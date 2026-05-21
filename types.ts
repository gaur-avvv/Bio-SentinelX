export interface ForecastItem {
  dt: number;
  time: string;
  temp: number;
  icon: string;
  description: string;
}

export interface DailyForecastItem {
  dt: number;
  date: string;
  minTemp: number;
  maxTemp: number;
  icon: string;
  description: string;
  pop: number; // Probability of precipitation
  precipitationSum?: number; // mm — daily total precipitation
}

export interface WeatherAlert {
  sender_name: string;
  event: string;
  start: number;
  end: number;
  description: string;
  tags: string[];
}

export interface AdvancedAtmosphericData {
  boundaryLayerHeight?: number;
  cape?: number;
  liftedIndex?: number;
  convectiveInhibition?: number;
  freezingLevelHeight?: number;
  windGusts?: number;
  surfacePressure?: number;
  soilTemperature?: number;
  vapourPressureDeficit?: number;
  soilMoisture?: number;
  // UV (hourly real-time)
  uvIndexClearSky?: number;          // UV index under clear sky — max possible UV exposure
  // Thermal & Moisture
  wetBulbTemperature?: number;       // °C — best heat-stress indicator (combines temp + humidity)
  totalColumnWaterVapour?: number;   // kg/m² — atmospheric moisture; pathogen/allergen transport
  sunshineDurationHourly?: number;   // seconds — actual sunshine current hour
  // Solar & Cloud Layers
  shortwaveRadiation?: number;
  cloudCoverLow?: number;
  cloudCoverMid?: number;
  cloudCoverHigh?: number;
  evapotranspiration?: number;
  shortwaveRadiationSum?: number;
  // Air Quality & Pollens
  pm10?: number;
  pm2_5?: number;
  co?: number;
  co2?: number;
  no2?: number;
  so2?: number;
  o3?: number;
  aod?: number;
  dust?: number;
  ammonia?: number;
  methane?: number;
  alder_pollen?: number;
  birch_pollen?: number;
  grass_pollen?: number;
  mugwort_pollen?: number;
  olive_pollen?: number;
  ragweed_pollen?: number;
}

export interface WeatherData {
  temp: number;
  feelsLike: number; // Health factor: real feel
  humidity: number;
  description: string;
  city: string;
  lat: number;
  lon: number;
  aqi: number; // 1 = Good, 5 = Very Poor (mapped for display)
  rawAqi?: number; // Raw US AQI 0–500 (used for ML prediction)
  windSpeed: number;
  windDeg: number; // Health factor: pollutant transport
  clouds: number; // Cloud cover percentage
  pressure: number; // Health factor: joint pain/migraines
  visibility: number; // Safety/Mental health factor
  uvIndex: number | null;           // real-time hourly UV (0 at night)
  uvIndexDailyMax?: number | null;  // today's forecast daily max for reference
  dewPoint: number | null; // Health factor: respiratory comfort/molds
  isDay?: boolean; // Day/night flag
  utcOffsetSeconds?: number; // timezone offset for live local clock
  windGusts?: number; // km/h — current wind gusts (safety factor)
  precipitation?: number; // mm — current/recent precipitation
  daylightDuration?: number; // seconds
  sunshineDuration?: number; // seconds
  precipitationSum?: number; // today's total mm
  sunrise?: string;
  sunset?: string;
  sunrises?: string[];
  sunsets?: string[];
  pop: number; // Probability of precipitation
  icon: string;
  forecastText: string;
  todaySummary: string;
  tomorrowSummary: string;
  forecast: ForecastItem[];
  dailyForecast: DailyForecastItem[];
  alerts?: WeatherAlert[];
  advancedData?: AdvancedAtmosphericData;
}

export interface HealthRecord {
  condition?: string;
  heartRate?: number;
  temperature?: number;
  [key: string]: string | number | undefined;
}

export interface ColumnStats {
  min: number;
  max: number;
  mean: number;
}

export interface DatasetStats {
  [columnName: string]: ColumnStats;
}

