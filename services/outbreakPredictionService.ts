/**
 * Bio-SentinelX — Outbreak Prediction Service (Phase 3)
 *
 * Implements temporal baseline syndromic surveillance:
 *   1. Moving Average Baseline — 4-week rolling mean + 2σ threshold
 *   2. Syndromic extraction → IDSR syndromes + ICD-10 codes
 *   3. Climate-integrated forecasting (EpiClim variables)
 *   4. District-level outbreak flagging and alert generation
 *
 * Architecture:
 *   - All surveillance logic runs on-device (zero cloud dependency)
 *   - Only anonymized structured signals sync to dashboards
 *   - Supports all 11 WHO/IDSP epidemic-prone syndromes
 */

import { IDSP_SYNDROMES, type IDSPSyndrome, type EpiClimRecord } from './indicDataService';

// ─── Types ──────────────────────────────────────────────────────────────────

export type OutbreakStatus = 'normal' | 'watch' | 'alert' | 'outbreak';

export interface SyndromicSignal {
  id: string;
  syndromeId: string;
  syndromeName: string;
  icd10Codes: string[];
  district: string;
  state: string;
  week: number;
  year: number;
  caseCount: number;
  timestamp: number;
}

export interface WeeklyBaseline {
  syndromeId: string;
  district: string;
  mean: number;      // μ — 4-week rolling mean
  stdDev: number;    // σ — standard deviation
  threshold: number; // μ + 2σ
  weeksCounted: number;
}

export interface OutbreakAlert {
  id: string;
  syndromeId: string;
  syndromeName: string;
  district: string;
  state: string;
  status: OutbreakStatus;
  currentCases: number;
  baselineMean: number;
  baselineThreshold: number;
  excessCases: number;
  deviations: number; // Number of σ above mean
  icd10Codes: string[];
  climateFactors?: ClimateContribution;
  timestamp: number;
  message: string;
}

export interface ClimateContribution {
  temperature: number;
  precipitation: number;
  humidity: number;
  lai: number;
  uvIndex?: number;
  aqi?: number;
  pressure?: number;
  soilMoisture?: number;
  riskMultiplier: number;
  seasonalContext: string;
}

export interface DistrictSurveillance {
  district: string;
  state: string;
  syndromes: SyndromeStatus[];
  overallStatus: OutbreakStatus;
  activeAlerts: number;
  lastUpdated: number;
}

export interface SyndromeStatus {
  syndromeId: string;
  syndromeName: string;
  currentWeekCases: number;
  baselineMean: number;
  baselineThreshold: number;
  status: OutbreakStatus;
  trend: 'rising' | 'stable' | 'declining';
  weeklyHistory: number[]; // Last 8 weeks
}

export interface OutbreakPredictionStats {
  totalSignals: number;
  activeAlerts: number;
  districtsCovered: number;
  syndromesMonitored: number;
  lastAnalysisTime: number;
}

// ─── Storage Keys ───────────────────────────────────────────────────────────

const SIGNALS_KEY = 'biosentinel_syndromic_signals';
const ALERTS_KEY = 'biosentinel_outbreak_alerts';

// ─── Storage Helpers ────────────────────────────────────────────────────────

function loadSignals(): SyndromicSignal[] {
  try { return JSON.parse(localStorage.getItem(SIGNALS_KEY) || '[]'); }
  catch { return []; }
}

function saveSignals(data: SyndromicSignal[]): void {
  const trimmed = data.slice(-5000);
  try { localStorage.setItem(SIGNALS_KEY, JSON.stringify(trimmed)); }
  catch { /* quota */ }
}

function loadAlerts(): OutbreakAlert[] {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'); }
  catch { return []; }
}

function saveAlerts(data: OutbreakAlert[]): void {
  const trimmed = data.slice(-500);
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(trimmed)); }
  catch { /* quota */ }
}

// ─── Core: Moving Average Baseline ──────────────────────────────────────────

/**
 * Calculate the 4-week moving average baseline for a syndrome in a district.
 * Implements: threshold = μ + 2σ (standard WHO syndromic surveillance formula)
 */
export function calculateBaseline(
  syndromeId: string,
  district: string,
  lookbackWeeks: number = 4
): WeeklyBaseline {
  const signals = loadSignals();
  const relevant = signals
    .filter(s => s.syndromeId === syndromeId && s.district.toLowerCase() === district.toLowerCase())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, lookbackWeeks);

  if (relevant.length === 0) {
    return { syndromeId, district, mean: 0, stdDev: 0, threshold: 2, weeksCounted: 0 };
  }

  const counts = relevant.map(s => s.caseCount);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const threshold = mean + 2 * stdDev;

  return {
    syndromeId,
    district,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    threshold: Math.round(threshold * 100) / 100,
    weeksCounted: relevant.length,
  };
}

