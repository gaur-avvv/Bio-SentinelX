/**
 * BioSentinelX — Query Orchestrator
 *
 * Unified orchestration layer that manages the entire query lifecycle:
 *   1. Intent Classification  — keyword-based, fast (~1ms)
 *   2. Cache Check            — semantic + exact hash via semanticCacheService
 *   3. Parallel Retrieval     — RAG chunks, memory context, signals via Promise.allSettled
 *   4. Provider Selection     — circuit breaker + rate limiter + fallback chain
 *   5. Metadata Return        — the actual LLM call is handled by geminiService.ts
 *
 * Design principles:
 *   • Coordination only — does NOT duplicate LLM call logic from geminiService.ts
 *   • Resilient — circuit breakers trip after 3 consecutive failures, auto-recover
 *   • Fair — per-provider sliding-window rate limiting with configurable limits
 *   • Efficient — request deduplication prevents redundant in-flight API calls
 *   • Observable — every stage emits timing + status events via StreamCallbacks
 */

import { semanticCache, type CacheResult } from './semanticCacheService';
import { hybridSearch, embedWithGemini, type VectorSearchResult, type HybridSearchOptions } from './vectorSearchEngine';
import { estimateTokens } from './contextManager';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueryIntent =
  | 'health_report'
  | 'chat'
  | 'historical_research'
  | 'outbreak_analysis'
  | 'symptom_check'
  | 'data_query'
  | 'flood_analysis';

export interface QueryContext {
  city?: string;
  lat?: number;
  lon?: number;
  provider: string;
  model: string;
  apiKey?: string;
  geminiKey?: string;
  sessionId?: string;
  deepAnalysis?: boolean;
}

export interface OrchestrationStage {
  name: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  durationMs?: number;
  details?: string;
}

export interface OrchestratedResponse {
  text: string;
  fromCache: boolean;
  cacheType?: 'exact' | 'semantic';
  cacheSimilarity?: number;
  stages: OrchestrationStage[];
  totalLatencyMs: number;
  ragChunksUsed: number;
  tokensEstimated: { input: number; output: number };
  provider: string;
  model: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onStage?: (stage: OrchestrationStage) => void;
  onComplete?: (response: OrchestratedResponse) => void;
}

/** Circuit breaker for provider resilience */
export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  openUntil: number; // timestamp when OPEN state expires → transitions to HALF_OPEN
  consecutiveSuccesses: number;
}

/** Rate limiter state — sliding window */
export interface RateLimiterState {
  requests: number[];  // timestamps of recent requests
  limit: number;       // max requests per window
  windowMs: number;    // sliding window size in ms
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum consecutive failures before a circuit breaker trips to OPEN */
const CB_FAILURE_THRESHOLD = 3;

/** Failures must occur within this window (ms) to count as consecutive */
const CB_FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** How long a breaker stays OPEN before transitioning to HALF_OPEN (ms) */
const CB_OPEN_DURATION_MS = 60 * 1000; // 60 seconds

/** Provider fallback priority — tried in order when the primary provider is unhealthy */
const PROVIDER_FALLBACK_CHAIN: string[] = [
  'gemini',
  'groq',
  'siliconflow',
  'openrouter',
  'cerebras',
  'pollinations',
  'ollama',
];

// ─── Intent Classifier ───────────────────────────────────────────────────────

/**
 * Fast, keyword-based intent classifier (~1ms).
 * Inspects the query string for domain-specific keywords and returns
 * the most likely `QueryIntent` category.
 *
 * @param query          The user's raw query text
 * @param hasWeather     Whether weather data is currently available
 * @param hasChatHistory Whether the session already has chat history
 * @returns The classified `QueryIntent`
 */
export function classifyIntent(
  query: string,
  hasWeather: boolean,
  hasChatHistory: boolean
): QueryIntent {
  const q = query.toLowerCase().trim();

  // ── Flood / hydrological analysis ──────────────────────────────────────────
  if (/\b(flood|river|dam|water\s?level|discharge)\b/.test(q)) {
    return 'flood_analysis';
  }

  // ── Outbreak / epidemiological surveillance ────────────────────────────────
  if (/\b(outbreak|epidemic|cases|cluster|surveillance)\b/.test(q)) {
    return 'outbreak_analysis';
  }

  // ── Symptom triage ─────────────────────────────────────────────────────────
  if (/\b(symptom|feeling|pain|ache|dizzy|nausea)\b/.test(q)) {
    return 'symptom_check';
  }

  // ── Historical / trend research ────────────────────────────────────────────
  if (/\b(history|historical|trend|past|last\s?year)\b/.test(q)) {
    return 'historical_research';
  }

  // ── Data / dataset queries ─────────────────────────────────────────────────
  if (/\b(data|csv|dataset|column|correlation)\b/.test(q)) {
    return 'data_query';
  }

  // ── Conversational follow-up (short queries in an active session) ──────────
  if (hasChatHistory && q.length < 100) {
    return 'chat';
  }

  // ── Default: full health report ────────────────────────────────────────────
  return 'health_report';
}

// ─── Hash Utility ─────────────────────────────────────────────────────────────

/**
 * Generate a fast, non-cryptographic hash of a string.
 * Uses a variant of DJB2 — sufficient for cache keys and dedup.
 */
function fastHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

// ─── Circuit Breaker Manager ──────────────────────────────────────────────────

/**
 * Manages per-provider circuit breaker states to prevent cascading failures.
 *
 * State machine:
 *   CLOSED  ──(3 consecutive failures within 5 min)──▶  OPEN
 *   OPEN    ──(60s elapsed)──▶  HALF_OPEN
 *   HALF_OPEN ──(1 success)──▶  CLOSED
 *   HALF_OPEN ──(1 failure)──▶  OPEN (another 60s)
 */
class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreakerState> = new Map();

