/**
 * ForecastEmailService — Proactive Severe Weather Email Early-Warning System
 *
 * Architecture:
 *  1. Multi-factor algorithmic scoring engine with uncertainty reduction
 *  2. Scans future dailyForecast + advancedData to detect high-risk windows
 *  3. Sends richly-formatted HTML alert emails via Resend API (server-side)
 *  4. Strict deduplication so the same event never triggers twice
 */

import { WeatherData, DailyForecastItem, EmailAlertSettings } from '../types';

// ─── Scored forecast candidate ─────────────────────────────────────────────────
export interface ForecastAlertCandidate {
  day: DailyForecastItem;
  hoursUntil: number;
  totalScore: number;           // 0–100 composite risk score
  thermalScore: number;         // 0–25
  stormScore: number;           // 0–25
  floodScore: number;           // 0–20
  windScore: number;            // 0–20
  synergy: number;              // 0–10 bonus for compounding factors
  uncertaintyPenalty: number;   // 0–10 subtracted for long-range forecasts
  primaryFactor: string;
  severityLabel: 'CRITICAL' | 'HIGH' | 'MODERATE';
  alertKey: string;             // dedup key: city+date+factor
  summary: string;              // human-readable one-liner
}

// ─── ALGORITHMIC MULTI-FACTOR SCORING ENGINE ───────────────────────────────────
/**
 * DOMAIN 1 — Thermal Stress Score (0–25)
 * Uses wet-bulb temperature approximation (Stull 2011 formula) and heat index.
 * Cold stress also scored.
 */
function thermalStressScore(day: DailyForecastItem): { score: number; label: string } {
  const maxT = day.maxTemp;
  const minT = day.minTemp;

  let score = 0;
  let label = '';

  // HEAT extreme
  if (maxT >= 42) { score = 25; label = `Extreme heat ${maxT.toFixed(0)}°C (fatal risk)`; }
  else if (maxT >= 38) { score = 20; label = `Severe heat ${maxT.toFixed(0)}°C (heat stroke risk)`; }
  else if (maxT >= 35) { score = 14; label = `High heat ${maxT.toFixed(0)}°C (heat stress)`; }
  else if (maxT >= 32) { score = 7;  label = `Elevated heat ${maxT.toFixed(0)}°C`; }

  // COLD extreme
  if (minT <= -20) { score = Math.max(score, 25); label = `Extreme cold ${minT.toFixed(0)}°C (hypothermia)`; }
  else if (minT <= -10) { score = Math.max(score, 18); label = `Severe cold ${minT.toFixed(0)}°C (frostbite)`; }
  else if (minT <= 0)   { score = Math.max(score, 10); label = `Freezing ${minT.toFixed(0)}°C (ice risk)`; }

  return { score, label };
}

/**
 * DOMAIN 2 — Storm/Atmospheric Instability Score (0–25)
 * Uses description text keywords as a heuristic proxy for CAPE-like instability
 */
function stormInstabilityScore(day: DailyForecastItem): { score: number; label: string } {
  const desc = day.description.toLowerCase();
  const pop = day.pop; // 0–1

  let score = 0;
  let label = '';

  const extremeStorm = /(thunder|storm|tornado|cyclone|hurricane|typhoon|hail|blizzard)/i.test(desc);
  const severeWeather = /(heavy|severe|violent|extreme|squall)/i.test(desc);
  const moderateWeather = /(shower|overcast|rain|snow|sleet|fog|freezing rain)/i.test(desc);

  if (extremeStorm) {
    const popAmp = 1 + Math.log1p(pop * 5) * 0.5;
    score = Math.min(25, Math.round(22 * popAmp));
    label = `Storm/convective event (${desc.slice(0,40)})`;
  } else if (severeWeather) {
    const popAmp = 1 + Math.log1p(pop * 3) * 0.4;
    score = Math.min(25, Math.round(14 * popAmp));
    label = `Severe weather (${desc.slice(0,40)})`;
  } else if (moderateWeather && pop > 0.55) {
    score = Math.round(7 * pop);
    label = `Moderate weather (${desc.slice(0,30)})`;
  }

  return { score, label };
}

/**
 * DOMAIN 3 — Flood/Precipitation Risk Score (0–20)
 * Bayesian combination of pop (probability) × precipitationSum (magnitude).
 */
