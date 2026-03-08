// ============================================================
// Open-Meteo Flood API Service — GloFAS v4
// https://flood-api.open-meteo.com
//
// Risk methodology:
//   Primary signal  → forecast MEDIAN (most-likely ensemble outcome)
//   Thresholds      → historical P50 / P75 / P90 / Max (percentile-based)
//   Seasonal factor → current calendar month vs location's typical flood regime
//   Trend           → 7-day mean vs seasonal P50, not raw prior-week average
//
// GloFAS ensemble has 50 members. API fields:
//   river_discharge           — consolidated observed reanalysis (past only)
//   river_discharge_mean      — ensemble mean  (forecast)
//   river_discharge_median    — ensemble median (forecast) ← PRIMARY SIGNAL
//   river_discharge_max       — worst single ensemble member
//   river_discharge_min       — best single ensemble member
//   river_discharge_p25/p75   — interquartile uncertainty band
// ============================================================

export interface FloodDataPoint {
  date: string;
  river_discharge: number | null;
  river_discharge_mean: number | null;
  river_discharge_median: number | null;
  river_discharge_max: number | null;
  river_discharge_min: number | null;
  river_discharge_p25: number | null;
  river_discharge_p75: number | null;
}

export interface FloodApiResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  daily_units: Record<string, string>;
  daily: {
    time: string[];
    river_discharge?: (number | null)[];
    river_discharge_mean?: (number | null)[];
    river_discharge_median?: (number | null)[];
    river_discharge_max?: (number | null)[];
    river_discharge_min?: (number | null)[];
    river_discharge_p25?: (number | null)[];
    river_discharge_p75?: (number | null)[];
  };
}

export interface FloodFetchResult {
  data: FloodDataPoint[];
  lat: number;
  lon: number;
  timezone: string;
  pastDays: number;
  forecastDays: number;
}

export interface MonthlyFloodPoint {
  /** YYYY-MM */
  month: string;
  /** Mean of daily ensemble median discharge for the month */
  discharge_median_mean: number | null;
  /** Max of daily ensemble median discharge for the month */
  discharge_median_max: number | null;
  /** Count of days with any discharge datapoint */
  days: number;
}

/**
 * Fetch flood/river discharge data from Open-Meteo GloFAS Flood API.
 * @param lat Latitude (WGS84)
 * @param lon Longitude (WGS84)
 * @param pastDays Number of past days to include (default 92)
 * @param forecastDays Number of forecast days (default 183 — 6 months)
 */