/**
 * Determine outbreak status based on current cases vs baseline.
 */
function determineStatus(currentCases: number, baseline: WeeklyBaseline): OutbreakStatus {
  if (baseline.weeksCounted < 2) return 'normal'; // Not enough data
  if (baseline.stdDev === 0 && currentCases > baseline.mean) return 'watch';
  if (currentCases > baseline.mean + 3 * baseline.stdDev) return 'outbreak';
  if (currentCases > baseline.threshold) return 'alert';
  if (currentCases > baseline.mean + baseline.stdDev) return 'watch';
  return 'normal';
}

/**
 * Calculate deviations above the mean (z-score).
 */
function calculateDeviations(currentCases: number, baseline: WeeklyBaseline): number {
  if (baseline.stdDev === 0) return currentCases > baseline.mean ? 1 : 0;
  return Math.round(((currentCases - baseline.mean) / baseline.stdDev) * 100) / 100;
}

// ─── Climate Integration ────────────────────────────────────────────────────

/**
 * Assess climate contribution to outbreak risk.
 * Integrates EpiClim variables with syndromic data.
 */
export function assessClimateContribution(
  syndromeId: string,
  climateData: { temperature: number; precipitation: number; humidity: number; lai: number; uvIndex?: number; aqi?: number; pressure?: number; soilMoisture?: number }
): ClimateContribution {
  const syndrome = IDSP_SYNDROMES.find(s => s.id === syndromeId);
  let riskMultiplier = 1.0;
  let seasonalContext = "Normal season";

  // Syndrome-specific climate risk multipliers
  if (syndrome) {
    switch (syndrome.id) {
      case "awd": // Acute Watery Diarrhea — peaks with heavy rainfall + high temp
      case "abd":
        if (climateData.precipitation > 100) riskMultiplier *= 1.8;
        if (climateData.temperature > 30) riskMultiplier *= 1.3;
        if (climateData.humidity > 80) riskMultiplier *= 1.2;
        if (climateData.soilMoisture && climateData.soilMoisture > 0.4) riskMultiplier *= 1.4; // Saturated soil -> runoff
        seasonalContext = climateData.precipitation > 100 ? "Monsoon season — elevated waterborne risk" : "Pre-monsoon";
        break;

      case "afi": // Acute Febrile Illness — dengue/malaria peaks with humidity + stagnant water
        if (climateData.humidity > 70) riskMultiplier *= 1.5;
        if (climateData.temperature > 25 && climateData.temperature < 35) riskMultiplier *= 1.4;
        if (climateData.lai > 3) riskMultiplier *= 1.2; // Vegetation → mosquito breeding
        if (climateData.soilMoisture && climateData.soilMoisture > 0.3) riskMultiplier *= 1.3; // Breeding sites
        seasonalContext = climateData.humidity > 70 ? "Vector breeding season — high mosquito activity" : "Normal vector activity";
        break;

      case "ari": // Acute Respiratory Infection — peaks in cold/dry or high pollution
        if (climateData.temperature < 15) riskMultiplier *= 1.6;
        if (climateData.humidity < 30) riskMultiplier *= 1.3;
        if (climateData.aqi && climateData.aqi >= 4) riskMultiplier *= 1.8; // High pollution (Poor/Very Poor)
        if (climateData.pressure && climateData.pressure < 1000) riskMultiplier *= 1.2; // Low pressure systems
        seasonalContext = climateData.aqi && climateData.aqi >= 4 ? "High pollution event — extreme respiratory risk" :
                         climateData.temperature < 15 ? "Winter season — respiratory vulnerability" : "Normal respiratory risk";
        break;

      case "jaundice": // Hepatitis — waterborne, floods
        if (climateData.precipitation > 150) riskMultiplier *= 2.0;
        if (climateData.soilMoisture && climateData.soilMoisture > 0.45) riskMultiplier *= 1.5;
        seasonalContext = climateData.precipitation > 150 ? "Post-flood contamination risk" : "Normal hepatitis risk";
        break;

      case "snakebite": // Snakes emerge during floods or heavy rain
        if (climateData.precipitation > 50) riskMultiplier *= 1.5;
        if (climateData.soilMoisture && climateData.soilMoisture > 0.4) riskMultiplier *= 1.6;
        seasonalContext = "Wet soil/Flooding — elevated snake activity";
        break;

      case "measles": // Measles peaks in dry seasons
        if (climateData.humidity < 40) riskMultiplier *= 1.4;
        if (climateData.uvIndex && climateData.uvIndex > 8) riskMultiplier *= 1.2;
        seasonalContext = "Dry season — increased measles transmission";
        break;

      default:
        if (climateData.temperature > 35) riskMultiplier *= 1.2;
        if (climateData.precipitation > 100) riskMultiplier *= 1.3;
        if (climateData.aqi && climateData.aqi >= 4) riskMultiplier *= 1.4;
        break;
    }
  }

  return {
    temperature: climateData.temperature,
    precipitation: climateData.precipitation,
    humidity: climateData.humidity,
    lai: climateData.lai,
    uvIndex: climateData.uvIndex,
    aqi: climateData.aqi,
    pressure: climateData.pressure,
    soilMoisture: climateData.soilMoisture,
    riskMultiplier: Math.round(riskMultiplier * 100) / 100,
    seasonalContext,
  };
}