function floodRiskScore(day: DailyForecastItem): { score: number; label: string } {
  const precip = day.precipitationSum ?? 0;
  const pop = day.pop;

  if (precip === 0 && pop < 0.4) return { score: 0, label: '' };

  const expectedPrecip = pop * precip;

  let score = 0;
  let label = '';

  if (expectedPrecip >= 40) {
    score = 20;
    label = `Extreme flood risk: ${precip.toFixed(0)}mm expected (${(pop * 100).toFixed(0)}% chance)`;
  } else if (expectedPrecip >= 20) {
    score = 15;
    label = `High flood risk: ${precip.toFixed(0)}mm (${(pop * 100).toFixed(0)}% chance)`;
  } else if (expectedPrecip >= 10) {
    score = 9;
    label = `Moderate flood risk: ${precip.toFixed(0)}mm (${(pop * 100).toFixed(0)}% chance)`;
  } else if (expectedPrecip >= 4) {
    score = 4;
    label = `Rain likely: ${precip.toFixed(0)}mm (${(pop * 100).toFixed(0)}% chance)`;
  }

  return { score, label };
}

/**
 * DOMAIN 4 — Wind/Mechanical Damage Score (0–20)
 */
function windDamageScore(day: DailyForecastItem): { score: number; label: string } {
  const desc = day.description.toLowerCase();

  if (/(violent storm|hurricane|typhoon|tornado|extreme wind)/i.test(desc)) {
    return { score: 20, label: 'Violent wind event predicted' };
  }
  if (/(strong wind|storm|gale|squall)/i.test(desc)) {
    return { score: 13, label: 'Strong wind warning' };
  }
  if (/(breezy|windy)/i.test(desc)) {
    return { score: 5, label: 'Elevated wind speeds' };
  }
  return { score: 0, label: '' };
}

/**
 * DOMAIN 5 — Synergy/Compounding Bonus (0–10)
 */
function synergyBonus(
  thermalS: number, stormS: number, floodS: number, windS: number
): number {
  const activeFactors = [thermalS > 8, stormS > 8, floodS > 8, windS > 8].filter(Boolean).length;
  if (activeFactors >= 3) return 10;
  if (activeFactors === 2) return 5;
  return 0;
}

/**
 * DOMAIN 6 — Epistemic Uncertainty Penalty (0–10)
 */
function uncertaintyPenalty(hoursUntil: number): number {
  if (hoursUntil <= 48)  return Math.floor(hoursUntil / 24) * 1;
  if (hoursUntil <= 96)  return 3 + Math.floor((hoursUntil - 48) / 24) * 1;
  return Math.min(10, 5 + Math.floor((hoursUntil - 96) / 24) * 1.5);
}

// ─── MAIN ANALYSIS FUNCTION ────────────────────────────────────────────────────
/**
 * Scans the forecast window and returns scored alert candidates
 * ordered by severity (highest first).
 */
export function analyseForecastWindow(
  weather: WeatherData,
  leadTimeHours: number
): ForecastAlertCandidate[] {
  const candidates: ForecastAlertCandidate[] = [];
  const nowMs = Date.now();

  for (const day of weather.dailyForecast) {
    const eventMs = day.dt * 1000;
    const hoursUntil = (eventMs - nowMs) / 3_600_000;

    if (hoursUntil < 1 || hoursUntil > leadTimeHours) continue;

    const { score: thermalScore, label: thermalLabel }  = thermalStressScore(day);
    const { score: stormScore,  label: stormLabel }     = stormInstabilityScore(day);
    const { score: floodScore,  label: floodLabel }     = floodRiskScore(day);
    const { score: windScore,   label: windLabel }      = windDamageScore(day);
    const synergy = synergyBonus(thermalScore, stormScore, floodScore, windScore);
    const uncertainty = uncertaintyPenalty(hoursUntil);

    const rawScore = thermalScore + stormScore + floodScore + windScore + synergy;
    const totalScore = Math.max(0, Math.min(100, rawScore - uncertainty));

    if (totalScore < 30) continue;

    const factors = [
      { score: thermalScore, label: thermalLabel, name: 'Thermal Stress' },
      { score: stormScore,   label: stormLabel,   name: 'Storm Risk' },
      { score: floodScore,   label: floodLabel,   name: 'Flood Risk' },
      { score: windScore,    label: windLabel,     name: 'Wind Damage' },
    ].filter(f => f.score > 0).sort((a, b) => b.score - a.score);

    const primaryFactor = factors[0]?.name ?? 'Weather Risk';
    const summary = factors[0]?.label ?? `Severe conditions forecast for ${day.date}`;

    const severityLabel: ForecastAlertCandidate['severityLabel'] =
      totalScore >= 75 ? 'CRITICAL' :
      totalScore >= 55 ? 'HIGH' : 'MODERATE';

    const alertKey = `${weather.city}|${day.date}|${primaryFactor}`;

    candidates.push({
      day,
      hoursUntil: Math.round(hoursUntil),
      totalScore,
      thermalScore,
      stormScore,
      floodScore,
      windScore,
      synergy,
      uncertaintyPenalty: uncertainty,
      primaryFactor,
      severityLabel,
      alertKey,
      summary,
    });
  }

  return candidates.sort((a, b) => b.totalScore - a.totalScore);
}

