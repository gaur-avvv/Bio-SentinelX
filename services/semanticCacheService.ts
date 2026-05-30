/**
 * Bio-SentinelX — Semantic Cache Service
 *
 * Two-layer (exact + semantic) cache that intercepts LLM queries to return
 * cached responses instantly when a match is found.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Layer 1 — Exact Match                                                  │
 * │  SHA-256 hash of (provider + model + systemInstruction + userPrompt).   │
 * │  O(1) lookup via IndexedDB index on `queryHash`.                        │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  Layer 2 — Semantic Match                                               │
 * │  Cosine similarity between query embedding and cached entry embeddings. │
 * │  Per-callType similarity threshold (e.g. 0.97 for outbreak, 0.90 chat). │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Persistence: IndexedDB (`biosentinel_semantic_cache`) with automatic
 * fallback to an in-memory Map when IndexedDB is unavailable.
 *
 * IMPORTANT: This file is fully self-contained — no imports from other
 * service files.
 */

// ─── UUID Generation ──────────────────────────────────────────────────────────

/**
 * Generate a unique identifier string.
 * Prefers `crypto.randomUUID()` where available, otherwise falls back
 * to a timestamp + random combination.
 */
function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fallback below */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Cosine Similarity ───────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two dense numeric vectors.
 * Returns 0 for zero-magnitude or mismatched-length inputs.
 */
