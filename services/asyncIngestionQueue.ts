/**
 * Bio-SentinelX — Async Ingestion Queue Service
 *
 * Background document processing queue for the vector DB ingestion pipeline.
 * Offloads expensive chunking and TF-IDF computation to a Web Worker via
 * inline blob URL (no separate worker file required).
 *
 * Architecture:
 *   1. Documents are enqueued with a priority level (high / normal / low).
 *   2. The queue processes jobs sequentially, dispatching chunking + TF-IDF
 *      to a Web Worker (or main-thread fallback).
 *   3. If a Gemini API key is provided, chunks are batch-embedded via
 *      text-embedding-004 with exponential backoff retry.
 *   4. Progress events are emitted to registered listeners throughout.
 *   5. Failed jobs are retried up to maxRetries times before marking failed.
 *
 * This file is fully self-contained — no imports from other service files.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestionJob {
  id: string;
  documentId: string;
  title: string;
  source: string;
  content: string;
  priority: 'high' | 'normal' | 'low';
  status: 'queued' | 'chunking' | 'embedding' | 'indexing' | 'done' | 'failed';
  progress: number;        // 0-100
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  geminiKey?: string;
  result?: {
    chunkCount: number;
    embeddedCount: number;
    tfidfCount: number;
    durationMs: number;
  };
}

export type IngestionEventType = 'queued' | 'started' | 'progress' | 'completed' | 'failed' | 'retrying';

export interface IngestionEvent {
  type: IngestionEventType;
  job: IngestionJob;
  timestamp: number;
}

/** Shape returned by the worker (or main-thread fallback) after chunking. */
interface ChunkResult {
  text: string;
  tfidf: Record<string, number>;
}

// ─── Priority ordering ───────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<IngestionJob['priority'], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

// ─── UID helper ──────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Inline Web Worker (blob URL) ─────────────────────────────────────────────

/**
 * Build a Web Worker from an inline string so we don't need a separate file.
 * The worker handles two concerns:
 *   1. Semantic + fixed-size chunking of text content.
 *   2. TF-IDF computation for each resulting chunk.
 *
 * Returns `null` if Worker is unavailable (SSR, CSP restrictions, etc.).
 */