export async function fetchFloodData(
  lat: number,
  lon: number,
  pastDays = 92,
  forecastDays = 183
): Promise<FloodFetchResult> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    daily: [
      'river_discharge',
      'river_discharge_mean',
      'river_discharge_median',
      'river_discharge_max',
      'river_discharge_min',
      'river_discharge_p25',
      'river_discharge_p75',
    ].join(','),
    timezone: 'auto',
    past_days: pastDays.toString(),
    forecast_days: forecastDays.toString(),
  });

  const url = `https://flood-api.open-meteo.com/v1/flood?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    let reason = `Flood API error ${res.status}`;
    try {
      const errJson = await res.json() as { reason?: string };
      if (errJson.reason) reason = errJson.reason;
    } catch (_) { /* ignore */ }
    throw new Error(reason);
  }

  const json: FloodApiResponse = await res.json();

  if (!json.daily || !json.daily.time) {
    throw new Error('No flood data returned for this location.');
  }

  const data: FloodDataPoint[] = json.daily.time.map((date, i) => ({
    date,
    river_discharge: json.daily.river_discharge?.[i] ?? null,
    river_discharge_mean: json.daily.river_discharge_mean?.[i] ?? null,
    river_discharge_median: json.daily.river_discharge_median?.[i] ?? null,
    river_discharge_max: json.daily.river_discharge_max?.[i] ?? null,
    river_discharge_min: json.daily.river_discharge_min?.[i] ?? null,
    river_discharge_p25: json.daily.river_discharge_p25?.[i] ?? null,
    river_discharge_p75: json.daily.river_discharge_p75?.[i] ?? null,
  }));

  return {
    data,
    lat: json.latitude,
    lon: json.longitude,
    timezone: json.timezone,
    pastDays,
    forecastDays,
  };
}

// ============================================================
// Monthly aggregation (derived from daily series)
// ============================================================

function monthKey(dateIso: string): string {
  // dateIso expected: YYYY-MM-DD
  return dateIso?.slice(0, 7);
}

function safeNum(v: number | null | undefined): number | null {
  return v == null || Number.isNaN(v) ? null : v;
}

/**
 * Convert daily flood discharge into monthly aggregates.
 * Uses ensemble median as the primary signal.
 */
export function toMonthlyFloodSeries(
  daily: FloodDataPoint[],
  opts?: { startIndex?: number; endIndexExclusive?: number }
): MonthlyFloodPoint[] {
  const startIndex = Math.max(0, opts?.startIndex ?? 0);
  const end = Math.min(daily.length, opts?.endIndexExclusive ?? daily.length);

  const buckets = new Map<string, { sum: number; count: number; max: number | null }>();

  for (let i = startIndex; i < end; i++) {
    const d = daily[i];
    const key = monthKey(d.date);
    if (!key) continue;
    const q = safeNum(d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge);
    if (q == null) continue;

    const b = buckets.get(key) ?? { sum: 0, count: 0, max: null as number | null };
    b.sum += q;
    b.count += 1;
    b.max = b.max == null ? q : Math.max(b.max, q);
    buckets.set(key, b);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({
      month,
      discharge_median_mean: b.count ? b.sum / b.count : null,
      discharge_median_max: b.max,
      days: b.count,
    }));
}

// ============================================================
// Statistical helpers
// ============================================================

/** Percentile (0–100) of a pre-sorted ascending array */
function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ============================================================
// Seasonal context
// ============================================================

export interface SeasonalContext {
  isFloodSeason: boolean;
  seasonLabel: string;
  note: string;
  /**
   * Applied to the base score before level assignment.
   * > 1 = flood season (seasonal highs are normal → require stronger anomaly)
   * < 1 = dry/low-flow season (any rise is unusual → flag earlier)
   */
  scoreScaler: number;
}

/**
 * Determine whether the current calendar month is within the expected
 * flood window for a given latitude band.
 * month is 1-based (1 = January, 3 = March).
 */
export function getSeasonalContext(month: number, lat: number): SeasonalContext {
  const N    = lat >= 0;
  const trop = Math.abs(lat) < 23.5;           // tropics / subtropics
  const mid  = Math.abs(lat) >= 23.5 && Math.abs(lat) < 55;
  const high = Math.abs(lat) >= 55;

  // ── Tropical Northern Hemisphere (e.g. Vietnam, India, Thailand) ──────────
  if (trop && N) {
    if (month >= 6 && month <= 10)
      return { isFloodSeason: true,  seasonLabel: 'Monsoon Season',
        note:  'June–October is the primary flood season for tropical northern locations. High discharge is seasonally expected.',
        scoreScaler: 1.35 };
    if (month >= 3 && month <= 5)
      return { isFloodSeason: false, seasonLabel: 'Pre-Monsoon Dry Period',
        note:  'March–May is the dry period before the monsoon onset. Any significant discharge rise is above the seasonal norm.',
        scoreScaler: 0.85 };
    return   { isFloodSeason: false, seasonLabel: 'Dry Season',
        note:  'November–February is the established dry season. River levels are near their seasonal minimum.',
        scoreScaler: 0.80 };
  }

  // ── Tropical Southern Hemisphere ──────────────────────────────────────────
  if (trop && !N) {
    if (month >= 11 || month <= 4)
      return { isFloodSeason: true,  seasonLabel: 'Southern Wet Season',
        note:  'November–April is the wet season for the southern tropics. Elevated discharge is expected.',
        scoreScaler: 1.35 };
    return   { isFloodSeason: false, seasonLabel: 'Southern Dry Season',
        note:  'May–October is the dry season in the southern tropics. River levels are near seasonal lows.',
        scoreScaler: 0.80 };
  }

  // ── Mid-latitude Northern Hemisphere (e.g. Europe, North America) ─────────
  if (mid && N) {
    if (month >= 3 && month <= 5)
      return { isFloodSeason: true,  seasonLabel: 'Spring Snowmelt Season',
        note:  'March–May is the primary snowmelt flood window for mid-latitude northern rivers. Rising discharge is seasonally expected.',
        scoreScaler: 1.30 };
    if (month >= 9 && month <= 11)
      return { isFloodSeason: true,  seasonLabel: 'Autumn Rain Season',
        note:  'September–November sees elevated flood risk from prolonged rainfall in mid-latitude regions.',
        scoreScaler: 1.20 };
    if (month >= 6 && month <= 8)
      return { isFloodSeason: false, seasonLabel: 'Summer Base-Flow',
        note:  'June–August is the stable base-flow period following spring snowmelt.',
        scoreScaler: 1.00 };
    return   { isFloodSeason: false, seasonLabel: 'Winter Low-Flow',
        note:  'December–February is typically the lowest-discharge period for mid-latitude northern rivers.',
        scoreScaler: 0.85 };
  }

  // ── Mid-latitude Southern Hemisphere ─────────────────────────────────────
  if (mid && !N) {
    if (month >= 9 && month <= 11)
      return { isFloodSeason: true,  seasonLabel: 'Southern Spring Snowmelt',
        note:  'September–November is the snowmelt flood window for southern mid-latitude rivers.',
        scoreScaler: 1.30 };
    if (month >= 3 && month <= 5)
      return { isFloodSeason: true,  seasonLabel: 'Southern Autumn Rain',
        note:  'March–May sees increased rainfall-driven flood risk in southern mid-latitude regions.',
        scoreScaler: 1.20 };
    return   { isFloodSeason: false, seasonLabel: 'Base-Flow Period',
        note:  'Current month is outside the primary flood windows for southern mid-latitude rivers.',
        scoreScaler: 0.95 };
  }

  // ── High-latitude Northern Hemisphere (e.g. Norway, Canada, Russia) ───────
  if (high && N) {
    if (month === 3)
      return { isFloodSeason: true,  seasonLabel: 'Ice-Break Period',
        note:  'March marks the beginning of ice-break and early snowmelt for subarctic rivers.',
        scoreScaler: 1.20 };
    if (month >= 4 && month <= 6)
      return { isFloodSeason: true,  seasonLabel: 'Arctic Snowmelt Season',
        note:  'April–June is the dominant snowmelt and ice-jam flood window at high northern latitudes.',
        scoreScaler: 1.40 };
    return   { isFloodSeason: false, seasonLabel: 'Winter Ice-Cover',
        note:  'Rivers at high northern latitudes are typically ice-covered or at minimum flow this period.',
        scoreScaler: 0.80 };
  }

  // ── High-latitude Southern Hemisphere ─────────────────────────────────────
  if (high && !N) {
    if (month >= 10 && month <= 12)
      return { isFloodSeason: true,  seasonLabel: 'Southern Snowmelt',
        note:  'October–December is the snowmelt season for high southern latitude rivers.',
        scoreScaler: 1.30 };
    return   { isFloodSeason: false, seasonLabel: 'Southern Winter',
        note:  'Low-flow winter period for high southern latitude rivers.',
        scoreScaler: 0.85 };
  }

  return { isFloodSeason: false, seasonLabel: 'Standard Period',
    note: 'Seasonal flood context could not be determined for this location.', scoreScaler: 1.0 };
}

// ============================================================
// Trend computation — contextualised against seasonal median
// ============================================================

export interface TrendResult {
  direction: 'INCREASING' | 'DECREASING' | 'STABLE';
  /** True when recent discharge is still at or below the seasonal P50 */
  withinNorm: boolean;
  /** Human-readable sub-label shown in the UI */
  label: string;
  changePct: number;
}

/**
 * Compare the 7-day average against the prior 7-day average.
 * "withinNorm" is set by whether the recent average is near or below the
 * historical P50 — so a seasonal rise that is still moderate does not show
 * as alarming.
 */
export function computeTrend(historical: FloodDataPoint[], histP50: number): TrendResult {
  if (historical.length < 10)
    return { direction: 'STABLE', withinNorm: true, label: 'Stable — Insufficient data', changePct: 0 };

  const vals    = historical.map(d => d.river_discharge ?? d.river_discharge_mean ?? 0);
  const recent7 = vals.slice(-7);
  const prior7  = vals.slice(-14, -7);

  if (recent7.length < 3 || prior7.length < 3)
    return { direction: 'STABLE', withinNorm: true, label: 'Stable', changePct: 0 };

  const r7avg = recent7.reduce((a, b) => a + b, 0) / recent7.length;
  const p7avg = prior7.reduce((a, b) => a + b, 0)  / prior7.length;
  const changePct = p7avg > 0 ? ((r7avg - p7avg) / p7avg) * 100 : 0;

  // Within norm = recent average is at or below 115% of seasonal P50
  const withinNorm = r7avg <= histP50 * 1.15;

  if (changePct > 10)
    return {
      direction: 'INCREASING', withinNorm,
      label: withinNorm
        ? 'Increasing — Within Seasonal Range'
        : 'Increasing — Above Seasonal Average',
      changePct,
    };

  if (changePct < -10)
    return { direction: 'DECREASING', withinNorm: true, label: 'Decreasing — Levels Receding', changePct };

  return { direction: 'STABLE', withinNorm: true, label: 'Stable — No Significant Change', changePct };
}

// ============================================================
// Risk scoring
// ============================================================

/**
 * Four calibrated risk levels.
 * NORMAL   — within seasonal variability (below P75)
 * MODERATE — above median, below P90
 * ELEVATED — approaching or at historical maximum
 * WATCH    — forecast median exceeds recent historical maximum (anomalous)
 *
 * "WATCH" is used instead of "CRITICAL" because GloFAS at 5 km resolution
 * is a monitoring-level tool. Civil emergency declarations require in-situ
 * gauge data and official authority thresholds.
 */
export type RiskLevel = 'NORMAL' | 'MODERATE' | 'ELEVATED' | 'WATCH';

export interface FloodRiskScore {
  level: RiskLevel;
  score: number;         // 0–99
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  description: string;
}

const PALETTE: Record<RiskLevel, Omit<FloodRiskScore, 'level' | 'score' | 'description'>> = {
  NORMAL:   { color: '#22c55e', bgColor: 'bg-green-50',  textColor: 'text-green-700',  borderColor: 'border-green-200'  },
  MODERATE: { color: '#eab308', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700', borderColor: 'border-yellow-200' },
  ELEVATED: { color: '#f97316', bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200' },
  WATCH:    { color: '#dc2626', bgColor: 'bg-red-50',    textColor: 'text-red-700',    borderColor: 'border-red-200'    },
};

/**
 * Compute a statistically grounded flood risk score.
 *
 * Design decisions:
 * 1. Primary signal = forecast MEDIAN, not ensemble max.
 *    The max represents only the worst of 50 model members and regularly
 *    exceeds historical observations during normal seasonal patterns.
 * 2. Thresholds = historical percentiles (P50/P75/P90/Max), not raw max alone.
 *    This captures where the forecast sits in the distribution of past events.
 * 3. Seasonal scaler dampens the score during the expected flood season so
 *    normal seasonal highs don't produce ELEVATED/WATCH alerts, and
 *    amplifies sensitivity during low-flow seasons.
 * 4. Persistence bonus rewards situations where elevated discharge is
 *    sustained across many forecast days, not just a single peak spike.
 */
export function computeFloodRisk(
  data: FloodDataPoint[],
  todayIndex: number,
  seasonalContext: SeasonalContext
): FloodRiskScore {
  const noData = (level: RiskLevel, desc: string): FloodRiskScore =>
    ({ level, score: 5, ...PALETTE[level], description: desc });

  if (data.length === 0) return noData('NORMAL', 'No data available.');

  const historical = data.slice(0, todayIndex + 1);
  const forecast   = data.slice(todayIndex + 1);

  const histValues = historical
    .map(d => d.river_discharge ?? d.river_discharge_mean ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  if (histValues.length < 5) return noData('NORMAL', 'Insufficient historical data for statistical analysis.');

  const eps     = 0.001;
  const histP50 = computePercentile(histValues, 50);
  const histP75 = computePercentile(histValues, 75);
  const histP90 = computePercentile(histValues, 90);
  const histMax = histValues[histValues.length - 1];

  // Primary forecast signal: ensemble median
  const fcMedians = forecast
    .map(d => d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge ?? 0)
    .filter(v => v > 0);

  if (fcMedians.length === 0) return noData('NORMAL', 'No forecast data available for this location.');

  const peakMedian = Math.max(...fcMedians);

  // Persistence: fraction of forecast days where median exceeds P75
  const elevatedDays    = forecast.filter(d =>
    (d.river_discharge_median ?? d.river_discharge_mean ?? 0) > histP75
  ).length;
  const persistenceBonus = (elevatedDays / Math.max(forecast.length, 1)) * 10;

  // ── Base score by percentile bracket ────────────────────────────────────────
  let baseScore: number;
  if      (peakMedian <= histP50) baseScore = 5  + (peakMedian / Math.max(histP50, eps)) * 19;                               // 5–24
  else if (peakMedian <= histP75) baseScore = 25 + ((peakMedian - histP50) / Math.max(histP75 - histP50, eps)) * 24;         // 25–49
  else if (peakMedian <= histP90) baseScore = 50 + ((peakMedian - histP75) / Math.max(histP90 - histP75, eps)) * 19;         // 50–69
  else if (peakMedian <= histMax) baseScore = 70 + ((peakMedian - histP90) / Math.max(histMax  - histP90, eps)) * 14;        // 70–84
  else {
    const excess = (peakMedian - histMax) / Math.max(histMax, eps);
    baseScore = 85 + Math.min(12, excess * 40);                                                                               // 85–97
  }

  // Apply seasonal scaler then add persistence bonus
  const raw   = baseScore / seasonalContext.scoreScaler + persistenceBonus;
  const score = Math.min(99, Math.max(1, Math.round(raw)));

  let level: RiskLevel;
  let description: string;

  if (score >= 80) {
    level = 'WATCH';
    description =
      'The most-likely forecast discharge materially exceeds the recent historical maximum — a statistically anomalous signal. ' +
      (seasonalContext.isFloodSeason
        ? 'This is above-normal even within the active flood season.'
        : 'This is particularly notable given the current low-flow period.');
  } else if (score >= 55) {
    level = 'ELEVATED';
    description =
      'Forecast median is approaching or exceeding the 90th historical percentile. ' +
      (seasonalContext.isFloodSeason
        ? 'Partially expected during the current season, but sustained monitoring is recommended.'
        : 'Above-normal for this time of year — increased monitoring is advised.');
  } else if (score >= 30) {
    level = 'MODERATE';
    description =
      'Forecast is above the historical median but below the 75th percentile. ' +
      (seasonalContext.isFloodSeason
        ? 'Within normal seasonal variability — standard awareness precautions apply.'
        : 'Slightly above the seasonal norm; routine monitoring recommended.');
  } else {
    level = 'NORMAL';
    description =
      'Forecast discharge is within the historical median range. ' +
      'Conditions are consistent with seasonal norms for this location.';
  }

  return { level, score, ...PALETTE[level], description };
}

// ============================================================
// Today-index helper
// ============================================================

/** Returns the index of the last data point on or before today's date. */
export function findTodayIndex(data: FloodDataPoint[]): number {
  const today = new Date().toISOString().split('T')[0];
  for (let i = 0; i < data.length; i++) {
    if (data[i].date >= today) return Math.max(0, i - 1);
  }
  return data.length - 1;
}

// ============================================================
// Bio-SentinelX ML API integration
// ============================================================

export interface MLPredictionRequest {
  latitude: number;
  longitude: number;
  // rainfall derived from current weather
  rainfall_1h_mm?: number;
  rainfall_3h_mm?: number;
  rainfall_6h_mm?: number;
  rainfall_24h_mm?: number;
  rainfall_48h_mm?: number;
  rainfall_72h_mm?: number;
  // terrain / infra defaults (API has sensible defaults)
  elevation_m?: number;
  impervious_surface_pct?: number;
  drainage_capacity_pct?: number;
  soil_moisture_pct?: number;
  // ─ River discharge (GloFAS) ───────────────────────────────────────────
  /** Raw GloFAS observed or forecast median discharge in m³/s */
  river_discharge_m3s?: number;
  /** Discharge normalised by historical P50 (>1 = above median; >4 = extreme) */
  discharge_anomaly_ratio?: number;
  // antecedent precipitation proxy (kept for backward-compat with older model)
  antecedent_precip_index?: number;
  temperature_c?: number;
  humidity_pct?: number;
  pressure_hpa?: number;
  month?: number;
  hour_of_day?: number;
}

export interface MLPredictionResult {
  latitude: number;
  longitude: number;
  flood_probability: number;
  flood_risk_level: string;
  estimated_inundation_depth_m: number;
  confidence: number;
  contributing_factors: Record<string, number>;
  recommendation: string;
  timestamp: string;
}

export interface MLTrainingStatus {
  status: string;
  message: string;
  trained: boolean;
  accuracy?: number;
  f1_score?: number;
  roc_auc?: number;
  last_trained?: string;
  training_samples?: number;
  hotspots_mapped?: number;
  feature_importances?: Record<string, number>;
}

export interface WardReadinessItem {
  ward_id: string;
  ward_name?: string | null;
  lat: number;
  lon: number;
  readiness_grade: string;
  readiness_description: string;
  flood_probability: number;
  risk_score: number;
  inundation_risk_score: number;
  drainage_health_score: number;
  infrastructure_exposure_score: number;
  recommended_actions: string[];
  pre_position_resources: string[];
  hotspot_count_in_ward: number;
}

export interface HotspotCell {
  lat: number;
  lon: number;
  cell_id: string;
  flood_probability: number;
  risk_level: string;
  inundation_depth_m: number;
  dominant_factor: string;
  area_km2: number;
}

export interface MicroHotspotResponse {
  centre_lat: number;
  centre_lon: number;
  radius_km: number;
  grid_size_km: number;
  total_cells_scanned: number;
  hotspots_identified: number;
  hotspots: HotspotCell[];
}
    
/** Normalise API URL: ensure it has a protocol and no trailing slash. */
function normaliseApiUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/$/, '');
  if (!trimmed) throw new Error('ML API URL is empty. Please configure it in settings.');
  // If no protocol, assume https for remote or http for localhost/127.0.0.1
  if (!/^https?:\/\//i.test(trimmed)) {
    const isLocal = /^(localhost|127\.|0\.0\.0\.)/.test(trimmed);
    return `${isLocal ? 'http' : 'https'}://${trimmed}`;
  }
  return trimmed;
}

