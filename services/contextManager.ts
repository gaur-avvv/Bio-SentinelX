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
    'deepseek-ai/DeepSeek-V3.2':                  { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-R1':                    { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 16_384, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'deepseek-ai/DeepSeek-V3.2-Exp':              { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-V3.1-Terminus':         { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-V3.1':                  { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'deepseek-ai/DeepSeek-V3':                    { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'MiniMaxAI/MiniMax-M2.5':                     { contextWindow: 204_800, maxInputTokens: 180_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'MiniMaxAI/MiniMax-M2.1':                     { contextWindow: 204_800, maxInputTokens: 180_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'moonshotai/Kimi-K2.5':                       { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'moonshotai/Kimi-K2-Thinking':                { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 16_384, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'moonshotai/Kimi-K2-Instruct-0905':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'moonshotai/Kimi-K2-Instruct':                { contextWindow: 131_072, maxInputTokens: 120_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-235B-A22B-Thinking-2507':         { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 16_384, inputBudget: 28_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'Qwen/Qwen3-235B-A22B-Instruct-2507':         { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-Coder-480B-A35B-Instruct':        { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-Coder-30B-A3B-Instruct':          { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-30B-A3B-Thinking-2507':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'Qwen/Qwen3-30B-A3B-Instruct-2507':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-Next-80B-A3B-Thinking':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.3, chatTemperature: 0.6 },
    'Qwen/Qwen3-Next-80B-A3B-Instruct':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-VL-235B-A22B-Instruct':           { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 28_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'Qwen/Qwen3-VL-32B-Instruct':                 { contextWindow: 262_144, maxInputTokens: 240_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
    'default':                                    { contextWindow: 163_840, maxInputTokens: 140_000, maxOutputTokens: 8_192, inputBudget: 24_000, reportTemperature: 0.4, chatTemperature: 0.7 },
  },
  ollama: {
    'smollm2-135m':  { contextWindow: 2_048,  maxInputTokens: 1_500,  maxOutputTokens: 512,   inputBudget: 1_200,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'smollm2-1.7b':  { contextWindow: 4_096,  maxInputTokens: 3_000,  maxOutputTokens: 1_024, inputBudget: 2_400,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'qwen2.5-1.5b':  { contextWindow: 8_192,  maxInputTokens: 6_000,  maxOutputTokens: 2_048, inputBudget: 4_800,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'qwen2.5-3b':    { contextWindow: 8_192,  maxInputTokens: 6_000,  maxOutputTokens: 2_048, inputBudget: 4_800,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'llama3.2-1b':   { contextWindow: 4_096,  maxInputTokens: 3_000,  maxOutputTokens: 1_024, inputBudget: 2_400,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'llama3.2-3b':   { contextWindow: 8_192,  maxInputTokens: 6_000,  maxOutputTokens: 2_048, inputBudget: 4_800,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'phi3-mini':     { contextWindow: 4_096,  maxInputTokens: 3_000,  maxOutputTokens: 1_024, inputBudget: 2_400,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'medllama2':     { contextWindow: 4_096,  maxInputTokens: 3_000,  maxOutputTokens: 1_024, inputBudget: 2_400,  reportTemperature: 0.4, chatTemperature: 0.7 },
    'default':       { contextWindow: 4_096,  maxInputTokens: 3_000,  maxOutputTokens: 1_024, inputBudget: 2_400,  reportTemperature: 0.4, chatTemperature: 0.7 },
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
  cachedTokens: number;
  compressed: boolean;
  compressionRatio?: number;
}

export interface SessionUsageStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCachedTokens: number;
  callsByType: Record<CallType, number>;
  compressionsSaved: number;
  entries: TokenUsageEntry[];
}

const STORAGE_KEY = 'biosentinel_token_usage';
const MAX_ENTRIES = 100;

function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch (_e) { return null; }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch (_e) {}
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch (_e) {}
}

// ─── Token Estimation ─────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

export function tokensToChars(tokens: number): number {
  return Math.floor(tokens * 3.8);
}

export function getModelProfile(provider: string, model: string): ModelProfile {
  const prov = MODEL_PROFILES[provider] || MODEL_PROFILES.gemini;
  return prov[model] || prov.default;
}

// ─── Content Compactor ────────────────────────────────────────────────────────

export function buildCompactWeatherContext(weather: WeatherData): string {
  const parts: string[] = [`Weather & Environmental conditions for ${weather.city}:`];
  const add = (label: string, val: unknown) => {
    if (val !== undefined && val !== null && val !== '' && val !== 'N/A') {
      parts.push(`- ${label}: ${val}`);
    }
  };

  add('Temp', `${weather.temp}°C`);
  add('Condition', weather.description);
  add('AQI', weather.aqi);
  add('Humidity', `${weather.humidity}%`);
  add('Wind', `${weather.windSpeed} km/h`);
  add('Pressure', `${weather.pressure} hPa`);
  add('Feels Like', `${weather.feelsLike}°C`);

  if (weather.uvIndex) add('UV Index', weather.uvIndex);
  if (weather.dewPoint) add('Dew Point', `${weather.dewPoint}°C`);

  if (weather.advancedData) {
    const adv = weather.advancedData;
    add('PM2.5', adv.pm2_5 ? `${adv.pm2_5} µg/m³` : null);
    add('PM10', adv.pm10 ? `${adv.pm10} µg/m³` : null);
    add('Ozone', adv.o3 ? `${adv.o3} µg/m³` : null);
    add('NO2', adv.no2 ? `${adv.no2} µg/m³` : null);
    add('SO2', adv.so2 ? `${adv.so2} µg/m³` : null);
    add('CO', adv.co ? `${adv.co} mg/m³` : null);
  }

  return parts.join('\n');
}

export interface CompressionReport {
  originalTokens: number;
  finalTokens: number;
  saved: number;
  ratio: number;
  budgetUsedPct: number;
  wasCompressed: boolean;
  actions: string[];
}

export interface CompressionQualityReport {
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  compressionRatio: number;
  informationDensityBefore: number;
  informationDensityAfter: number;
  retentionPct: number;
}

export function analyzeCompressionQuality(original: string, compressed: string): CompressionQualityReport {
  const origTokens = estimateTokens(original);
  const compTokens = estimateTokens(compressed);
  
  const tokenizeSimple = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const origWords = tokenizeSimple(original);
  const compWords = tokenizeSimple(compressed);
  
  const origUnique = new Set(origWords).size;
  const compUnique = new Set(compWords).size;
  
  const densityBefore = origWords.length > 0 ? origUnique / origWords.length : 0;
  const densityAfter = compWords.length > 0 ? compUnique / compWords.length : 0;
  
  const origVocab = new Set(origWords);
  const retainedWords = compWords.filter(w => origVocab.has(w));
  const retentionPct = compWords.length > 0 ? retainedWords.length / compWords.length : 1;
  
  return {
    originalTokens: origTokens,
    compressedTokens: compTokens,
    savedTokens: Math.max(0, origTokens - compTokens),
    compressionRatio: compTokens > 0 ? Math.round((origTokens / compTokens) * 100) / 100 : 1,
    informationDensityBefore: Math.round(densityBefore * 100) / 100,
    informationDensityAfter: Math.round(densityAfter * 100) / 100,
    retentionPct: Math.round(retentionPct * 100),
  };
}

// ─── Dataset Summary Trimmer ──────────────────────────────────────────────────

export function trimDatasetSummary(summary: string, maxTokens: number): { text: string; wasTrimmed: boolean } {
  if (!summary || estimateTokens(summary) <= maxTokens) return { text: summary, wasTrimmed: false };

  const lines = summary.split('\n');
  const keptLines: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    if (currentTokens + lineTokens <= maxTokens) {
      keptLines.push(line);
      currentTokens += lineTokens;
    } else {
      break;
    }
  }

  return {
    text: keptLines.join('\n') + '\n[Dataset summary trimmed to fit context budget]',
    wasTrimmed: true,
  };
}

// ─── O(n) Single-pass Chat History Trimmer ─────────────────────────────────────

/**
 * Trim chat history to fit within a token budget in O(n) time.
 * Strategy: always keep the FIRST message (initial context) and the most RECENT N messages.
 * Drops messages from the middle.
 */
export function trimChatHistory(history: ChatMessage[], maxTokens: number): {
  history: ChatMessage[];
  droppedCount: number;
} {
  if (!history.length) return { history: [], droppedCount: 0 };

  const tokenCounts = history.map(m => estimateTokens(m.text));
  const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
  if (totalTokens <= maxTokens) return { history, droppedCount: 0 };

  let keptTokens = 0;
  let keepCount = 0;

  // Scan backwards from the end to keep the most recent messages
  for (let i = history.length - 1; i >= 0; i--) {
    const t = tokenCounts[i];
    if (keepCount < 4 || keptTokens + t <= maxTokens) {
      keptTokens += t;
      keepCount++;
    } else {
      break;
    }
  }

  const kept = history.slice(history.length - keepCount);
  const droppedCount = history.length - keepCount;

  return { history: kept, droppedCount };
}

// ─── Content Priority Scorer & Dynamic Reallocation ───────────────────────────

export interface ContentPriorityConfig {
  weatherContextBudget: number;
  datasetBudget: number;
  lifestyleBudget: number;
  chatHistoryBudget: number;
}

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
  return {
    weatherContextBudget: Math.floor(inputBudget * 0.35),
    datasetBudget:        Math.floor(inputBudget * 0.30),
    lifestyleBudget:      Math.floor(inputBudget * 0.10),
    chatHistoryBudget:    0,
  };
}

/**
 * Enforces dynamic context budget reallocation. If one section has low usage
 * (e.g. no weather data, or weather is very brief), its leftover budget is redistributed
 * to other sections that actually require it.
 */
export function allocateBudgetsDynamic(
  inputBudget: number,
  callType: CallType,
  sizes: { weatherTokens?: number; datasetTokens?: number; lifestyleTokens?: number; chatHistoryTokens?: number }
): ContentPriorityConfig {
  const standard = allocateBudgets(inputBudget, callType);
  const dynamic = { ...standard };
  let leftover = 0;

  // 1. Calculate actual use and collect leftover budget
  if (standard.weatherContextBudget > 0 && sizes.weatherTokens !== undefined) {
    const diff = standard.weatherContextBudget - sizes.weatherTokens;
    if (diff > 0) {
      dynamic.weatherContextBudget = sizes.weatherTokens;
      leftover += diff;
    }
  }
  if (standard.datasetBudget > 0 && sizes.datasetTokens !== undefined) {
    const diff = standard.datasetBudget - sizes.datasetTokens;
    if (diff > 0) {
      dynamic.datasetBudget = sizes.datasetTokens;
      leftover += diff;
    }
  }
  if (standard.lifestyleBudget > 0 && sizes.lifestyleTokens !== undefined) {
    const diff = standard.lifestyleBudget - sizes.lifestyleTokens;
    if (diff > 0) {
      dynamic.lifestyleBudget = sizes.lifestyleTokens;
      leftover += diff;
    }
  }
  if (standard.chatHistoryBudget > 0 && sizes.chatHistoryTokens !== undefined) {
    const diff = standard.chatHistoryBudget - sizes.chatHistoryTokens;
    if (diff > 0) {
      dynamic.chatHistoryBudget = sizes.chatHistoryTokens;
      leftover += diff;
    }
  }

  // 2. Redistribute leftover to the sections that exceed their standard budget
  if (leftover > 0) {
    const needy: Array<keyof ContentPriorityConfig> = [];
    if (sizes.weatherTokens !== undefined && sizes.weatherTokens > standard.weatherContextBudget) needy.push('weatherContextBudget');
    if (sizes.datasetTokens !== undefined && sizes.datasetTokens > standard.datasetBudget) needy.push('datasetBudget');
    if (sizes.lifestyleTokens !== undefined && sizes.lifestyleTokens > standard.lifestyleBudget) needy.push('lifestyleBudget');
    if (sizes.chatHistoryTokens !== undefined && sizes.chatHistoryTokens > standard.chatHistoryBudget) needy.push('chatHistoryBudget');

    if (needy.length > 0) {
      const portion = Math.floor(leftover / needy.length);
      for (const key of needy) {
        dynamic[key] += portion;
      }
    }
  }

  return dynamic;
}

// ─── Streaming Token Tracker ──────────────────────────────────────────────────

export interface StreamTokenTracker {
  tokenCount: number;
  startTime: number;
  latencyMs: number;
  tokensPerSecond: number;
}

export function createStreamTracker(): {
  track: (token: string) => StreamTokenTracker;
  getStats: () => StreamTokenTracker;
} {
  let tokenCount = 0;
  const startTime = Date.now();
  return {
    track: (token: string) => {
      tokenCount += estimateTokens(token);
      const latency = Math.max(1, Date.now() - startTime);
      return {
        tokenCount,
        startTime,
        latencyMs: latency,
        tokensPerSecond: Math.round((tokenCount / (latency / 1000)) * 100) / 100,
      };
    },
    getStats: () => {
      const latency = Math.max(1, Date.now() - startTime);
      return {
        tokenCount,
        startTime,
        latencyMs: latency,
        tokensPerSecond: Math.round((tokenCount / (latency / 1000)) * 100) / 100,
      };
    }
  };
}

// ─── Full Prompt Budget Check ─────────────────────────────────────────────────

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
    this.tracker = new UsageTracker();
  }

  /** Get the model profile for a given provider + model combo */
  getProfile(provider: string, model: string): ModelProfile {
    return getModelProfile(provider, model);
  }

  /**
   * Build an optimally compressed weather context string.
   * Omits all N/A fields. Respects the provided token budget.
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
   * Allocate section budgets dynamically using actual section sizes.
   */
  allocateDynamic(
    provider: string,
    model: string,
    callType: CallType,
    sizes: { weatherTokens?: number; datasetTokens?: number; lifestyleTokens?: number; chatHistoryTokens?: number }
  ): ContentPriorityConfig {
    const profile = getModelProfile(provider, model);
    return allocateBudgetsDynamic(profile.inputBudget, callType, sizes);
  }

  /**
   * Allocate standard section budgets.
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
