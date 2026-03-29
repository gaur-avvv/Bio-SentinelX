/**
 * BioSentinelX — Small Model Intelligence Service
 *
 * Provides:
 *  1. SmallLM & Qwen 1.5B integration via HuggingFace Inference API
 *  2. Self-Learning Intelligence with feedback loops
 *  3. Long-Term Memory for domain-specific context retention
 *  4. Synthetic Data generation + Guardrails for compliance
 *  5. Distilled model cost tracking for lower inference costs
 *
 * All models run through the HuggingFace Inference API (free tier available).
 */

import { WeatherData } from '../types';

// ─── Model Definitions ──────────────────────────────────────────────────────

export interface SmallModelDef {
  id: string;
  name: string;
  provider: 'huggingface';
  endpoint: string;
  maxTokens: number;
  costPer1kTokens: number; // USD
  specialization: string;
}

export const SMALL_MODELS: SmallModelDef[] = [
  {
    id: 'smalllm-135m',
    name: 'SmallLM 135M',
    provider: 'huggingface',
    endpoint: 'https://api-inference.huggingface.co/models/HuggingFaceTB/SmolLM2-135M-Instruct',
    maxTokens: 2048,
    costPer1kTokens: 0.0001,
    specialization: 'Ultra-lightweight triage, fast health keyword extraction',
  },
  {
    id: 'smalllm-1.7b',
    name: 'SmallLM 1.7B',
    provider: 'huggingface',
    endpoint: 'https://api-inference.huggingface.co/models/HuggingFaceTB/SmolLM2-1.7B-Instruct',
    maxTokens: 4096,
    costPer1kTokens: 0.0003,
    specialization: 'Health risk triage, symptom classification, alert summarization',
  },
  {
    id: 'qwen-1.5b',
    name: 'Qwen 2.5 1.5B',
    provider: 'huggingface',
    endpoint: 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct',
    maxTokens: 4096,
    costPer1kTokens: 0.0002,
    specialization: 'Structured health analysis, multi-lingual support, compliance checks',
  },
];

export function getSmallModel(id: string): SmallModelDef | undefined {
  return SMALL_MODELS.find(m => m.id === id);
}

// ─── HuggingFace Inference ──────────────────────────────────────────────────

export async function inferWithSmallModel(
  modelId: string,
  prompt: string,
  systemPrompt: string,
  apiKey: string,
  maxTokens = 512
): Promise<{ text: string; tokensUsed: number; latencyMs: number }> {
  const model = getSmallModel(modelId);
  if (!model) throw new Error(`Unknown small model: ${modelId}`);

  const start = performance.now();

  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: `<|system|>\n${systemPrompt}\n<|user|>\n${prompt}\n<|assistant|>\n`,
      parameters: {
        max_new_tokens: Math.min(maxTokens, model.maxTokens),
        temperature: 0.4,
        top_p: 0.9,
        return_full_text: false,
      },
    }),
  });

  const latencyMs = performance.now() - start;

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (err?.error as string) || `HuggingFace API error ${response.status}`;
    if (response.status === 401) throw new Error('Invalid HuggingFace API key. Get a free key at huggingface.co/settings/tokens');
    if (response.status === 503) throw new Error(`Model ${model.name} is loading. Please retry in 20-30 seconds.`);
    throw new Error(msg);
  }

  const data = await response.json() as Array<{ generated_text: string }>;
  const text = data?.[0]?.generated_text?.trim() || '';
  const tokensUsed = Math.ceil(text.length / 4); // rough estimate

  return { text, tokensUsed, latencyMs };
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
  // Keep last 200 entries
  const trimmed = entries.slice(-200);
  try { localStorage.setItem(LEARNING_STORE_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
}

function loadFeedbackEntries(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFeedbackEntries(entries: FeedbackEntry[]): void {
  const trimmed = entries.slice(-500);
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
}

export function getLearningStats(): LearningStats {
  const entries = loadLearningEntries();
  const feedbacks = loadFeedbackEntries();

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
 * Uses domain knowledge to create realistic weather-health correlation data points.
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

    // Determine health label based on synthetic conditions
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
 * Ensures health advice doesn't cross medical boundaries.
 */
export function applyGuardrails(output: string): GuardrailResult {
  const violations: string[] = [];
  let sanitizedOutput = output;

  // Medical prescription guardrails
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

  // Emergency self-treatment guardrails
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

  // Disclaimer check — add if missing on health-related content
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
  savingsVsLargeModel: number; // estimated savings compared to GPT-4o pricing
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

  // GPT-4o pricing: $5/1M input + $15/1M output ≈ $0.01/1K tokens average
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
 * 1. Use small model for fast initial classification
 * 2. Apply guardrails to output
 * 3. Record prediction for self-learning
 * 4. Update domain memory with results
 * 5. Track inference costs
 */
export async function runSmallModelPipeline(
  modelId: string,
  weatherContext: string,
  healthQuery: string,
  apiKey: string,
  domain: string = 'general'
): Promise<{
  result: string;
  guardrails: GuardrailResult;
  predictionId: string;
  cost: { tokensUsed: number; costUsd: number; latencyMs: number };
}> {
  const model = getSmallModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  // Build context-enriched prompt with domain memory
  const domainContext = getDomainMemoryContext(domain);
  const systemPrompt = `You are BioSentinel, a specialized health-weather intelligence assistant.
Analyze weather conditions and their health impacts. Be concise and actionable.
${domainContext}
Focus on: ${model.specialization}`;

  const fullPrompt = `${weatherContext}\n\nHealth Query: ${healthQuery}`;

  // Run inference
  const { text, tokensUsed, latencyMs } = await inferWithSmallModel(
    modelId,
    fullPrompt,
    systemPrompt,
    apiKey,
    512
  );

  // Apply guardrails
  const guardrails = applyGuardrails(text);
  const finalOutput = guardrails.sanitizedOutput || text;

  // Calculate cost
  const costUsd = (tokensUsed / 1000) * model.costPer1kTokens;

  // Record prediction for self-learning
  const predictionId = recordPrediction({
    domain,
    context: fullPrompt.slice(0, 300),
    prediction: finalOutput.slice(0, 500),
    confidence: guardrails.passed ? 0.8 : 0.5,
    modelId,
  });

  // Track cost
  trackInferenceCost({
    modelId,
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
  };
}