/**
 * Call the Bio-SentinelX ML API to predict flood risk using real-time inputs.
 * Combines GloFAS river discharge as antecedent precip proxy with weather data.
 */
export async function fetchMLPrediction(
  apiUrl: string,
  lat: number,
  lon: number,
  weather: {
    temp: number;
    precipitation: number | null | undefined;
    humidity: number;
    pressure?: number;
  },
  riverDischargeToday: number | null,
  riverDischargeP50: number
): Promise<MLPredictionResult> {
  const precip = weather.precipitation ?? 0;

  // ── River discharge features ────────────────────────────────────────────────
  // 1. river_discharge_m3s: the raw GloFAS observed/median value (direct feature)
  const riverDischarge = riverDischargeToday ?? 0;

  // 2. discharge_anomaly_ratio: normalised against historical P50
  //    >1 = above median flow, >2 = significant, >4 = extreme flood-level
  const dischargeRatio = riverDischargeP50 > 0
    ? Math.min(riverDischarge / riverDischargeP50, 10)   // cap at 10× to avoid outlier blow-up
    : 0;

  // 3. antecedent_precip_index: kept for backward-compat with older model versions
  //    Scales the discharge ratio into a mm-equivalent so old models still work
  const api = riverDischarge > 0 && riverDischargeP50 > 0
    ? Math.min((riverDischarge / riverDischargeP50) * 30, 150)
    : 0;

  const body: MLPredictionRequest = {
    latitude: lat,
    longitude: lon,
    rainfall_1h_mm: precip,
    rainfall_3h_mm: precip * 2.5,
    rainfall_6h_mm: precip * 4,
    rainfall_24h_mm: precip * 8,
    rainfall_48h_mm: precip * 12,
    rainfall_72h_mm: precip * 15,
    // ─ River discharge (explicit GloFAS features) ──────────────────────────
    river_discharge_m3s: riverDischarge,
    discharge_anomaly_ratio: dischargeRatio,
    antecedent_precip_index: api,   // backward compat
    temperature_c: weather.temp,
    humidity_pct: weather.humidity,
    pressure_hpa: weather.pressure ?? 1013,
    month: new Date().getMonth() + 1,
    hour_of_day: new Date().getHours(),
  };

  const base = normaliseApiUrl(apiUrl);
  const res = await fetch(`${base}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.detail ?? `ML API error ${res.status}`);
  }
  return res.json() as Promise<MLPredictionResult>;
}

/** Get ML model training status and metrics. */
export async function fetchMLStatus(apiUrl: string): Promise<MLTrainingStatus> {
  const base = normaliseApiUrl(apiUrl);
  const res = await fetch(`${base}/train/status`);
  if (!res.ok) throw new Error(`ML API error ${res.status}`);
  return res.json() as Promise<MLTrainingStatus>;
}

/** Trigger a model retrain for the given location. */
export async function triggerMLRetrain(
  apiUrl: string,
  lat: number,
  lon: number,
  radiusKm = 20,
  yearsBack = 10
): Promise<{ status: string; message: string }> {
  const base = normaliseApiUrl(apiUrl);
  const res = await fetch(`${base}/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: lat, longitude: lon, radius_km: radiusKm, years_back: yearsBack }),
  });
  if (!res.ok) throw new Error(`ML API error ${res.status}`);
  return res.json() as Promise<{ status: string; message: string }>;
}

