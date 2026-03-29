/**
 * BioSentinelX — Small Model Intelligence Service (Ollama Edition)
 *
 * Provides:
 *  1. SmolLM, Qwen 1.5B & other small models via Ollama local inference
 *  2. Adaptive Learning with feedback-driven model selection & prompt refinement
 *  3. Long-Term Memory for domain-specific context retention
 *  4. Synthetic Data generation + Guardrails for compliance
 *  5. Inference cost tracking for local models
 *
 * All models run locally through Ollama (no API key required).
 */

import { WeatherData } from '../types';

// ─── Default Ollama Endpoint ────────────────────────────────────────────────

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

export function getOllamaEndpoint(): string {
  try {
    return localStorage.getItem('biosentinel_ollama_endpoint') || DEFAULT_OLLAMA_ENDPOINT;
  } catch { return DEFAULT_OLLAMA_ENDPOINT; }
}

export function setOllamaEndpoint(endpoint: string): void {
  try { localStorage.setItem('biosentinel_ollama_endpoint', endpoint); } catch { /* quota */ }
}

// ─── Model Definitions ──────────────────────────────────────────────────────

export interface SmallModelDef {
  id: string;
  name: string;
  provider: 'ollama';
  ollamaModel: string;       // Ollama model tag (e.g. 'qwen2.5:1.5b')
  maxTokens: number;
  costPer1kTokens: number;   // USD — effectively 0 for local inference
  specialization: string;
}

export const SMALL_MODELS: SmallModelDef[] = [
  {
    id: 'smollm2-135m',
    name: 'SmolLM2 135M',
    provider: 'ollama',
    ollamaModel: 'smollm2:135m',
    maxTokens: 2048,
    costPer1kTokens: 0,
    specialization: 'Ultra-lightweight triage, fast health keyword extraction',
  },
  {
    id: 'smollm2-1.7b',
    name: 'SmolLM2 1.7B',
    provider: 'ollama',
    ollamaModel: 'smollm2:1.7b',
    maxTokens: 4096,
    costPer1kTokens: 0,
    specialization: 'Health risk triage, symptom classification, alert summarization',
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen 2.5 1.5B',
    provider: 'ollama',
    ollamaModel: 'qwen2.5:1.5b',
    maxTokens: 8192,
    costPer1kTokens: 0,
    specialization: 'Structured health analysis, multi-lingual support, compliance checks',
  },
  {
    id: 'qwen2.5-3b',
    name: 'Qwen 2.5 3B',
    provider: 'ollama',
    ollamaModel: 'qwen2.5:3b',
    maxTokens: 8192,
    costPer1kTokens: 0,
    specialization: 'Advanced reasoning, medical report generation, research synthesis',
  },
  {
    id: 'llama3.2-1b',
    name: 'Llama 3.2 1B',
    provider: 'ollama',
    ollamaModel: 'llama3.2:1b',
    maxTokens: 4096,
    costPer1kTokens: 0,
    specialization: 'Fast triage, lightweight classification, quick summaries',
  },
  {
    id: 'llama3.2-3b',
    name: 'Llama 3.2 3B',
    provider: 'ollama',
    ollamaModel: 'llama3.2:3b',
    maxTokens: 8192,
    costPer1kTokens: 0,
    specialization: 'Balanced reasoning, health risk assessment, contextual analysis',
  },
  {
    id: 'phi3-mini',
    name: 'Phi-3 Mini 3.8B',
    provider: 'ollama',
    ollamaModel: 'phi3:mini',
    maxTokens: 4096,
    costPer1kTokens: 0,
    specialization: 'Medical reasoning, structured output, clinical guidelines',
  },
  {
    id: 'medllama2',
    name: 'MedLlama2 7B',
    provider: 'ollama',
    ollamaModel: 'medllama2',
    maxTokens: 4096,
    costPer1kTokens: 0,
    specialization: 'Medical domain specialist, clinical QA, health knowledge',
  },
];

export function getSmallModel(id: string): SmallModelDef | undefined {
  return SMALL_MODELS.find(m => m.id === id);
}

