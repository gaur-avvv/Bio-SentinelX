/**
 * BioSentinelX — Prompt Cache Service
 *
 * Implements prompt caching for all AI providers:
 *
 * ┌──────────────┬─────────────────────────────────────────────────────────┐
 * │ Provider     │ Caching mechanism                                        │
 * ├──────────────┼─────────────────────────────────────────────────────────┤
 * │ Cerebras     │ Automatic 128-token block caching (5 min–1 hr TTL).     │
 * │              │ No code changes needed. Place static content first.      │
 * │ OpenRouter   │ Automatic (OpenAI-compatible). Tracks cached_tokens.     │
 * │ Groq         │ Automatic (OpenAI-compatible). Tracks cached_tokens.     │
 * │ SiliconFlow  │ Automatic (OpenAI-compatible). Tracks cached_tokens.     │
 * │ Pollinations │ Automatic (OpenAI-compatible). Tracks cached_tokens.     │
 * │ Gemini       │ Implicit caching via static system instruction prefix.   │
 * └──────────────┴─────────────────────────────────────────────────────────┘
 *
 * This service adds:
 *   • Client-side LRU memoization of large system instruction strings L1 (in-memory)
 *   • L2 IndexedDB persistence layer so cached prompts survive page reloads
 *   • Server-side cached-token accounting from API response `usage` fields
 *   • Persistent aggregate statistics for cross-session analytics
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptCacheStats {
  /** Client-side cache hits (system instruction served from memory) */
  clientHits: number;
  /** Client-side cache misses (system instruction freshly built) */
  clientMisses: number;
  /** Cumulative server-reported cached tokens across all API calls */
  serverCachedTokens: number;
  /** Number of API calls where the server reported cached_tokens > 0 */
  serverCacheHits: number;
  /** Estimated tokens saved by client-side memoization */
  clientTokensSaved: number;
}

interface CacheEntry {
  text: string;
  /** Estimated token count of this system instruction */
  tokens: number;
  lastUsed: number;
  useCount: number;
}

// ─── IndexedDB Persistent Layer (L2) ──────────────────────────────────────────

const IDB_NAME = 'biosentinel_prompt_cache';
const IDB_VERSION = 1;
const STORE_PROMPTS = 'prompts';
const STORE_STATS = 'stats';

class PromptCacheDB {
  private db: IDBDatabase | null = null;
  private fallback = false;
  private initPromise: Promise<boolean>;

  constructor() {
    this.initPromise = this.openDB();
  }

  private openDB(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          this.fallback = true;
          resolve(false);
          return;
        }

        const req = indexedDB.open(IDB_NAME, IDB_VERSION);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_PROMPTS)) {
            db.createObjectStore(STORE_PROMPTS, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_STATS)) {
            db.createObjectStore(STORE_STATS, { keyPath: 'id' });
          }
        };

        req.onsuccess = () => {
          this.db = req.result;
          resolve(true);
        };

        req.onerror = () => {
          this.fallback = true;
          resolve(false);
        };
      } catch {
        this.fallback = true;
        resolve(false);
      }
    });
  }

  async isReady(): Promise<boolean> {
    return this.initPromise;
  }

  async savePrompt(key: string, entry: CacheEntry): Promise<void> {
    if (this.fallback) return;
    await this.isReady();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_PROMPTS, 'readwrite');
      tx.objectStore(STORE_PROMPTS).put({ key, ...entry });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadPrompts(): Promise<Array<{ key: string } & CacheEntry>> {
    if (this.fallback) return [];
    await this.isReady();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_PROMPTS, 'readonly');
      const req = tx.objectStore(STORE_PROMPTS).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async deletePrompt(key: string): Promise<void> {
    if (this.fallback) return;
    await this.isReady();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_PROMPTS, 'readwrite');
      tx.objectStore(STORE_PROMPTS).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveStats(stats: PromptCacheStats): Promise<void> {
    if (this.fallback) return;
    await this.isReady();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_STATS, 'readwrite');
      tx.objectStore(STORE_STATS).put({ id: 'aggregate', ...stats });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadStats(): Promise<PromptCacheStats | null> {
    if (this.fallback) return null;
    await this.isReady();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_STATS, 'readonly');
      const req = tx.objectStore(STORE_STATS).get('aggregate');
      req.onsuccess = () => resolve(req.result ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    if (this.fallback) return;
    await this.isReady();
    if (!this.db) return;

    const tx = this.db.transaction([STORE_PROMPTS, STORE_STATS], 'readwrite');
    tx.objectStore(STORE_PROMPTS).clear();
    tx.objectStore(STORE_STATS).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }
}

// ─── PromptCacheService ───────────────────────────────────────────────────────

class PromptCacheService {
  /**
   * In-memory LRU store for system instruction strings (L1).
   * Key format: "<callType>:<discriminator>" e.g. "ha:Mumbai" or "hr:static"
   */
  private readonly store = new Map<string, CacheEntry>();

  /** L2 Persistent database storage */
  private readonly db = new PromptCacheDB();