// ─── Signal Recording & Analysis ────────────────────────────────────────────

/**
 * Record a syndromic signal (from field conversation extraction or manual entry).
 */
export function recordSyndromicSignal(
  syndromeId: string,
  district: string,
  state: string,
  caseCount: number,
  week?: number,
  year?: number,
): SyndromicSignal {
  const now = new Date();
  const syndrome = IDSP_SYNDROMES.find(s => s.id === syndromeId);

  const signal: SyndromicSignal = {
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    syndromeId,
    syndromeName: syndrome?.name || syndromeId,
    icd10Codes: syndrome?.icd10Codes || [],
    district,
    state,
    week: week || getISOWeek(now),
    year: year || now.getFullYear(),
    caseCount,
    timestamp: Date.now(),
  };

  const signals = loadSignals();
  signals.push(signal);
  saveSignals(signals);

  return signal;
}

/**
 * Analyze a district for outbreak conditions across all syndromes.
 */
export function analyzeDistrict(
  district: string,
  state: string,
  climateData?: { temperature: number; precipitation: number; humidity: number; lai: number; uvIndex?: number; aqi?: number; pressure?: number; soilMoisture?: number }
): DistrictSurveillance {
  const signals = loadSignals();
  const districtSignals = signals.filter(
    s => s.district.toLowerCase() === district.toLowerCase()
  );

  const syndromeStatuses: SyndromeStatus[] = [];
  let activeAlerts = 0;
  let worstStatus: OutbreakStatus = 'normal';

  for (const syndrome of IDSP_SYNDROMES) {
    const syndromeSignals = districtSignals
      .filter(s => s.syndromeId === syndrome.id)
      .sort((a, b) => b.timestamp - a.timestamp);

    const currentWeekCases = syndromeSignals.length > 0 ? syndromeSignals[0].caseCount : 0;
    const baseline = calculateBaseline(syndrome.id, district);
    const status = determineStatus(currentWeekCases, baseline);

    // Determine trend from last 4 data points
    const recent = syndromeSignals.slice(0, 4).map(s => s.caseCount);
    let trend: 'rising' | 'stable' | 'declining' = 'stable';
    if (recent.length >= 2) {
      const diff = recent[0] - recent[recent.length - 1];
      if (diff > 2) trend = 'rising';
      else if (diff < -2) trend = 'declining';
    }

    // Weekly history (last 8 weeks)
    const weeklyHistory = syndromeSignals.slice(0, 8).map(s => s.caseCount);

    syndromeStatuses.push({
      syndromeId: syndrome.id,
      syndromeName: syndrome.name,
      currentWeekCases,
      baselineMean: baseline.mean,
      baselineThreshold: baseline.threshold,
      status,
      trend,
      weeklyHistory,
    });

    if (status === 'alert' || status === 'outbreak') {
      activeAlerts++;

      // Generate outbreak alert
      const deviations = calculateDeviations(currentWeekCases, baseline);
      const alert: OutbreakAlert = {
        id: `oa_${Date.now()}_${syndrome.id}_${Math.random().toString(36).slice(2, 5)}`,
        syndromeId: syndrome.id,
        syndromeName: syndrome.name,
        district,
        state,
        status,
        currentCases: currentWeekCases,
        baselineMean: baseline.mean,
        baselineThreshold: baseline.threshold,
        excessCases: Math.max(0, currentWeekCases - Math.round(baseline.mean)),
        deviations,
        icd10Codes: syndrome.icd10Codes,
        climateFactors: climateData
          ? assessClimateContribution(syndrome.id, climateData)
          : undefined,
        timestamp: Date.now(),
        message: `${syndrome.name} cases (${currentWeekCases}) exceed the 4-week baseline (${baseline.mean.toFixed(1)} +/- ${baseline.stdDev.toFixed(1)}) by ${deviations.toFixed(1)} standard deviations in ${district}, ${state}.`,
      };

      const alerts = loadAlerts();
      alerts.push(alert);
      saveAlerts(alerts);
    }

    // Track worst status
    const statusRank: Record<OutbreakStatus, number> = { normal: 0, watch: 1, alert: 2, outbreak: 3 };
    if (statusRank[status] > statusRank[worstStatus]) worstStatus = status;
  }

  return {
    district,
    state,
    syndromes: syndromeStatuses,
    overallStatus: worstStatus,
    activeAlerts,
    lastUpdated: Date.now(),
  };
}