  /**
   * Get or create the breaker state for a provider.
   * New providers start in the CLOSED (healthy) state.
   */
  private getOrCreate(provider: string): CircuitBreakerState {
    let state = this.breakers.get(provider);
    if (!state) {
      state = {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        openUntil: 0,
        consecutiveSuccesses: 0,
      };
      this.breakers.set(provider, state);
    }
    return state;
  }

  /**
   * Check whether a provider is available to accept requests.
   *
   * - CLOSED → always available
   * - OPEN   → available only after `openUntil` has passed (auto-transitions to HALF_OPEN)
   * - HALF_OPEN → available (allows exactly 1 probe request)
   */
  isAvailable(provider: string): boolean {
    const cb = this.getOrCreate(provider);
    const now = Date.now();

    if (cb.state === 'closed') return true;

    if (cb.state === 'open') {
      if (now >= cb.openUntil) {
        // Auto-transition to HALF_OPEN — allow a single probe request
        cb.state = 'half_open';
        return true;
      }
      return false;
    }

    // HALF_OPEN — allow the probe
    return true;
  }

  /**
   * Record a successful request for a provider.
   * Resets the failure counter and transitions HALF_OPEN → CLOSED.
   */
  recordSuccess(provider: string): void {
    const cb = this.getOrCreate(provider);
    cb.consecutiveSuccesses++;
    cb.failureCount = 0;
    cb.lastSuccessTime = Date.now();

    if (cb.state === 'half_open') {
      // Probe succeeded — circuit is healthy again
      cb.state = 'closed';
      cb.consecutiveSuccesses = 0;
    }
  }

  /**
   * Record a failed request for a provider.
   * Increments the failure counter and trips to OPEN after reaching the threshold.
   */
  recordFailure(provider: string): void {
    const cb = this.getOrCreate(provider);
    const now = Date.now();

    cb.lastFailureTime = now;
    cb.consecutiveSuccesses = 0;

    if (cb.state === 'half_open') {
      // Probe failed — go back to OPEN for another cooldown period
      cb.state = 'open';
      cb.openUntil = now + CB_OPEN_DURATION_MS;
      return;
    }

    // Check if prior failures are still within the rolling window
    if (cb.failureCount > 0 && (now - cb.lastFailureTime) > CB_FAILURE_WINDOW_MS) {
      // Outside window — reset counter
      cb.failureCount = 0;
    }

    cb.failureCount++;

    if (cb.failureCount >= CB_FAILURE_THRESHOLD) {
      cb.state = 'open';
      cb.openUntil = now + CB_OPEN_DURATION_MS;
    }
  }

  /**
   * Get the current circuit breaker state for a provider.
   * Useful for debugging and UI display.
   */
  getState(provider: string): CircuitBreakerState {
    return { ...this.getOrCreate(provider) };
  }

