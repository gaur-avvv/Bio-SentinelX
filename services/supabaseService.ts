/**
 * Bio-SentinelX — Supabase Cloud Sync Service
 *
 * Handles the synchronization of anonymized structured signals
 * to the Supabase backend for interconnected surveillance.
 */

import { AnonymizedSignal } from './privacyService';
import { OutbreakAlert } from './outbreakPredictionService';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Sync a batch of anonymized signals to Supabase.
 */
export async function syncSignalsToCloud(signals: AnonymizedSignal[], city?: string): Promise<{ success: boolean; count: number; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    const formatted = signals.map(s => ({
      syndrome_code: s.syndromeCode,
      icd10_codes: s.icd10Codes,
      district: s.district,
      state: s.state,
      city: city || s.district, // Fallback to district if city not provided
      week: s.week,
      year: s.year,
      case_count: s.caseCount,
      severity: s.severity,
      timestamp: new Date(s.timestamp).toISOString(),
    }));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/syndromic_signals`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(formatted),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    return { success: true, count: signals.length };
  } catch (err) {
    return { success: false, count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Fetch global syndromic signals for regional analysis.
 */
export async function fetchGlobalSignals(district?: string, state?: string, city?: string): Promise<AnonymizedSignal[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];

  try {
    let url = `${SUPABASE_URL}/rest/v1/syndromic_signals?select=*`;
    if (district) url += `&district=eq.${encodeURIComponent(district)}`;
    if (state) url += `&state=eq.${encodeURIComponent(state)}`;
    if (city) url += `&city=eq.${encodeURIComponent(city)}`;
    url += '&order=timestamp.desc&limit=1000';

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) return [];
    const data = await res.json();

    return data.map((d: any) => ({
      signalId: d.id,
      syndromeCode: d.syndrome_code,
      icd10Codes: d.icd10_codes,
      district: d.district,
      state: d.state,
      week: d.week,
      year: d.year,
      caseCount: d.case_count,
      severity: d.severity,
      timestamp: new Date(d.timestamp).getTime(),
    }));
  } catch {
    return [];
  }
}

/**
 * Sync outbreak alerts to cloud for multi-location monitoring.
 */
export async function syncAlertsToCloud(alerts: OutbreakAlert[], city?: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  try {
    const formatted = alerts.map(a => ({
      syndrome_id: a.syndromeId,
      syndrome_name: a.syndromeName,
      district: a.district,
      state: a.state,
      city: city || a.district,
      status: a.status,
      current_cases: a.currentCases,
      baseline_mean: a.baselineMean,
      baseline_threshold: a.baselineThreshold,
      excess_cases: a.excessCases,
      deviations: a.deviations,
      icd10_codes: a.icd10Codes,
      climate_factors: a.climateFactors,
      timestamp: new Date(a.timestamp).toISOString(),
    }));

    await fetch(`${SUPABASE_URL}/rest/v1/outbreak_alerts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(formatted),
    });
  } catch (err) {
    console.error('[SupabaseSync] Alert sync failed:', err);
  }
}

/**
 * Fetch all active alerts from cloud for interconnected prediction.
 */
export async function fetchGlobalAlerts(): Promise<OutbreakAlert[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/outbreak_alerts?select=*&order=timestamp.desc&limit=500`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) return [];
    const data = await res.json();

    return data.map((d: any) => ({
      id: d.id,
      syndromeId: d.syndrome_id,
      syndromeName: d.syndrome_name,
      district: d.district,
      state: d.state,
      status: d.status as any,
      currentCases: d.current_cases,
      baselineMean: d.baseline_mean,
      baselineThreshold: d.baseline_threshold,
      excessCases: d.excess_cases,
      deviations: d.deviations,
      icd10Codes: d.icd10_codes,
      climateFactors: d.climate_factors,
      timestamp: new Date(d.timestamp).getTime(),
      message: `${d.syndrome_name} alert in ${d.city || d.district}`, // Reconstructed
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch regional data (aggregated signals) for interconnected analysis.
 */
export async function fetchRegionalData(state: string): Promise<Record<string, number>> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return {};

  try {
    const url = `${SUPABASE_URL}/rest/v1/syndromic_signals?select=syndrome_code,case_count&state=eq.${encodeURIComponent(state)}`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) return {};
    const data = await res.json();

    const totals: Record<string, number> = {};
    data.forEach((d: any) => {
      totals[d.syndrome_code] = (totals[d.syndrome_code] || 0) + (d.case_count || 1);
    });

    return totals;
  } catch {
    return {};
  }
}