// ─── Alert Management ───────────────────────────────────────────────────────

/**
 * Get all outbreak alerts, optionally filtered by district.
 */
export function getOutbreakAlerts(district?: string): OutbreakAlert[] {
  const alerts = loadAlerts();
  const filtered = district
    ? alerts.filter(a => a.district.toLowerCase() === district.toLowerCase())
    : alerts;
  return filtered.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get active outbreak alerts (alert or outbreak status only).
 */
export function getActiveOutbreakAlerts(): OutbreakAlert[] {
  return loadAlerts()
    .filter(a => a.status === 'alert' || a.status === 'outbreak')
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Clear outbreak alerts.
 */
export function clearOutbreakAlerts(): void {
  localStorage.removeItem(ALERTS_KEY);
}

// ─── Statistics ─────────────────────────────────────────────────────────────

export function getOutbreakPredictionStats(): OutbreakPredictionStats {
  const signals = loadSignals();
  const alerts = loadAlerts();
  const districts = new Set(signals.map(s => s.district));

  return {
    totalSignals: signals.length,
    activeAlerts: alerts.filter(a => a.status === 'alert' || a.status === 'outbreak').length,
    districtsCovered: districts.size,
    syndromesMonitored: IDSP_SYNDROMES.length,
    lastAnalysisTime: signals.length > 0
      ? Math.max(...signals.map(s => s.timestamp))
      : 0,
  };
}

/**
 * Clear all syndromic signals.
 */
export function clearSyndromicSignals(): void {
  localStorage.removeItem(SIGNALS_KEY);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}


// ─── Cloud-Enhanced Early Warning ───────────────────────────────────────────

import { fetchGlobalSignals, fetchGlobalAlerts } from './supabaseService';

export interface CloudEarlyWarning {
  syndromeId: string;
  syndromeName: string;
  city: string;
  caseCount: number;
  thresholdExceeded: boolean;
  message: string;
}

/**
 * Checks the cloud (Supabase) to see if more than `threshold` (default 15) people
 * in the same city have reported the same disease recently.
 * This triggers an early disease outbreak chance warning.
 */
export async function checkCloudEarlyWarning(city: string, threshold: number = 15): Promise<CloudEarlyWarning[]> {
  try {
    const signals = await fetchGlobalSignals(undefined, undefined, city);
    if (!signals || signals.length === 0) return [];

    // Group recent signals (e.g. last 7 days) by syndrome
    const recentSignals = signals.filter(s => Date.now() - s.timestamp < 7 * 24 * 60 * 60 * 1000);
    const syndromeCounts: Record<string, number> = {};
    const syndromeNames: Record<string, string> = {};

    for (const sig of recentSignals) {
      syndromeCounts[sig.syndromeCode] = (syndromeCounts[sig.syndromeCode] || 0) + sig.caseCount;
      // We assume syndromeCode maps back to IDSP_SYNDROMES id roughly
      const syndrome = IDSP_SYNDROMES.find(s => s.id === sig.syndromeCode);
      syndromeNames[sig.syndromeCode] = syndrome?.name || sig.syndromeCode;
    }

    const warnings: CloudEarlyWarning[] = [];
    for (const [code, count] of Object.entries(syndromeCounts)) {
      if (count > threshold) {
        warnings.push({
          syndromeId: code,
          syndromeName: syndromeNames[code],
          city,
          caseCount: count,
          thresholdExceeded: true,
          message: `Early Warning: >${threshold} cases of ${syndromeNames[code]} reported in ${city} recently.`
        });
      }
    }

    return warnings;
  } catch (err) {
    console.error("Failed to check cloud early warning:", err);
    return [];
  }
}