  /**
   * Get all providers currently in a healthy (CLOSED or HALF_OPEN) state.
   * HALF_OPEN providers are included because they accept probe requests.
   */
  getHealthyProviders(): string[] {
    const healthy: string[] = [];
    const now = Date.now();

    for (const provider of PROVIDER_FALLBACK_CHAIN) {
      const cb = this.getOrCreate(provider);
      if (cb.state === 'closed') {
        healthy.push(provider);
      } else if (cb.state === 'open' && now >= cb.openUntil) {
        // Auto-transition
        cb.state = 'half_open';
        healthy.push(provider);
      } else if (cb.state === 'half_open') {
        healthy.push(provider);
      }
    }

    return healthy;
  }
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

/**
 * Per-provider sliding-window rate limiter.
 * Each provider has a configurable request limit and window size.
 * Timestamps outside the current window are pruned on every check.
 */
class RateLimiter {
  private limiters: Map<string, RateLimiterState> = new Map();

  /** Provider-specific default limits (requests per window) */
  private readonly PROVIDER_LIMITS: Record<string, { limit: number; windowMs: number }> = {
    groq:        { limit: 28,  windowMs: 60_000 },  // 30 RPM with 2 buffer
    cerebras:    { limit: 28,  windowMs: 60_000 },  // 30 RPM with 2 buffer
    siliconflow: { limit: 55,  windowMs: 60_000 },  // 60 RPM with buffer
    openrouter:  { limit: 55,  windowMs: 60_000 },  // varies by model
    gemini:      { limit: 55,  windowMs: 60_000 },  // generous
    pollinations:{ limit: 8,   windowMs: 60_000 },  // conservative
    ollama:      { limit: 100, windowMs: 60_000 },   // local, generous
  };

  /**
   * Get or create the rate limiter state for a provider.
   */
  private getOrCreate(provider: string): RateLimiterState {
    let state = this.limiters.get(provider);
    if (!state) {
      const config = this.PROVIDER_LIMITS[provider] ?? { limit: 30, windowMs: 60_000 };
      state = {
        requests: [],
        limit: config.limit,
        windowMs: config.windowMs,
      };
      this.limiters.set(provider, state);
    }
    return state;
  }

  /**
   * Prune timestamps outside the current sliding window.
   */
  private prune(state: RateLimiterState): void {
    const cutoff = Date.now() - state.windowMs;
    state.requests = state.requests.filter(t => t > cutoff);
  }

  /**
   * Check whether the provider has remaining capacity in the current window.
   */
  canMakeRequest(provider: string): boolean {
    const state = this.getOrCreate(provider);
    this.prune(state);
    return state.requests.length < state.limit;
  }

  /**
   * Record a request timestamp for a provider.
   * Should be called immediately before making an API request.
   */
  recordRequest(provider: string): void {
    const state = this.getOrCreate(provider);
    this.prune(state);
    state.requests.push(Date.now());
  }

  /**
   * Get the number of milliseconds until the next request is allowed.
   * Returns 0 if a request can be made immediately.
   */
  getWaitTime(provider: string): number {
    const state = this.getOrCreate(provider);
    this.prune(state);

    if (state.requests.length < state.limit) return 0;

    // The earliest request in the window will expire first
    const earliest = state.requests[0];
    if (earliest === undefined) return 0;

    const waitUntil = earliest + state.windowMs;
    return Math.max(0, waitUntil - Date.now());
  }

  /**
   * Get the current status for a provider — remaining capacity and reset time.
   */
  getStatus(provider: string): { remaining: number; resetIn: number } {
    const state = this.getOrCreate(provider);
    this.prune(state);

    const remaining = Math.max(0, state.limit - state.requests.length);
    const resetIn = state.requests.length > 0
      ? Math.max(0, state.requests[0] + state.windowMs - Date.now())
      : 0;

    return { remaining, resetIn };
  }
}

// ─── Request Deduplicator ─────────────────────────────────────────────────────

/**
 * Prevents redundant in-flight API requests.
 * If the same query (by hash key) is already in progress, returns the
 * existing promise instead of spawning a duplicate request.
 */
class RequestDeduplicator {
  private inflight: Map<string, Promise<string>> = new Map();

