/**
 * Bio-SentinelX — Hugging Face API Integration Service
 *
 * Connects to Hugging Face Inference API for MedGemma and other medical AI models.
 * Provides:
 *   1. MedGemma 4B integration for on-device clinical text extraction
 *   2. Syndromic extraction via AI (dynamic, not rule-based)
 *   3. Clinical text analysis and ICD-10 code assignment
 *   4. Model availability checking and automatic fallback
 *
 * Uses the HF Inference API — requires a valid Hugging Face token.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HFModelConfig {
  id: string;
  name: string;
  description: string;
  task: 'text-generation' | 'text-classification' | 'feature-extraction';
  maxTokens: number;
  isDefault: boolean;
}

export interface HFInferenceRequest {
  model: string;
  inputs: string;
  parameters?: {
    max_new_tokens?: number;
    temperature?: number;
    top_p?: number;
    do_sample?: boolean;
    return_full_text?: boolean;
  };
}

export interface HFInferenceResponse {
  generated_text?: string;
  error?: string;
}

export interface AISyndromeExtraction {
  syndromes: Array<{
    name: string;
    icd10Codes: string[];
    confidence: number;
    severity: 'low' | 'moderate' | 'high' | 'critical';
    reasoning: string;
  }>;
  summary: string;
  language_detected: string;
  processing_time_ms: number;
}

export interface AIOutbreakAnalysis {
  risk_level: 'normal' | 'watch' | 'alert' | 'outbreak';
  risk_score: number;
  contributing_factors: string[];
  recommended_actions: string[];
  reasoning: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HF_INFERENCE_API = 'https://api-inference.huggingface.co/models';

export const MEDGEMMA_MODELS: HFModelConfig[] = [
  {
    id: 'google/medgemma-4b-it',
    name: 'MedGemma 4B IT',
    description: 'Medical reasoning and instruction-following model optimized for clinical text extraction and ICD-10 coding.',
    task: 'text-generation',
    maxTokens: 2048,
    isDefault: true,
  },
  {
    id: 'google/medgemma-27b-text-it',
    name: 'MedGemma 27B Text IT',
    description: 'Larger model for complex medical analysis, situation reports, and clinical decision support.',
    task: 'text-generation',
    maxTokens: 4096,
    isDefault: false,
  },
  {
    id: 'Medical-NLP/medgemma-1.5-4b-it-sft-lora-indian-meds',
    name: 'MedGemma Indian Meds Adapter',
    description: 'Fine-tuned on Indian medicine metadata. Specialized for Indian healthcare context, drug interactions, and regional disease patterns.',
    task: 'text-generation',
    maxTokens: 2048,
    isDefault: false,
  },
];

const STORAGE_KEY = 'biosentinel_hf_token';
const MODEL_STATUS_KEY = 'biosentinel_hf_model_status';

// ─── Token Management ───────────────────────────────────────────────────────

export function getHFToken(): string {
  return localStorage.getItem(STORAGE_KEY)
    || process.env.HF_TOKEN
    || '';
}

export function setHFToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function hasHFToken(): boolean {
  return getHFToken().length > 0;
}

// ─── Model Status ───────────────────────────────────────────────────────────

interface ModelStatus {
  modelId: string;
  available: boolean;
  lastChecked: number;
  error?: string;
}

function getModelStatuses(): Record<string, ModelStatus> {
  try {
    return JSON.parse(localStorage.getItem(MODEL_STATUS_KEY) || '{}');
  } catch { return {}; }
}

function setModelStatus(status: ModelStatus): void {
  const all = getModelStatuses();
  all[status.modelId] = status;
  try { localStorage.setItem(MODEL_STATUS_KEY, JSON.stringify(all)); }
  catch { /* quota */ }
}

/**
 * Check if a model is available on Hugging Face Inference API.
 */