  /** Maximum number of cached entries before LRU eviction */
  private readonly MAX_ENTRIES = 30;

  /** Client-side TTL — entries older than this are evicted passively */
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  private stats: PromptCacheStats = {
    clientHits: 0,
    clientMisses: 0,
    serverCachedTokens: 0,
    serverCacheHits: 0,
    clientTokensSaved: 0,
  };

  constructor() {
    this.warmCache();
  }

  /**
   * Asynchronously warms the cache by loading stats and the top-10
   * most-used prompts from L2 (IndexedDB).
   */
  private async warmCache(): Promise<void> {
    try {
      const loadedStats = await this.db.loadStats();
      if (loadedStats) {
        this.stats = loadedStats;
      }

      const prompts = await this.db.loadPrompts();
      if (prompts && prompts.length > 0) {
        // Sort by useCount descending and take top 10 to warm L1
        const warmed = prompts
          .sort((a, b) => b.useCount - a.useCount)
          .slice(0, 10);

        for (const p of warmed) {
          this.store.set(p.key, {
            text: p.text,
            tokens: p.tokens,
            lastUsed: p.lastUsed,
            useCount: p.useCount,
          });
        }
        console.log(`[PromptCache] Loaded stats and pre-warmed L1 cache with ${warmed.length} prompts.`);
      }
    } catch (e) {
      console.warn('[PromptCache] Warm cache failed:', e);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Return a (possibly memoized) system instruction string.
   *
   * @param key     A stable, unique key for this system instruction variant.
   * @param builder A function that builds the system instruction from scratch.
   *                Only called on a cache miss.
   *
   * @returns `{ text, fromCache }` where `fromCache` indicates a hit.
   */
  getSystemInstruction(
    key: string,
    builder: () => string
  ): { text: string; fromCache: boolean } {
    this.evictExpired();

    const hit = this.store.get(key);
    if (hit) {
      hit.lastUsed = Date.now();
      hit.useCount++;
      this.stats.clientHits++;
      this.stats.clientTokensSaved += hit.tokens;

      // Persist hit updates to L2 in background
      this.db.savePrompt(key, hit).catch(() => {});
      this.db.saveStats(this.stats).catch(() => {});

      return { text: hit.text, fromCache: true };
    }

    // Cache miss — build the system instruction
    const text = builder();
    const tokens = Math.ceil(text.length / 3.8);

    this.stats.clientMisses++;
    this.ensureCapacity();

    const newEntry: CacheEntry = { text, tokens, lastUsed: Date.now(), useCount: 1 };
    this.store.set(key, newEntry);

    // Persist new entry and stats to L2 in background
    this.db.savePrompt(key, newEntry).catch(() => {});
    this.db.saveStats(this.stats).catch(() => {});

    return { text, fromCache: false };
  }

  /**
   * Record server-reported cached tokens from an API response.
   * Should be called after every successful API call.
   */
  recordServerCacheHit(cachedTokens: number): void {
    if (cachedTokens > 0) {
      this.stats.serverCachedTokens += cachedTokens;
      this.stats.serverCacheHits++;
      this.db.saveStats(this.stats).catch(() => {});
    }
  }

  /**
   * Extract the number of cached tokens from an OpenAI-compatible API
   * response body.
   */
  extractCachedTokens(responseData: unknown): number {
    const d = responseData as any;
    return (
      d?.usage?.prompt_tokens_details?.cached_tokens ??
      d?.usage?.prompt_cache_hit_tokens ??
      d?.usage?.cached_tokens ??
      0
    );
  }

  /**
   * Return a snapshot of the current cache statistics.
   */
  getStats(): PromptCacheStats {
    return { ...this.stats };
  }

  /**
   * Total tokens saved across both client-side and server-side caching.
   */
  totalTokensSaved(): number {
    return this.stats.clientTokensSaved + this.stats.serverCachedTokens;
  }

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(key: string): void {
    this.store.delete(key);
    this.db.deletePrompt(key).catch(() => {});
  }

  /** Purge the entire cache and reset statistics. */
  clear(): void {
    this.store.clear();
    this.stats = {
      clientHits: 0,
      clientMisses: 0,
      serverCachedTokens: 0,
      serverCacheHits: 0,
      clientTokensSaved: 0,
    };
    this.db.clear().catch(() => {});
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private evictExpired(): void {
    const cutoff = Date.now() - this.TTL_MS;
    for (const [key, entry] of this.store.entries()) {
      if (entry.lastUsed < cutoff) {
        this.store.delete(key);
        this.db.deletePrompt(key).catch(() => {});
      }
    }
  }

  private ensureCapacity(): void {
    if (this.store.size < this.MAX_ENTRIES) return;
    // Evict least-recently-used entry
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldest = key;
        oldestTime = entry.lastUsed;
      }
    }
    if (oldest) {
      this.store.delete(oldest);
      this.db.deletePrompt(oldest).catch(() => {});
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const promptCache = new PromptCacheService();