  /**
   * Deduplicate a request by key.
   * If a matching in-flight request exists, returns its promise.
   * Otherwise, calls the factory to create a new request and tracks it.
   *
   * @param key     Unique key for this request (hash of provider + model + prompt prefix)
   * @param factory Async function that produces the response text
   * @returns The response text (from existing or new request)
   */
  async deduplicate(key: string, factory: () => Promise<string>): Promise<string> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    const promise = factory().finally(() => {
      // Clean up once the request settles (success or failure)
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Build a dedup key from provider, model, and the first 200 chars of the prompt.
   */
  static buildKey(provider: string, model: string, prompt: string): string {
    const prefix = prompt.slice(0, 200);
    return fastHash(`${provider}:${model}:${prefix}`);
  }
}

// ─── Retrieval Result Types ───────────────────────────────────────────────────

/** Aggregated results from the parallel retrieval stage */
export interface RetrievalResults {
  /** RAG chunks from vectorSearchEngine — relevance-ranked document fragments */
  ragChunks: VectorSearchResult[];
  /** Memory context string from memoryService */
  memoryContext: string;
  /** Additional signals (e.g. knowledge graph, web search) keyed by source */
  signals: Record<string, string>;
  /** Total number of RAG chunks retrieved */
  ragChunkCount: number;
}

// ─── Query Orchestrator ───────────────────────────────────────────────────────

/**
 * Main orchestration class for the Bio-SentinelX query pipeline.
 *
 * Coordinates intent classification, caching, retrieval, and provider
 * selection. The actual LLM generation is deliberately left to
 * `geminiService.ts` — this orchestrator prepares context, validates
 * providers, and returns structured metadata for the caller.
 */
class QueryOrchestrator {
  private circuitBreakers: CircuitBreakerManager;
  private rateLimiter: RateLimiter;
  private deduplicator: RequestDeduplicator;

  constructor() {
    this.circuitBreakers = new CircuitBreakerManager();
    this.rateLimiter = new RateLimiter();
    this.deduplicator = new RequestDeduplicator();
  }

  // ── Main Orchestration Entry Point ────────────────────────────────────────

  /**
   * Run the full orchestration pipeline for a user query.
   *
   * Flow:
   *   1. Intent classification (~1ms)
   *   2. Cache check (hash + optional semantic embedding, ~5-10ms)
   *   3. Parallel retrieval — RAG, memory, signals (~50-150ms)
   *   4. Provider selection — circuit breaker + rate limiter (~1ms)
   *   5. Return orchestration metadata (caller handles LLM call)
   *
   * If a cache hit is found in step 2, the method returns immediately
   * with `fromCache: true` and the cached text — no retrieval or LLM
   * call is needed.
   *
   * @param query     The user's raw query text
   * @param context   Provider configuration, location, session info
   * @param callbacks Optional callbacks for streaming stage updates
   * @returns Full orchestrated response with metadata
   */
  async orchestrate(
    query: string,
    context: QueryContext,
    callbacks?: StreamCallbacks
  ): Promise<OrchestratedResponse> {
    const orchestrationStart = Date.now();
    const stages: OrchestrationStage[] = [];

    /**
     * Helper to record and emit a stage event.
     */
    const emitStage = (stage: OrchestrationStage): void => {
      stages.push(stage);
      try {
        callbacks?.onStage?.(stage);
      } catch (_e) {
        // Never let a callback error crash orchestration
      }
    };

    // ── Stage 1: Intent Classification (~1ms) ─────────────────────────────
    const intentStart = Date.now();
    const hasChatHistory = !!context.sessionId;
    const hasWeather = !!(context.lat !== undefined && context.lon !== undefined);
    const intent = classifyIntent(query, hasWeather, hasChatHistory);

    emitStage({
      name: 'Intent Classification',
      status: 'done',
      durationMs: Date.now() - intentStart,
      details: `Classified as "${intent}"`,
    });

    // ── Stage 2: Cache Check (~5-10ms) ────────────────────────────────────
    const cacheStart = Date.now();
    let cacheResult: CacheResult | null = null;

    try {
      const queryHash = fastHash(query);

      // Build a callType string that maps intent → semanticCache callType
      const callType = this.intentToCallType(intent);

      // Optionally embed the query for semantic cache lookup
      let embedding: number[] | undefined;
      if (context.geminiKey) {
        try {
          embedding = await embedWithGemini(query, context.geminiKey, 'RETRIEVAL_QUERY');
        } catch (_e) {
          // Non-fatal — falls back to exact hash match only
        }
      }

      cacheResult = await semanticCache.lookup(queryHash, embedding ?? null, callType);

      if (cacheResult && cacheResult.hit) {
        emitStage({
          name: 'Cache Check',
          status: 'done',
          durationMs: Date.now() - cacheStart,
          details: `Cache HIT (${cacheResult.type}, similarity: ${((cacheResult.similarity ?? 1) * 100).toFixed(0)}%)`,
        });

        const response: OrchestratedResponse = {
          text: cacheResult.response || "",
          fromCache: true,
          cacheType: cacheResult.type as 'exact' | 'semantic',
          cacheSimilarity: cacheResult.similarity,
          stages,
          totalLatencyMs: Date.now() - orchestrationStart,
          ragChunksUsed: 0,
          tokensEstimated: {
            input: estimateTokens(query),
            output: estimateTokens(cacheResult.response || ""),
          },
          provider: context.provider,
          model: context.model,
        };

        try {
          callbacks?.onComplete?.(response);
        } catch (_e) { /* ignore callback errors */ }

        return response;
      }

      emitStage({
        name: 'Cache Check',
        status: 'done',
        durationMs: Date.now() - cacheStart,
        details: 'Cache MISS',
      });
    } catch (cacheErr) {
      emitStage({
        name: 'Cache Check',
        status: 'failed',
        durationMs: Date.now() - cacheStart,
        details: `Cache error: ${cacheErr instanceof Error ? cacheErr.message : 'Unknown'}`,
      });
    }

    // ── Stage 3: Parallel Retrieval (~50-150ms) ───────────────────────────
    const retrievalStart = Date.now();
    let retrievalResults: RetrievalResults = {
      ragChunks: [],
      memoryContext: '',
      signals: {},
      ragChunkCount: 0,
    };

    try {
      // Launch retrieval tasks in parallel — none are hard-blocking
      const [ragResult, memoryResult] = await Promise.allSettled([
        // RAG retrieval via vectorSearchEngine
        this.safeHybridSearch(query, context),
        // Memory context from memoryService
        this.safeBuildMemoryContext(context.city),
      ]);

      // Unpack RAG results
      if (ragResult.status === 'fulfilled' && ragResult.value) {
        retrievalResults.ragChunks = ragResult.value;
        retrievalResults.ragChunkCount = ragResult.value.length;
      }

      // Unpack memory context
      if (memoryResult.status === 'fulfilled' && memoryResult.value) {
        retrievalResults.memoryContext = memoryResult.value;
      }

      emitStage({
        name: 'Parallel Retrieval',
        status: 'done',
        durationMs: Date.now() - retrievalStart,
        details: `RAG: ${retrievalResults.ragChunkCount} chunks | Memory: ${retrievalResults.memoryContext.length > 0 ? 'loaded' : 'empty'}`,
      });
    } catch (retrievalErr) {
      emitStage({
        name: 'Parallel Retrieval',
        status: 'failed',
        durationMs: Date.now() - retrievalStart,
        details: `Retrieval error: ${retrievalErr instanceof Error ? retrievalErr.message : 'Unknown'}`,
      });
    }

    // ── Stage 4: Provider Selection (~1ms) ────────────────────────────────
    const providerStart = Date.now();
    let selectedProvider = context.provider;
    let selectedModel = context.model;
    let providerDetails = `Using ${selectedProvider}/${selectedModel}`;

    // Check circuit breaker for requested provider
    if (!this.circuitBreakers.isAvailable(selectedProvider)) {
      // Primary provider is unhealthy — walk the fallback chain
      const fallback = this.selectFallbackProvider(selectedProvider);
      if (fallback) {
        providerDetails = `${selectedProvider} is unhealthy (circuit OPEN). Falling back to ${fallback}`;
        selectedProvider = fallback;
        // Keep the model as-is — the caller should resolve the actual model
        // for the fallback provider based on their configuration
      } else {
        providerDetails = `${selectedProvider} is unhealthy. No healthy fallback available — proceeding anyway`;
      }
    }

    // Check rate limiter
    if (!this.rateLimiter.canMakeRequest(selectedProvider)) {
      const waitMs = this.rateLimiter.getWaitTime(selectedProvider);

      if (waitMs > 0 && waitMs <= 5000) {
        // Short wait — block briefly rather than switching providers
        providerDetails += ` (rate-limited, waiting ${waitMs}ms)`;
        await new Promise(resolve => setTimeout(resolve, waitMs));
      } else if (waitMs > 5000) {
        // Long wait — try to find an alternative provider
        const alt = this.selectFallbackProvider(selectedProvider);
        if (alt && this.rateLimiter.canMakeRequest(alt)) {
          providerDetails += ` (rate-limited for ${waitMs}ms, switching to ${alt})`;
          selectedProvider = alt;
        } else {
          providerDetails += ` (rate-limited for ${waitMs}ms, no alternative available)`;
        }
      }
    }

    // Record the request against the rate limiter
    this.rateLimiter.recordRequest(selectedProvider);

    emitStage({
      name: 'Provider Selection',
      status: 'done',
      durationMs: Date.now() - providerStart,
      details: providerDetails,
    });

    // ── Stage 5: Build Orchestration Response ─────────────────────────────
    // The actual LLM call is handled by geminiService.ts — we just return
    // the prepared context, validated provider, and orchestration metadata.

    const response: OrchestratedResponse = {
      text: '', // Empty — caller fills this after LLM generation
      fromCache: false,
      stages,
      totalLatencyMs: Date.now() - orchestrationStart,
      ragChunksUsed: retrievalResults.ragChunkCount,
      tokensEstimated: {
        input: estimateTokens(query) +
               retrievalResults.ragChunks.reduce((sum, c) => sum + estimateTokens(c.text ?? ''), 0) +
               estimateTokens(retrievalResults.memoryContext),
        output: 0, // Unknown until generation completes
      },
      provider: selectedProvider,
      model: selectedModel,
    };

    try {
      callbacks?.onComplete?.(response);
    } catch (_e) { /* ignore callback errors */ }

    return response;
  }

  // ── Provider Lifecycle Hooks ──────────────────────────────────────────────

  /**
   * Record a successful LLM generation for a provider.
   * Should be called by geminiService.ts after a successful API response.
   */
  recordProviderSuccess(provider: string): void {
    this.circuitBreakers.recordSuccess(provider);
  }

  /**
   * Record a failed LLM generation for a provider.
   * Should be called by geminiService.ts after a failed API response.
   */
  recordProviderFailure(provider: string): void {
    this.circuitBreakers.recordFailure(provider);
  }

  // ── Request Deduplication ─────────────────────────────────────────────────

  /**
   * Deduplicate an LLM request.
   * If an identical request is already in-flight, returns the existing promise.
   *
   * @param provider The provider name
   * @param model    The model name
   * @param prompt   The full prompt text
   * @param factory  Async function that produces the response
   * @returns The response text
   */
  async deduplicateRequest(
    provider: string,
    model: string,
    prompt: string,
    factory: () => Promise<string>
  ): Promise<string> {
    const key = RequestDeduplicator.buildKey(provider, model, prompt);
    return this.deduplicator.deduplicate(key, factory);
  }

  // ── Background Cache Save ─────────────────────────────────────────────────

  /**
   * Save a response to the semantic cache in the background.
   * Called by the caller after a successful LLM generation.
   * Errors are silently caught — cache saves must never block the UI.
   *
   * @param query     The original query text
   * @param response  The generated response text
   * @param intent    The classified intent
   * @param geminiKey Optional Gemini key for embedding the query
   */
  async backgroundCacheSave(
    query: string,
    response: string,
    intent: QueryIntent,
    geminiKey?: string
  ): Promise<void> {
    try {
      const queryHash = fastHash(query);
      const callType = this.intentToCallType(intent);

      let embedding: number[] | undefined;
      if (geminiKey) {
        try {
          embedding = await embedWithGemini(query, geminiKey, 'RETRIEVAL_QUERY');
        } catch (_e) {
          // Non-fatal — store without embedding (exact hash only)
        }
      }

      await semanticCache.store({
        queryHash,
        queryEmbedding: embedding ?? [],
        queryText: query.slice(0, 500),
        responseText: response,
        provider: 'orchestrator',
        model: 'orchestrator',
        callType: callType as any,
        createdAt: Date.now(),
        ttlMs: semanticCache.getTTL(callType),
      });
    } catch (_e) {
      // Silently catch — cache saves must never propagate errors
      console.warn('[QueryOrchestrator] Background cache save failed:', _e);
    }
  }

  // ── Observability / Stats ─────────────────────────────────────────────────

  /**
   * Get cache statistics from the semantic cache layer.
   */
  getCacheStats(): {
    totalEntries: number;
    hitRate: number;
    exactHits: number;
    semanticHits: number;
  } {
    try {
      const stats = semanticCache.getStats();
      const hits = stats.exactHits + stats.semanticHits;
      const total = hits + stats.misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;
      return {
        totalEntries: stats.totalEntries,
        hitRate: Math.round(hitRate * 10) / 10,
        exactHits: stats.exactHits,
        semanticHits: stats.semanticHits,
      };
    } catch (_e) {
      return { totalEntries: 0, hitRate: 0, exactHits: 0, semanticHits: 0 };
    }
  }

  /**
   * Get the current state of all circuit breakers, keyed by provider.
   */
  getCircuitBreakerStates(): Record<string, CircuitBreakerState> {
    const states: Record<string, CircuitBreakerState> = {};
    for (const provider of PROVIDER_FALLBACK_CHAIN) {
      states[provider] = this.circuitBreakers.getState(provider);
    }
    return states;
  }

  /**
   * Get the current rate limiter status for all providers.
   */
  getRateLimiterStatus(): Record<string, { remaining: number; resetIn: number }> {
    const status: Record<string, { remaining: number; resetIn: number }> = {};
    for (const provider of PROVIDER_FALLBACK_CHAIN) {
      status[provider] = this.rateLimiter.getStatus(provider);
    }
    return status;
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Map a QueryIntent to the callType string expected by semanticCacheService.
   */
  private intentToCallType(intent: QueryIntent): string {
    switch (intent) {
      case 'health_report':       return 'health_assessment';
      case 'chat':                return 'chat';
      case 'historical_research': return 'historical_research';
      case 'flood_analysis':      return 'flood_analysis';
      case 'outbreak_analysis':   return 'health_assessment';
      case 'symptom_check':       return 'chat';
      case 'data_query':          return 'health_assessment';
      default:                    return 'health_assessment';
    }
  }

  /**
   * Select a fallback provider from the priority chain.
   * Skips the excluded provider and any providers with tripped circuit breakers
   * or exhausted rate limits.
   *
   * @param exclude Provider to exclude (the one that failed / is unhealthy)
   * @returns The first healthy + available provider, or null if none found
   */
  private selectFallbackProvider(exclude: string): string | null {
    for (const provider of PROVIDER_FALLBACK_CHAIN) {
      if (provider === exclude) continue;
      if (!this.circuitBreakers.isAvailable(provider)) continue;
      if (!this.rateLimiter.canMakeRequest(provider)) continue;
      return provider;
    }
    return null;
  }

  /**
   * Safe wrapper for hybridSearch — returns empty array on any error.
   */
  private async safeHybridSearch(
    query: string,
    context: QueryContext
  ): Promise<VectorSearchResult[]> {
    try {
      const { getAllChunksAsync } = await import('./vectorDB');
      const chunks = await getAllChunksAsync();
      if (chunks.length === 0) return [];

      const allSearchChunks: any[] = chunks.map(c => ({
        id: c.id,
        text: c.text,
        embedding: c.embedding,
        tfidf: c.tfidf,
        docId: c.docId,
        docTitle: c.docTitle
      }));

      const options: HybridSearchOptions = {
        topK: context.deepAnalysis ? 10 : 6,
        geminiKey: context.geminiKey,
        useDense: !!context.geminiKey && chunks.some(c => !!c.embedding),
        useSparse: true,
      };
      return await hybridSearch(query, allSearchChunks, options);
    } catch (_e) {
      console.warn('[QueryOrchestrator] Hybrid search failed:', _e);
      return [];
    }
  }

  /**
   * Safe wrapper for buildMemoryContext — returns empty string on any error.
   */
  private async safeBuildMemoryContext(city?: string): Promise<string> {
    try {
      // Dynamic import to avoid circular dependency issues
      const { buildMemoryContext } = await import('./memoryService');
      return buildMemoryContext(city);
    } catch (_e) {
      console.warn('[QueryOrchestrator] Memory context build failed:', _e);
      return '';
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const queryOrchestrator = new QueryOrchestrator();