function createWorkerBlob(): Worker | null {
  if (typeof Worker === 'undefined') return null;

  const code = `
// ─── Stop words (inside worker) ──────────────────────────────────────────────
var STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','as','this','that','these',
  'those','it','its','or','and','but','not','no','so','if','then','than','more',
  'also','such','which','they','their','there','into','about','after','before',
  'when','where','how','what','who','all','each','any','some','one','two','three'
]);

// ─── Tokeniser ───────────────────────────────────────────────────────────────
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\\s]/g, ' ')
    .split(/\\s+/)
    .filter(function(t) { return t.length > 2 && !STOP_WORDS.has(t); });
}

// ─── TF-IDF (TF only — IDF approximated as uniform for single-doc ingestion)
function buildTFIDF(text) {
  var tokens = tokenize(text);
  var freq = {};
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    freq[t] = (freq[t] || 0) + 1;
  }
  var total = tokens.length || 1;
  var tfidf = {};
  var keys = Object.keys(freq);
  for (var j = 0; j < keys.length; j++) {
    tfidf[keys[j]] = freq[keys[j]] / total;
  }
  return tfidf;
}

// ─── Semantic chunking ───────────────────────────────────────────────────────
// Splits on paragraph boundaries (double newlines), heading markers (#),
// and falls back to sentence-boundary splitting for oversized paragraphs.
var TARGET_CHUNK_SIZE = 600;   // characters
var MIN_CHUNK_SIZE = 80;       // merge chunks smaller than this

function splitOnBoundaries(text) {
  // First pass: split on double-newlines and markdown headings
  var raw = text
    .replace(/\\r\\n/g, '\\n')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();

  var segments = [];
  var lines = raw.split('\\n');
  var buffer = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var isHeading = /^#{1,6}\\s+/.test(line);
    var isEmpty = line.trim() === '';

    if (isHeading && buffer.length > 0) {
      segments.push(buffer.join('\\n').trim());
      buffer = [line];
    } else if (isEmpty && buffer.length > 0) {
      segments.push(buffer.join('\\n').trim());
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) {
    segments.push(buffer.join('\\n').trim());
  }

  return segments.filter(function(s) { return s.length > 0; });
}

function splitLargeSegment(text) {
  // Split oversized segments at sentence boundaries
  var chunks = [];
  var start = 0;
  while (start < text.length) {
    var end = Math.min(start + TARGET_CHUNK_SIZE, text.length);
    if (end < text.length) {
      // Snap to nearest sentence boundary (period, question, exclamation)
      var searchRange = text.substring(Math.max(start, end - 120), end);
      var lastPeriod = searchRange.lastIndexOf('. ');
      var lastQuestion = searchRange.lastIndexOf('? ');
      var lastExclaim = searchRange.lastIndexOf('! ');
      var boundary = Math.max(lastPeriod, lastQuestion, lastExclaim);
      if (boundary > 0) {
        end = Math.max(start, end - 120) + boundary + 2;
      }
    }
    var chunk = text.substring(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end >= text.length) break;
    start = end;
  }
  return chunks;
}

function chunkText(text) {
  var segments = splitOnBoundaries(text);

  // Second pass: merge tiny segments, split oversized ones
  var chunks = [];
  var pendingMerge = '';

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];

    if (seg.length < MIN_CHUNK_SIZE) {
      // Accumulate small segments
      pendingMerge = pendingMerge ? pendingMerge + '\\n\\n' + seg : seg;
      continue;
    }

    // Flush any pending small segments
    if (pendingMerge) {
      var merged = pendingMerge + '\\n\\n' + seg;
      if (merged.length <= TARGET_CHUNK_SIZE) {
        pendingMerge = merged;
        continue;
      } else {
        chunks.push(pendingMerge);
        pendingMerge = '';
      }
    }

    if (seg.length > TARGET_CHUNK_SIZE) {
      var subChunks = splitLargeSegment(seg);
      for (var j = 0; j < subChunks.length; j++) {
        chunks.push(subChunks[j]);
      }
    } else {
      chunks.push(seg);
    }
  }

  if (pendingMerge) {
    chunks.push(pendingMerge);
  }

  // Final filter: drop anything too tiny to be useful
  return chunks.filter(function(c) { return c.length >= 20; });
}

// ─── Message handler ─────────────────────────────────────────────────────────
self.onmessage = function(e) {
  var data = e.data;
  if (data.type === 'chunk') {
    try {
      var chunks = chunkText(data.payload.content);
      var results = [];
      for (var i = 0; i < chunks.length; i++) {
        results.push({
          text: chunks[i],
          tfidf: buildTFIDF(chunks[i])
        });
        // Post progress periodically
        if (i % 10 === 0 || i === chunks.length - 1) {
          self.postMessage({
            type: 'progress',
            payload: {
              jobId: data.payload.jobId,
              current: i + 1,
              total: chunks.length
            }
          });
        }
      }
      self.postMessage({
        type: 'result',
        payload: {
          jobId: data.payload.jobId,
          chunks: results
        }
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        payload: {
          jobId: data.payload.jobId,
          message: err.message || 'Worker chunking failed'
        }
      });
    }
  }
};
`;

  try {
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    // Clean up the blob URL after the worker loads (it's already been fetched)
    worker.addEventListener('error', () => {
      URL.revokeObjectURL(url);
    });
    return worker;
  } catch (err) {
    console.warn('[IngestionQueue] Failed to create Web Worker, will use main-thread fallback:', err);
    return null;
  }
}

// ─── Main-thread fallback (mirrors worker logic) ──────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','as','this','that','these',
  'those','it','its','or','and','but','not','no','so','if','then','than','more',
  'also','such','which','they','their','there','into','about','after','before',
  'when','where','how','what','who','all','each','any','some','one','two','three',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function buildTFIDF(text: string): Record<string, number> {
  const tokens = tokenize(text);
  const freq: Record<string, number> = {};
  tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  const total = tokens.length || 1;
  const tfidf: Record<string, number> = {};
  Object.entries(freq).forEach(([term, count]) => { tfidf[term] = count / total; });
  return tfidf;
}