/** Fetch ward-level readiness scores for the current location. */
export async function fetchWardReadiness(
  apiUrl: string,
  lat: number,
  lon: number,
  radiusKm = 15
): Promise<WardReadinessItem[]> {
  const base = normaliseApiUrl(apiUrl);
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius_km: String(radiusKm),
  });

  const res = await fetch(`${base}/wards/readiness?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.detail ?? `ML API error ${res.status}`);
  }
  return res.json() as Promise<WardReadinessItem[]>;
}

/** Fetch micro-hotspot grid scan results for the current location. */
export async function fetchHotspots(
  apiUrl: string,
  lat: number,
  lon: number,
  opts?: { radiusKm?: number; gridSizeKm?: number; minRisk?: number }
): Promise<MicroHotspotResponse> {
  const base = normaliseApiUrl(apiUrl);
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius_km: String(opts?.radiusKm ?? 10),
    grid_size_km: String(opts?.gridSizeKm ?? 1.0),
    min_risk: String(opts?.minRisk ?? 0.5),
  });

  const res = await fetch(`${base}/hotspots?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.detail ?? `ML API error ${res.status}`);
  }
  return res.json() as Promise<MicroHotspotResponse>;
}

// ============================================================
// mGIS (Mappls) Reverse Geocoding
// ============================================================

