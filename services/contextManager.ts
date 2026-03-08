/**
 * BioSentinelX — AI Context Manager
 * Token budget tracking, context window enforcement, and smart content compression
 * to use every AI provider efficiently and never waste context on N/A fields.
 */

import { WeatherData, ChatMessage } from '../types';

// ─── Model Registry ──────────────────────────────────────────────────────────

export interface ModelProfile {
  contextWindow: number;    // Total tokens the model can handle (input + output)
  maxInputTokens: number;   // Max tokens we send as input (conservative limit)
  maxOutputTokens: number;  // Max tokens to request in response
  inputBudget: number;      // Soft target for input (leave headroom for output)
  /** Ideal temperature for structured health reports */
  reportTemperature: number;
  /** Ideal temperature for conversational chat */
  chatTemperature: number;
}

export const MODEL_PROFILES: Record<string, Record<string, ModelProfile>> = {
  gemini: {
    'gemini-3-flash-preview':  { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192,  inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-3.1-pro-preview':  { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 65_536, inputBudget: 32_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-2.5-pro':          { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 65_536, inputBudget: 32_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-2.5-flash':        { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192,  inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-2.0-flash':        { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192,  inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-1.5-pro':          { contextWindow: 2_097_152, maxInputTokens: 1_800_000, maxOutputTokens: 8_192, inputBudget: 32_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-1.5-flash':        { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192,  inputBudget: 20_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-1.0-pro':          { contextWindow: 32_768,   maxInputTokens: 28_000,   maxOutputTokens: 4_096,  inputBudget: 12_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'default':                 { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192,  inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
  },
  groq: {
    'llama-3.3-70b-versatile':     { contextWindow: 131_072, maxInputTokens: 100_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'llama-3.1-8b-instant':        { contextWindow: 131_072, maxInputTokens: 100_000, maxOutputTokens: 8_192, inputBudget: 16_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'llama-3.1-70b-versatile':     { contextWindow: 131_072, maxInputTokens: 100_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'mixtral-8x7b-32768':          { contextWindow: 32_768,  maxInputTokens: 28_000,  maxOutputTokens: 8_192, inputBudget: 12_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemma2-9b-it':                { contextWindow: 8_192,   maxInputTokens: 7_500,   maxOutputTokens: 4_096, inputBudget: 6_000,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'default':                     { contextWindow: 131_072, maxInputTokens: 100_000, maxOutputTokens: 8_192, inputBudget: 20_000, reportTemperature: 0.4, chatTemperature: 0.7 },
  },
  pollinations: {
    'openai':           { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'openai-large':     { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'openai-reasoning': { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 20_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'qwen-coder':       { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 20_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'llama':            { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 20_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'mistral':          { contextWindow: 32_768,  maxInputTokens: 28_000,  maxOutputTokens: 8_192, inputBudget: 12_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek':         { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'gemini':           { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'gemini-thinking':  { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'claude-hybridspace': { contextWindow: 200_000, maxInputTokens: 180_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'default':          { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 20_000, reportTemperature: 0.4, chatTemperature: 0.7 },
  },
  openrouter: {
    'openai/gpt-4o':                          { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'openai/gpt-4o-mini':                     { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'meta-llama/llama-3.1-8b-instruct':       { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 16_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'meta-llama/llama-3.3-70b-instruct':      { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'mistralai/mistral-nemo':                 { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'google/gemini-2.0-flash-exp':            { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'google/gemini-2.5-pro':                  { contextWindow: 1_048_576, maxInputTokens: 900_000, maxOutputTokens: 65_536, inputBudget: 32_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek/deepseek-r1':                   { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'anthropic/claude-3-haiku':               { contextWindow: 200_000, maxInputTokens: 180_000, maxOutputTokens: 4_096, inputBudget: 20_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'qwen/qwen-2.5-72b-instruct':             { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'default':                                { contextWindow: 128_000, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 20_000, reportTemperature: 0.4, chatTemperature: 0.7 },
  },
  siliconflow: {
    // ── DeepSeek ──────────────────────────────────────────────────────────────
    'deepseek-ai/DeepSeek-V3.2':                  { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-R1':                    { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 16_384, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'deepseek-ai/DeepSeek-V3.2-Exp':              { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-V3.1-Terminus':         { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-V3.1':                  { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-V3':                    { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    // ── MiniMax ───────────────────────────────────────────────────────────────
    'MiniMaxAI/MiniMax-M2.5':                     { contextWindow: 204_800, maxInputTokens: 180_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'MiniMaxAI/MiniMax-M2.1':                     { contextWindow: 204_800, maxInputTokens: 180_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    // ── Kimi ──────────────────────────────────────────────────────────────────
    'moonshotai/Kimi-K2.5':                       { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'moonshotai/Kimi-K2-Thinking':                { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 16_384, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'moonshotai/Kimi-K2-Instruct-0905':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'moonshotai/Kimi-K2-Instruct':                { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    // ── Qwen3 Flagship ────────────────────────────────────────────────────────
    'Qwen/Qwen3-235B-A22B-Thinking-2507':         { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 16_384, inputBudget: 28_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'Qwen/Qwen3-235B-A22B-Instruct-2507':         { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-Coder-480B-A35B-Instruct':        { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-Coder-30B-A3B-Instruct':          { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-30B-A3B-Thinking-2507':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'Qwen/Qwen3-30B-A3B-Instruct-2507':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    // ── Qwen3 Next / VL ───────────────────────────────────────────────────────
    'Qwen/Qwen3-Next-80B-A3B-Thinking':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'Qwen/Qwen3-Next-80B-A3B-Instruct':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-VL-235B-A22B-Instruct':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-VL-32B-Instruct':                 { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'default':                                    { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
  },
};

// ─── Usage Tracking ───────────────────────────────────────────────────────────

export type CallType = 'health_assessment' | 'historical_research' | 'chat' | 'flood_analysis';

export interface TokenUsageEntry {
  timestamp: number;
  callType: CallType;
  provider: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  /** Server-reported cached tokens (from usage.prompt_tokens_details.cached_tokens) */
  cachedTokens: number;
  compressed: boolean;
  compressionRatio?: number;
}

export interface SessionUsageStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  /** Cumulative server-reported cached tokens (prompt caching) */
  totalCachedTokens: number;
  callsByType: Record<CallType, number>;
  compressionsSaved: number;
  entries: TokenUsageEntry[];
}

const STORAGE_KEY = 'biosentinel_token_usage';
const MAX_ENTRIES = 100;

/** Safe localStorage getter — returns null if storage unavailable */
function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch (_e) { return null; }
}

/** Safe localStorage setter — no-op if storage unavailable */
function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch (_e) { /* storage full or unavailable */ }
}

/** Safe localStorage remover */
function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch (_e) { /* noop */ }
}

// ─── Compression Report ───────────────────────────────────────────────────────

export interface CompressionReport {
  originalTokens: number;
  finalTokens: number;
  saved: number;
  ratio: number;              // 0–1: how much was compressed away
  budgetUsedPct: number;      // % of inputBudget used
  wasCompressed: boolean;
  actions: string[];          // what was trimmed/removed
}

// ─── Core Token Estimator ─────────────────────────────────────────────────────

/**
 * Fast, language-agnostic token estimator.
 * Uses chars/3.8 — validated against OpenAI tokenizer on mixed English/numeric text.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

export function tokensToChars(tokens: number): number {
  return Math.ceil(tokens * 3.8);
}

// ─── Model Profile Resolver ───────────────────────────────────────────────────

export function getModelProfile(provider: string, model: string): ModelProfile {
  const providerProfiles = MODEL_PROFILES[provider] ?? MODEL_PROFILES['gemini'];
  return providerProfiles[model] ?? providerProfiles['default'];
}

// ─── Smart Weather Context Builder ───────────────────────────────────────────

/**
 * Build a compact weather context string by:
 * 1. Omitting every field that is null, undefined, or the string 'N/A'
 * 2. Formatting numeric values with appropriate precision
 * 3. Only including advanced fields that have real data
 */
export function buildCompactWeatherContext(weather: WeatherData): string {
  const f = (v: any, unit = '') => (v !== null && v !== undefined && v !== 'N/A' ? `${v}${unit}` : null);
  const adv = weather.advancedData;

  const core = [
    `Location: ${weather.city} (${weather.lat.toFixed(3)}, ${weather.lon.toFixed(3)})`,
    `Temp: ${weather.temp}°C (Feels ${weather.feelsLike}°C) | Humidity: ${weather.humidity}% | Condition: ${weather.description}`,
    f(weather.dewPoint, '°C') ? `Dew Point: ${weather.dewPoint}°C` : null,
    `Pressure: ${weather.pressure} hPa | Wind: ${weather.windSpeed} m/s @ ${weather.windDeg}°`,
    f(weather.uvIndex) ? `UV: ${weather.uvIndex}` : null,
    `AQI: ${weather.aqi}${weather.rawAqi ? ` (raw US AQI: ${weather.rawAqi})` : ''}`,
    f(weather.visibility) ? `Visibility: ${weather.visibility}m` : null,
  ].filter(Boolean).join('\n');

  // Advanced atmospheric — only include fields with real values
  const advFields: string[] = [];
  if (adv) {
    if (adv.boundaryLayerHeight !== undefined) advFields.push(`BLH: ${adv.boundaryLayerHeight}m`);
    if (adv.cape !== undefined)                advFields.push(`CAPE: ${adv.cape} J/kg`);
    if (adv.windGusts !== undefined)           advFields.push(`Gusts: ${adv.windGusts} km/h`);
    if (adv.vapourPressureDeficit !== undefined) advFields.push(`VPD: ${adv.vapourPressureDeficit} kPa`);
    if (adv.wetBulbTemperature !== undefined)  advFields.push(`Wet-Bulb: ${adv.wetBulbTemperature}°C`);
    if (adv.surfacePressure !== undefined)     advFields.push(`SfcPress: ${adv.surfacePressure} hPa`);
    if (adv.soilTemperature !== undefined)     advFields.push(`Soil: ${adv.soilTemperature}°C`);
    if (adv.soilMoisture !== undefined)        advFields.push(`SoilMoist: ${adv.soilMoisture} m³/m³`);
    if (adv.shortwaveRadiation !== undefined)  advFields.push(`SW-Rad: ${adv.shortwaveRadiation} W/m²`);
    if (adv.evapotranspiration !== undefined)  advFields.push(`ET: ${adv.evapotranspiration} mm`);
  }

  // Air quality — only non-null values
  const aqFields: string[] = [];
  if (adv) {
    if (adv.pm2_5 !== undefined) aqFields.push(`PM2.5: ${adv.pm2_5}`);
    if (adv.pm10  !== undefined) aqFields.push(`PM10: ${adv.pm10}`);
    if (adv.o3    !== undefined) aqFields.push(`O3: ${adv.o3}`);
    if (adv.no2   !== undefined) aqFields.push(`NO2: ${adv.no2}`);
    if (adv.so2   !== undefined) aqFields.push(`SO2: ${adv.so2}`);
    if (adv.co    !== undefined) aqFields.push(`CO: ${adv.co}`);
    if (adv.co2   !== undefined) aqFields.push(`CO2: ${adv.co2}`);
    if (adv.dust  !== undefined) aqFields.push(`Dust: ${adv.dust}`);
    if (adv.ammonia !== undefined) aqFields.push(`NH3: ${adv.ammonia}`);
    if (adv.aod   !== undefined) aqFields.push(`AOD: ${adv.aod}`);
  }

  // Pollen — only non-null values
  const pollenFields: string[] = [];
  if (adv) {
    if (adv.grass_pollen   !== undefined) pollenFields.push(`Grass: ${adv.grass_pollen}`);
    if (adv.birch_pollen   !== undefined) pollenFields.push(`Birch: ${adv.birch_pollen}`);
    if (adv.ragweed_pollen !== undefined) pollenFields.push(`Ragweed: ${adv.ragweed_pollen}`);
    if (adv.olive_pollen   !== undefined) pollenFields.push(`Olive: ${adv.olive_pollen}`);
    if (adv.alder_pollen   !== undefined) pollenFields.push(`Alder: ${adv.alder_pollen}`);
    if (adv.mugwort_pollen !== undefined) pollenFields.push(`Mugwort: ${adv.mugwort_pollen}`);
  }

  const parts: string[] = [core];
  if (advFields.length)  parts.push(`Atmospheric: ${advFields.join(' | ')}`);
  if (aqFields.length)   parts.push(`Air Quality (µg/m³): ${aqFields.join(' | ')}`);
  if (pollenFields.length) parts.push(`Pollen (grains/m³): ${pollenFields.join(' | ')}`);
  parts.push(`Today: ${weather.todaySummary}`);
  parts.push(`Tomorrow: ${weather.tomorrowSummary}`);

  return parts.join('\n');
}

// ─── Dataset Summary Trimmer ──────────────────────────────────────────────────

/**
 * Truncate a CSV/dataset summary to fit within a token budget.
 * Keeps the header block + top rows, warns the model data was truncated.
 */
export function trimDatasetSummary(summary: string, maxTokens: number): { text: string; wasTrimmed: boolean } {
  if (!summary || estimateTokens(summary) <= maxTokens) return { text: summary, wasTrimmed: false };

  const maxChars = tokensToChars(maxTokens);
  const truncated = summary.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  const safe = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;
  return {
    text: safe + '\n[DATASET TRUNCATED — remaining rows omitted to fit context budget. Analyze available rows only.]',
    wasTrimmed: true,
  };
}

// ─── Chat History Trimmer ─────────────────────────────────────────────────────

/**
 * Trim chat history to fit within a token budget.
 * Strategy: always keep the FIRST message (initial context) and the most RECENT N messages.
 * Drops messages from the middle when necessary.
 */
export function trimChatHistory(history: ChatMessage[], maxTokens: number): {
  history: ChatMessage[];
  droppedCount: number;
} {
  if (!history.length) return { history: [], droppedCount: 0 };

  const totalTokens = history.reduce((sum, m) => sum + estimateTokens(m.text), 0);
  if (totalTokens <= maxTokens) return { history, droppedCount: 0 };

  // Always keep at least the last 4 messages
  let kept = [...history];
  let dropped = 0;

  while (estimateTokens(kept.map(m => m.text).join('\n')) > maxTokens && kept.length > 4) {
    // Drop from the oldest end (index 0) first, keeping at least the anchor
    kept.splice(0, 1);
    dropped++;
  }

  return { history: kept, droppedCount: dropped };
}

// ─── Content Priority Scorer ──────────────────────────────────────────────────

export interface ContentPriorityConfig {
  /** Max tokens for the weather context section */
  weatherContextBudget: number;
  /** Max tokens for the dataset summary section */
  datasetBudget: number;
  /** Max tokens for the lifestyle/feedback section */
  lifestyleBudget: number;
  /** Max tokens for chat history (chat mode only) */
  chatHistoryBudget: number;
}

/**
 * Given the model's input budget and callType, allocate token budgets to each section.
 * Health assessment: weather=40%, dataset=30%, lifestyle=15%, system/prompt=15%
 * Chat: history=50%, weather=30%, query=20%
 */
export function allocateBudgets(inputBudget: number, callType: CallType): ContentPriorityConfig {
  if (callType === 'chat') {
    return {
      weatherContextBudget: Math.floor(inputBudget * 0.25),
      datasetBudget: 0,
      lifestyleBudget: 0,
      chatHistoryBudget: Math.floor(inputBudget * 0.55),
    };
  }
  if (callType === 'historical_research') {
    return {
      weatherContextBudget: Math.floor(inputBudget * 0.35),
      datasetBudget: 0,
      lifestyleBudget: 0,
      chatHistoryBudget: 0,
    };
  }
  // health_assessment & flood_analysis
  return {
    weatherContextBudget: Math.floor(inputBudget * 0.35),
    datasetBudget:        Math.floor(inputBudget * 0.30),
    lifestyleBudget:      Math.floor(inputBudget * 0.10),
    chatHistoryBudget:    0,
  };
}

// ─── Full Prompt Budget Check ─────────────────────────────────────────────────

/**
 * Check whether a fully built (systemInstruction + userPrompt) will fit
 * within the model's max input budget. Returns a report with stats.
 */
export function checkPromptFit(
  systemInstruction: string,
  userPrompt: string,
  provider: string,
  model: string
): CompressionReport & { willFit: boolean; overflow: number } {
  const profile = getModelProfile(provider, model);
  const total = estimateTokens(systemInstruction) + estimateTokens(userPrompt);
  const willFit = total <= profile.maxInputTokens;
  const overflow = Math.max(0, total - profile.maxInputTokens);
  const budgetUsedPct = Math.round((total / profile.inputBudget) * 100);

  return {
    originalTokens: total,
    finalTokens: total,
    saved: 0,
    ratio: 0,
    budgetUsedPct,
    wasCompressed: false,
    actions: [],
    willFit,
    overflow,
  };
}

// ─── Usage Tracker ────────────────────────────────────────────────────────────

class UsageTracker {
  private entries: TokenUsageEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = safeGet(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.entries = Array.isArray(parsed) ? parsed : [];
      }
    } catch (_e) { this.entries = []; }
  }

  private save(): void {
    try {
      const trimmed = this.entries.slice(-MAX_ENTRIES);
      safeSet(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (_e) { /* storage full — skip */ }
  }

  track(entry: Omit<TokenUsageEntry, 'timestamp'>): void {
    this.entries.push({ ...entry, timestamp: Date.now() });
    this.save();
  }

  getSessionStats(sinceMs = Date.now() - 24 * 60 * 60 * 1000): SessionUsageStats {
    const recent = this.entries.filter(e => e.timestamp >= sinceMs);
    const stats: SessionUsageStats = {
      totalCalls: recent.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCachedTokens: 0,
      callsByType: { health_assessment: 0, historical_research: 0, chat: 0, flood_analysis: 0 },
      compressionsSaved: 0,
      entries: recent,
    };
    for (const e of recent) {
      stats.totalInputTokens += e.estimatedInputTokens;
      stats.totalOutputTokens += e.estimatedOutputTokens;
      stats.totalCachedTokens += e.cachedTokens ?? 0;
      stats.callsByType[e.callType]++;
      if (e.compressed && e.compressionRatio) {
        stats.compressionsSaved += Math.round(e.estimatedInputTokens * e.compressionRatio);
      }
    }
    stats.totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
    return stats;
  }

  clearHistory(): void {
    this.entries = [];
    safeRemove(STORAGE_KEY);
  }
}

// ─── Main ContextManager Class ────────────────────────────────────────────────

class ContextManager {
  private tracker: UsageTracker;

  constructor() {
    // Explicit constructor for correct initialization order
    // (useDefineForClassFields: false in tsconfig uses legacy assignment semantics)
    this.tracker = new UsageTracker();
  }

  /** Get the model profile for a given provider + model combo */
  getProfile(provider: string, model: string): ModelProfile {
    return getModelProfile(provider, model);
  }

  /**
   * Build an optimally compressed weather context string.
   * Omits all N/A fields. Respects the provided token budget.
   * Returns originalTokens (full compact size) so callers can compute savings.
   */
  buildWeatherContext(weather: WeatherData, budgetTokens?: number): {
    text: string; tokens: number; wasTrimmed: boolean; originalTokens: number;
  } {
    const compact = buildCompactWeatherContext(weather);
    const originalTokens = estimateTokens(compact);
    if (!budgetTokens || originalTokens <= budgetTokens) {
      return { text: compact, tokens: originalTokens, wasTrimmed: false, originalTokens };
    }
    // Trim to budget — clean break on last newline
    const maxChars = tokensToChars(budgetTokens);
    const raw = compact.slice(0, maxChars);
    const safe = raw.lastIndexOf('\n') > 0 ? raw.slice(0, raw.lastIndexOf('\n')) : raw;
    return {
      text: safe + '\n[Weather context trimmed to fit context budget]',
      tokens: budgetTokens,
      wasTrimmed: true,
      originalTokens,
    };
  }

  /**
   * Compress a dataset summary to fit within budget.
   * Returns originalTokens so callers can compute savings.
   */
  compressDataset(summary: string, budgetTokens: number): {
    text: string; tokens: number; wasTrimmed: boolean; originalTokens: number;
  } {
    const originalTokens = estimateTokens(summary);
    const result = trimDatasetSummary(summary, budgetTokens);
    return { text: result.text, tokens: estimateTokens(result.text), wasTrimmed: result.wasTrimmed, originalTokens };
  }

  /**
   * Trim chat history to fit within a budget.
   */
  trimHistory(history: ChatMessage[], budgetTokens: number): { history: ChatMessage[]; droppedCount: number } {
    return trimChatHistory(history, budgetTokens);
  }

  /**
   * Allocate section budgets for a given call type and model.
   */
  allocate(provider: string, model: string, callType: CallType): ContentPriorityConfig {
    const profile = getModelProfile(provider, model);
    return allocateBudgets(profile.inputBudget, callType);
  }

  /**
   * Track a completed API call.
   */
  track(
    callType: CallType,
    provider: string,
    model: string,
    inputText: string,
    outputText: string,
    compressionReport?: CompressionReport,
    cachedTokens = 0
  ): TokenUsageEntry {
    const entry: Omit<TokenUsageEntry, 'timestamp'> = {
      callType,
      provider,
      model,
      estimatedInputTokens: estimateTokens(inputText),
      estimatedOutputTokens: estimateTokens(outputText),
      cachedTokens,
      compressed: compressionReport?.wasCompressed ?? false,
      compressionRatio: compressionReport?.ratio,
    };
    this.tracker.track(entry);
    return { ...entry, timestamp: Date.now() };
  }

  /**
   * Get session usage statistics (default: last 24h).
   */
  getStats(sinceMs?: number): SessionUsageStats {
    return this.tracker.getSessionStats(sinceMs);
  }

  /**
   * Clear all stored usage history.
   */
  clearStats(): void {
    this.tracker.clearHistory();
  }

  /**
   * Check if a combined prompt will overflow the model's context.
   */
  checkFit(system: string, user: string, provider: string, model: string) {
    return checkPromptFit(system, user, provider, model);
  }

  /**
   * Get the optimal temperature for a given call type and model.
   */
  getTemperature(provider: string, model: string, callType: CallType): number {
    const profile = getModelProfile(provider, model);
    return callType === 'chat' ? profile.chatTemperature : profile.reportTemperature;
  }

  /**
   * Format a token count for display (e.g., "12.3K", "1.05M").
   */
  formatTokens(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
    if (count >= 1_000)     return `${(count / 1_000).toFixed(1)}K`;
    return `${count}`;
  }

  /**
   * Format a context window size label (e.g., "128K", "1M").
   */
  formatContextWindow(provider: string, model: string): string {
    const profile = getModelProfile(provider, model);
    return this.formatTokens(profile.contextWindow);
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────
export const contextManager = new ContextManager();