const TARGET_CHUNK_SIZE = 600;
const MIN_CHUNK_SIZE = 80;

function splitOnBoundaries(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const segments: string[] = [];
  const lines = raw.split('\n');
  let buffer: string[] = [];

  for (const line of lines) {
    const isHeading = /^#{1,6}\s+/.test(line);
    const isEmpty = line.trim() === '';

    if (isHeading && buffer.length > 0) {
      segments.push(buffer.join('\n').trim());
      buffer = [line];
    } else if (isEmpty && buffer.length > 0) {
      segments.push(buffer.join('\n').trim());
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) {
    segments.push(buffer.join('\n').trim());
  }
  return segments.filter(s => s.length > 0);
}

function splitLargeSegment(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + TARGET_CHUNK_SIZE, text.length);
    if (end < text.length) {
      const searchRange = text.substring(Math.max(start, end - 120), end);
      const lastPeriod = searchRange.lastIndexOf('. ');
      const lastQuestion = searchRange.lastIndexOf('? ');
      const lastExclaim = searchRange.lastIndexOf('! ');
      const boundary = Math.max(lastPeriod, lastQuestion, lastExclaim);
      if (boundary > 0) {
        end = Math.max(start, end - 120) + boundary + 2;
      }
    }
    const chunk = text.substring(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    start = end;
  }
  return chunks;
}

function chunkTextMainThread(text: string): ChunkResult[] {
  const segments = splitOnBoundaries(text);
  const chunks: string[] = [];
  let pendingMerge = '';

  for (const seg of segments) {
    if (seg.length < MIN_CHUNK_SIZE) {
      pendingMerge = pendingMerge ? `${pendingMerge}\n\n${seg}` : seg;
      continue;
    }
    if (pendingMerge) {
      const merged = `${pendingMerge}\n\n${seg}`;
      if (merged.length <= TARGET_CHUNK_SIZE) {
        pendingMerge = merged;
        continue;
      } else {
        chunks.push(pendingMerge);
        pendingMerge = '';
      }
    }
    if (seg.length > TARGET_CHUNK_SIZE) {
      chunks.push(...splitLargeSegment(seg));
    } else {
      chunks.push(seg);
    }
  }
  if (pendingMerge) chunks.push(pendingMerge);

  return chunks
    .filter(c => c.length >= 20)
    .map(text => ({ text, tfidf: buildTFIDF(text) }));
}

/**
 * Yield to the main thread between expensive iterations.
 * Uses `requestIdleCallback` when available, falls back to `setTimeout`.
 */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

// ─── Batch Embedding (Gemini text-embedding-004) ──────────────────────────────

const EMBED_BATCH_SIZE = 20;
const EMBED_MAX_RETRIES = 3;

/**
 * Batch-embed an array of texts using the Gemini text-embedding-004
 * `batchEmbedContents` endpoint.
 *
 * @param texts   Array of text strings to embed
 * @param apiKey  Gemini API key
 * @returns Array matching input length — `number[]` for successes, `null` for failures
 */
async function batchEmbed(texts: string[], apiKey: string): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  // Process in batches of EMBED_BATCH_SIZE
  for (let batchStart = 0; batchStart < texts.length; batchStart += EMBED_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + EMBED_BATCH_SIZE, texts.length);
    const batchTexts = texts.slice(batchStart, batchEnd);

    const requests = batchTexts.map(text => ({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    }));

    let attempt = 0;
    let success = false;

    while (attempt < EMBED_MAX_RETRIES && !success) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
          const errMsg = (errBody?.error as Record<string, unknown>)?.message ?? `HTTP ${res.status}`;
          throw new Error(`Gemini batchEmbed: ${errMsg}`);
        }

        const data = await res.json() as { embeddings?: Array<{ values: number[] }> };
        const embeddings = data.embeddings ?? [];

        for (let i = 0; i < batchTexts.length; i++) {
          results[batchStart + i] = embeddings[i]?.values ?? null;
        }
        success = true;
      } catch (err) {
        attempt++;
        if (attempt < EMBED_MAX_RETRIES) {
          // Exponential backoff: min(1000 * 2^attempt, 8000) ms
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(
            `[IngestionQueue] batchEmbed attempt ${attempt} failed, retrying in ${delay}ms:`,
            err,
          );
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error(`[IngestionQueue] batchEmbed failed after ${EMBED_MAX_RETRIES} attempts:`, err);
          // Leave results as null for this batch
        }
      }
    }
  }

  return results;
}