interface MapplsRevGeoResult {
  responseCode: number;
  results: Array<{
    formatted_address?: string;
    subLocality?: string;
    locality?: string;
    city?: string;
    district?: string;
    state?: string;
    pincode?: string;
  }>;
}

/**
 * Reverse-geocode a lat/lon using Mappls mGIS API to get a human-readable area name.
 * Extremely accurate for Indian sub-localities (Wards, Blocks).
 */
export async function reverseGeocode(lat: number, lon: number, token?: string): Promise<string | null> {
  try {
    const finalToken = token || import.meta.env.VITE_MAPPLS_TOKEN;
    if (!finalToken) return null;
    const url = `https://apis.mappls.com/advancedmaps/v1/${finalToken}/rev_geocode?lat=${lat}&lng=${lon}`;
    
    const res = await fetch(url);
    if (!res.ok) return null;
    
    const json: MapplsRevGeoResult = await res.json();
    if (json.responseCode !== 200 || !json.results?.length) return null;
    
    const r = json.results[0];
    
    // Best-preference chain for ward/neighbourhood
    return (
      r.subLocality ||
      r.locality ||
      r.formatted_address ||
      r.district ||
      null
    );
  } catch (e) {
    console.warn('[Mappls RevGeocode] Failed:', e);
    return null;
  }
}

