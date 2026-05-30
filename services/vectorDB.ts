/**
 * Bio-SentinelX Vector Database Service
 * In-browser RAG (Retrieval-Augmented Generation) engine.
 *
 * Modified to integrate with the new vectorSearchEngine and IndexedDB.
 */

import {
  vectorStore,
  tokenize,
  buildTFIDF,
  cosineDense,
  embedWithGemini,
  semanticChunk,
  fixedChunk,
  hybridSearch,
  type StoredVectorDocument as ResearchDocument,
  type StoredVectorChunk as ResearchChunk,
  type SearchChunk
} from './vectorSearchEngine';

export { type ResearchDocument, type ResearchChunk };

export interface EmbeddingStats {
  totalDocs: number;
  totalChunks: number;
  embeddedChunks: number;  // chunks with dense embedding
  tfidfChunks: number;     // chunks using TF-IDF fallback
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

// Cache in-memory for synchronous lookups in UI methods,
// but all vectorStore calls are asynchronous. So we keep a local cache
// that we keep in sync with IndexedDB!
let cacheDocs: ResearchDocument[] = [];
let cacheChunks: ResearchChunk[] = [];
let cacheInitialized = false;

async function ensureCache(): Promise<void> {
  if (cacheInitialized) return;
  try {
    cacheDocs = await vectorStore.loadDocuments();
    cacheChunks = await vectorStore.loadChunks();
    cacheInitialized = true;
  } catch (e) {
    console.error('[VectorDB] Failed to initialize in-memory cache from IndexedDB:', e);
  }
}

// Kick off initialization
ensureCache();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a research document to the vector DB.
 * Chunks the text using semantic chunking, builds TF-IDF vectors,
 * and attempts to generate dense Gemini embeddings.
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
  await ensureCache();

  const docId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  
  // Use semantic chunking by default (it snaps to boundaries beautifully!)
  const textChunks = semanticChunk(content, { maxChunkSize: 600, overlapSize: 100 });
  const chunkIds: string[] = [];
  const newChunks: ResearchChunk[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    const chunkId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
        chunk.embedding = await embedWithGemini(textChunks[i], geminiKey, 'RETRIEVAL_DOCUMENT');
      } catch (e) {
        console.warn(`[VectorDB] Embedding failed for chunk ${i}:`, e);
      }
    }

    newChunks.push(chunk);
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

  cacheDocs.push(doc);
  cacheChunks.push(...newChunks);

  await vectorStore.saveDocuments(cacheDocs);
  await vectorStore.saveChunks(cacheChunks);

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
  await ensureCache();
  
  const docChunks = cacheChunks.filter(c => c.docId === docId);
  for (let i = 0; i < docChunks.length; i++) {
    try {
      docChunks[i].embedding = await embedWithGemini(docChunks[i].text, geminiKey, 'RETRIEVAL_DOCUMENT');
    } catch (e) {
      console.warn(`[VectorDB] Re-embed failed for chunk ${i}`, e);
    }
    onProgress?.(i + 1, docChunks.length);
  }

  // Update in-memory chunks cache
  cacheChunks = cacheChunks.map(c => {
    const found = docChunks.find(d => d.id === c.id);
    return found ?? c;
  });

  await vectorStore.saveChunks(cacheChunks);
}

/**
 * Remove a document and all its chunks from the store.
 */
export async function removeDocument(docId: string): Promise<void> {
  await ensureCache();
  cacheDocs = cacheDocs.filter(d => d.id !== docId);
  cacheChunks = cacheChunks.filter(c => c.docId !== docId);
  await vectorStore.saveDocuments(cacheDocs);
  await vectorStore.saveChunks(cacheChunks);
}

/** Return all stored documents (metadata only, no chunks). */
export function getAllDocuments(): ResearchDocument[] {
  return cacheDocs;
}

/** Return the chunks belonging to a specific document (text + embedding status only). */
export function getDocumentChunks(docId: string): Array<{ id: string; text: string; hasDense: boolean }> {
  return cacheChunks
    .filter(c => c.docId === docId)
    .map(c => ({ id: c.id, text: c.text, hasDense: !!c.embedding }));
}

/** Return embedding coverage stats. */
export function getEmbeddingStats(): EmbeddingStats {
  return {
    totalDocs: cacheDocs.length,
    totalChunks: cacheChunks.length,
    embeddedChunks: cacheChunks.filter(c => !!c.embedding).length,
    tfidfChunks: cacheChunks.filter(c => !c.embedding && !!c.tfidf).length,
  };
}

/** Clear all documents and chunks. */
export async function clearAllDocuments(): Promise<void> {
  cacheDocs = [];
  cacheChunks = [];
  await vectorStore.clear();
}

/**
 * Retrieve the top-k most relevant chunks for a given query string.
 * Leverages the high-performance hybridSearch (dense + sparse + RRF) under the hood.
 *
 * @param query     Natural-language query
 * @param topK      Number of chunks to return (default 6)
 * @param geminiKey Optional Gemini API key to embed the query densely
 * @returns Formatted string ready for injection into the AI prompt
 */
export async function retrieveRelevant(
  query: string,
  topK = 6,
  geminiKey?: string,
): Promise<string> {
  await ensureCache();
  if (cacheChunks.length === 0) return '';

  try {
    const allSearchChunks: SearchChunk[] = cacheChunks.map(c => ({
      id: c.id,
      text: c.text,
      embedding: c.embedding,
      tfidf: c.tfidf,
      docId: c.docId,
      docTitle: c.docTitle
    }));

    const results = await hybridSearch(query, allSearchChunks, {
      topK,
      geminiKey,
      useDense: !!geminiKey && cacheChunks.some(c => !!c.embedding),
      useSparse: true,
      rerank: false, // Default to false for retrieval performance
      maxPerDoc: 3
    });

    if (results.length === 0) return '';

    // Format into a structured injection block
    const lines: string[] = [
      '### Retrieved Research Context (from user-uploaded literature)',
      '_The following excerpts were automatically retrieved from the Research Library based on relevance to the current analysis. Use this evidence to ground and enrich the report output._',
      '',
    ];

    results.forEach((item, idx) => {
      const displayScore = item.denseScore > 0 
        ? item.denseScore 
        : item.sparseScore;
      lines.push(`**[${idx + 1}] ${item.docTitle}** _(relevance: ${(displayScore * 100).toFixed(0)}%)_`);
      lines.push(item.text);
      lines.push('');
    });

    return lines.join('\n');
  } catch (err) {
    console.error('[VectorDB] retrieveRelevant failed:', err);
    return '';
  }
}

/** Expose the cached chunks asynchronously to ensure cache is fully initialized first. */
export async function getAllChunksAsync(): Promise<ResearchChunk[]> {
  await ensureCache();
  return cacheChunks;
}