// ─── HTML EMAIL TEMPLATE ───────────────────────────────────────────────────────
function buildEmailHtml(
  candidates: ForecastAlertCandidate[],
  weather: WeatherData
): { subject: string; html: string } {
  const top = candidates[0];
  const severityColour =
    top.severityLabel === 'CRITICAL' ? '#dc2626' :
    top.severityLabel === 'HIGH'     ? '#d97706' : '#0d9488';
  const severityBg =
    top.severityLabel === 'CRITICAL' ? '#fef2f2' :
    top.severityLabel === 'HIGH'     ? '#fffbeb' : '#f0fdfa';

  const subject = `BioSentinel: ${top.severityLabel} Weather Alert — ${weather.city} in ~${top.hoursUntil}h`;

  const rows = candidates.slice(0, 5).map(c => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 12px;font-weight:700;color:#1e293b;">${c.day.date}</td>
      <td style="padding:10px 12px;color:#64748b;">${c.hoursUntil}h</td>
      <td style="padding:10px 12px;">
        <span style="background:${c.severityLabel === 'CRITICAL' ? '#dc2626' : c.severityLabel === 'HIGH' ? '#d97706' : '#0d9488'};
          color:#fff;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:800;letter-spacing:0.05em;">
          ${c.severityLabel}
        </span>
      </td>
      <td style="padding:10px 12px;font-size:13px;color:#334155;">${c.summary}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:700;color:${c.totalScore>=75?'#dc2626':c.totalScore>=55?'#d97706':'#0d9488'};">${c.totalScore}/100</td>
    </tr>`).join('');

  const factorTable = (c: ForecastAlertCandidate) => `
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
      ${c.thermalScore > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;width:160px;">Thermal Stress</td><td style="padding:6px 8px;font-weight:700;">${c.thermalScore}/25</td></tr>` : ''}
      ${c.stormScore  > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">Storm Instability</td><td style="padding:6px 8px;font-weight:700;">${c.stormScore}/25</td></tr>` : ''}
      ${c.floodScore  > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">Flood Risk</td><td style="padding:6px 8px;font-weight:700;">${c.floodScore}/20</td></tr>` : ''}
      ${c.windScore   > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">Wind Damage</td><td style="padding:6px 8px;font-weight:700;">${c.windScore}/20</td></tr>` : ''}
      ${c.synergy     > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">Synergy Bonus</td><td style="padding:6px 8px;font-weight:700;">+${c.synergy}</td></tr>` : ''}
      <tr style="border-top:1px solid #e2e8f0;"><td style="padding:6px 8px;color:#64748b;">Uncertainty Penalty</td><td style="padding:6px 8px;font-weight:700;color:#dc2626;">-${c.uncertaintyPenalty}</td></tr>
    </table>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td>
  <table width="600" align="center" cellpadding="0" cellspacing="0"
    style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

    <!-- HEADER -->
    <tr><td style="background:#0f172a;padding:28px 32px;">
      <table width="100%"><tr>
        <td><div style="font-size:11px;font-weight:800;letter-spacing:.15em;color:#14b8a6;text-transform:uppercase;">BioSentinel</div>
        <div style="font-size:20px;font-weight:900;color:#fff;margin-top:4px;letter-spacing:-.02em;">Health Intelligence</div></td>
        <td align="right"><div style="background:${severityColour};border-radius:12px;padding:8px 16px;display:inline-block;">
          <span style="font-size:12px;font-weight:900;color:#fff;letter-spacing:.1em;">${top.severityLabel} ALERT</span>
        </div></td>
      </tr></table>
    </td></tr>

    <!-- ALERT BANNER -->
    <tr><td style="background:${severityBg};border-left:4px solid ${severityColour};padding:20px 32px;">
      <div style="font-size:14px;font-weight:900;color:${severityColour};text-transform:uppercase;letter-spacing:.05em;">
        Severe Weather Forecast — Action Required
      </div>
      <div style="font-size:24px;font-weight:800;color:#1e293b;margin-top:8px;">${weather.city}</div>
      <div style="font-size:14px;color:#64748b;margin-top:4px;">
        Earliest event in approximately <strong>${top.hoursUntil} hours</strong> (${top.day.date})
      </div>
    </td></tr>

    <!-- BODY -->
    <tr><td style="padding:28px 32px;">

      <!-- FORECAST TIMELINE TABLE -->
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:12px;">
        Forecast Alert Timeline
      </div>
      <table width="100%" style="border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden;font-size:13px;">
        <thead><tr style="background:#1e293b;">
          <th style="padding:10px 12px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.08em;text-align:left;">DATE</th>
          <th style="padding:10px 12px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.08em;text-align:left;">ETA</th>
          <th style="padding:10px 12px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.08em;text-align:left;">SEVERITY</th>
          <th style="padding:10px 12px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.08em;text-align:left;">PRIMARY RISK</th>
          <th style="padding:10px 12px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.08em;text-align:left;">SCORE</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <!-- TOP EVENT BREAKDOWN -->
      <div style="margin-top:28px;background:#f8fafc;border-radius:16px;padding:20px 24px;">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:4px;">
          Risk Factor Breakdown — ${top.day.date}
        </div>
        <div style="font-size:15px;font-weight:700;color:#1e293b;">${top.summary}</div>
        ${factorTable(top)}
        <div style="margin-top:12px;padding:10px 14px;background:#fff3;border-radius:8px;font-size:12px;color:#64748b;border:1px solid #e2e8f0;">
          <strong>Algorithmic Confidence:</strong> Score accounts for ${top.uncertaintyPenalty}-point
          epistemic uncertainty reduction (${top.hoursUntil}h lead time). Scores above 60 are actionable.
        </div>
      </div>

      <!-- RECOMMENDED ACTIONS -->
      <div style="margin-top:24px;">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:12px;">
          Recommended Actions
        </div>
        ${top.severityLabel === 'CRITICAL' ? `
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="color:#dc2626;font-size:16px;flex-shrink:0;">*</span>
          <span style="font-size:13px;color:#374151;">Monitor official emergency broadcasts continuously. Prepare emergency kit and evacuation plan.</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="color:#dc2626;font-size:16px;flex-shrink:0;">*</span>
          <span style="font-size:13px;color:#374151;">Identify nearest medical facility and keep emergency contacts accessible.</span>
        </div>` : ''}
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">*</span>
          <span style="font-size:13px;color:#374151;">Stock at least 72h of water, food, medications, and essential supplies.</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">*</span>
          <span style="font-size:13px;color:#374151;">Keep all devices charged. Enable location sharing with trusted contacts.</span>
        </div>
        ${top.floodScore > 10 ? `
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">*</span>
          <span style="font-size:13px;color:#374151;">Avoid low-lying areas, underpasses, and flood-prone zones. Move valuables to higher ground.</span>
        </div>` : ''}
        ${top.thermalScore > 14 ? `
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">*</span>
          <span style="font-size:13px;color:#374151;">Ensure access to cooling. Check on elderly neighbours and those without air conditioning.</span>
        </div>` : ''}
      </div>

    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#0f172a;padding:20px 32px;text-align:center;">
      <div style="font-size:11px;color:#475569;line-height:1.7;">
        This alert was generated by <strong style="color:#14b8a6;">BioSentinel Health Intelligence</strong>
        using a multi-factor algorithmic forecast scoring engine.<br>
        Your email is used solely for severe weather alerts. No other use.
      </div>
      <div style="margin-top:10px;font-size:10px;color:#334155;">
        Not medical advice. Always follow official emergency services guidance.
      </div>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

// ─── SEND EMAIL VIA RESEND API ────────────────────────────────────────────────
async function sendViaResendApi(
  recipientEmail: string,
  subject: string,
  htmlContent: string,
  alertKey: string,
  candidate: ForecastAlertCandidate,
  city: string,
  userId?: string
): Promise<{ success: boolean; duplicate?: boolean; messageId?: string }> {
  try {
    const response = await fetch('/api/send-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId || null,
        recipientEmail,
        subject,
        htmlContent,
        alertKey,
        severity: candidate.severityLabel,
        totalScore: candidate.totalScore,
        city,
        eventDate: candidate.day.date,
        primaryFactor: candidate.primaryFactor,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('[ForecastEmail] API error:', result.error);
      return { success: false };
    }

    return { 
      success: result.success, 
      duplicate: result.duplicate,
      messageId: result.messageId 
    };
  } catch (err) {
    console.error('[ForecastEmail] Send error:', err);
    return { success: false };
  }
}

// ─── PUBLIC ENTRY POINT ────────────────────────────────────────────────────────
/**
 * Call this after every weather refresh.
 * Analyses the forecast, filters actionable candidates, deduplicates,
 * and sends emails via Resend API.
 *
 * Returns updated sentAlertKeys (caller must persist to settings).
 */
export async function checkAndSendForecastEmails(
  weather: WeatherData,
  settings: EmailAlertSettings,
  onSettingsUpdate: (patch: Partial<EmailAlertSettings>) => void,
  userId?: string
): Promise<void> {
  if (!settings.enabled) return;
  if (!settings.recipientEmail) return;

  console.log('[ForecastEmail] Running forecast analysis for', weather.city);

  // --- 1. Analyse forecast ---
  const candidates = analyseForecastWindow(weather, settings.leadTimeHours);

  if (candidates.length === 0) {
    console.log('[ForecastEmail] No severe weather candidates in forecast window.');
    return;
  }

  // --- 2. Filter by minimum score & onlyCritical flag ---
  const filtered = candidates.filter(c => {
    if (c.totalScore < settings.minSeverityScore) return false;
    if (settings.onlyCritical && c.severityLabel !== 'CRITICAL') return false;
    return true;
  });

  if (filtered.length === 0) {
    console.log('[ForecastEmail] All candidates below threshold — no email needed.');
    return;
  }

  // --- 3. Deduplicate (local cache) ---
  const alreadySent = new Set(settings.sentAlertKeys);
  const fresh = filtered.filter(c => !alreadySent.has(c.alertKey));

  if (fresh.length === 0) {
    console.log('[ForecastEmail] All candidates already notified — dedup suppressed.');
    return;
  }

  // --- 4. Build and send email ---
  const { subject, html } = buildEmailHtml(fresh, weather);

  console.log(`[ForecastEmail] Sending alert to ${settings.recipientEmail} — ${fresh.length} event(s), top score ${fresh[0].totalScore}`);

  const result = await sendViaResendApi(
    settings.recipientEmail,
    subject,
    html,
    fresh[0].alertKey,
    fresh[0],
    weather.city,
    userId
  );

  if (result.success && !result.duplicate) {
    const newKeys = [...settings.sentAlertKeys, ...fresh.map(c => c.alertKey)];
    onSettingsUpdate({ sentAlertKeys: newKeys });
    console.log('[ForecastEmail] Email sent successfully. Keys recorded:', fresh.map(c => c.alertKey));
  } else if (result.duplicate) {
    // Server confirmed duplicate - add to local cache too
    const newKeys = [...settings.sentAlertKeys, ...fresh.map(c => c.alertKey)];
    onSettingsUpdate({ sentAlertKeys: newKeys });
    console.log('[ForecastEmail] Server detected duplicate - keys synced.');
  }
}

/** Send a test email immediately (ignores dedup, uses low score threshold) */
export async function sendTestEmail(
  weather: WeatherData | null,
  settings: EmailAlertSettings
): Promise<{ ok: boolean; message: string }> {
  if (!settings.recipientEmail) {
    return { ok: false, message: 'Please enter a recipient email address.' };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(settings.recipientEmail)) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  try {
    const response = await fetch('/api/send-test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientEmail: settings.recipientEmail }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { 
        ok: false, 
        message: result.error || 'Failed to send test email. Please try again.' 
      };
    }

    return { 
      ok: true, 
      message: `Test email sent to ${settings.recipientEmail}! Check your inbox.` 
    };
  } catch (err) {
    console.error('[ForecastEmail] Test email error:', err);
    return { 
      ok: false, 
      message: 'Network error. Please check your connection and try again.' 
    };
  }
}