/**
 * Enrich a list of WardReadinessItems with real area names from mGIS.
 * Can be run in parallel since API key has higher limits, but we keep small delay purely for UI smooth rendering.
 */
export async function enrichWardsWithGeoNames(
  wards: WardReadinessItem[],
  token?: string
): Promise<WardReadinessItem[]> {
  const enriched: WardReadinessItem[] = [];
  
  // Create a batch of promises (Mappls handles higher concurrency than OSM)
  const batchRequests = wards.map(async (w) => {
    if (w.ward_name && !w.ward_name.startsWith('ward_') && !w.ward_name.match(/^[0-9a-f-]+$/i)) {
      return w; // Already named
    }
    const geoName = await reverseGeocode(w.lat, w.lon, token);
    
    // If geoName is quite long (full address), split by comma and take first 2 parts for brevity
    let finalName = geoName ?? w.ward_name ?? w.ward_id;
    if (finalName.length > 35 && finalName.includes(',')) {
       finalName = finalName.split(',').slice(0, 2).join(', ');
    }
    
    return { ...w, ward_name: finalName };
  });

  return Promise.all(batchRequests);
}

// REMOVED old enrich block

// ============================================================
// Historical statistics (used by component and AI prompt)
// ============================================================

export interface HistoricalStats {
  p50: number; p75: number; p90: number;
  max: number; min: number; mean: number; count: number;
}

