import re

with open('services/outbreakPredictionService.ts', 'r') as f:
    content = f.read()

# Add a function that simulates pulling from "cloud" / Supabase and updating the outbreak status
# based on the "if > 15 people in the same city have same disease" rule.
# For this, we'll append a function that checks this threshold.

new_code = """

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
      const syndrome = IDSP_SYNDROMES.find(s => s.id === sig.syndromeCode || s.code === sig.syndromeCode);
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
"""

if "checkCloudEarlyWarning" not in content:
    content += new_code

with open('services/outbreakPredictionService.ts', 'w') as f:
    f.write(content)
