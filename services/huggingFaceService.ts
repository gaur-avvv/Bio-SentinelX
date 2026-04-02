/**
 * Bio-SentinelX — Hugging Face MedGemma Integration Service
 *
 * Uses the HF Inference API (OpenAI-compatible chat completions) for:
 *   1. MedGemma 4B IT — multimodal (image + text) clinical analysis
 *   2. MedGemma 27B Text IT — complex medical reasoning & SitReps
 *   3. Indian Meds adapter — Indian healthcare context
 *
 * Supports:
 *   - Text-only clinical extraction
 *   - Multimodal analysis (clinical photos + text)
 *   - Outbreak risk analysis
 *   - Model availability checking
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HFModelConfig {
  id: string;
  name: string;
  description: string;
  supportsVision: boolean;
  maxTokens: number;
  isDefault: boolean;
}

/** A single content part in a chat message (text or image). */
type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** A chat message in the OpenAI-compatible format. */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

/** OpenAI-compatible chat completion response. */
interface ChatCompletionResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
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
  model_used?: string;
}

export interface AIOutbreakAnalysis {
  risk_level: 'normal' | 'watch' | 'alert' | 'outbreak';
  risk_score: number;
  contributing_factors: string[];
  recommended_actions: string[];
  reasoning: string;
}

export interface AIImageAnalysis {
  findings: string;
  conditions: string[];
  severity: 'low' | 'moderate' | 'high' | 'critical';
  recommendations: string[];
  processing_time_ms: number;
  model_used: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** HF Inference API — OpenAI-compatible chat completions endpoint. */
const HF_API_BASE = 'https://router.huggingface.co/hf-inference/models';

export const MEDGEMMA_MODELS: HFModelConfig[] = [
  {
    id: 'google/medgemma-4b-it',
    name: 'MedGemma 4B IT',
    description: 'Multimodal medical model — supports clinical image + text analysis, syndromic extraction, and ICD-10 coding.',
    supportsVision: true,
    maxTokens: 2048,
    isDefault: true,
  },
  {
    id: 'google/medgemma-27b-text-it',
    name: 'MedGemma 27B Text IT',
    description: 'Large text-only model for complex medical reasoning, situation reports, and outbreak analysis.',
    supportsVision: false,
    maxTokens: 4096,
    isDefault: false,
  },
  {
    id: 'Medical-NLP/medgemma-1.5-4b-it-sft-lora-indian-meds',
    name: 'MedGemma Indian Meds Adapter',
    description: 'Fine-tuned on Indian medicine metadata — specialized for Indian drug interactions and regional disease patterns.',
    supportsVision: false,
    maxTokens: 2048,
    isDefault: false,
  },
];

const STORAGE_KEY = 'biosentinel_hf_token';
const MODEL_STATUS_KEY = 'biosentinel_hf_model_status';

// ─── Token Management ───────────────────────────────────────────────────────

export function getHFToken(): string {
  return localStorage.getItem(STORAGE_KEY)
    || (typeof process !== 'undefined' && process.env?.HF_TOKEN)
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
    const response = await fetch(`${HF_API_BASE}/${modelId}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
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

// ─── Chat Completions API ───────────────────────────────────────────────────

/**
 * Send a chat completion request to the HF Inference API.
 * Uses the OpenAI-compatible format supported by MedGemma models.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    modelId?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  const token = getHFToken();
  if (!token) {
    throw new Error('Hugging Face token not configured. Please add your HF token in Settings.');
  }

  const modelId = options?.modelId || MEDGEMMA_MODELS.find(m => m.isDefault)?.id || MEDGEMMA_MODELS[0].id;
  const maxTokens = options?.maxTokens || 1024;
  const temperature = options?.temperature ?? 0.3;

  const response = await fetch(`${HF_API_BASE}/${modelId}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = (data as { error?: string }).error || `HF API error ${response.status}`;
    throw new Error(String(error));
  }

  const result = await response.json() as ChatCompletionResponse;
  if (result.error) throw new Error(result.error);

  return result.choices?.[0]?.message?.content || '';
}

/**
 * Convenience wrapper: text-only chat completion.
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
  const messages: ChatMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  return chatCompletion(messages, {
    modelId,
    maxTokens: options?.maxTokens,
    temperature: options?.temperature,
  });
}

// ─── Multimodal Analysis (Image + Text) ─────────────────────────────────────

/**
 * Analyze a clinical image with optional text context using MedGemma 4B (VLM).
 * Supports image URLs for remote images.
 */
export async function analyzeClinicialImage(
  imageUrl: string,
  textContext?: string,
): Promise<AIImageAnalysis> {
  const startTime = Date.now();
  const modelId = MEDGEMMA_MODELS.find(m => m.supportsVision)?.id || MEDGEMMA_MODELS[0].id;

  if (!hasHFToken()) {
    return {
      findings: 'Hugging Face token required for image analysis.',
      conditions: [],
      severity: 'low',
      recommendations: ['Configure HF token in Settings'],
      processing_time_ms: Date.now() - startTime,
      model_used: modelId,
    };
  }

  const userContent: ChatContentPart[] = [
    { type: 'image_url', image_url: { url: imageUrl } },
    {
      type: 'text',
      text: textContext
        ? `Analyze this clinical image. Patient context: ${textContext}\n\nProvide: 1) Key findings 2) Possible conditions 3) Severity (low/moderate/high/critical) 4) Recommendations. Respond in JSON: {"findings":"...","conditions":["..."],"severity":"...","recommendations":["..."]}`
        : 'Analyze this clinical/medical image. Identify any visible conditions, symptoms, or health concerns. Respond in JSON: {"findings":"...","conditions":["..."],"severity":"...","recommendations":["..."]}',
    },
  ];

  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: 'You are a medical AI assistant. Analyze clinical images and provide structured findings. Always respond in valid JSON.' },
        { role: 'user', content: userContent },
      ],
      { modelId, maxTokens: 1024, temperature: 0.1 },
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Omit<AIImageAnalysis, 'processing_time_ms' | 'model_used'>;
      return {
        ...parsed,
        processing_time_ms: Date.now() - startTime,
        model_used: modelId,
      };
    }

    return {
      findings: response,
      conditions: [],
      severity: 'low',
      recommendations: [],
      processing_time_ms: Date.now() - startTime,
      model_used: modelId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image analysis failed';
    return {
      findings: `Error: ${msg}`,
      conditions: [],
      severity: 'low',
      recommendations: ['Check HF token and model availability'],
      processing_time_ms: Date.now() - startTime,
      model_used: modelId,
    };
  }
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
 * AI-powered syndromic extraction using MedGemma via chat completions.
 * Optionally includes a clinical image for multimodal analysis.
 */