// ─── Ollama Inference ───────────────────────────────────────────────────────

/**
 * Check if Ollama is reachable at the configured endpoint.
 */
export async function checkOllamaHealth(endpoint?: string): Promise<boolean> {
  const base = endpoint || getOllamaEndpoint();
  try {
    const res = await fetch(base, { method: 'GET', signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

/**
 * List models available in the local Ollama instance.
 */
export async function listOllamaModels(endpoint?: string): Promise<string[]> {
  const base = endpoint || getOllamaEndpoint();
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json() as { models?: Array<{ name: string }> };
    return (data.models || []).map(m => m.name);
  } catch { return []; }
}

/**
 * Run inference through Ollama's OpenAI-compatible chat API.
 */
export async function inferWithSmallModel(
  modelId: string,
  prompt: string,
  systemPrompt: string,
  _apiKey: string, // kept for API compatibility; Ollama needs no key
  maxTokens = 512
): Promise<{ text: string; tokensUsed: number; latencyMs: number }> {
  const model = getSmallModel(modelId);
  if (!model) throw new Error(`Unknown small model: ${modelId}`);

  const base = getOllamaEndpoint();
  const start = performance.now();

  // Use adaptive temperature if available
  const adaptiveTemp = getAdaptiveTemperature(modelId);

  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.ollamaModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: Math.min(maxTokens, model.maxTokens),
      temperature: adaptiveTemp,
      top_p: 0.9,
      stream: false,
    }),
  });

  const latencyMs = performance.now() - start;

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>;
    const errMsg = (err?.error as Record<string, unknown>)?.message as string
      || (err?.error as string)
      || `Ollama API error ${response.status}`;
    if (response.status === 404) {
      throw new Error(`Model "${model.ollamaModel}" not found. Run: ollama pull ${model.ollamaModel}`);
    }
    throw new Error(errMsg);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  const tokensUsed = data?.usage?.total_tokens || Math.ceil(text.length / 4);

  return { text, tokensUsed, latencyMs };
}

/**
 * Run chat inference through Ollama (multi-turn conversation).
 */
export async function chatWithOllama(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  modelId: string,
  maxTokens = 1024
): Promise<string> {
  const model = getSmallModel(modelId);
  if (!model) throw new Error(`Unknown small model: ${modelId}`);

  const base = getOllamaEndpoint();
  const adaptiveTemp = getAdaptiveTemperature(modelId);

  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.ollamaModel,
      messages,
      max_tokens: Math.min(maxTokens, model.maxTokens),
      temperature: adaptiveTemp,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>;
    const errMsg = (err?.error as Record<string, unknown>)?.message as string
      || (err?.error as string)
      || `Ollama API error ${response.status}`;
    if (response.status === 404) {
      throw new Error(`Model "${model.ollamaModel}" not found. Run: ollama pull ${model.ollamaModel}`);
    }
    throw new Error(errMsg);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data?.choices?.[0]?.message?.content?.trim() || "I'm sorry, I couldn't process that request.";
}

// ─── Self-Learning Intelligence ─────────────────────────────────────────────

const LEARNING_STORE_KEY = 'biosentinel_self_learning_v1';
const FEEDBACK_STORE_KEY = 'biosentinel_feedback_log_v1';

export interface LearningEntry {
  id: string;
  timestamp: number;
  domain: string;        // e.g. 'respiratory', 'cardiovascular', 'heat_stress'
  context: string;       // compressed input context
  prediction: string;    // model output
  confidence: number;    // 0-1
  feedback?: 'positive' | 'negative' | 'neutral';
  correctedOutput?: string;
  modelId: string;
}

export interface FeedbackEntry {
  id: string;
  timestamp: number;
  predictionId: string;
  rating: 'helpful' | 'unhelpful' | 'incorrect';
  comment?: string;
  domain: string;
}

export interface LearningStats {
  totalPredictions: number;
  positiveRate: number;
  negativeRate: number;
  topDomains: Array<{ domain: string; count: number; accuracy: number }>;
  avgConfidence: number;
  modelPerformance: Record<string, { predictions: number; positiveRate: number }>;
}

