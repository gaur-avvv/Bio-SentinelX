/**
 * Bio-SentinelX Vector Database Service
 * In-browser RAG (Retrieval-Augmented Generation) engine.
 *
 * Architecture:
 *   1. User uploads research text → chunked into ~600-char segments with overlap.
 *   2. Each chunk is embedded via Gemini text-embedding-004 API (if key present),
 *      or falls back to a TF-IDF bag-of-words vector (no API required).
 *   3. Embeddings + documents are persisted to localStorage.
 *   4. At analysis time, a query vector is built from the current context
 *      and the top-k most similar chunks are retrieved via cosine similarity.
 *   5. Retrieved chunks are injected into the AI prompt as additional context.
 */

// ─── Storage keys ────────────────────────────────────────────────────────────
const DOCS_KEY   = 'biosentinel_rag_docs';
const CHUNKS_KEY = 'biosentinel_rag_chunks';

// ─── Types (internal) ────────────────────────────────────────────────────────
export interface ResearchDocument {
  id: string;
  title: string;
  source: string;
  addedAt: number;
  chunkIds: string[];
  charCount: number;
}

export interface ResearchChunk {
  id: string;
  docId: string;
  docTitle: string;
  text: string;
  embedding?: number[];               // Dense embedding from Gemini
  tfidf?: Record<string, number>;     // Sparse TF-IDF fallback
}

export interface EmbeddingStats {
  totalDocs: number;
  totalChunks: number;
  embeddedChunks: number;  // chunks with dense embedding
  tfidfChunks: number;     // chunks using TF-IDF fallback
}

// ─── Persistence helpers ──────────────────────────────────────────────────────
function loadDocs(): ResearchDocument[] {
  try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '[]'); } catch { return []; }
}
function saveDocs(docs: ResearchDocument[]): void {
  localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
}
function loadChunks(): ResearchChunk[] {
  try { return JSON.parse(localStorage.getItem(CHUNKS_KEY) || '[]'); } catch { return []; }
}
function saveChunks(chunks: ResearchChunk[]): void {
  // Strip dense embeddings if the payload would exceed localStorage quota (~4.5 MB cap).
  // We keep TF-IDF vectors, which are compact, and silently downgrade dense-only chunks.
  const tryStore = (payload: ResearchChunk[]) => {
    localStorage.setItem(CHUNKS_KEY, JSON.stringify(payload));
  };
  try {
    tryStore(chunks);
  } catch {
    // Quota exceeded with dense embeddings — strip them and retry with TF-IDF only
    console.warn('[VectorDB] localStorage quota exceeded. Stripping dense embeddings to save space.');
    try {
      tryStore(chunks.map(c => ({ ...c, embedding: undefined })));
    } catch {
      console.error('[VectorDB] localStorage quota exceeded even without embeddings. Clearing chunk store.');
      localStorage.removeItem(CHUNKS_KEY);
    }
  }
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 650;   // characters
const CHUNK_OVERLAP = 120; // characters of overlap between consecutive chunks

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    // Snap end to nearest sentence boundary within 80 chars to avoid mid-word cuts
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf('.', end);
      if (boundary > start + CHUNK_SIZE - 80) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);
    // Stop when we've consumed to (or past) the end of the document
    if (end >= normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

// ─── TF-IDF Fallback ──────────────────────────────────────────────────────────
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
  Object.entries(freq).forEach(([term, count]) => {
    tfidf[term] = count / total; // TF only (IDF approximated as uniform for retrieval)
  });
  return tfidf;
}

function cosineTFIDF(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  Object.entries(a).forEach(([term, va]) => {
    dot += va * (b[term] || 0);
    magA += va * va;
  });
  Object.values(b).forEach(vb => { magB += vb * vb; });
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Dense embedding (Gemini text-embedding-004) ──────────────────────────────
async function embedWithGemini(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error?.message || `Gemini Embedding API error ${res.status}`);
  }
  const data = await res.json() as any;
  return data.embedding?.values as number[];
}

async function embedQueryWithGemini(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  });
  if (!res.ok) throw new Error(`Embedding query failed: ${res.status}`);
  const data = await res.json() as any;
  return data.embedding?.values as number[];
}