export async function aiExtractSyndromes(
  text: string,
  imageUrl?: string,
): Promise<AISyndromeExtraction> {
  const startTime = Date.now();

  if (!hasHFToken()) {
    return {
      syndromes: [],
      summary: 'Hugging Face token required for AI-powered extraction. Configure in Settings.',
      language_detected: 'unknown',
      processing_time_ms: Date.now() - startTime,
    };
  }

  // Choose model: use vision model if image is provided
  const modelId = imageUrl
    ? (MEDGEMMA_MODELS.find(m => m.supportsVision)?.id || MEDGEMMA_MODELS[0].id)
    : (MEDGEMMA_MODELS.find(m => m.isDefault)?.id || MEDGEMMA_MODELS[0].id);

  try {
    // Build user content — multimodal if image provided
    let userContent: string | ChatContentPart[];
    if (imageUrl) {
      userContent = [
        { type: 'image_url' as const, image_url: { url: imageUrl } },
        { type: 'text' as const, text: `Analyze this clinical image along with the patient description and extract syndromes:\n\n"${text}"` },
      ];
    } else {
      userContent = `Analyze this clinical description and extract syndromes:\n\n"${text}"`;
    }

    const response = await chatCompletion(
      [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      { modelId, maxTokens: 1024, temperature: 0.1 },
    );

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as AISyndromeExtraction;
      return {
        ...parsed,
        processing_time_ms: Date.now() - startTime,
        model_used: modelId,
      };
    }

    return {
      syndromes: [],
      summary: response || 'AI extraction returned non-parseable response. Try again.',
      language_detected: 'unknown',
      processing_time_ms: Date.now() - startTime,
      model_used: modelId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI extraction failed';
    return {
      syndromes: [],
      summary: `AI extraction error: ${msg}`,
      language_detected: 'unknown',
      processing_time_ms: Date.now() - startTime,
      model_used: modelId,
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
 * AI-powered outbreak risk analysis using MedGemma via chat completions.
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

    const response = await chatCompletion(
      [
        { role: 'system', content: OUTBREAK_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 512, temperature: 0.1 },
    );

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

export function getDefaultModel(): HFModelConfig {
  return MEDGEMMA_MODELS.find(m => m.isDefault) || MEDGEMMA_MODELS[0];
}

export function getAvailableModels(): HFModelConfig[] {
  return MEDGEMMA_MODELS;
}

export function getCachedModelStatus(modelId: string): ModelStatus | null {
  const statuses = getModelStatuses();
  return statuses[modelId] || null;
}