function cosineSimilarity(a: number[], b: number[]): number {
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

// ─── Types ────────────────────────────────────────────────────────────────────

/** Supported call types for cache segmentation. */
export type CacheCallType = 'report' | 'chat' | 'historical' | 'outbreak' | 'flood';

/** A single cached LLM query/response pair with metadata. */
export interface SemanticCacheEntry {
  /** Unique entry identifier (UUID). */
  id: string;
  /** SHA-256 hash for exact-match lookup. */
  queryHash: string;
  /** Dense embedding vector for semantic-match lookup. */
  queryEmbedding: number[];
  /** Original query text (first 500 chars). */
  queryText: string;
  /** Cached LLM response. */
  responseText: string;
  /** AI provider name (e.g. "gemini", "openrouter"). */
  provider: string;
  /** Model identifier used for the original call. */
  model: string;
  /** Category of the original call for threshold/TTL segmentation. */
  callType: CacheCallType;
  /** Unix timestamp (ms) when the entry was created. */
  createdAt: number;
  /** Time-to-live in milliseconds from `createdAt`. */
  ttlMs: number;
  /** Number of times this entry has been served as a cache hit. */
  hitCount: number;
  /** Unix timestamp (ms) of the most recent cache hit. */
  lastHitAt: number;
}

/** Result returned from a cache lookup operation. */
export interface CacheResult {
  /** Whether a cache hit was found. */
  hit: boolean;
  /** Type of match: exact hash, semantic similarity, or miss. */
  type: 'exact' | 'semantic' | 'miss';
  /** Cosine similarity score (only for semantic hits). */
  similarity?: number;
  /** Cached response text (only for hits). */
  response?: string;
  /** Lookup latency in milliseconds. */
  latencyMs: number;
  /** ID of the matched entry (only for hits). */
  entryId?: string;
}

/** Aggregate statistics for the semantic cache. */
export interface SemanticCacheStats {
  /** Total number of active cache entries. */
  totalEntries: number;
  /** Cumulative exact-match cache hits. */
  exactHits: number;
  /** Cumulative semantic-match cache hits. */
  semanticHits: number;
  /** Cumulative cache misses. */
  misses: number;
  /** Average lookup latency across all lookups (ms). */
  avgLatencyMs: number;
  /** Estimated tokens saved via cache hits (chars / 3.8). */
  tokensSaved: number;
}

// ─── SHA-256 Hashing ──────────────────────────────────────────────────────────

/**
 * Produce a SHA-256 hex digest of the concatenation of all four query
 * dimensions. Falls back to a simple djb2-like string hash if the
 * Web Crypto API is unavailable.
 */
async function hashQuery(
  provider: string,
  model: string,
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  const raw = `${provider}|${model}|${systemInstruction}|${userPrompt}`;

  // Prefer browser-native SHA-256 via SubtleCrypto
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(raw);
      const digest = await crypto.subtle.digest('SHA-256', data);
      const bytes = new Uint8Array(digest);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fallback below */ }

  // Fallback: simple 53-bit numeric hash (djb2 variant) → hex string
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

// ─── IndexedDB Storage Layer ──────────────────────────────────────────────────

const IDB_NAME = 'biosentinel_semantic_cache';
const IDB_VERSION = 1;
const STORE_ENTRIES = 'cache_entries';
const STORE_EMBEDDINGS = 'cache_embeddings';

/**
 * Lightweight IndexedDB wrapper with automatic fallback to an in-memory
 * Map when IndexedDB is unavailable (SSR, private browsing, etc.).
 */
class CacheStorage {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<boolean>;

  /** In-memory fallback stores. */
  private memEntries = new Map<string, SemanticCacheEntry>();
  private memEmbeddings = new Map<string, { id: string; embedding: number[] }>();

  /** Whether we are running in fallback (in-memory) mode. */
  private fallback = false;

  constructor() {
    this.dbReady = this.openDatabase();
  }

  // ── Database initialisation ─────────────────────────────────────────────────

  private openDatabase(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          console.warn('[SemanticCache] IndexedDB unavailable — using in-memory fallback.');
          this.fallback = true;
          resolve(false);
          return;
        }

        const request = indexedDB.open(IDB_NAME, IDB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
            const entryStore = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
            entryStore.createIndex('queryHash', 'queryHash', { unique: false });
            entryStore.createIndex('callType', 'callType', { unique: false });
          }

          if (!db.objectStoreNames.contains(STORE_EMBEDDINGS)) {
            db.createObjectStore(STORE_EMBEDDINGS, { keyPath: 'id' });
          }
        };

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;

          // Silently switch to fallback if the connection drops
          this.db.onclose = () => {
            this.db = null;
            this.fallback = true;
          };

          resolve(true);
        };

        request.onerror = () => {
          console.warn('[SemanticCache] IndexedDB open failed — using in-memory fallback.');
          this.fallback = true;
          resolve(false);
        };
      } catch {
        console.warn('[SemanticCache] IndexedDB not supported — using in-memory fallback.');
        this.fallback = true;
        resolve(false);
      }
    });
  }

  /** Ensure the database is ready before any operation. */
  private async ensureReady(): Promise<void> {
    await this.dbReady;
  }

  // ── Generic IDB transaction helpers ─────────────────────────────────────────

  private idbPut<T>(storeName: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not open')); return; }
      const tx = this.db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not open')); return; }
      const tx = this.db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private idbGetAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not open')); return; }
      const tx = this.db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private idbGetByIndex<T>(storeName: string, indexName: string, value: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not open')); return; }
      const tx = this.db.transaction(storeName, 'readonly');
      const index = tx.objectStore(storeName).index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private idbDelete(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not open')); return; }
      const tx = this.db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private idbClear(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not open')); return; }
      const tx = this.db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Public CRUD ─────────────────────────────────────────────────────────────

  /**
   * Persist a cache entry (metadata stored in `cache_entries`, embedding
   * stored separately in `cache_embeddings` to keep scans lightweight).
   */
  async saveEntry(entry: SemanticCacheEntry): Promise<void> {
    await this.ensureReady();

    // Separate the embedding for storage efficiency
    const { queryEmbedding, ...meta } = entry;
    const metaWithStub: SemanticCacheEntry = { ...meta, queryEmbedding: [] };

    if (this.fallback) {
      this.memEntries.set(entry.id, entry);
      this.memEmbeddings.set(entry.id, { id: entry.id, embedding: queryEmbedding });
      return;
    }

    try {
      await this.idbPut(STORE_ENTRIES, metaWithStub);
      await this.idbPut(STORE_EMBEDDINGS, { id: entry.id, embedding: queryEmbedding });
    } catch (err) {
      console.warn('[SemanticCache] IndexedDB saveEntry failed — caching in memory.', err);
      this.memEntries.set(entry.id, entry);
      this.memEmbeddings.set(entry.id, { id: entry.id, embedding: queryEmbedding });
    }
  }

  /**
   * Load a single cache entry by ID, re-attaching its embedding.
   */
  async loadEntry(id: string): Promise<SemanticCacheEntry | null> {
    await this.ensureReady();

    if (this.fallback) {
      return this.memEntries.get(id) ?? null;
    }

    try {
      const meta = await this.idbGet<SemanticCacheEntry>(STORE_ENTRIES, id);
      if (!meta) return null;
      const emb = await this.idbGet<{ id: string; embedding: number[] }>(STORE_EMBEDDINGS, id);
      return { ...meta, queryEmbedding: emb?.embedding ?? [] };
    } catch {
      return this.memEntries.get(id) ?? null;
    }
  }

  /**
   * Load all entries matching a queryHash (exact-match layer).
   */
  async loadEntriesByHash(queryHash: string): Promise<SemanticCacheEntry[]> {
    await this.ensureReady();

    if (this.fallback) {
      return Array.from(this.memEntries.values()).filter(e => e.queryHash === queryHash);
    }

    try {
      const metas = await this.idbGetByIndex<SemanticCacheEntry>(STORE_ENTRIES, 'queryHash', queryHash);
      // Re-attach embeddings
      const results: SemanticCacheEntry[] = [];
      for (const meta of metas) {
        const emb = await this.idbGet<{ id: string; embedding: number[] }>(STORE_EMBEDDINGS, meta.id);
        results.push({ ...meta, queryEmbedding: emb?.embedding ?? [] });
      }
      return results;
    } catch {
      return Array.from(this.memEntries.values()).filter(e => e.queryHash === queryHash);
    }
  }

  /**
   * Load all entries for a specific callType (used for semantic scan).
   */
  async loadEntriesByCallType(callType: string): Promise<SemanticCacheEntry[]> {
    await this.ensureReady();

    if (this.fallback) {
      return Array.from(this.memEntries.values()).filter(e => e.callType === callType);
    }

    try {
      const metas = await this.idbGetByIndex<SemanticCacheEntry>(STORE_ENTRIES, 'callType', callType);
      const results: SemanticCacheEntry[] = [];
      for (const meta of metas) {
        const emb = await this.idbGet<{ id: string; embedding: number[] }>(STORE_EMBEDDINGS, meta.id);
        results.push({ ...meta, queryEmbedding: emb?.embedding ?? [] });
      }
      return results;
    } catch {
      return Array.from(this.memEntries.values()).filter(e => e.callType === callType);
    }
  }

  /**
   * Load every cache entry (with embeddings re-attached).
   */
  async loadAllEntries(): Promise<SemanticCacheEntry[]> {
    await this.ensureReady();

    if (this.fallback) {
      return Array.from(this.memEntries.values());
    }

    try {
      const metas = await this.idbGetAll<SemanticCacheEntry>(STORE_ENTRIES);
      const results: SemanticCacheEntry[] = [];
      for (const meta of metas) {
        const emb = await this.idbGet<{ id: string; embedding: number[] }>(STORE_EMBEDDINGS, meta.id);
        results.push({ ...meta, queryEmbedding: emb?.embedding ?? [] });
      }
      return results;
    } catch {
      return Array.from(this.memEntries.values());
    }
  }

  /**
   * Delete a single cache entry and its embedding.
   */
  async deleteEntry(id: string): Promise<void> {
    await this.ensureReady();

    this.memEntries.delete(id);
    this.memEmbeddings.delete(id);

    if (this.fallback) return;

    try {
      await this.idbDelete(STORE_ENTRIES, id);
      await this.idbDelete(STORE_EMBEDDINGS, id);
    } catch (err) {
      console.warn('[SemanticCache] IndexedDB deleteEntry failed.', err);
    }
  }

  /**
   * Wipe all cache entries and embeddings.
   */
  async clear(): Promise<void> {
    await this.ensureReady();

    this.memEntries.clear();
    this.memEmbeddings.clear();

    if (this.fallback) return;

    try {
      await this.idbClear(STORE_ENTRIES);
      await this.idbClear(STORE_EMBEDDINGS);
    } catch (err) {
      console.warn('[SemanticCache] IndexedDB clear failed.', err);
    }
  }
}

// ─── SemanticCacheService ─────────────────────────────────────────────────────

class SemanticCacheService {
  // ── Configuration ───────────────────────────────────────────────────────────

  /**
   * Minimum cosine similarity required for a semantic hit, per call type.
   * Higher thresholds mean stricter matching (fewer false positives).
   */
  private readonly SIMILARITY_THRESHOLDS: Record<string, number> = {
    report: 0.95,
    chat: 0.90,
    historical: 0.93,
    outbreak: 0.97,
    flood: 0.95,
  };

  /**
   * Default time-to-live for each call type. Entries older than their TTL
   * are treated as expired and will be evicted on the next cleanup pass.
   */
  private readonly TTL_DEFAULTS: Record<string, number> = {
    report: 2 * 60 * 60 * 1000,     // 2 hours
    chat: 30 * 60 * 1000,            // 30 minutes
    historical: 4 * 60 * 60 * 1000,  // 4 hours
    outbreak: 15 * 60 * 1000,        // 15 minutes
    flood: 60 * 60 * 1000,           // 1 hour
  };

  /** Default TTL when the call type is unknown. */
  private readonly DEFAULT_TTL = 60 * 60 * 1000; // 1 hour

  /** Default similarity threshold when the call type is unknown. */
  private readonly DEFAULT_THRESHOLD = 0.92;

  // ── Internal state ──────────────────────────────────────────────────────────

  private readonly storage = new CacheStorage();

  /** Running statistics (in-memory, reset on page reload). */
  private stats: SemanticCacheStats = {
    totalEntries: 0,
    exactHits: 0,
    semanticHits: 0,
    misses: 0,
    avgLatencyMs: 0,
    tokensSaved: 0,
  };

  /** Running sum/count for incremental average latency calculation. */
  private totalLatencyMs = 0;
  private totalLookups = 0;

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Hash a query's four identifying dimensions into a SHA-256 hex string
   * suitable for exact-match lookups.
   */
  async hashQuery(
    provider: string,
    model: string,
    systemInstruction: string,
    userPrompt: string,
  ): Promise<string> {
    return hashQuery(provider, model, systemInstruction, userPrompt);
  }

  /**
   * Look up a cached response for the given query.
   *
   * **Layer 1 – Exact match**: O(1) lookup by `queryHash`.
   * **Layer 2 – Semantic match**: Scan entries with the same `callType`,
   * compute cosine similarity against `queryEmbedding`, return best match
   * exceeding the call-type threshold.
   *
   * @param queryHash       SHA-256 hash from `hashQuery()`
   * @param queryEmbedding  Dense vector for semantic matching (or null to skip)
   * @param callType        Category used for threshold/TTL selection
   * @returns               A `CacheResult` describing the outcome
   */
  async lookup(
    queryHash: string,
    queryEmbedding: number[] | null,
    callType: string,
  ): Promise<CacheResult> {
    const t0 = performance.now();

    try {
      // ── Layer 1: Exact hash match ─────────────────────────────────────────
      const exactMatches = await this.storage.loadEntriesByHash(queryHash);
      for (const entry of exactMatches) {
        if (!this.isExpired(entry)) {
          // Update hit metadata
          entry.hitCount++;
          entry.lastHitAt = Date.now();
          await this.storage.saveEntry(entry);

          const latency = performance.now() - t0;
          this.recordLookup(latency, 'exact', entry.responseText);
          return {
            hit: true,
            type: 'exact',
            response: entry.responseText,
            latencyMs: Math.round(latency * 100) / 100,
            entryId: entry.id,
          };
        }
      }

      // ── Layer 2: Semantic similarity match ────────────────────────────────
      if (queryEmbedding && queryEmbedding.length > 0) {
        const candidates = await this.storage.loadEntriesByCallType(callType);
        const threshold = this.SIMILARITY_THRESHOLDS[callType] ?? this.DEFAULT_THRESHOLD;

        let bestEntry: SemanticCacheEntry | null = null;
        let bestSimilarity = -1;

        for (const entry of candidates) {
          if (this.isExpired(entry)) continue;
          if (!entry.queryEmbedding || entry.queryEmbedding.length === 0) continue;

          const sim = cosineSimilarity(queryEmbedding, entry.queryEmbedding);
          if (sim >= threshold && sim > bestSimilarity) {
            bestSimilarity = sim;
            bestEntry = entry;
          }
        }

        if (bestEntry) {
          // Update hit metadata
          bestEntry.hitCount++;
          bestEntry.lastHitAt = Date.now();
          await this.storage.saveEntry(bestEntry);

          const latency = performance.now() - t0;
          this.recordLookup(latency, 'semantic', bestEntry.responseText);
          return {
            hit: true,
            type: 'semantic',
            similarity: Math.round(bestSimilarity * 10000) / 10000,
            response: bestEntry.responseText,
            latencyMs: Math.round(latency * 100) / 100,
            entryId: bestEntry.id,
          };
        }
      }

      // ── Miss ──────────────────────────────────────────────────────────────
      const latency = performance.now() - t0;
      this.recordLookup(latency, 'miss');
      return {
        hit: false,
        type: 'miss',
        latencyMs: Math.round(latency * 100) / 100,
      };
    } catch (err) {
      console.error('[SemanticCache] Lookup error:', err);
      const latency = performance.now() - t0;
      this.recordLookup(latency, 'miss');
      return {
        hit: false,
        type: 'miss',
        latencyMs: Math.round(latency * 100) / 100,
      };
    }
  }

  /**
   * Store a new cache entry and return its generated ID.
   *
   * @param entry  Entry data without `id`, `hitCount`, or `lastHitAt`
   *               (these are auto-populated).
   * @returns      The generated entry ID (UUID).
   */
  async store(
    entry: Omit<SemanticCacheEntry, 'id' | 'hitCount' | 'lastHitAt'>,
  ): Promise<string> {
    try {
      const id = uid();
      const fullEntry: SemanticCacheEntry = {
        ...entry,
        id,
        queryText: entry.queryText.slice(0, 500),
        ttlMs: entry.ttlMs || this.TTL_DEFAULTS[entry.callType] || this.DEFAULT_TTL,
        hitCount: 0,
        lastHitAt: entry.createdAt,
      };

      await this.storage.saveEntry(fullEntry);
      this.stats.totalEntries++;
      return id;
    } catch (err) {
      console.error('[SemanticCache] Store error:', err);
      return '';
    }
  }

  /**
   * Delete all entries whose TTL has been exceeded.
   * @returns The number of evicted entries.
   */
  async evictExpired(): Promise<number> {
    try {
      const all = await this.storage.loadAllEntries();
      const now = Date.now();
      let evicted = 0;

      for (const entry of all) {
        if (now - entry.createdAt > entry.ttlMs) {
          await this.storage.deleteEntry(entry.id);
          evicted++;
        }
      }

      if (evicted > 0) {
        this.stats.totalEntries = Math.max(0, this.stats.totalEntries - evicted);
        console.log(`[SemanticCache] Evicted ${evicted} expired entries.`);
      }

      return evicted;
    } catch (err) {
      console.error('[SemanticCache] Eviction error:', err);
      return 0;
    }
  }

  /**
   * Return a snapshot of aggregate cache statistics.
   */
  getStats(): SemanticCacheStats {
    return { ...this.stats };
  }

  /**
   * Return the default TTL for a given call type (ms).
   */
  getTTL(callType: string): number {
    return this.TTL_DEFAULTS[callType] ?? this.DEFAULT_TTL;
  }

  /**
   * Wipe all cache entries, embeddings, and reset statistics.
   */
  async clear(): Promise<void> {
    try {
      await this.storage.clear();
      this.stats = {
        totalEntries: 0,
        exactHits: 0,
        semanticHits: 0,
        misses: 0,
        avgLatencyMs: 0,
        tokensSaved: 0,
      };
      this.totalLatencyMs = 0;
      this.totalLookups = 0;
      console.log('[SemanticCache] Cache cleared.');
    } catch (err) {
      console.error('[SemanticCache] Clear error:', err);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Check whether an entry's TTL has been exceeded.
   */
  private isExpired(entry: SemanticCacheEntry): boolean {
    return Date.now() - entry.createdAt > entry.ttlMs;
  }

  /**
   * Record a lookup result for running statistics.
   */
  private recordLookup(
    latencyMs: number,
    type: 'exact' | 'semantic' | 'miss',
    responseText?: string,
  ): void {
    this.totalLookups++;
    this.totalLatencyMs += latencyMs;
    this.stats.avgLatencyMs = Math.round((this.totalLatencyMs / this.totalLookups) * 100) / 100;

    if (type === 'exact') {
      this.stats.exactHits++;
      if (responseText) {
        this.stats.tokensSaved += Math.ceil(responseText.length / 3.8);
      }
    } else if (type === 'semantic') {
      this.stats.semanticHits++;
      if (responseText) {
        this.stats.tokensSaved += Math.ceil(responseText.length / 3.8);
      }
    } else {
      this.stats.misses++;
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const semanticCache = new SemanticCacheService();