function loadLearningEntries(): LearningEntry[] {
  try {
    const raw = localStorage.getItem(LEARNING_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLearningEntries(entries: LearningEntry[]): void {
  // Keep last 500 entries for richer adaptive learning
  const trimmed = entries.slice(-500);
  try { localStorage.setItem(LEARNING_STORE_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
}

function loadFeedbackEntries(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFeedbackEntries(entries: FeedbackEntry[]): void {
  const trimmed = entries.slice(-1000);
  try { localStorage.setItem(FEEDBACK_STORE_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
}

export function recordPrediction(entry: Omit<LearningEntry, 'id' | 'timestamp'>): string {
  const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const entries = loadLearningEntries();
  entries.push({ ...entry, id, timestamp: Date.now() });
  saveLearningEntries(entries);
  return id;
}

export function recordFeedback(feedback: Omit<FeedbackEntry, 'id' | 'timestamp'>): void {
  const feedbacks = loadFeedbackEntries();
  feedbacks.push({
    ...feedback,
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  });
  saveFeedbackEntries(feedbacks);

  // Update the corresponding learning entry
  const entries = loadLearningEntries();
  const entry = entries.find(e => e.id === feedback.predictionId);
  if (entry) {
    entry.feedback = feedback.rating === 'helpful' ? 'positive'
      : feedback.rating === 'incorrect' ? 'negative' : 'neutral';
    saveLearningEntries(entries);
  }

  // Trigger adaptive learning updates
  updateAdaptiveModelScores(feedback.domain);
  refinePromptTemplates(feedback.domain);
}

export function getLearningStats(): LearningStats {
  const entries = loadLearningEntries();

  const total = entries.length;
  const withFeedback = entries.filter(e => e.feedback);
  const positive = withFeedback.filter(e => e.feedback === 'positive').length;
  const negative = withFeedback.filter(e => e.feedback === 'negative').length;

  // Domain breakdown
  const domainMap = new Map<string, { count: number; positive: number }>();
  for (const e of entries) {
    const existing = domainMap.get(e.domain) || { count: 0, positive: 0 };
    existing.count++;
    if (e.feedback === 'positive') existing.positive++;
    domainMap.set(e.domain, existing);
  }

  const topDomains = Array.from(domainMap.entries())
    .map(([domain, data]) => ({
      domain,
      count: data.count,
      accuracy: data.count > 0 ? data.positive / data.count : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Model performance
  const modelMap = new Map<string, { predictions: number; positive: number }>();
  for (const e of entries) {
    const existing = modelMap.get(e.modelId) || { predictions: 0, positive: 0 };
    existing.predictions++;
    if (e.feedback === 'positive') existing.positive++;
    modelMap.set(e.modelId, existing);
  }

  const modelPerformance: Record<string, { predictions: number; positiveRate: number }> = {};
  for (const [modelId, data] of modelMap.entries()) {
    modelPerformance[modelId] = {
      predictions: data.predictions,
      positiveRate: data.predictions > 0 ? data.positive / data.predictions : 0,
    };
  }

  return {
    totalPredictions: total,
    positiveRate: withFeedback.length > 0 ? positive / withFeedback.length : 0,
    negativeRate: withFeedback.length > 0 ? negative / withFeedback.length : 0,
    topDomains,
    avgConfidence: total > 0 ? entries.reduce((s, e) => s + e.confidence, 0) / total : 0,
    modelPerformance,
  };
}

export function getFeedbackLog(): FeedbackEntry[] {
  return loadFeedbackEntries().slice(-50).reverse();
}

// ─── Adaptive Learning Engine ───────────────────────────────────────────────

const ADAPTIVE_SCORES_KEY = 'biosentinel_adaptive_scores_v1';
const ADAPTIVE_PROMPTS_KEY = 'biosentinel_adaptive_prompts_v1';
const ADAPTIVE_TEMP_KEY = 'biosentinel_adaptive_temps_v1';

export interface AdaptiveModelScore {
  modelId: string;
  domain: string;
  score: number;         // 0-1, higher = better for this domain
  totalInteractions: number;
  lastUpdated: number;
}

export interface AdaptivePromptTemplate {
  domain: string;
  refinements: string[];  // learned prompt additions
  avoidPatterns: string[]; // patterns that led to negative feedback
  lastUpdated: number;
}

function loadAdaptiveScores(): AdaptiveModelScore[] {
  try {
    const raw = localStorage.getItem(ADAPTIVE_SCORES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAdaptiveScores(scores: AdaptiveModelScore[]): void {
  try { localStorage.setItem(ADAPTIVE_SCORES_KEY, JSON.stringify(scores)); } catch { /* quota */ }
}

function loadAdaptivePrompts(): Record<string, AdaptivePromptTemplate> {
  try {
    const raw = localStorage.getItem(ADAPTIVE_PROMPTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAdaptivePrompts(prompts: Record<string, AdaptivePromptTemplate>): void {
  try { localStorage.setItem(ADAPTIVE_PROMPTS_KEY, JSON.stringify(prompts)); } catch { /* quota */ }
}

function loadAdaptiveTemps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ADAPTIVE_TEMP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAdaptiveTemps(temps: Record<string, number>): void {
  try { localStorage.setItem(ADAPTIVE_TEMP_KEY, JSON.stringify(temps)); } catch { /* quota */ }
}

/**
 * Get the adaptive temperature for a model based on historical accuracy.
 * Lower temp for high-accuracy models (more deterministic), higher for exploratory.
 */
function getAdaptiveTemperature(modelId: string): number {
  const temps = loadAdaptiveTemps();
  return temps[modelId] ?? 0.4;
}

/**
 * Update adaptive model scores after receiving feedback for a domain.
 * Uses exponential moving average for smooth score updates.
 */
function updateAdaptiveModelScores(domain: string): void {
  const entries = loadLearningEntries();
  const scores = loadAdaptiveScores();
  const temps = loadAdaptiveTemps();

  // Get recent entries for this domain (last 50)
  const domainEntries = entries.filter(e => e.domain === domain).slice(-50);

  // Group by model
  const modelGroups = new Map<string, LearningEntry[]>();
  for (const e of domainEntries) {
    const group = modelGroups.get(e.modelId) || [];
    group.push(e);
    modelGroups.set(e.modelId, group);
  }

  for (const [modelId, group] of modelGroups.entries()) {
    const withFeedback = group.filter(e => e.feedback);
    if (withFeedback.length === 0) continue;

    const positive = withFeedback.filter(e => e.feedback === 'positive').length;
    const newScore = positive / withFeedback.length;

    // Find or create the score entry
    const scoreEntry = scores.find(s => s.modelId === modelId && s.domain === domain);
    if (scoreEntry) {
      // Exponential moving average (alpha=0.3)
      scoreEntry.score = 0.7 * scoreEntry.score + 0.3 * newScore;
      scoreEntry.totalInteractions = group.length;
      scoreEntry.lastUpdated = Date.now();
    } else {
      scores.push({
        modelId,
        domain,
        score: newScore,
        totalInteractions: group.length,
        lastUpdated: Date.now(),
      });
    }

    // Adjust temperature based on accuracy
    // High accuracy -> lower temp (more deterministic)
    // Low accuracy -> slightly higher temp (more exploration)
    const accuracy = newScore;
    temps[modelId] = accuracy > 0.7 ? 0.3 : accuracy > 0.4 ? 0.5 : 0.7;
  }

  saveAdaptiveScores(scores);
  saveAdaptiveTemps(temps);
}

/**
 * Refine prompt templates based on feedback patterns.
 * Learns what works and what to avoid for each domain.
 */
function refinePromptTemplates(domain: string): void {
  const entries = loadLearningEntries().filter(e => e.domain === domain);
  const prompts = loadAdaptivePrompts();

  const template = prompts[domain] || {
    domain,
    refinements: [],
    avoidPatterns: [],
    lastUpdated: 0,
  };

  // Analyze positive feedback patterns
  const positiveEntries = entries.filter(e => e.feedback === 'positive').slice(-20);
  const negativeEntries = entries.filter(e => e.feedback === 'negative').slice(-10);

  // Extract successful patterns from high-confidence positive results
  for (const e of positiveEntries) {
    if (e.confidence > 0.7 && e.prediction.length > 50) {
      const keyPhrases = extractKeyPhrases(e.prediction);
      for (const phrase of keyPhrases) {
        if (!template.refinements.includes(phrase)) {
          template.refinements.push(phrase);
          if (template.refinements.length > 15) template.refinements.shift();
        }
      }
    }
  }

  // Learn avoidance patterns from negative feedback
  for (const e of negativeEntries) {
    const avoidPhrases = extractKeyPhrases(e.prediction);
    for (const phrase of avoidPhrases) {
      if (!template.avoidPatterns.includes(phrase)) {
        template.avoidPatterns.push(phrase);
        if (template.avoidPatterns.length > 10) template.avoidPatterns.shift();
      }
    }
  }

  template.lastUpdated = Date.now();
  prompts[domain] = template;
  saveAdaptivePrompts(prompts);
}

/**
 * Extract key phrases from text for learning patterns.
 */
function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const healthKeywords = /\b(risk|prevent|monitor|recommend|avoid|protect|hydrat|respirat|cardiovascular|symptom)\b/i;

  for (const sentence of sentences.slice(0, 3)) {
    if (healthKeywords.test(sentence)) {
      const cleaned = sentence.trim().slice(0, 80);
      if (cleaned.length > 20) phrases.push(cleaned);
    }
  }
  return phrases;
}

/**
 * Select the best model for a given domain based on adaptive scores.
 * Falls back to the specified model if no adaptive data exists.
 */
export function selectBestModel(domain: string, fallbackModelId: string): string {
  const scores = loadAdaptiveScores();
  const domainScores = scores
    .filter(s => s.domain === domain && s.totalInteractions >= 3)
    .sort((a, b) => b.score - a.score);

  if (domainScores.length > 0 && domainScores[0].score > 0.5) {
    return domainScores[0].modelId;
  }
  return fallbackModelId;
}

/**
 * Get adaptive prompt context for a domain.
 * Includes learned refinements and avoidance patterns.
 */
export function getAdaptivePromptContext(domain: string): string {
  const prompts = loadAdaptivePrompts();
  const template = prompts[domain];
  if (!template) return '';

  const parts: string[] = [];
  if (template.refinements.length > 0) {
    parts.push(`[Learned effective patterns for ${domain}]`);
    parts.push(`Focus on: ${template.refinements.slice(-5).join('; ')}`);
  }
  if (template.avoidPatterns.length > 0) {
    parts.push(`[Avoid these patterns]: ${template.avoidPatterns.slice(-3).join('; ')}`);
  }
  return parts.join('\n');
}

/**
 * Get all adaptive model scores for display.
 */
export function getAdaptiveScores(): AdaptiveModelScore[] {
  return loadAdaptiveScores().sort((a, b) => b.score - a.score);
}

/**
 * Clear all adaptive learning data.
 */
export function clearAdaptiveLearning(): void {
  localStorage.removeItem(ADAPTIVE_SCORES_KEY);
  localStorage.removeItem(ADAPTIVE_PROMPTS_KEY);
  localStorage.removeItem(ADAPTIVE_TEMP_KEY);
}

// ─── Long-Term Domain Memory ────────────────────────────────────────────────

const DOMAIN_MEMORY_KEY = 'biosentinel_domain_memory_v1';

export interface DomainMemoryEntry {
  domain: string;
  insights: string[];       // Learned insights from positive feedback
  patterns: string[];       // Recognized patterns
  lastUpdated: number;
  entryCount: number;
}

function loadDomainMemory(): Record<string, DomainMemoryEntry> {
  try {
    const raw = localStorage.getItem(DOMAIN_MEMORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveDomainMemory(memory: Record<string, DomainMemoryEntry>): void {
  try { localStorage.setItem(DOMAIN_MEMORY_KEY, JSON.stringify(memory)); } catch { /* quota */ }
}

export function updateDomainMemory(domain: string, insight: string, pattern?: string): void {
  const memory = loadDomainMemory();
  const entry = memory[domain] || { domain, insights: [], patterns: [], lastUpdated: 0, entryCount: 0 };

  if (insight && !entry.insights.includes(insight)) {
    entry.insights.push(insight);
    if (entry.insights.length > 20) entry.insights = entry.insights.slice(-20);
  }
  if (pattern && !entry.patterns.includes(pattern)) {
    entry.patterns.push(pattern);
    if (entry.patterns.length > 15) entry.patterns = entry.patterns.slice(-15);
  }

  entry.lastUpdated = Date.now();
  entry.entryCount++;
  memory[domain] = entry;
  saveDomainMemory(memory);
}

export function getDomainMemoryContext(domain?: string): string {
  const memory = loadDomainMemory();
  const entries = domain ? (memory[domain] ? [memory[domain]] : []) : Object.values(memory);

  if (entries.length === 0) return '';

  const parts: string[] = ['[Domain Knowledge Memory]'];
  for (const entry of entries.slice(0, 5)) {
    parts.push(`Domain: ${entry.domain} (${entry.entryCount} interactions)`);
    if (entry.insights.length > 0) {
      parts.push(`  Learned insights: ${entry.insights.slice(-5).join('; ')}`);
    }
    if (entry.patterns.length > 0) {
      parts.push(`  Recognized patterns: ${entry.patterns.slice(-3).join('; ')}`);
    }
  }
  return parts.join('\n');
}

export function getAllDomainMemory(): DomainMemoryEntry[] {
  return Object.values(loadDomainMemory()).sort((a, b) => b.lastUpdated - a.lastUpdated);
}

export function clearDomainMemory(): void {
  localStorage.removeItem(DOMAIN_MEMORY_KEY);
}

// ─── Synthetic Data Generation + Guardrails ─────────────────────────────────

export interface SyntheticDataPoint {
  input: Record<string, number>;
  label: string;
  confidence: number;
  source: 'synthetic';
}

export interface GuardrailResult {
  passed: boolean;
  violations: string[];
  riskLevel: 'safe' | 'caution' | 'blocked';
  sanitizedOutput?: string;
}

/**
 * Generate synthetic training data from weather patterns for compliance-critical learning.
 */
export function generateSyntheticData(
  weather: WeatherData,
  count: number = 50
): SyntheticDataPoint[] {
  const data: SyntheticDataPoint[] = [];
  const baseTemp = weather.temp;
  const baseHumidity = weather.humidity;
  const basePressure = weather.pressure;
  const baseAqi = weather.aqi;
  const baseWind = weather.windSpeed;

  for (let i = 0; i < count; i++) {
    const tempVar = baseTemp + (Math.random() - 0.5) * 20;
    const humVar = Math.max(0, Math.min(100, baseHumidity + (Math.random() - 0.5) * 40));
    const pressVar = basePressure + (Math.random() - 0.5) * 30;
    const aqiVar = Math.max(1, Math.min(5, baseAqi + Math.floor((Math.random() - 0.5) * 3)));
    const windVar = Math.max(0, baseWind + (Math.random() - 0.5) * 10);

    let label: string;
    let confidence: number;

    if (tempVar > 40 || (tempVar > 35 && humVar > 70)) {
      label = 'Heat-related Illness';
      confidence = 0.7 + Math.random() * 0.25;
    } else if (tempVar < 0 && windVar > 8) {
      label = 'Hypothermia Risk';
      confidence = 0.65 + Math.random() * 0.3;
    } else if (aqiVar >= 4 || (weather.advancedData?.pm2_5 ?? 0) > 50) {
      label = 'Respiratory Illness (Asthma/COPD)';
      confidence = 0.6 + Math.random() * 0.3;
    } else if (Math.abs(pressVar - basePressure) > 15) {
      label = 'Neurological Stress';
      confidence = 0.55 + Math.random() * 0.3;
    } else if (humVar > 85 && tempVar > 30) {
      label = 'Cardiovascular Stress';
      confidence = 0.6 + Math.random() * 0.25;
    } else if (humVar < 30 && tempVar < 10) {
      label = 'Viral Infection Risk';
      confidence = 0.5 + Math.random() * 0.3;
    } else {
      label = 'Low Risk';
      confidence = 0.8 + Math.random() * 0.15;
    }

    data.push({
      input: {
        temp: Math.round(tempVar * 10) / 10,
        humidity: Math.round(humVar),
        pressure: Math.round(pressVar),
        aqi: aqiVar,
        windSpeed: Math.round(windVar * 10) / 10,
        uvIndex: weather.uvIndex ?? 0,
      },
      label,
      confidence,
      source: 'synthetic',
    });
  }

  return data;
}

/**
 * Apply compliance guardrails to model output.
 */
export function applyGuardrails(output: string): GuardrailResult {
  const violations: string[] = [];
  let sanitizedOutput = output;

  const prescriptionPatterns = [
    /\b(prescribe|prescription|rx)\b/i,
    /\b(take|consume)\s+\d+\s*(mg|ml|tablets?|pills?|capsules?)\b/i,
    /\b(diagnos(?:e|is|ed))\s+(?:you|the patient)\s+with\b/i,
  ];

  for (const pattern of prescriptionPatterns) {
    if (pattern.test(output)) {
      violations.push('Contains specific medical prescription language');
      sanitizedOutput = sanitizedOutput.replace(pattern, '[Consult your healthcare provider]');
    }
  }

  const dangerousAdvice = [
    /\b(perform\s+surgery|self-medicate)\b/i,
    /\b(stop\s+taking\s+(?:your|all)\s+medication)\b/i,
    /\b(ignore\s+(?:the|your)\s+(?:symptoms?|doctor))\b/i,
  ];

  for (const pattern of dangerousAdvice) {
    if (pattern.test(output)) {
      violations.push('Contains potentially dangerous medical advice');
      sanitizedOutput = sanitizedOutput.replace(pattern, '[Please consult a medical professional]');
    }
  }

  const isHealthContent = /\b(health|risk|symptom|disease|condition|treatment|medical)\b/i.test(output);
  const hasDisclaimer = /\b(consult|professional|doctor|physician|healthcare provider|not medical advice)\b/i.test(output);

  if (isHealthContent && !hasDisclaimer && output.length > 200) {
    sanitizedOutput += '\n\n*This is AI-generated health information, not medical advice. Please consult a healthcare professional for personalized guidance.*';
  }

  const riskLevel: GuardrailResult['riskLevel'] = violations.length === 0 ? 'safe'
    : violations.length <= 2 ? 'caution' : 'blocked';

  return {
    passed: violations.length === 0,
    violations,
    riskLevel,
    sanitizedOutput: violations.length > 0 ? sanitizedOutput : undefined,
  };
}

// ─── Inference Cost Tracker ─────────────────────────────────────────────────

const COST_TRACKER_KEY = 'biosentinel_inference_costs_v1';

export interface InferenceCostEntry {
  timestamp: number;
  modelId: string;
  tokensUsed: number;
  costUsd: number;
  latencyMs: number;
  task: string;
}

export interface CostSummary {
  totalCostUsd: number;
  totalTokens: number;
  avgLatencyMs: number;
  entriesCount: number;
  costByModel: Record<string, { cost: number; tokens: number; calls: number }>;
  savingsVsLargeModel: number;
}

function loadCostEntries(): InferenceCostEntry[] {
  try {
    const raw = localStorage.getItem(COST_TRACKER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCostEntries(entries: InferenceCostEntry[]): void {
  const trimmed = entries.slice(-1000);
  try { localStorage.setItem(COST_TRACKER_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
}

export function trackInferenceCost(entry: Omit<InferenceCostEntry, 'timestamp'>): void {
  const entries = loadCostEntries();
  entries.push({ ...entry, timestamp: Date.now() });
  saveCostEntries(entries);
}

export function getCostSummary(): CostSummary {
  const entries = loadCostEntries();
  const costByModel: Record<string, { cost: number; tokens: number; calls: number }> = {};

  let totalCost = 0;
  let totalTokens = 0;
  let totalLatency = 0;

  for (const e of entries) {
    totalCost += e.costUsd;
    totalTokens += e.tokensUsed;
    totalLatency += e.latencyMs;

    const model = costByModel[e.modelId] || { cost: 0, tokens: 0, calls: 0 };
    model.cost += e.costUsd;
    model.tokens += e.tokensUsed;
    model.calls++;
    costByModel[e.modelId] = model;
  }

  // GPT-4o pricing estimate for savings comparison
  const gpt4oCostEstimate = totalTokens * 0.00001;

  return {
    totalCostUsd: totalCost,
    totalTokens,
    avgLatencyMs: entries.length > 0 ? totalLatency / entries.length : 0,
    entriesCount: entries.length,
    costByModel,
    savingsVsLargeModel: Math.max(0, gpt4oCostEstimate - totalCost),
  };
}

export function clearCostHistory(): void {
  localStorage.removeItem(COST_TRACKER_KEY);
}

// ─── Orchestrated Small Model Pipeline ──────────────────────────────────────

/**
 * Run a health triage through the small model pipeline:
 * 1. Select best model via adaptive learning (or use specified)
 * 2. Enrich prompt with adaptive context and domain memory
 * 3. Run inference through Ollama
 * 4. Apply guardrails to output
 * 5. Record prediction for self-learning
 * 6. Track inference costs
 */
export async function runSmallModelPipeline(
  modelId: string,
  weatherContext: string,
  healthQuery: string,
  _apiKey: string, // kept for API compatibility; Ollama needs no key
  domain: string = 'general'
): Promise<{
  result: string;
  guardrails: GuardrailResult;
  predictionId: string;
  cost: { tokensUsed: number; costUsd: number; latencyMs: number };
  adaptiveModelUsed: string;
}> {
  // Step 1: Adaptive model selection
  const selectedModelId = selectBestModel(domain, modelId);
  const model = getSmallModel(selectedModelId);
  if (!model) throw new Error(`Unknown model: ${selectedModelId}`);

  // Step 2: Build context-enriched prompt
  const domainContext = getDomainMemoryContext(domain);
  const adaptiveContext = getAdaptivePromptContext(domain);
  const systemPrompt = `You are BioSentinel, a specialized health-weather intelligence assistant.
Analyze weather conditions and their health impacts. Be concise and actionable.
${domainContext}
${adaptiveContext}
Focus on: ${model.specialization}`;

  const fullPrompt = `${weatherContext}\n\nHealth Query: ${healthQuery}`;

  // Step 3: Run inference through Ollama
  const { text, tokensUsed, latencyMs } = await inferWithSmallModel(
    selectedModelId,
    fullPrompt,
    systemPrompt,
    '',
    512
  );

  // Step 4: Apply guardrails
  const guardrails = applyGuardrails(text);
  const finalOutput = guardrails.sanitizedOutput || text;

  // Step 5: Calculate cost (effectively $0 for local models)
  const costUsd = (tokensUsed / 1000) * model.costPer1kTokens;

  // Step 6: Record prediction for self-learning
  const predictionId = recordPrediction({
    domain,
    context: fullPrompt.slice(0, 300),
    prediction: finalOutput.slice(0, 500),
    confidence: guardrails.passed ? 0.8 : 0.5,
    modelId: selectedModelId,
  });

  // Step 7: Track cost
  trackInferenceCost({
    modelId: selectedModelId,
    tokensUsed,
    costUsd,
    latencyMs,
    task: `health_triage_${domain}`,
  });

  return {
    result: finalOutput,
    guardrails,
    predictionId,
    cost: { tokensUsed, costUsd, latencyMs },
    adaptiveModelUsed: selectedModelId,
  };
}