export function computeHistoricalStats(historical: FloodDataPoint[]): HistoricalStats {
  const vals = historical
    .map(d => d.river_discharge ?? d.river_discharge_mean ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  if (vals.length === 0) return { p50: 0, p75: 0, p90: 0, max: 0, min: 0, mean: 0, count: 0 };
  return {
    p50:   computePercentile(vals, 50),
    p75:   computePercentile(vals, 75),
    p90:   computePercentile(vals, 90),
    max:   vals[vals.length - 1],
    min:   vals[0],
    mean:  vals.reduce((a, b) => a + b, 0) / vals.length,
    count: vals.length,
  };
}

// ============================================================
// ESRI India Ward Boundaries — ArcGIS Living Atlas
// Service: https://livingatlas.esri.in/server1/rest/services/Wards/India_Ward_Boundaries/MapServer
// Provides official ward polygon boundaries for all Indian cities.
// ============================================================

export interface IndiaWardFeature {
  wardId:    string;
  wardName:  string;
  cityName:  string;
  stateName: string;
  lat:       number;   // centroid
  lon:       number;   // centroid
  geometry:  GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

const INDIA_WARD_BOUNDARIES_URL =
  'https://livingatlas.esri.in/server1/rest/services/Wards/India_Ward_Boundaries/MapServer/0';

/**
 * Convert Web Mercator (EPSG:3857) coordinates to WGS84 (EPSG:4326).
 */
function webMercatorToWgs84(x: number, y: number): [number, number] {
  const lon = (x / 20037508.342) * 180;
  let lat   = (y / 20037508.342) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lon, lat];
}

/**
 * Compute the centroid [lon, lat] of a GeoJSON polygon ring (Web Mercator input → WGS84 output).
 */
function ringCentroidWgs84(ring: number[][], inWgs84 = false): [number, number] {
  let sumX = 0, sumY = 0;
  const n = ring.length;
  for (const [x, y] of ring) { sumX += x; sumY += y; }
  const avgX = sumX / n;
  const avgY = sumY / n;
  return inWgs84 ? [avgX, avgY] : webMercatorToWgs84(avgX, avgY);
}

/**
 * Fetch official India ward boundaries from the ESRI Living Atlas ArcGIS MapServer.
 *
 * Queries wards that intersect a bounding box around the given lat/lon within the specified radius.
 * Returns GeoJSON features with real ward polygons and centroids.
 */
export async function fetchIndiaWardBoundaries(
  lat: number,
  lon: number,
  radiusKm = 15
): Promise<IndiaWardFeature[]> {
  // Convert radius to degrees (rough approximation for bounding box query)
  const degLat = radiusKm / 111.32;
  const degLon = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));

  const minLon = lon - degLon; const maxLon = lon + degLon;
  const minLat = lat - degLat; const maxLat = lat + degLat;

  const params = new URLSearchParams({
    geometry:         `${minLon},${minLat},${maxLon},${maxLat}`,
    geometryType:     'esriGeometryEnvelope',
    inSR:             '4326',
    spatialRel:       'esriSpatialRelIntersects',
    outFields:        '*',
    returnGeometry:   'true',
    outSR:            '4326',               // get output in WGS84
    f:                'geojson',
    resultRecordCount: '200',              // cap at 200 wards
  });

  const url = `${INDIA_WARD_BOUNDARIES_URL}/query?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // 10s timeout via AbortController
    signal: AbortSignal.timeout?.(10000),
  });

  if (!res.ok) {
    throw new Error(`India Ward Boundaries API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as { features?: Array<{ geometry: any; properties: any }> };
  if (!json.features?.length) return [];

  return json.features
    .filter(f => f.geometry && f.properties)
    .map(f => {
      const props = f.properties as Record<string, unknown>;

      // Try multiple possible field names for ward/city/state across ESRI schema versions
      const wardId   = String(props['WARD_NO']    ?? props['Ward_No']    ?? props['OBJECTID']  ?? '');
      const wardName = String(props['WARD_NAME']  ?? props['Ward_Name']  ?? props['WardName']  ?? props['NAME'] ?? `Ward ${wardId}`);
      const cityName = String(props['CITY_NAME']  ?? props['City_Name']  ?? props['CITY']      ?? props['ULB_NAME'] ?? '');
      const stateName= String(props['STATE_NAME'] ?? props['State_Name'] ?? props['STATE']     ?? '');

      // Compute centroid from first polygon ring (geometry is already in WGS84)
      let lon = 0, lat = 0;
      try {
        const geom = f.geometry;
        if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
          [lon, lat] = ringCentroidWgs84(geom.coordinates[0], true);
        } else if (geom.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]) {
          [lon, lat] = ringCentroidWgs84(geom.coordinates[0][0], true);
        } else if (geom.type === 'Point') {
          [lon, lat] = [geom.coordinates[0], geom.coordinates[1]];
        }
      } catch {}

      return {
        wardId, wardName, cityName, stateName,
        lat, lon,
        geometry: f.geometry,
        properties: props,
      } satisfies IndiaWardFeature;
    })
    .filter(w => w.lat !== 0 && w.lon !== 0);
}