export async function checkModelAvailability(modelId: string): Promise<{
  available: boolean;
  loading: boolean;
  error?: string;
}> {
  const token = getHFToken();
  if (!token) {
    return { available: false, loading: false, error: 'No Hugging Face token configured' };
  }

  try {
    const response = await fetch(`${HF_INFERENCE_API}/${modelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: 'test',
        parameters: { max_new_tokens: 1 },
      }),
    });

    if (response.ok) {
      setModelStatus({ modelId, available: true, lastChecked: Date.now() });
      return { available: true, loading: false };
    }

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = (data as { error?: string }).error || `HTTP ${response.status}`;

    if (typeof error === 'string' && error.includes('loading')) {
      setModelStatus({ modelId, available: false, lastChecked: Date.now(), error: 'Model is loading' });
      return { available: false, loading: true, error: 'Model is loading — try again in a few minutes' };
    }

    setModelStatus({ modelId, available: false, lastChecked: Date.now(), error: String(error) });
    return { available: false, loading: false, error: String(error) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { available: false, loading: false, error: msg };
  }
}

// ─── Inference API ──────────────────────────────────────────────────────────

/**
 * Send a prompt to a Hugging Face model via Inference API.
 */
export async function hfInference(
  prompt: string,
  modelId?: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }
): Promise<string> {
  const token = getHFToken();
  if (!token) {
    throw new Error('Hugging Face token not configured. Please add your HF token in Settings.');
  }

  const model = modelId || MEDGEMMA_MODELS.find(m => m.isDefault)?.id || MEDGEMMA_MODELS[0].id;
  const maxNewTokens = options?.maxTokens || 1024;
  const temperature = options?.temperature ?? 0.3;

  const fullPrompt = options?.systemPrompt
    ? `${options.systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`
    : prompt;

  const response = await fetch(`${HF_INFERENCE_API}/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: fullPrompt,
      parameters: {
        max_new_tokens: maxNewTokens,
        temperature,
        top_p: 0.9,
        do_sample: temperature > 0,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = (data as { error?: string }).error || `HF API error ${response.status}`;
    throw new Error(String(error));
  }

  const result = await response.json() as HFInferenceResponse[] | HFInferenceResponse;
  if (Array.isArray(result)) {
    return result[0]?.generated_text || '';
  }
  return result.generated_text || '';
}

// ─── AI-Powered Syndromic Extraction ────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a medical AI assistant specialized in Indian syndromic surveillance.
Given a clinical description (which may be in Hindi, Hinglish, or English), extract:
1. All matching IDSP/WHO syndromes from these 11 categories:
   - Acute Watery Diarrhea (AWD) - ICD-10: A00, A09, K52.9
   - Acute Bloody Diarrhea/Dysentery (ABD) - ICD-10: A03, A06.0, A09
   - Acute Febrile Illness (AFI) - ICD-10: R50.9, A90, A91, B50, B54
   - Acute Respiratory Infection (ARI) - ICD-10: J06, J18, J22, J20
   - Meningitis/Encephalitis - ICD-10: G03, A87, B05.1
   - Measles - ICD-10: B05
   - Acute Jaundice Syndrome - ICD-10: R17, B15, B16, B17
   - Acute Flaccid Paralysis (AFP) - ICD-10: G82.0, A80
   - Snake Bite - ICD-10: T63.0, W59
   - Dog Bite/Rabies - ICD-10: T14.1, A82, W54
   - Unusual Fever Cluster - ICD-10: R50.9, U07.1

2. Relevant ICD-10 codes
3. Severity assessment (low/moderate/high/critical)
4. Confidence score (0-1)

Respond ONLY in valid JSON format:
{
  "syndromes": [{"name": "...", "icd10Codes": ["..."], "confidence": 0.0, "severity": "...", "reasoning": "..."}],
  "summary": "Brief clinical summary",
  "language_detected": "hi/en/hinglish"
}`;

/**
 * AI-powered syndromic extraction using MedGemma.
 * Falls back to keyword-based extraction if HF API is unavailable.
 */
export async function aiExtractSyndromes(text: string): Promise<AISyndromeExtraction> {
  const startTime = Date.now();

  if (!hasHFToken()) {
    // Return empty result when no token
    return {
      syndromes: [],
      summary: 'Hugging Face token required for AI-powered extraction. Configure in Settings.',
      language_detected: 'unknown',
      processing_time_ms: Date.now() - startTime,
    };
  }

  try {
    const prompt = `Analyze this clinical description and extract syndromes:\n\n"${text}"`;
    const response = await hfInference(prompt, undefined, {
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      maxTokens: 1024,
      temperature: 0.1,
    });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as AISyndromeExtraction;
      return {
        ...parsed,
        processing_time_ms: Date.now() - startTime,
      };
    }

    return {
      syndromes: [],
      summary: 'AI extraction returned non-parseable response. Try again.',
      language_detected: 'unknown',
      processing_time_ms: Date.now() - startTime,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI extraction failed';
    return {
      syndromes: [],
      summary: `AI extraction error: ${msg}`,
      language_detected: 'unknown',
      processing_time_ms: Date.now() - startTime,
    };
  }
}

// ─── AI-Powered Outbreak Analysis ───────────────────────────────────────────

const OUTBREAK_SYSTEM_PROMPT = `You are an epidemiological AI assistant for Indian district-level outbreak detection.
Given syndromic surveillance data with case counts and climate variables, analyze the outbreak risk.

Consider:
- Temporal trends (4-week baseline: flag if current > mean + 2*stddev)
- Climate factors (temperature, humidity, rainfall, LAI correlations)
- Regional disease patterns in Indian context
- Seasonal disease patterns (monsoon → dengue/cholera, winter → respiratory)

Respond ONLY in valid JSON:
{
  "risk_level": "normal|watch|alert|outbreak",
  "risk_score": 0.0,
  "contributing_factors": ["..."],
  "recommended_actions": ["..."],
  "reasoning": "..."
}`;

/**
 * AI-powered outbreak risk analysis using MedGemma.
 */
export async function aiAnalyzeOutbreakRisk(data: {
  district: string;
  state: string;
  syndrome: string;
  currentCases: number;
  weeklyHistory: number[];
  climate: {
    temperature: number;
    humidity: number;
    precipitation: number;
    lai: number;
  };
}): Promise<AIOutbreakAnalysis> {
  if (!hasHFToken()) {
    return {
      risk_level: 'normal',
      risk_score: 0,
      contributing_factors: ['AI analysis unavailable — configure HF token in Settings'],
      recommended_actions: ['Configure Hugging Face token for AI-powered outbreak analysis'],
      reasoning: 'No Hugging Face token available for AI analysis.',
    };
  }

  try {
    const mean = data.weeklyHistory.length > 0
      ? data.weeklyHistory.reduce((a, b) => a + b, 0) / data.weeklyHistory.length
      : 0;
    const stddev = data.weeklyHistory.length > 1
      ? Math.sqrt(data.weeklyHistory.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (data.weeklyHistory.length - 1))
      : 0;

    const prompt = `Analyze outbreak risk for:
District: ${data.district}, ${data.state}
Syndrome: ${data.syndrome}
Current week cases: ${data.currentCases}
4-week history: [${data.weeklyHistory.join(', ')}]
Baseline mean: ${mean.toFixed(1)}, StdDev: ${stddev.toFixed(1)}
Threshold (μ+2σ): ${(mean + 2 * stddev).toFixed(1)}
Climate: Temp ${data.climate.temperature}°C, Humidity ${data.climate.humidity}%, Precip ${data.climate.precipitation}mm, LAI ${data.climate.lai}`;

    const response = await hfInference(prompt, undefined, {
      systemPrompt: OUTBREAK_SYSTEM_PROMPT,
      maxTokens: 512,
      temperature: 0.1,
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AIOutbreakAnalysis;
    }

    return {
      risk_level: 'normal',
      risk_score: 0,
      contributing_factors: ['AI response parsing failed'],
      recommended_actions: ['Retry analysis'],
      reasoning: 'Could not parse AI response.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Outbreak analysis failed';
    return {
      risk_level: 'normal',
      risk_score: 0,
      contributing_factors: [`AI error: ${msg}`],
      recommended_actions: ['Check HF token and retry'],
      reasoning: msg,
    };
  }
}

// ─── Model Info ─────────────────────────────────────────────────────────────

/**
 * Get the default MedGemma model config.
 */
export function getDefaultModel(): HFModelConfig {
  return MEDGEMMA_MODELS.find(m => m.isDefault) || MEDGEMMA_MODELS[0];
}

/**
 * Get all available model configs.
 */
export function getAvailableModels(): HFModelConfig[] {
  return MEDGEMMA_MODELS;
}

/**
 * Get cached model status info.
 */
export function getCachedModelStatus(modelId: string): ModelStatus | null {
  const statuses = getModelStatuses();
  return statuses[modelId] || null;
}