// ─── AsyncIngestionQueue ──────────────────────────────────────────────────────

/**
 * Background document processing queue for vector DB ingestion.
 *
 * Usage:
 * ```ts
 * import { ingestionQueue } from './asyncIngestionQueue';
 *
 * const unsub = ingestionQueue.onProgress(event => {
 *   console.log(event.type, event.job.progress);
 * });
 *
 * const jobId = ingestionQueue.enqueue({
 *   title: 'Dengue Research Paper',
 *   content: fullText,
 *   source: 'PubMed',
 *   geminiKey: 'AIza...',
 * }, 'high');
 *
 * const status = ingestionQueue.getStatus(jobId);
 * unsub(); // cleanup
 * ```
 */
class AsyncIngestionQueue {
  private queue: IngestionJob[] = [];
  private completed: IngestionJob[] = [];
  private processing: boolean = false;
  private worker: Worker | null = null;
  private workerReady: boolean = false;
  private paused: boolean = false;
  private listeners: Set<(event: IngestionEvent) => void> = new Set();
  private concurrency: number = 1; // reserved for future parallel processing

  constructor() {
    this.initWorker();
  }

  // ─── Worker lifecycle ────────────────────────────────────────────────────────

  /** Lazily initialise the Web Worker. */
  private initWorker(): void {
    try {
      this.worker = createWorkerBlob();
      if (this.worker) {
        this.workerReady = true;
        // Handle unexpected worker death
        this.worker.addEventListener('error', (evt) => {
          console.warn('[IngestionQueue] Worker error, falling back to main thread:', evt.message);
          this.workerReady = false;
          this.worker = null;
        });
      }
    } catch {
      this.worker = null;
      this.workerReady = false;
    }
  }

  // ─── Event emission ──────────────────────────────────────────────────────────

