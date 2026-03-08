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
  age: string;
  height?: string;
  weight?: string;
  gender: string;
  lifestyle: string;
  medication: string;
  foodHabits: string;
  allergies: string;
  medicalHistory: string;
  exercise?: string;
  smoking?: boolean;
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

export type AiProvider = 'gemini' | 'groq' | 'pollinations' | 'openrouter' | 'siliconflow' | 'cerebras';

export const AI_MODELS: Record<AiProvider, Array<{ value: string; label: string }>> = {
  gemini: [
    { value: 'gemini-3-flash-preview',    label: 'Gemini 3 Flash Preview — Latest' },
    { value: 'gemini-3.1-pro-preview',    label: 'Gemini 3.1 Pro Preview — Cutting Edge' },
    { value: 'gemini-2.5-flash',          label: 'Gemini 2.5 Flash — Fast & Capable' },
    { value: 'gemini-2.0-flash',          label: 'Gemini 2.0 Flash — Stable' },
    { value: 'gemini-2.5-pro',            label: 'Gemini 2.5 Pro — Most Powerful' },
    { value: 'gemini-1.5-pro',            label: 'Gemini 1.5 Pro — Long Context' },
    { value: 'gemini-1.5-flash',          label: 'Gemini 1.5 Flash — Balanced Speed' },
    { value: 'gemini-1.0-pro',            label: 'Gemini 1.0 Pro — Stable' },
  ],
  groq: [
    { value: 'llama-3.3-70b-versatile',      label: 'Llama 3.3 70B Versatile — Best Quality' },
    { value: 'llama-3.1-8b-instant',         label: 'Llama 3.1 8B Instant — Ultra Fast' },
    { value: 'llama-3.1-70b-versatile',      label: 'Llama 3.1 70B Versatile — Balanced' },
    { value: 'mixtral-8x7b-32768',           label: 'Mixtral 8x7B — 32K Context' },
    { value: 'gemma2-9b-it',                 label: 'Gemma 2 9B — Google Efficient' },
  ],
  pollinations: [
    { value: 'openai',             label: 'GPT-4o Mini — Fast' },
    { value: 'openai-large',       label: 'GPT-4o Large — Most Capable' },
    { value: 'openai-reasoning',   label: 'o3 Mini — Reasoning' },
    { value: 'qwen-coder',         label: 'Qwen 2.5 Coder — Code & Logic' },
    { value: 'llama',              label: 'Llama — Meta' },
    { value: 'mistral',            label: 'Mistral — Lightweight' },
    { value: 'deepseek',           label: 'DeepSeek — Reasoning' },
    { value: 'gemini',             label: 'Gemini — Google' },
    { value: 'gemini-thinking',    label: 'Gemini Thinking — Google' },
    { value: 'claude-hybridspace', label: 'Claude Hybridspace — Anthropic' },
  ],
  openrouter: [
    { value: 'openai/gpt-4o',                              label: 'GPT-4o — OpenAI' },
    { value: 'openai/gpt-4o-mini',                         label: 'GPT-4o Mini — OpenAI Fast' },
    { value: 'meta-llama/llama-3.1-8b-instruct',      label: 'Llama 3.1 8B Instruct — Free' },
    { value: 'meta-llama/llama-3.3-70b-instruct',          label: 'Llama 3.3 70B Instruct — Meta' },
    { value: 'mistralai/mistral-nemo',                label: 'Mistral Nemo — Free & Efficient' },
    { value: 'google/gemini-2.0-flash-exp',           label: 'Gemini 2.0 Flash — Free' },
    { value: 'google/gemini-2.5-pro',                      label: 'Gemini 2.5 Pro — Google' },
    { value: 'deepseek/deepseek-r1',                  label: 'DeepSeek R1 — Free Reasoning' },
    { value: 'anthropic/claude-3-haiku',                   label: 'Claude 3 Haiku — Anthropic Fast' },
    { value: 'qwen/qwen-2.5-72b-instruct',            label: 'Qwen 2.5 72B — Free' },
  ],
  cerebras: [
    { value: 'gpt-oss-120b',                        label: 'GPT OSS 120B — ~3000 tok/s (Default)' },
    { value: 'llama3.1-8b',                         label: 'Llama 3.1 8B — ~2200 tok/s (Ultra Fast)' },
    { value: 'qwen-3-235b-a22b-instruct-2507',      label: 'Qwen 3 235B — ~1400 tok/s (Preview)' },
    { value: 'zai-glm-4.7',                         label: 'Z.ai GLM 4.7 — ~1000 tok/s (Preview)' },
  ],
  siliconflow: [
    // ── DeepSeek ──────────────────────────────────────────────────────
    { value: 'deepseek-ai/DeepSeek-V3.2',                  label: 'DeepSeek V3.2 — Best Overall ★ ($0.42/M)' },
    { value: 'deepseek-ai/DeepSeek-R1',                    label: 'DeepSeek R1 — O3-Level Reasoning ($2.18/M)' },
    { value: 'deepseek-ai/DeepSeek-V3.2-Exp',              label: 'DeepSeek V3.2 Exp — DSA Fast ($0.41/M)' },
    { value: 'deepseek-ai/DeepSeek-V3.1-Terminus',         label: 'DeepSeek V3.1 Terminus — Code Agent ($1/M)' },
    { value: 'deepseek-ai/DeepSeek-V3.1',                  label: 'DeepSeek V3.1 — Hybrid Think ($1/M)' },
    { value: 'deepseek-ai/DeepSeek-V3',                    label: 'DeepSeek V3 — Stable ($1/M)' },
    // ── MiniMax ───────────────────────────────────────────────────────
    { value: 'MiniMaxAI/MiniMax-M2.5',                     label: 'MiniMax M2.5 — 80.2% SWE-Bench ($1.2/M)' },
    { value: 'MiniMaxAI/MiniMax-M2.1',                     label: 'MiniMax M2.1 — Agentic Coding ($1.2/M)' },
    // ── Kimi ──────────────────────────────────────────────────────────
    { value: 'moonshotai/Kimi-K2.5',                       label: 'Kimi K2.5 — Multimodal Agentic ($3/M)' },
    { value: 'moonshotai/Kimi-K2-Thinking',                label: 'Kimi K2 Thinking — HLE SOTA ($2.5/M)' },
    { value: 'moonshotai/Kimi-K2-Instruct-0905',           label: 'Kimi K2 Instruct 0905 — Latest ($2/M)' },
    { value: 'moonshotai/Kimi-K2-Instruct',                label: 'Kimi K2 Instruct — 1T MoE ($2.29/M)' },
    // ── Qwen3 Flagship ────────────────────────────────────────────────
    { value: 'Qwen/Qwen3-235B-A22B-Thinking-2507',         label: 'Qwen3 235B Thinking 2507 — SOTA ($0.6/M)' },
    { value: 'Qwen/Qwen3-235B-A22B-Instruct-2507',         label: 'Qwen3 235B Instruct 2507 — Fast ($0.6/M)' },
    { value: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',        label: 'Qwen3 Coder 480B — Best Open Coder ($1/M)' },
    { value: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',          label: 'Qwen3 Coder 30B — Efficient ($0.28/M)' },
    { value: 'Qwen/Qwen3-30B-A3B-Thinking-2507',           label: 'Qwen3 30B Thinking 2507 ($0.3/M)' },
    { value: 'Qwen/Qwen3-30B-A3B-Instruct-2507',           label: 'Qwen3 30B Instruct 2507 ($0.3/M)' },
    // ── Qwen3 Next / VL ───────────────────────────────────────────────
    { value: 'Qwen/Qwen3-Next-80B-A3B-Thinking',           label: 'Qwen3 Next 80B Thinking — Beats 32B ($0.57/M)' },
    { value: 'Qwen/Qwen3-Next-80B-A3B-Instruct',           label: 'Qwen3 Next 80B Instruct ($1.4/M)' },
    { value: 'Qwen/Qwen3-VL-235B-A22B-Instruct',           label: 'Qwen3 VL 235B — Vision Flagship ($1.5/M)' },
    { value: 'Qwen/Qwen3-VL-32B-Instruct',                 label: 'Qwen3 VL 32B — Vision ($0.6/M)' },
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