function cosineDense(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── UID ─────────────────────────────────────────────────────────────────────
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a research document to the vector DB.
 * Chunks the text, builds TF-IDF vectors immediately, and attempts to
 * generate dense Gemini embeddings if an API key is provided.
 *
 * @param title    Human-readable title for the document
 * @param source   Source reference (journal, URL, etc.)
 * @param content  Full text of the document
 * @param geminiKey Optional Gemini API key for dense embeddings
 * @param onProgress Callback(chunksEmbedded, totalChunks) during embedding
 */
export async function addDocument(
  title: string,
  source: string,
  content: string,
  geminiKey?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ResearchDocument> {
  const docs = loadDocs();
  const chunks = loadChunks();

  const docId = uid();
  const textChunks = chunkText(content);
  const chunkIds: string[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    const chunkId = uid();
    const chunk: ResearchChunk = {
      id: chunkId,
      docId,
      docTitle: title,
      text: textChunks[i],
      tfidf: buildTFIDF(textChunks[i]),
    };

    // Attempt dense embedding
    if (geminiKey) {
      try {
        chunk.embedding = await embedWithGemini(textChunks[i], geminiKey);
      } catch (e) {
        // Non-fatal: TF-IDF fallback will be used
        console.warn(`[VectorDB] Embedding failed for chunk ${i}:`, e);
      }
    }

    chunks.push(chunk);
    chunkIds.push(chunkId);
    onProgress?.(i + 1, textChunks.length);
  }

  const doc: ResearchDocument = {
    id: docId,
    title,
    source,
    addedAt: Date.now(),
    chunkIds,
    charCount: content.length,
  };

  docs.push(doc);
  saveDocs(docs);
  saveChunks(chunks);
  return doc;
}

/**
 * Re-embed a document's chunks using Gemini (upgrade from TF-IDF to dense).
 */
export async function reEmbedDocument(
  docId: string,
  geminiKey: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const chunks = loadChunks();
  const docChunks = chunks.filter(c => c.docId === docId);
  for (let i = 0; i < docChunks.length; i++) {
    try {
      docChunks[i].embedding = await embedWithGemini(docChunks[i].text, geminiKey);
    } catch (e) {
      console.warn(`[VectorDB] Re-embed failed for chunk ${i}`, e);
    }
    onProgress?.(i + 1, docChunks.length);
  }
  // Merge back
  const updated = chunks.map(c => {
    const found = docChunks.find(d => d.id === c.id);
    return found ?? c;
  });
  saveChunks(updated);
}

/**
 * Remove a document and all its chunks from the store.
 */
export function removeDocument(docId: string): void {
  const docs = loadDocs().filter(d => d.id !== docId);
  const chunks = loadChunks().filter(c => c.docId !== docId);
  saveDocs(docs);
  saveChunks(chunks);
}

/** Return all stored documents (metadata only, no chunks). */
export function getAllDocuments(): ResearchDocument[] {
  return loadDocs();
}

/** Return the chunks belonging to a specific document (text + embedding status only, no raw vectors). */
export function getDocumentChunks(docId: string): Array<{ id: string; text: string; hasDense: boolean }> {
  return loadChunks()
    .filter(c => c.docId === docId)
    .map(c => ({ id: c.id, text: c.text, hasDense: !!c.embedding }));
}

/** Return embedding coverage stats. */
export function getEmbeddingStats(): EmbeddingStats {
  const docs = loadDocs();
  const chunks = loadChunks();
  return {
    totalDocs: docs.length,
    totalChunks: chunks.length,
    embeddedChunks: chunks.filter(c => !!c.embedding).length,
    tfidfChunks: chunks.filter(c => !c.embedding && !!c.tfidf).length,
  };
}

/** Clear all documents and chunks. */
export function clearAllDocuments(): void {
  saveDocs([]);
  saveChunks([]);
}

/**
 * Retrieve the top-k most relevant chunks for a given query string.
 * Uses dense cosine similarity if available, otherwise TF-IDF.
 *
 * @param query     Natural-language query (derived from weather/location context)
 * @param topK      Number of chunks to return (default 6)
 * @param geminiKey Optional Gemini API key to embed the query densely
 * @returns Formatted string ready for injection into the AI prompt
 */
export async function retrieveRelevant(
  query: string,
  topK = 6,
  geminiKey?: string,
): Promise<string> {
  const chunks = loadChunks();
  if (chunks.length === 0) return '';

  // Try dense query embedding
  let queryEmbedding: number[] | null = null;
  if (geminiKey && chunks.some(c => !!c.embedding)) {
    try {
      queryEmbedding = await embedQueryWithGemini(query, geminiKey);
    } catch (e) {
      console.warn('[VectorDB] Query embedding failed, falling back to TF-IDF', e);
    }
  }

  const queryTFIDF = buildTFIDF(query);

  // Score each chunk
  const scored = chunks.map(chunk => {
    let score = 0;
    if (queryEmbedding && chunk.embedding) {
      score = cosineDense(queryEmbedding, chunk.embedding);
    } else if (chunk.tfidf) {
      score = cosineTFIDF(queryTFIDF, chunk.tfidf);
    }
    return { chunk, score };
  });

  // Sort descending, deduplicate by docId to favour diversity
  scored.sort((a, b) => b.score - a.score);

  const selected: typeof scored = [];
  const seenDocs: Record<string, number> = {};
  for (const item of scored) {
    if (item.score < 0.01) break;   // below relevance floor
    const docCount = seenDocs[item.chunk.docId] || 0;
    if (docCount >= 3) continue;    // max 3 chunks per same doc
    selected.push(item);
    seenDocs[item.chunk.docId] = docCount + 1;
    if (selected.length >= topK) break;
  }

  if (selected.length === 0) return '';

  // Format into a structured injection block
  const lines: string[] = [
    '### Retrieved Research Context (from user-uploaded literature)',
    '_The following excerpts were automatically retrieved from the Research Library based on relevance to the current analysis. Use this evidence to ground and enrich the report output._',
    '',
  ];

  selected.forEach((item, idx) => {
    lines.push(`**[${idx + 1}] ${item.chunk.docTitle}** _(relevance: ${(item.score * 100).toFixed(0)}%)_`);
    lines.push(item.chunk.text);
    lines.push('');
  });

  return lines.join('\n');
}