  private emit(type: IngestionEventType, job: IngestionJob): void {
    const event: IngestionEvent = { type, job: { ...job }, timestamp: Date.now() };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[IngestionQueue] Listener threw:', err);
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Add a document to the ingestion queue.
   *
   * @param doc       Document payload (title, content, source, optional geminiKey)
   * @param priority  Processing priority — 'high' | 'normal' | 'low'
   * @returns         Unique job ID for tracking
   */
  enqueue(
    doc: { title: string; content: string; source: string; geminiKey?: string },
    priority: IngestionJob['priority'] = 'normal',
  ): string {
    const job: IngestionJob = {
      id: uid(),
      documentId: uid(),
      title: doc.title,
      source: doc.source,
      content: doc.content,
      geminiKey: doc.geminiKey,
      priority,
      status: 'queued',
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
    };

    // Insert sorted by priority (high → normal → low)
    const insertIdx = this.queue.findIndex(
      q => PRIORITY_ORDER[q.priority] > PRIORITY_ORDER[priority],
    );
    if (insertIdx === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(insertIdx, 0, job);
    }

    this.emit('queued', job);

    // Kick off processing if idle
    if (!this.processing && !this.paused) {
      this.processQueue();
    }

    return job.id;
  }

  /**
   * Register a listener for ingestion progress events.
   *
   * @param callback  Event handler receiving `IngestionEvent`
   * @returns         Unsubscribe function
   */
  onProgress(callback: (event: IngestionEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get the current status of a specific job.
   */
  getStatus(jobId: string): IngestionJob | undefined {
    return (
      this.queue.find(j => j.id === jobId) ??
      this.completed.find(j => j.id === jobId)
    );
  }

  /**
   * Get an aggregate overview of the queue.
   */
  getQueueStatus(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const pending = this.queue.filter(j => j.status === 'queued').length;
    const processing = this.queue.filter(j =>
      j.status === 'chunking' || j.status === 'embedding' || j.status === 'indexing',
    ).length;
    const completed = this.completed.filter(j => j.status === 'done').length;
    const failed = this.completed.filter(j => j.status === 'failed').length;

    return {
      total: this.queue.length + this.completed.length,
      pending,
      processing,
      completed,
      failed,
    };
  }

  /**
   * Pause queue processing. Currently running jobs will complete,
   * but no new jobs will start until `resume()` is called.
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume queue processing after a pause.
   */
  resume(): void {
    this.paused = false;
    if (!this.processing && this.queue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Cancel a queued job. Jobs already in progress cannot be cancelled.
   *
   * @returns `true` if the job was found and removed, `false` otherwise.
   */
  cancelJob(jobId: string): boolean {
    const idx = this.queue.findIndex(j => j.id === jobId && j.status === 'queued');
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    return true;
  }

  /**
   * Remove all completed and failed jobs from the history.
   */
  clearCompleted(): void {
    this.completed = [];
  }

  // ─── Queue processor ────────────────────────────────────────────────────────

  /**
   * Main processing loop. Processes jobs sequentially from the front of the
   * priority-sorted queue until empty or paused.
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && !this.paused) {
      // Find the first 'queued' job
      const jobIdx = this.queue.findIndex(j => j.status === 'queued');
      if (jobIdx === -1) break;

      const job = this.queue[jobIdx];
      const startTime = Date.now();

      try {
        // ── Step 1: Chunking + TF-IDF ──────────────────────────────────────
        job.status = 'chunking';
        job.startedAt = startTime;
        job.progress = 5;
        this.emit('started', job);

        let chunks: ChunkResult[];

        if (this.worker && this.workerReady) {
          chunks = await this.chunkWithWorker(job);
        } else {
          chunks = await this.chunkOnMainThread(job);
        }

        job.progress = 40;
        this.emit('progress', job);

        // ── Step 2: Embedding (if API key provided) ────────────────────────
        let embeddedCount = 0;

        if (job.geminiKey && chunks.length > 0) {
          job.status = 'embedding';
          job.progress = 45;
          this.emit('progress', job);

          try {
            const texts = chunks.map(c => c.text);
            const embeddings = await batchEmbed(texts, job.geminiKey);

            embeddedCount = embeddings.filter(e => e !== null).length;

            // Merge embeddings into chunk results (stored for caller retrieval)
            for (let i = 0; i < chunks.length; i++) {
              if (embeddings[i]) {
                (chunks[i] as ChunkResult & { embedding?: number[] }).embedding = embeddings[i]!;
              }
            }
          } catch (embedErr) {
            // Non-fatal: TF-IDF fallback remains available
            console.warn('[IngestionQueue] Embedding failed, continuing with TF-IDF:', embedErr);
          }

          job.progress = 80;
          this.emit('progress', job);
        } else {
          job.progress = 80;
        }

        // ── Step 3: Indexing (finalise results) ────────────────────────────
        job.status = 'indexing';
        job.progress = 90;
        this.emit('progress', job);

        // Store results on the job — the caller will handle actual persistence
        // to vectorDB or other storage.
        const durationMs = Date.now() - startTime;
        job.result = {
          chunkCount: chunks.length,
          embeddedCount,
          tfidfCount: chunks.filter(c => Object.keys(c.tfidf).length > 0).length,
          durationMs,
        };

        // ── Done ───────────────────────────────────────────────────────────
        job.status = 'done';
        job.progress = 100;
        job.completedAt = Date.now();
        delete job.error;

        // Move from queue to completed
        this.queue.splice(this.queue.indexOf(job), 1);
        this.completed.push(job);

        this.emit('completed', job);

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        job.error = message;

        if (job.retryCount < job.maxRetries) {
          // Retry: re-queue with incremented count
          job.retryCount++;
          job.status = 'queued';
          job.progress = 0;
          delete job.startedAt;
          this.emit('retrying', job);

          // Exponential backoff before retry
          const delay = Math.min(1000 * Math.pow(2, job.retryCount), 8000);
          await new Promise(r => setTimeout(r, delay));
        } else {
          // Exhausted retries — mark failed
          job.status = 'failed';
          job.completedAt = Date.now();

          this.queue.splice(this.queue.indexOf(job), 1);
          this.completed.push(job);

          this.emit('failed', job);
        }
      }
    }

    this.processing = false;
  }

  // ─── Worker-based chunking ──────────────────────────────────────────────────

  /**
   * Send content to the Web Worker for chunking + TF-IDF computation.
   * Returns a promise that resolves with the chunk results.
   */
  private chunkWithWorker(job: IngestionJob): Promise<ChunkResult[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Worker timed out after 60 seconds'));
      }, 60_000);

      const handler = (e: MessageEvent) => {
        const { type, payload } = e.data as {
          type: string;
          payload: {
            jobId: string;
            chunks?: ChunkResult[];
            message?: string;
            current?: number;
            total?: number;
          };
        };

        if (payload.jobId !== job.id) return;

        if (type === 'progress' && payload.current != null && payload.total != null) {
          // Map worker progress (0..total) to job progress (5..40)
          const pct = (payload.current / payload.total) * 35 + 5;
          job.progress = Math.round(pct);
          this.emit('progress', job);
          return;
        }

        if (type === 'result') {
          clearTimeout(timeoutId);
          this.worker?.removeEventListener('message', handler);
          resolve(payload.chunks ?? []);
          return;
        }

        if (type === 'error') {
          clearTimeout(timeoutId);
          this.worker?.removeEventListener('message', handler);
          reject(new Error(payload.message ?? 'Worker error'));
          return;
        }
      };

      this.worker.addEventListener('message', handler);

      this.worker.postMessage({
        type: 'chunk',
        payload: {
          jobId: job.id,
          content: job.content,
        },
      });
    });
  }

  // ─── Main-thread fallback chunking ──────────────────────────────────────────

  /**
   * Perform chunking + TF-IDF on the main thread, yielding periodically
   * via `requestIdleCallback` / `setTimeout` to avoid blocking the UI.
   */
  private async chunkOnMainThread(job: IngestionJob): Promise<ChunkResult[]> {
    // Split text into raw segments first
    const segments = splitOnBoundaries(job.content);
    const rawChunks: string[] = [];
    let pendingMerge = '';

    for (const seg of segments) {
      if (seg.length < MIN_CHUNK_SIZE) {
        pendingMerge = pendingMerge ? `${pendingMerge}\n\n${seg}` : seg;
        continue;
      }
      if (pendingMerge) {
        const merged = `${pendingMerge}\n\n${seg}`;
        if (merged.length <= TARGET_CHUNK_SIZE) {
          pendingMerge = merged;
          continue;
        } else {
          rawChunks.push(pendingMerge);
          pendingMerge = '';
        }
      }
      if (seg.length > TARGET_CHUNK_SIZE) {
        rawChunks.push(...splitLargeSegment(seg));
      } else {
        rawChunks.push(seg);
      }
    }
    if (pendingMerge) rawChunks.push(pendingMerge);

    const filtered = rawChunks.filter(c => c.length >= 20);
    const results: ChunkResult[] = [];

    for (let i = 0; i < filtered.length; i++) {
      results.push({
        text: filtered[i],
        tfidf: buildTFIDF(filtered[i]),
      });

      // Yield every 5 chunks to keep the UI responsive
      if (i % 5 === 0) {
        await yieldToMain();
        const pct = ((i + 1) / filtered.length) * 35 + 5;
        job.progress = Math.round(pct);
        this.emit('progress', job);
      }
    }

    return results;
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  /**
   * Terminate the worker and clean up resources.
   * Call this when the service is no longer needed.
   */
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
    this.listeners.clear();
    this.queue = [];
    this.completed = [];
    this.processing = false;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const ingestionQueue = new AsyncIngestionQueue();