export interface GroundingChunk {
  maps?: {
    uri?: string;
    title?: string;
  };
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface LifestyleData {
  fullName?: string;
  age: string;
  height?: string;
  weight?: string;
  gender: string;
  bloodGroup?: string;
  occupation?: string;
  cityType?: string;
  lifestyle: string;
  medication: string;
  chronicConditions?: string;
  vaccinationStatus?: string;
  foodHabits: string;
  sleepHours?: string;
  waterIntakeLiters?: string;
  stressLevel?: string;
  allergies: string;
  medicalHistory: string;
  familyHistory?: string;
  emergencyContact?: string;
  exercise?: string;
  smoking?: string;
  alcoholConsumption?: string;
}

export interface AnalysisResponse {
  markdown: string;
  groundingChunks?: GroundingChunk[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type SeverityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface RiskItem {
  severity: SeverityLevel;
  title: string;
  description: string;
}

export type AiProvider = 'huggingface' | 'gemini' | 'groq' | 'pollinations' | 'openrouter' | 'siliconflow' | 'cerebras' | 'ollama';

export const AI_MODELS: Record<AiProvider, Array<{ value: string; label: string }>> = {
  huggingface: [
    { value: 'google/medgemma-4b-it', label: 'MedGemma 4B IT — Medical Multimodal (Primary)' },
    { value: 'google/medgemma-27b-text-it', label: 'MedGemma 27B Text IT — Advanced Medical Reasoning' },
    { value: 'Medical-NLP/medgemma-1.5-4b-it-sft-lora-indian-meds', label: 'MedGemma Indian Meds Adapter' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — Fast & Capable (Default)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — Most Powerful' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Stable' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro — Long Context' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash — Balanced Speed' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview — Latest' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview — Cutting Edge' },
    { value: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro — Stable' },
  ],
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile — Best Quality' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant — Ultra Fast' },
    { value: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill Llama 70B — Groq Reasoning' },
    { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile — Balanced' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B — 32K Context' },
    { value: 'gemma2-9b-it', label: 'Gemma 2 9B — Google Efficient' },
  ],
  pollinations: [
    { value: 'openai', label: 'GPT-4o Mini — Fast' },
    { value: 'openai-large', label: 'GPT-4o Large — Most Capable' },
    { value: 'openai-reasoning', label: 'o3 Mini — Reasoning' },
    { value: 'qwen-coder', label: 'Qwen 2.5 Coder — Code & Logic' },
    { value: 'llama', label: 'Llama — Meta' },
    { value: 'mistral', label: 'Mistral — Lightweight' },
    { value: 'deepseek', label: 'DeepSeek — Reasoning' },
    { value: 'gemini', label: 'Gemini — Google' },
    { value: 'gemini-thinking', label: 'Gemini Thinking — Google' },
    { value: 'claude-hybridspace', label: 'Claude Hybridspace — Anthropic' },
  ],
  openrouter: [
    { value: 'openai/gpt-4o', label: 'GPT-4o — OpenAI' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini — OpenAI Fast' },
    { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B Instruct — Free Meta' },
    { value: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B Instruct — Free Fast' },
    { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash — Free Google' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash — Google' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro — Google' },
    { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 — Free Reasoning' },
    { value: 'mistralai/mistral-nemo:free', label: 'Mistral Nemo — Free Efficient' },
    { value: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B — Free Qwen' },
    { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku — Anthropic Fast' },
  ],
  cerebras: [
    { value: 'gpt-oss-120b', label: 'GPT OSS 120B — ~3000 tok/s (Default)' },
    { value: 'llama3.1-8b', label: 'Llama 3.1 8B — ~2200 tok/s (Ultra Fast)' },
    { value: 'llama3.1-70b', label: 'Llama 3.1 70B — Versatile Fast' },
    { value: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen 3 235B — ~1400 tok/s (Preview)' },
    { value: 'zai-glm-4.7', label: 'Z.ai GLM 4.7 — ~1000 tok/s (Preview)' },
  ],
  siliconflow: [
    { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3 — Stable Flagship ★' },
    { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1 — O3-Level Reasoning' },
    { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B Instruct — Balanced' },
    { value: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B Instruct — Fast' },
    { value: 'moonshotai/Kimi-K2-Thinking', label: 'Kimi K2 Thinking — HLE SOTA' },
    { value: 'deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2 — Best Overall' },
    { value: 'MiniMaxAI/MiniMax-M2.5', label: 'MiniMax M2.5 — SWE-Bench SOTA' },
  ],
  ollama: [
    { value: 'llama3.2-3b', label: 'Llama 3.2 3B — Balanced Health Assessment' },
    { value: 'llama3.2-1b', label: 'Llama 3.2 1B — Fast Triage' },
    { value: 'qwen2.5-1.5b', label: 'Qwen 2.5 1.5B — Structured Analysis' },
    { value: 'qwen2.5-3b', label: 'Qwen 2.5 3B — Advanced Reasoning' },
    { value: 'smollm2-1.7b', label: 'SmolLM2 1.7B — Health Triage & Alerts' },
    { value: 'phi3-mini', label: 'Phi-3 Mini 3.8B — Medical Reasoning' },
    { value: 'medllama2', label: 'MedLlama2 7B — Medical Domain Specialist' },
  ],
};

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING_WEATHER = 'LOADING_WEATHER',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

// ─── RAG / Vector DB ──────────────────────────────────────────────────────────
export interface RagDocument {
  id: string;
  title: string;
  source: string;
  addedAt: number;
  chunkIds: string[];
  charCount: number;
}

export interface RagEmbeddingStats {
  totalDocs: number;
  totalChunks: number;
  embeddedChunks: number;
  tfidfChunks: number;
}

// ─── Health Alert System ──────────────────────────────────────────────────────
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory =
  | 'humidity'
  | 'temperature'
  | 'uv'
  | 'airQuality'
  | 'pollen'
  | 'wind'
  | 'precipitation'
  | 'pressure'
  | 'heatIndex'
  | 'dewPoint'
  | 'general';

export type AlertSession = 'morning' | 'afternoon' | 'evening' | 'realtime';

export interface HealthAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  session: AlertSession;
  title: string;
  message: string;
  healthTip: string;
  emoji: string;
  factor: string;
  value: string;
  timestamp: number;
  read: boolean;
}

// ─── Notification & Alert Settings ───────────────────────────────────────────
export interface NotificationAlertToggles {
  dailyWeatherForecast: boolean;   // Morning/afternoon/evening weather briefings
  tomorrowForecast: boolean;       // Tomorrow forecast summary
  diseaseOutbreak: boolean;        // Disease/outbreak risk predictions
  severeWeather: boolean;          // Severe weather alerts (storms, heatwaves, etc.)
  rainAlerts: boolean;             // Rain / precipitation alerts
  airQualityAlerts: boolean;       // AQI / pollen / dust alerts
  aiBasedAlerts: boolean;          // AI-enriched alert headings (vs static templates)
}

export type AlertNotificationMode = 'ai' | 'normal';
export type ForecastUpdatePeriod = 15 | 30 | 60 | 180 | 360 | 720;

export interface NotificationSettings {
  forecastUpdatePeriodMinutes: ForecastUpdatePeriod;
  alertMode: AlertNotificationMode;
  alerts: NotificationAlertToggles;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  forecastUpdatePeriodMinutes: 180,
  alertMode: 'ai',
  alerts: {
    dailyWeatherForecast: true,
    tomorrowForecast: true,
    diseaseOutbreak: true,
    severeWeather: true,
    rainAlerts: true,
    airQualityAlerts: true,
    aiBasedAlerts: true,
  },
};

// ─── Email Early-Warning Settings ─────────────────────────────────────────────
export interface EmailAlertSettings {
  enabled: boolean;
  recipientEmail: string;      // user's alert destination email
  smtpDevApiKey: string;       // smtp.dev API key for creating sender account
  senderEmail: string;         // auto-provisioned smtp.dev sender (stored after first run)
  senderPassword: string;      // auto-generated password for the sender smtp.dev account
  resendApiKey: string;        // Resend API key
  sendGridApiKey: string;      // SendGrid API key
  resendFromEmail: string;     // Verified sender for Resend
  sendGridFromEmail: string;   // Verified sender for SendGrid
  emailJsPublicKey: string;    // EmailJS public key (free, works with any email)
  emailJsServiceId: string;    // EmailJS service ID
  emailJsTemplateId: string;   // EmailJS template ID
  leadTimeHours: number;       // how many hours ahead to scan forecast (1–72)
  minSeverityScore: number;    // 0–100 threshold to trigger email
  onlyCritical: boolean;       // restrict to critical-only events
  sentAlertKeys: string[];     // dedup keys: city+date+factor already emailed
}

export const DEFAULT_EMAIL_ALERT_SETTINGS: EmailAlertSettings = {
  enabled: false,
  recipientEmail: '',
  smtpDevApiKey: '',
  senderEmail: '',
  senderPassword: '',
  resendApiKey: '',
  sendGridApiKey: '',
  resendFromEmail: '',
  sendGridFromEmail: '',
  emailJsPublicKey: '',
  emailJsServiceId: '',
  emailJsTemplateId: '',
  leadTimeHours: 12,
  minSeverityScore: 60,
  onlyCritical: false,
  sentAlertKeys: [],
};



// ─── Database Integration Settings ──────────────────────────────────────────
export interface DatabaseSettings {
  preferredDb: 'none' | 'supabase' | 'firebase';
  supabaseUrl: string;
  supabaseAnonKey: string;
  firebaseConfigJson: string;
  firebaseApiKey: string;
}

export const DEFAULT_DATABASE_SETTINGS: DatabaseSettings = {
  preferredDb: 'none',
  supabaseUrl: '',
  supabaseAnonKey: '',
  firebaseConfigJson: '',
  firebaseApiKey: ''
};

// ─── MCP Orchestration Settings ───────────────────────────────────────────
export interface McpServerConfig {
  id: string;
  name: string;
  endpoint: string;
  enabled: boolean;
  allowedTools: string[];
  timeoutMs: number;
  retryCount: number;
}

export interface McpSettings {
  enabled: boolean;
  allowlistedTools: string[];
  defaultTimeoutMs: number;
  defaultRetryCount: number;
  servers: McpServerConfig[];
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: false,
  allowlistedTools: ['outbreak_sweep', 'kg_expand', 'protocol_draft', 'wiki_search', 'wiki_summary'],
  defaultTimeoutMs: 5000,
  defaultRetryCount: 1,
  servers: [
    {
      id: 'local-biosentinel',
      name: 'BioSentinel MCP Local',
      endpoint: 'https://web-production-37f41.up.railway.app',
      enabled: true,
      allowedTools: ['outbreak_sweep'],
      timeoutMs: 5000,
      retryCount: 1,
    },
    {
      id: 'deep-wiki-mcp',
      name: 'Deep Wiki Search MCP',
      endpoint: 'internal-wiki',
      enabled: true,
      allowedTools: ['wiki_search', 'wiki_summary'],
      timeoutMs: 5000,
      retryCount: 1,
    },
  ],
};

// ─── Outbreak Intelligence Hub ──────────────────────────────────────────────
export type OutbreakRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'EPIDEMIC';

export interface HospitalCaseReport {
  id: string;
  reporterName: string;
  facilityName: string;
  city: string;
  district: string;
  state: string;
  disease: string;
  syndromeId?: string;
  patientCount: number;
  ageRange: string;
  genderDistribution: string;
  symptoms: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  additionalNotes: string;
  timestamp: number;
  syncedToCloud: boolean;
  embedding?: number[];
}

export interface DiseaseCluster {
  disease: string;
  locations: string[];
  totalCases: number;
  trend: 'rising' | 'stable' | 'declining';
  riskLevel: OutbreakRiskLevel;
  firstReported: number;
  lastReported: number;
}

export interface OutbreakPrediction {
  id: string;
  timestamp: number;
  overallRisk: OutbreakRiskLevel;
  confidence: number;
  predictedDiseases: Array<{
    disease: string;
    probability: number;
    estimatedCases: string;
    peakWindow: string;
  }>;
  diseaseClusters: DiseaseCluster[];
  environmentalFactors: {
    temperature: number;
    humidity: number;
    aqi: number;
    riskMultiplier: number;
    seasonalContext: string;
  };
  geographicSpread: {
    epicenter: string;
    affectedAreas: string[];
    spreadDirection: string;
  };
  recommendations: string[];
  rawAnalysis: string;
  aiProvider: string;
  aiModel: string;
}
