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
 * Prompt structure best practice (already applied throughout geminiService.ts):
 *   1. STATIC content first  — system instructions, role definitions, domain knowledge
 *   2. DYNAMIC content last  — user query, weather data, conversation history
 *
 * This service adds:
 *   • Client-side LRU memoization of large system instruction strings
 *     (avoids re-building 2 000–8 000 char strings on every call)
 *   • Server-side cached-token accounting from API response `usage` fields
 *   • Aggregate statistics exposed to the TokenBudgetPanel UI
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

// ─── PromptCacheService ───────────────────────────────────────────────────────

class PromptCacheService {
  /**
   * In-memory LRU store for system instruction strings.
   * Key format: "<callType>:<discriminator>" e.g. "ha:Mumbai" or "hr:static"
   */
  private readonly store = new Map<string, CacheEntry>();

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

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Return a (possibly memoized) system instruction string.
   *
   * @param key     A stable, unique key for this system instruction variant.
   *                Example: `"ha:${weather.city}"`, `"hr:static"`, `"flood:static"`
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
      return { text: hit.text, fromCache: true };
    }

    // Cache miss — build the system instruction
    const text = builder();
    // Fast char-based token estimate (chars / 3.8, same as contextManager)
    const tokens = Math.ceil(text.length / 3.8);

    this.stats.clientMisses++;
    this.ensureCapacity();
    this.store.set(key, { text, tokens, lastUsed: Date.now(), useCount: 1 });

    return { text, fromCache: false };
  }

  /**
   * Record server-reported cached tokens from an API response.
   * Should be called after every successful API call with the value extracted
   * via `extractCachedTokens(data)`.
   */
  recordServerCacheHit(cachedTokens: number): void {
    if (cachedTokens > 0) {
      this.stats.serverCachedTokens += cachedTokens;
      this.stats.serverCacheHits++;
    }
  }

  /**
   * Extract the number of cached tokens from an OpenAI-compatible API
   * response body. Returns 0 if the field is absent (cache miss or provider
   * does not expose it).
   *
   * Supported response shapes:
   *   • `usage.prompt_tokens_details.cached_tokens`  (OpenAI, Cerebras, Groq)
   *   • `usage.prompt_cache_hit_tokens`              (DeepSeek, some others)
   *   • `usage.cached_tokens`                        (fallback)
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
   * Invalidate a specific cache entry (e.g. when the city or profile changes).
   */
  invalidate(key: string): void {
    this.store.delete(key);
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
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private evictExpired(): void {
    const cutoff = Date.now() - this.TTL_MS;
    for (const [key, entry] of this.store.entries()) {
      if (entry.lastUsed < cutoff) this.store.delete(key);
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
    if (oldest) this.store.delete(oldest);
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const promptCache = new PromptCacheService();
