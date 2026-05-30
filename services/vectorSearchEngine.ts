/**
 * Bio-SentinelX — Unified Vector Search Engine
 *
 * Replaces scattered TF-IDF implementations across vectorDB.ts and
 * memoryService.ts with a single, well-tested, self-contained module.
 *
 * Architecture:
 *   1. IndexedDB persistence layer (localStorage fallback).
 *   2. Shared TF-IDF sparse-vector module.
 *   3. Dense embedding utilities (Gemini text-embedding-004).
 *   4. Semantic chunking with paragraph/heading/sentence awareness.
 *   5. HNSW-Lite approximate nearest neighbor index.
 *   6. Hybrid search with Reciprocal Rank Fusion (RRF).
 *
 * IMPORTANT: This file has ZERO imports from other project services.
 *            It is fully self-contained.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result returned by the hybrid search pipeline. */
export interface VectorSearchResult {
  chunkId: string;
  docId: string;
  docTitle: string;
  text: string;
  denseScore: number;
  sparseScore: number;
  rrfScore: number;
  rerankedScore?: number;
}

/** Options for the hybrid search pipeline. */
export interface HybridSearchOptions {
  /** Number of results to return (default 6). */
  topK?: number;
  /** Use dense (embedding) cosine similarity (default true). */
  useDense?: boolean;
  /** Use sparse (TF-IDF) cosine similarity (default true). */
  useSparse?: boolean;
  /** Re-rank top-20 candidates via embedding similarity (default false). */
  rerank?: boolean;
  /** Gemini API key — required for dense scoring and reranking. */
  geminiKey?: string;
  /** Max chunks from a single document in final results (default 3). */
  maxPerDoc?: number;
}

/** Shape of a search chunk fed into the hybrid search pipeline. */
export interface SearchChunk {
  id: string;
  text: string;
  embedding?: number[];
  tfidf?: Record<string, number>;
  docId: string;
  docTitle: string;
}

/** Serialised document stored in IndexedDB / localStorage. */
export interface StoredVectorDocument {
  id: string;
  title: string;
  source: string;
  addedAt: number;
  chunkIds: string[];
  charCount: number;
}

/** Serialised chunk stored in IndexedDB / localStorage. */
export interface StoredVectorChunk {
  id: string;
  docId: string;
  docTitle: string;
  text: string;
  embedding?: number[];
  tfidf?: Record<string, number>;
}

/** HNSW index node for serialisation. */
interface HNSWNode {
  id: string;
  vector: number[];
  /** Map from layer number → list of neighbour IDs at that layer. */
  connections: Record<number, string[]>;
  layer: number;
}

/** Nearest-neighbour search result from HNSWIndex. */
export interface HNSWSearchResult {
  id: string;
  distance: number;
}

// ─── Section 1: IndexedDB Storage Layer ───────────────────────────────────────

const IDB_NAME = 'biosentinel_vectordb';
const IDB_VERSION = 1;

const STORE_DOCUMENTS = 'documents';
const STORE_CHUNKS = 'chunks';
const STORE_HNSW = 'hnsw_index';

/** localStorage fallback keys (used when IndexedDB is unavailable). */
const LS_DOCS_KEY = 'biosentinel_vse_docs';
const LS_CHUNKS_KEY = 'biosentinel_vse_chunks';
const LS_HNSW_KEY = 'biosentinel_vse_hnsw';

/**
 * Wrapper around IndexedDB with automatic localStorage fallback.
 *
 * No size caps are applied — the browser's storage quota is the only limit.
 */
export class VectorStore {
  private _db: IDBDatabase | null = null;
  private _useLocalStorage = false;
  private _initPromise: Promise<void> | null = null;

  // ── Initialisation ────────────────────────────────────────────────────────

  /** Open (or create) the IndexedDB database. */
  private _init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = new Promise<void>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          this._useLocalStorage = true;
          resolve();
          return;
        }

        const req = indexedDB.open(IDB_NAME, IDB_VERSION);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
            db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
            db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_HNSW)) {
            db.createObjectStore(STORE_HNSW, { keyPath: 'key' });
          }
        };

        req.onsuccess = () => {
          this._db = req.result;
          resolve();
        };

        req.onerror = () => {
          console.warn('[VectorStore] IndexedDB unavailable, falling back to localStorage.');
          this._useLocalStorage = true;
          resolve();
        };
      } catch {
        console.warn('[VectorStore] IndexedDB open threw, falling back to localStorage.');
        this._useLocalStorage = true;
        resolve();
      }
    });
    return this._initPromise;
  }

  /** Ensure the database is ready before any read/write. */
  private async _ready(): Promise<void> {
    await this._init();
  }

  // ── Generic IDB helpers ───────────────────────────────────────────────────

  /**
   * Perform a transaction on a single object store.
   * Returns a Promise that resolves with the IDBRequest result.
   */
  private _tx<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this._db) {
        reject(new Error('IndexedDB not initialised'));
        return;
      }
      const tx = this._db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = operation(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── localStorage helpers ──────────────────────────────────────────────────

  private _lsGet<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private _lsSet(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[VectorStore] localStorage write failed:', e);
    }
  }

  // ── Document persistence ──────────────────────────────────────────────────

  /**
   * Persist an array of documents.
   * Replaces the entire documents collection.
   */
  async saveDocuments(docs: StoredVectorDocument[]): Promise<void> {
    await this._ready();

    if (this._useLocalStorage) {
      this._lsSet(LS_DOCS_KEY, docs);
      return;
    }

    const tx = this._db!.transaction(STORE_DOCUMENTS, 'readwrite');
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.clear();
    for (const doc of docs) {
      store.put(doc);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load all documents from the store.
   */
  async loadDocuments(): Promise<StoredVectorDocument[]> {
    await this._ready();

    if (this._useLocalStorage) {
      return this._lsGet<StoredVectorDocument[]>(LS_DOCS_KEY, []);
    }

    return this._tx<StoredVectorDocument[]>(
      STORE_DOCUMENTS,
      'readonly',
      (store) => store.getAll(),
    );
  }

  // ── Chunk persistence ─────────────────────────────────────────────────────

  /**
   * Persist an array of chunks.
   * Replaces the entire chunks collection.
   */
  async saveChunks(chunks: StoredVectorChunk[]): Promise<void> {
    await this._ready();

    if (this._useLocalStorage) {
      this._lsSet(LS_CHUNKS_KEY, chunks);
      return;
    }

    const tx = this._db!.transaction(STORE_CHUNKS, 'readwrite');
    const store = tx.objectStore(STORE_CHUNKS);
    store.clear();
    for (const chunk of chunks) {
      store.put(chunk);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load all chunks from the store.
   */
  async loadChunks(): Promise<StoredVectorChunk[]> {
    await this._ready();

    if (this._useLocalStorage) {
      return this._lsGet<StoredVectorChunk[]>(LS_CHUNKS_KEY, []);
    }

    return this._tx<StoredVectorChunk[]>(
      STORE_CHUNKS,
      'readonly',
      (store) => store.getAll(),
    );
  }

  // ── HNSW index persistence ────────────────────────────────────────────────

  /**
   * Persist a serialised HNSW index string.
   */
  async saveHNSWIndex(serialised: string): Promise<void> {
    await this._ready();

    if (this._useLocalStorage) {
      this._lsSet(LS_HNSW_KEY, serialised);
      return;
    }

    await this._tx(STORE_HNSW, 'readwrite', (store) =>
      store.put({ key: 'default', data: serialised }),
    );
  }

  /**
   * Load the serialised HNSW index string.
   */
  async loadHNSWIndex(): Promise<string | null> {
    await this._ready();

    if (this._useLocalStorage) {
      const raw = this._lsGet<string | null>(LS_HNSW_KEY, null);
      return raw;
    }

    try {
      const record = await this._tx<{ key: string; data: string } | undefined>(
        STORE_HNSW,
        'readonly',
        (store) => store.get('default'),
      );
      return record?.data ?? null;
    } catch {
      return null;
    }
  }

  // ── Clear all stores ──────────────────────────────────────────────────────

  /**
   * Wipe all data across every object store.
   */
  async clear(): Promise<void> {
    await this._ready();

    if (this._useLocalStorage) {
      localStorage.removeItem(LS_DOCS_KEY);
      localStorage.removeItem(LS_CHUNKS_KEY);
      localStorage.removeItem(LS_HNSW_KEY);
      return;
    }

    const tx = this._db!.transaction(
      [STORE_DOCUMENTS, STORE_CHUNKS, STORE_HNSW],
      'readwrite',
    );
    tx.objectStore(STORE_DOCUMENTS).clear();
    tx.objectStore(STORE_CHUNKS).clear();
    tx.objectStore(STORE_HNSW).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/** Singleton store instance. */
export const vectorStore = new VectorStore();

// ─── Section 2: Shared TF-IDF Module ─────────────────────────────────────────

/**
 * Comprehensive English stop-word set.
 * Shared across the entire application to avoid duplication.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'this', 'that', 'these',
  'those', 'it', 'its', 'or', 'and', 'but', 'not', 'no', 'so', 'if',
  'then', 'than', 'more', 'also', 'such', 'which', 'they', 'their',
  'there', 'into', 'about', 'after', 'before', 'when', 'where', 'how',
  'what', 'who', 'all', 'each', 'any', 'some', 'one', 'two', 'three',
  'we', 'you', 'he', 'she', 'me', 'him', 'her', 'us', 'them', 'my',
  'your', 'his', 'our', 'very', 'just', 'only', 'now', 'here', 'up',
  'out', 'over', 'own', 'same', 'other', 'between', 'through', 'during',
  'above', 'below', 'both', 'under', 'again', 'further', 'once', 'too',
  'most', 'been', 'while', 'because', 'until', 'against', 'nor', 'yet',
  'down', 'off', 'few', 'many', 'much', 'well', 'back', 'still', 'even',
  'made', 'make', 'get', 'got', 'go', 'went', 'come', 'came', 'take',
  'took', 'give', 'gave', 'say', 'said', 'see', 'saw', 'know', 'knew',
  'think', 'thought', 'want', 'use', 'used', 'find', 'found', 'tell',
  'told', 'ask', 'asked', 'seem', 'feel', 'try', 'leave', 'call',
]);

/**
 * Tokenise text into lowercase alphanumeric tokens,
 * stripping punctuation and filtering stop words & short tokens.
 *
 * @param text - Raw input text.
 * @returns Array of cleaned tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Build a TF (term-frequency) vector for a single text.
 * Each value is `count / totalTokens`.
 *
 * @param text - Raw input text.
 * @returns Sparse vector mapping term → normalised frequency.
 */
export function buildTFIDF(text: string): Record<string, number> {
  const tokens = tokenize(text);
  const freq: Record<string, number> = {};
  for (const t of tokens) {
    freq[t] = (freq[t] || 0) + 1;
  }
  const total = tokens.length || 1;
  const tfidf: Record<string, number> = {};
  for (const [term, count] of Object.entries(freq)) {
    tfidf[term] = count / total;
  }
  return tfidf;
}

/**
 * Compute IDF (inverse document frequency) across a corpus of TF vectors.
 *
 * `IDF(term) = log(N / (1 + df(term)))` where `df` is the number of
 * documents containing the term and `N` is the corpus size.
 *
 * @param corpus - Array of TF vectors (one per document).
 * @returns Mapping from term → IDF value.
 */
export function computeIDF(corpus: Record<string, number>[]): Record<string, number> {
  const N = corpus.length || 1;
  const df: Record<string, number> = {};

  for (const doc of corpus) {
    for (const term of Object.keys(doc)) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  for (const [term, count] of Object.entries(df)) {
    idf[term] = Math.log(N / (1 + count));
  }
  return idf;
}

/**
 * Build a TF × IDF vector for a single text using pre-computed IDF values.
 *
 * @param text - Raw input text.
 * @param idf  - Pre-computed IDF mapping.
 * @returns Sparse vector mapping term → TF × IDF.
 */
export function buildTFIDFWithIDF(
  text: string,
  idf: Record<string, number>,
): Record<string, number> {
  const tf = buildTFIDF(text);
  const result: Record<string, number> = {};
  for (const [term, tfVal] of Object.entries(tf)) {
    const idfVal = idf[term] ?? 0;
    if (idfVal > 0) {
      result[term] = tfVal * idfVal;
    }
  }
  return result;
}

/**
 * Cosine similarity between two sparse vectors (Record<string, number>).
 *
 * @param a - First sparse vector.
 * @param b - Second sparse vector.
 * @returns Similarity in [0, 1] (or technically [-1, 1] if negative weights exist).
 */
export function cosineSparse(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, va] of Object.entries(a)) {
    dot += va * (b[term] || 0);
    magA += va * va;
  }
  for (const vb of Object.values(b)) {
    magB += vb * vb;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Section 3: Dense Vector Utilities ────────────────────────────────────────

/**
 * Cosine similarity between two dense (number[]) vectors.
 *
 * @param a - First dense vector.
 * @param b - Second dense vector.
 * @returns Similarity in [-1, 1], or 0 if inputs are invalid.
 */
export function cosineDense(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Batch embed up to 20 texts per API call using Gemini text-embedding-004
 * `batchEmbedContents` endpoint.
 *
 * @param texts    - Array of texts to embed.
 * @param apiKey   - Gemini API key.
 * @param taskType - Embedding task type.
 * @returns Array of dense embedding vectors (one per input text).
 */
export async function batchEmbedWithGemini(
  texts: string[],
  apiKey: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_SIZE = 20;
  const allEmbeddings: number[][] = [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const requests = batch.map((text) => ({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType,
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const message =
        (err?.error as Record<string, unknown>)?.message ?? `Gemini Batch Embedding API error ${res.status}`;
      throw new Error(String(message));
    }

    const data = (await res.json()) as {
      embeddings: Array<{ values: number[] }>;
    };

    for (const emb of data.embeddings) {
      allEmbeddings.push(emb.values);
    }
  }

  return allEmbeddings;
}

/**
 * Embed a single text using Gemini text-embedding-004 `embedContent` endpoint.
 *
 * @param text     - Text to embed.
 * @param apiKey   - Gemini API key.
 * @param taskType - Embedding task type string.
 * @returns Dense embedding vector.
 */
export async function embedWithGemini(
  text: string,
  apiKey: string,
  taskType: string,
): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message =
      (err?.error as Record<string, unknown>)?.message ?? `Gemini Embedding API error ${res.status}`;
    throw new Error(String(message));
  }

  const data = (await res.json()) as { embedding: { values: number[] } };
  return data.embedding.values;
}

// ─── Section 4: Semantic Chunking ─────────────────────────────────────────────

/** Sentence-boundary regex (period/exclamation/question followed by whitespace). */
const SENTENCE_END_RE = /(?<=[.!?])\s+/;

/**
 * Split text into sentences, respecting common abbreviations.
 * Falls back to the whole text if no sentence boundary is found.
 */
function splitSentences(text: string): string[] {
  const raw = text.split(SENTENCE_END_RE).filter((s) => s.trim().length > 0);
  return raw.length > 0 ? raw : [text];
}

/**
 * Snap a character position to the nearest preceding sentence boundary
 * within the given text. Returns the snapped position.
 */
function snapToSentence(text: string, pos: number): number {
  if (pos >= text.length) return text.length;

  // Look backwards for a sentence terminator followed by whitespace
  const searchWindow = text.slice(0, pos + 1);
  const lastEnd = Math.max(
    searchWindow.lastIndexOf('. '),
    searchWindow.lastIndexOf('! '),
    searchWindow.lastIndexOf('? '),
    searchWindow.lastIndexOf('.\n'),
    searchWindow.lastIndexOf('!\n'),
    searchWindow.lastIndexOf('?\n'),
  );

  // If we found a boundary within a reasonable distance, snap to it
  if (lastEnd > pos - 120 && lastEnd > 0) {
    return lastEnd + 1; // +1 to include the terminator
  }
  return pos;
}

/**
 * Semantic chunker: splits text on paragraph boundaries (double newline),
 * heading boundaries (# markdown), and sentence boundaries.
 *
 * Small paragraphs are merged into chunks up to `maxChunkSize`.
 * Overlap is added between consecutive chunks.
 *
 * @param text    - Full input text.
 * @param options - Chunking configuration.
 * @returns Array of text chunks.
 */
export function semanticChunk(
  text: string,
  options?: { maxChunkSize?: number; overlapSize?: number },
): string[] {
  const maxChunkSize = options?.maxChunkSize ?? 600;
  const overlapSize = options?.overlapSize ?? 100;

  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length === 0) return [];

  // Step 1: Split into "blocks" on paragraph & heading boundaries
  const blocks: string[] = [];
  const rawBlocks = normalized.split(/\n\n+/);

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (trimmed.length === 0) continue;

    // Further split on markdown headings (# / ## / ### etc.)
    const headingSplit = trimmed.split(/(?=^#{1,6}\s)/m);
    for (const part of headingSplit) {
      const p = part.trim();
      if (p.length > 0) blocks.push(p);
    }
  }

  // Step 2: Merge small blocks into chunks up to maxChunkSize
  const mergedChunks: string[] = [];
  let currentChunk = '';

  for (const block of blocks) {
    if (currentChunk.length === 0) {
      currentChunk = block;
    } else if (currentChunk.length + block.length + 1 <= maxChunkSize) {
      currentChunk += '\n\n' + block;
    } else {
      // Current chunk is full — flush it
      mergedChunks.push(currentChunk);
      currentChunk = block;
    }
  }
  if (currentChunk.length > 0) {
    mergedChunks.push(currentChunk);
  }

  // Step 3: Split any oversized chunks at sentence boundaries
  const sizedChunks: string[] = [];
  for (const chunk of mergedChunks) {
    if (chunk.length <= maxChunkSize) {
      sizedChunks.push(chunk);
      continue;
    }

    // This chunk exceeds maxChunkSize — split on sentences
    const sentences = splitSentences(chunk);
    let buffer = '';
    for (const sentence of sentences) {
      if (buffer.length === 0) {
        buffer = sentence;
      } else if (buffer.length + sentence.length + 1 <= maxChunkSize) {
        buffer += ' ' + sentence;
      } else {
        if (buffer.length > 0) sizedChunks.push(buffer.trim());
        buffer = sentence;
      }
    }
    if (buffer.length > 0) sizedChunks.push(buffer.trim());
  }

  // Step 4: Add overlap between consecutive chunks
  if (overlapSize <= 0 || sizedChunks.length <= 1) {
    return sizedChunks.filter((c) => c.length > 20);
  }

  const finalChunks: string[] = [];
  for (let i = 0; i < sizedChunks.length; i++) {
    if (i === 0) {
      finalChunks.push(sizedChunks[i]);
    } else {
      // Prepend the tail of the previous chunk as overlap
      const prev = sizedChunks[i - 1];
      const overlapStart = Math.max(0, prev.length - overlapSize);
      const snapped = snapToSentence(prev, overlapStart);
      const overlap = prev.slice(snapped).trim();
      const combined = overlap.length > 0
        ? overlap + ' ' + sizedChunks[i]
        : sizedChunks[i];
      finalChunks.push(combined);
    }
  }

  return finalChunks.filter((c) => c.length > 20);
}

/**
 * Fixed-size chunker: splits text into overlapping windows of a fixed
 * character size, snapping to sentence boundaries where possible.
 *
 * @param text      - Full input text.
 * @param chunkSize - Target chunk size in characters (default 650).
 * @param overlap   - Overlap between consecutive chunks (default 120).
 * @returns Array of text chunks.
 */
export function fixedChunk(
  text: string,
  chunkSize = 650,
  overlap = 120,
): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    // Snap end to nearest sentence boundary within 80 chars
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf('.', end);
      if (boundary > start + chunkSize - 80) end = boundary + 1;
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);

    if (end >= normalized.length) break;
    start = end - overlap;
  }

  return chunks;
}

// ─── Section 5: HNSW-Lite Index ───────────────────────────────────────────────

/**
 * Lightweight HNSW (Hierarchical Navigable Small World) approximate
 * nearest-neighbour index.
 *
 * Uses cosine distance (1 - cosine_similarity) as the metric.
 * Falls back to brute-force linear scan for small datasets (<100 vectors).
 */
export class HNSWIndex {
  /** Max connections per node per layer. */
  private _M: number;
  /** Size of the dynamic candidate list during construction. */
  private _efConstruction: number;
  /** Node storage keyed by ID. */
  private _nodes: Map<string, HNSWNode> = new Map();
  /** Entry point node ID (top-level entry). */
  private _entryPointId: string | null = null;
  /** Maximum layer in the graph. */
  private _maxLayer = 0;

  /**
   * @param options.M              - Max connections per node per layer (default 16).
   * @param options.efConstruction - Dynamic candidate list size during insertion (default 200).
   */
  constructor(options?: { M?: number; efConstruction?: number }) {
    this._M = options?.M ?? 16;
    this._efConstruction = options?.efConstruction ?? 200;
  }

  /** Number of vectors in the index. */
  size(): number {
    return this._nodes.size;
  }

  // ── Distance metric ───────────────────────────────────────────────────────

  /** Cosine distance: 1 - cosine_similarity. Lower is better. */
  private _distance(a: number[], b: number[]): number {
    return 1 - cosineDense(a, b);
  }

  // ── Layer assignment ──────────────────────────────────────────────────────

  /**
   * Assign a random layer using the HNSW exponential distribution.
   * `floor(-ln(uniform(0,1)) * mL)` where `mL = 1 / ln(M)`.
   */
  private _randomLayer(): number {
    const mL = 1 / Math.log(this._M);
    return Math.floor(-Math.log(Math.random()) * mL);
  }

  // ── Core search: greedy layer traversal ───────────────────────────────────

  /**
   * Greedy search at a single layer: find the closest neighbour by
   * traversing connections greedily.
   */
  private _searchLayer(
    query: number[],
    entryId: string,
    ef: number,
    layer: number,
  ): Array<{ id: string; dist: number }> {
    const entryNode = this._nodes.get(entryId);
    if (!entryNode) return [];

    const visited = new Set<string>([entryId]);
    const candidates: Array<{ id: string; dist: number }> = [
      { id: entryId, dist: this._distance(query, entryNode.vector) },
    ];
    const results: Array<{ id: string; dist: number }> = [...candidates];

    while (candidates.length > 0) {
      // Pop nearest candidate
      candidates.sort((a, b) => a.dist - b.dist);
      const current = candidates.shift()!;

      // Furthest result
      const furthestResult = results.reduce((f, r) => (r.dist > f.dist ? r : f), results[0]);
      if (current.dist > furthestResult.dist) break;

      const currentNode = this._nodes.get(current.id);
      if (!currentNode) continue;

      const neighbours = currentNode.connections[layer] ?? [];
      for (const nId of neighbours) {
        if (visited.has(nId)) continue;
        visited.add(nId);

        const nNode = this._nodes.get(nId);
        if (!nNode) continue;

        const dist = this._distance(query, nNode.vector);
        const worst = results.reduce((f, r) => (r.dist > f.dist ? r : f), results[0]);

        if (results.length < ef || dist < worst.dist) {
          candidates.push({ id: nId, dist });
          results.push({ id: nId, dist });

          // Trim results to ef
          if (results.length > ef) {
            results.sort((a, b) => a.dist - b.dist);
            results.pop();
          }
        }
      }
    }

    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  // ── Neighbour selection (simple) ──────────────────────────────────────────

  /**
   * Select at most `M` nearest neighbours from candidates.
   */
  private _selectNeighbours(
    candidates: Array<{ id: string; dist: number }>,
    M: number,
  ): string[] {
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, M).map((c) => c.id);
  }

  // ── Add a vector ──────────────────────────────────────────────────────────

  /**
   * Add a vector to the index.
   *
   * @param id     - Unique identifier for the vector.
   * @param vector - Dense embedding vector.
   */
  add(id: string, vector: number[]): void {
    const nodeLayer = this._randomLayer();

    const newNode: HNSWNode = {
      id,
      vector,
      connections: {},
      layer: nodeLayer,
    };

    // Initialise empty connection lists for each layer
    for (let l = 0; l <= nodeLayer; l++) {
      newNode.connections[l] = [];
    }

    // First node — becomes the entry point
    if (this._nodes.size === 0) {
      this._nodes.set(id, newNode);
      this._entryPointId = id;
      this._maxLayer = nodeLayer;
      return;
    }

    this._nodes.set(id, newNode);

    let currentEntryId = this._entryPointId!;

    // Phase 1: Greedy descent from top layer down to nodeLayer + 1
    for (let layer = this._maxLayer; layer > nodeLayer; layer--) {
      const nearest = this._searchLayer(vector, currentEntryId, 1, layer);
      if (nearest.length > 0) {
        currentEntryId = nearest[0].id;
      }
    }

    // Phase 2: Insert at layers [min(maxLayer, nodeLayer), ..., 0]
    const insertUpTo = Math.min(this._maxLayer, nodeLayer);
    for (let layer = insertUpTo; layer >= 0; layer--) {
      const candidates = this._searchLayer(
        vector,
        currentEntryId,
        this._efConstruction,
        layer,
      );

      const M = layer === 0 ? this._M * 2 : this._M;
      const selectedIds = this._selectNeighbours(candidates, M);

      // Connect new node to selected neighbours
      newNode.connections[layer] = selectedIds;

      // Add reverse connections (bidirectional)
      for (const nId of selectedIds) {
        const nNode = this._nodes.get(nId);
        if (!nNode) continue;
        if (!nNode.connections[layer]) nNode.connections[layer] = [];
        nNode.connections[layer].push(id);

        // Trim connections if they exceed M
        if (nNode.connections[layer].length > M) {
          const withDist = nNode.connections[layer].map((cId) => {
            const cNode = this._nodes.get(cId);
            return {
              id: cId,
              dist: cNode ? this._distance(nNode.vector, cNode.vector) : Infinity,
            };
          });
          nNode.connections[layer] = this._selectNeighbours(withDist, M);
        }
      }

      if (candidates.length > 0) {
        currentEntryId = candidates[0].id;
      }
    }

    // Update entry point if new node is at a higher layer
    if (nodeLayer > this._maxLayer) {
      this._maxLayer = nodeLayer;
      this._entryPointId = id;
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Search for the k nearest neighbours of a query vector.
   *
   * For datasets with fewer than 100 vectors, a brute-force linear scan
   * is used instead of the HNSW graph traversal.
   *
   * @param query - Query vector.
   * @param k     - Number of nearest neighbours to return.
   * @param ef    - Size of the dynamic candidate list (default efConstruction).
   * @returns Nearest neighbours sorted by ascending distance (closest first).
   */
  search(query: number[], k: number, ef?: number): HNSWSearchResult[] {
    if (this._nodes.size === 0) return [];

    // Brute-force for small datasets
    if (this._nodes.size < 100) {
      return this._bruteForceSearch(query, k);
    }

    const effectiveEf = Math.max(ef ?? this._efConstruction, k);
    let currentEntryId = this._entryPointId!;

    // Greedy descent from top layer to layer 1
    for (let layer = this._maxLayer; layer > 0; layer--) {
      const nearest = this._searchLayer(query, currentEntryId, 1, layer);
      if (nearest.length > 0) {
        currentEntryId = nearest[0].id;
      }
    }

    // Search at layer 0 with full ef
    const results = this._searchLayer(query, currentEntryId, effectiveEf, 0);

    return results.slice(0, k).map((r) => ({ id: r.id, distance: r.dist }));
  }

  /**
   * Brute-force linear scan over all vectors. Used as fallback for
   * small datasets where graph traversal overhead is not worthwhile.
   */
  private _bruteForceSearch(query: number[], k: number): HNSWSearchResult[] {
    const scored: HNSWSearchResult[] = [];
    for (const node of this._nodes.values()) {
      scored.push({ id: node.id, distance: this._distance(query, node.vector) });
    }
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, k);
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  /**
   * Remove a vector from the index by ID.
   *
   * This performs a "lazy delete": the node is removed and all references
   * to it in neighbour lists are cleaned up, but the graph is not
   * re-optimised. Acceptable for moderate deletion workloads.
   *
   * @param id - ID of the vector to remove.
   */
  remove(id: string): void {
    const node = this._nodes.get(id);
    if (!node) return;

    // Remove references to this node from all neighbours
    for (const [layerStr, neighbours] of Object.entries(node.connections)) {
      const layer = Number(layerStr);
      for (const nId of neighbours) {
        const nNode = this._nodes.get(nId);
        if (!nNode || !nNode.connections[layer]) continue;
        nNode.connections[layer] = nNode.connections[layer].filter((cId) => cId !== id);
      }
    }

    this._nodes.delete(id);

    // If we removed the entry point, pick a new one
    if (this._entryPointId === id) {
      if (this._nodes.size === 0) {
        this._entryPointId = null;
        this._maxLayer = 0;
      } else {
        // Pick the node with the highest layer
        let bestId: string | null = null;
        let bestLayer = -1;
        for (const [nId, nNode] of this._nodes) {
          if (nNode.layer > bestLayer) {
            bestLayer = nNode.layer;
            bestId = nId;
          }
        }
        this._entryPointId = bestId;
        this._maxLayer = bestLayer;
      }
    }
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  /**
   * Serialise the entire index to a JSON string for persistence.
   */
  serialize(): string {
    const data = {
      M: this._M,
      efConstruction: this._efConstruction,
      entryPointId: this._entryPointId,
      maxLayer: this._maxLayer,
      nodes: Array.from(this._nodes.values()),
    };
    return JSON.stringify(data);
  }

  /**
   * Restore an HNSWIndex from a serialised JSON string.
   *
   * @param data - JSON string previously returned by `serialize()`.
   * @returns Restored HNSWIndex instance.
   */
  static deserialize(data: string): HNSWIndex {
    const parsed = JSON.parse(data) as {
      M: number;
      efConstruction: number;
      entryPointId: string | null;
      maxLayer: number;
      nodes: HNSWNode[];
    };

    const index = new HNSWIndex({
      M: parsed.M,
      efConstruction: parsed.efConstruction,
    });

    index._entryPointId = parsed.entryPointId;
    index._maxLayer = parsed.maxLayer;

    for (const node of parsed.nodes) {
      index._nodes.set(node.id, node);
    }

    return index;
  }
}

// ─── Section 6: Hybrid Search with RRF ────────────────────────────────────────

/**
 * Reciprocal Rank Fusion constant.
 * Higher values smooth out rank differences; 60 is the standard default.
 */
const RRF_K = 60;

/**
 * Hybrid search combining dense cosine similarity and sparse TF-IDF
 * scoring with Reciprocal Rank Fusion (RRF).
 *
 * Pipeline:
 *   1. Dense scoring:  cosine similarity between query embedding & chunk embeddings.
 *   2. Sparse scoring: TF-IDF cosine similarity between query & chunk sparse vectors.
 *   3. RRF fusion:     `score(d) = 1/(k + rank_dense) + 1/(k + rank_sparse)`.
 *   4. Diversity:      at most `maxPerDoc` chunks per source document.
 *   5. Reranking:      optional embedding-based rerank of top-20 candidates.
 *
 * @param query     - Natural-language query text.
 * @param allChunks - All candidate chunks to search over.
 * @param options   - Search configuration.
 * @returns Ranked search results.
 */
export async function hybridSearch(
  query: string,
  allChunks: SearchChunk[],
  options: HybridSearchOptions,
): Promise<VectorSearchResult[]> {
  const topK = options.topK ?? 6;
  const useDense = options.useDense ?? true;
  const useSparse = options.useSparse ?? true;
  const rerank = options.rerank ?? false;
  const maxPerDoc = options.maxPerDoc ?? 3;

  if (allChunks.length === 0) return [];

  // ── Step 1: Dense scoring ─────────────────────────────────────────────────
  const denseScores: Map<string, number> = new Map();

  if (useDense && options.geminiKey) {
    try {
      const queryEmbedding = await embedWithGemini(
        query,
        options.geminiKey,
        'RETRIEVAL_QUERY',
      );

      for (const chunk of allChunks) {
        if (chunk.embedding) {
          const score = cosineDense(queryEmbedding, chunk.embedding);
          denseScores.set(chunk.id, score);
        }
      }
    } catch (e) {
      console.warn('[VectorSearch] Dense scoring failed, proceeding with sparse only:', e);
    }
  }

  // ── Step 2: Sparse (TF-IDF) scoring ───────────────────────────────────────
  const sparseScores: Map<string, number> = new Map();

  if (useSparse) {
    const queryTFIDF = buildTFIDF(query);

    for (const chunk of allChunks) {
      const chunkTFIDF = chunk.tfidf ?? buildTFIDF(chunk.text);
      const score = cosineSparse(queryTFIDF, chunkTFIDF);
      sparseScores.set(chunk.id, score);
    }
  }

  // ── Step 3: Reciprocal Rank Fusion (RRF) ──────────────────────────────────

  // Build ranked lists
  const denseRanked = [...denseScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id], rank) => ({ id, rank: rank + 1 }));

  const sparseRanked = [...sparseScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id], rank) => ({ id, rank: rank + 1 }));

  // Build rank lookup maps
  const denseRankMap = new Map<string, number>();
  for (const { id, rank } of denseRanked) {
    denseRankMap.set(id, rank);
  }

  const sparseRankMap = new Map<string, number>();
  for (const { id, rank } of sparseRanked) {
    sparseRankMap.set(id, rank);
  }

  // Compute RRF score for every chunk
  const rrfScores: Map<string, number> = new Map();
  const allIds = new Set([...denseScores.keys(), ...sparseScores.keys()]);

  for (const id of allIds) {
    const denseRank = denseRankMap.get(id) ?? allChunks.length + 1;
    const sparseRank = sparseRankMap.get(id) ?? allChunks.length + 1;
    const rrf = 1 / (RRF_K + denseRank) + 1 / (RRF_K + sparseRank);
    rrfScores.set(id, rrf);
  }

  // If neither dense nor sparse produced scores, score everything at 0
  if (rrfScores.size === 0) {
    for (const chunk of allChunks) {
      rrfScores.set(chunk.id, 0);
    }
  }

  // ── Step 4: Sort and apply diversity constraint ───────────────────────────

  // Build lookup map for chunks
  const chunkMap = new Map<string, SearchChunk>();
  for (const chunk of allChunks) {
    chunkMap.set(chunk.id, chunk);
  }

  const sortedIds = [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1]);

  const docCount: Record<string, number> = {};
  const candidates: VectorSearchResult[] = [];

  for (const [id, rrfScore] of sortedIds) {
    const chunk = chunkMap.get(id);
    if (!chunk) continue;

    const currentDocCount = docCount[chunk.docId] || 0;
    if (currentDocCount >= maxPerDoc) continue;

    candidates.push({
      chunkId: chunk.id,
      docId: chunk.docId,
      docTitle: chunk.docTitle,
      text: chunk.text,
      denseScore: denseScores.get(id) ?? 0,
      sparseScore: sparseScores.get(id) ?? 0,
      rrfScore,
    });

    docCount[chunk.docId] = currentDocCount + 1;

    // Collect top-20 for potential reranking, more than topK if reranking
    if (candidates.length >= (rerank ? 20 : topK)) break;
  }

  // ── Step 5: Optional reranking ────────────────────────────────────────────

  if (rerank && options.geminiKey && candidates.length > 0) {
    try {
      // Embed the query and all candidate texts together for reranking
      const textsToEmbed = [query, ...candidates.map((c) => c.text)];
      const embeddings = await batchEmbedWithGemini(
        textsToEmbed,
        options.geminiKey,
        'RETRIEVAL_QUERY',
      );

      const queryEmb = embeddings[0];
      for (let i = 0; i < candidates.length; i++) {
        const candidateEmb = embeddings[i + 1];
        candidates[i].rerankedScore = cosineDense(queryEmb, candidateEmb);
      }

      // Re-sort by reranked score
      candidates.sort((a, b) => (b.rerankedScore ?? 0) - (a.rerankedScore ?? 0));
    } catch (e) {
      console.warn('[VectorSearch] Reranking failed, using RRF order:', e);
    }
  }

  // Return final top-K
  return candidates.slice(0, topK);
}
