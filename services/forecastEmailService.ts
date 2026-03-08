/**
 * ForecastEmailService — Proactive Severe Weather Email Early-Warning System
 *
 * Architecture:
 *  1. Multi-factor algorithmic scoring engine with uncertainty reduction
 *  2. Scans future dailyForecast + advancedData to detect high-risk windows
 *  3. Auto-provisions smtp.dev sender account via REST API
 *  4. Sends richly-formatted HTML alert emails via smtpjs (browser SMTP)
 *  5. Strict deduplication so the same event never triggers twice
 */

import { WeatherData, DailyForecastItem, EmailAlertSettings } from '../types';

declare const Email: {
  send(config: {
    Host?: string;
    Username?: string;
    Password?: string;
    Port?: number;
    To: string;
    From: string;
    Subject: string;
    Body: string;
  }): Promise<string>;
};

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

// ─── SMTP.DEV API helpers ──────────────────────────────────────────────────────
const SMTP_API_BASE = 'https://api.smtp.dev';
const SMTP_SEND_HOST = 'send.smtp.dev';

/** Generate a cryptographically-adequate random password */
function randomPassword(len = 20): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  let out = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  arr.forEach(b => { out += chars[b % chars.length]; });
  return out;
}

/**
 * Provisions (or re-uses) a smtp.dev sender account.
 * Returns { email, password } to use with smtpjs.
 * Stores credentials in the passed settings object (caller must persist).
 */
export async function provisionSenderAccount(
  settings: EmailAlertSettings
): Promise<{ email: string; password: string } | null> {
  // Already provisioned — reuse
  if (settings.senderEmail && settings.senderPassword) {
    return { email: settings.senderEmail, password: settings.senderPassword };
  }

  if (!settings.smtpDevApiKey) {
    console.warn('[ForecastEmail] No smtp.dev API key — cannot provision sender.');
    return null;
  }

  try {
    // 1. Get first available active domain
    const domainsRes = await fetch(`${SMTP_API_BASE}/domains?isActive=true&page=1`, {
      headers: { 'X-API-KEY': settings.smtpDevApiKey, 'Accept': 'application/json' },
    });
    if (!domainsRes.ok) throw new Error(`Domains fetch failed: ${domainsRes.status}`);
    const domainsData = await domainsRes.json() as any;
    const domain: string | undefined = domainsData?.member?.[0]?.domain;
    if (!domain) throw new Error('No active domains found on smtp.dev account.');

    // 2. Create a unique sender account
    const senderAddress = `biosentinel-alerts-${Date.now()}@${domain}`;
    const senderPassword = randomPassword();

    const createRes = await fetch(`${SMTP_API_BASE}/accounts`, {
      method: 'POST',
      headers: {
        'X-API-KEY': settings.smtpDevApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ address: senderAddress, password: senderPassword }),
    });
    if (!createRes.ok) throw new Error(`Account creation failed: ${createRes.status}`);

    console.log('[ForecastEmail] Sender account provisioned:', senderAddress);
    return { email: senderAddress, password: senderPassword };
  } catch (err) {
    console.error('[ForecastEmail] Sender provisioning error:', err);
    return null;
  }
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

  // Wet-bulb approximation (simplified Stull formula)
  // WBT ≈ T * atan(0.151977*(RH+8.313659)^0.5) + atan(T+RH) - atan(RH-1.676331) + 0.00391838*(RH^1.5)*atan(0.023101*RH) - 4.686035
  // We don't have RH per day in forecast, so use maxTemp directly with a mortality model:
  // MMT (Minimum Mortality Temperature) for tropical: ~28–30°C. Excess risk above 35°C.

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
 * (forecast data doesn't include per-day CAPE, so we use description + pop to infer).
 */
function stormInstabilityScore(day: DailyForecastItem): { score: number; label: string } {
  const desc = day.description.toLowerCase();
  const pop = day.pop; // 0–1

  let score = 0;
  let label = '';

  // Identify storm/convective keywords
  const extremeStorm = /(thunder|storm|tornado|cyclone|hurricane|typhoon|hail|blizzard)/i.test(desc);
  const severeWeather = /(heavy|severe|violent|extreme|squall)/i.test(desc);
  const moderateWeather = /(shower|overcast|rain|snow|sleet|fog|freezing rain)/i.test(desc);

  if (extremeStorm) {
    // Log-scaled precipitation probability amplifier (Bayesian: both cues raise confidence)
    const popAmp = 1 + Math.log1p(pop * 5) * 0.5;  // 1.0 → ~1.9 amplifier
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
 * Sigmoid-like curve — exponential increase above flood threshold.
 */
function floodRiskScore(day: DailyForecastItem): { score: number; label: string } {
  const precip = day.precipitationSum ?? 0;
  const pop = day.pop;

  if (precip === 0 && pop < 0.4) return { score: 0, label: '' };

  // Bayesian expected precipitation: E[P] = pop × precipitationSum
  // This reduces uncertainty: high pop + high precip = high confidence
  const expectedPrecip = pop * precip;

  // Sigmoid-like score: rapid increase above 25mm (flash flood threshold)
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
 * Derived from description text since dailyForecast doesn't carry gusts per day.
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
 * When multiple domains fire together, the combined physiological burden is
 * non-linearly greater than individual risks.
 */
function synergyBonus(
  thermalS: number, stormS: number, floodS: number, windS: number
): number {
  const activeFactors = [thermalS > 8, stormS > 8, floodS > 8, windS > 8].filter(Boolean).length;
  if (activeFactors >= 3) return 10;  // 3+ simultaneous hazards
  if (activeFactors === 2) return 5;  // 2 simultaneous hazards
  return 0;
}

/**
 * DOMAIN 6 — Epistemic Uncertainty Penalty (0–10)
 * Forecast skill degrades with lead time. Apply a penalty that scales with
 * how far in the future the event is, reducing false alarms and over-alerting.
 *
 * Based on NWP ensemble spread research:
 * 0–2 days:  high confidence → penalty 0–2
 * 3–4 days:  moderate → penalty 3–5
 * 5–7 days:  lower confidence → penalty 6–10
 */
function uncertaintyPenalty(hoursUntil: number): number {
  if (hoursUntil <= 48)  return Math.floor(hoursUntil / 24) * 1;   // 0–2
  if (hoursUntil <= 96)  return 3 + Math.floor((hoursUntil - 48) / 24) * 1;  // 3–4
  return Math.min(10, 5 + Math.floor((hoursUntil - 96) / 24) * 1.5); // 5–7d
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

    // Skip past events and beyond lead-time window
    if (hoursUntil < 1 || hoursUntil > leadTimeHours) continue;

    // Run all scoring domains
    const { score: thermalScore, label: thermalLabel }  = thermalStressScore(day);
    const { score: stormScore,  label: stormLabel }     = stormInstabilityScore(day);
    const { score: floodScore,  label: floodLabel }     = floodRiskScore(day);
    const { score: windScore,   label: windLabel }      = windDamageScore(day);
    const synergy = synergyBonus(thermalScore, stormScore, floodScore, windScore);
    const uncertainty = uncertaintyPenalty(hoursUntil);

    const rawScore = thermalScore + stormScore + floodScore + windScore + synergy;
    const totalScore = Math.max(0, Math.min(100, rawScore - uncertainty));

    if (totalScore < 30) continue; // Skip genuinely low-risk days early

    // Determine primary factor and summary
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

  // Sort highest score first
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

  const subject = `🚨 BioSentinel: ${top.severityLabel} Weather Alert — ${weather.city} in ~${top.hoursUntil}h`;

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
      ${c.thermalScore > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;width:160px;">🌡 Thermal Stress</td><td style="padding:6px 8px;font-weight:700;">${c.thermalScore}/25</td></tr>` : ''}
      ${c.stormScore  > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">⛈ Storm Instability</td><td style="padding:6px 8px;font-weight:700;">${c.stormScore}/25</td></tr>` : ''}
      ${c.floodScore  > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">🌊 Flood Risk</td><td style="padding:6px 8px;font-weight:700;">${c.floodScore}/20</td></tr>` : ''}
      ${c.windScore   > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">💨 Wind Damage</td><td style="padding:6px 8px;font-weight:700;">${c.windScore}/20</td></tr>` : ''}
      ${c.synergy     > 0 ? `<tr><td style="padding:6px 8px;color:#64748b;">⚡ Synergy Bonus</td><td style="padding:6px 8px;font-weight:700;">+${c.synergy}</td></tr>` : ''}
      <tr style="border-top:1px solid #e2e8f0;"><td style="padding:6px 8px;color:#64748b;">📊 Uncertainty Penalty</td><td style="padding:6px 8px;font-weight:700;color:#dc2626;">-${c.uncertaintyPenalty}</td></tr>
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
        ⚠ Severe Weather Forecast — Action Required
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
          <span style="color:#dc2626;font-size:16px;flex-shrink:0;">🚨</span>
          <span style="font-size:13px;color:#374151;">Monitor official emergency broadcasts continuously. Prepare emergency kit and evacuation plan.</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="color:#dc2626;font-size:16px;flex-shrink:0;">🏥</span>
          <span style="font-size:13px;color:#374151;">Identify nearest medical facility and keep emergency contacts accessible.</span>
        </div>` : ''}
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">📦</span>
          <span style="font-size:13px;color:#374151;">Stock at least 72h of water, food, medications, and essential supplies.</span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">📱</span>
          <span style="font-size:13px;color:#374151;">Keep all devices charged. Enable location sharing with trusted contacts.</span>
        </div>
        ${top.floodScore > 10 ? `
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">🌊</span>
          <span style="font-size:13px;color:#374151;">Avoid low-lying areas, underpasses, and flood-prone zones. Move valuables to higher ground.</span>
        </div>` : ''}
        ${top.thermalScore > 14 ? `
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
          <span style="font-size:16px;flex-shrink:0;">🌡</span>
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

// ─── SEND EMAIL VIA SMTPJS ────────────────────────────────────────────────────
async function sendViaSmtpJs(
  to: string,
  from: string,
  password: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (typeof Email === 'undefined') {
    console.error('[ForecastEmail] smtpjs library not loaded. Check index.html script tag.');
    return false;
  }
  try {
    const result = await Email.send({
      Host: SMTP_SEND_HOST,
      Username: from,
      Password: password,
      Port: 587,
      To: to,
      From: from,
      Subject: subject,
      Body: html,
    });
    const ok = result === 'OK';
    if (!ok) console.warn('[ForecastEmail] smtpjs send result:', result);
    return ok;
  } catch (err) {
    console.error('[ForecastEmail] smtpjs error:', err);
    return false;
  }
}

// ─── PUBLIC ENTRY POINT ────────────────────────────────────────────────────────
/**
 * Call this after every weather refresh.
 * Analyses the forecast, filters actionable candidates, deduplicates,
 * provisions the smtp.dev sender if needed, and fires emails.
 *
 * Returns updated sentAlertKeys (caller must persist to settings).
 */
export async function checkAndSendForecastEmails(
  weather: WeatherData,
  settings: EmailAlertSettings,
  onSettingsUpdate: (patch: Partial<EmailAlertSettings>) => void
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

  // --- 3. Deduplicate ---
  const alreadySent = new Set(settings.sentAlertKeys);
  const fresh = filtered.filter(c => !alreadySent.has(c.alertKey));

  if (fresh.length === 0) {
    console.log('[ForecastEmail] All candidates already notified — dedup suppressed.');
    return;
  }

  // --- 4. Provision sender account (if not yet done) ---
  let senderEmail = settings.senderEmail;
  let senderPassword = settings.senderPassword;

  if (!senderEmail || !senderPassword) {
    const creds = await provisionSenderAccount(settings);
    if (!creds) {
      console.error('[ForecastEmail] Could not provision sender — aborting.');
      return;
    }
    senderEmail = creds.email;
    senderPassword = creds.password;
    onSettingsUpdate({ senderEmail, senderPassword });
  }

  // --- 5. Build and send email ---
  const { subject, html } = buildEmailHtml(fresh, weather);

  console.log(`[ForecastEmail] Sending alert to ${settings.recipientEmail} — ${fresh.length} event(s), top score ${fresh[0].totalScore}`);

  const sent = await sendViaSmtpJs(
    settings.recipientEmail,
    senderEmail,
    senderPassword,
    subject,
    html
  );

  if (sent) {
    const newKeys = [...settings.sentAlertKeys, ...fresh.map(c => c.alertKey)];
    onSettingsUpdate({ sentAlertKeys: newKeys });
    console.log('[ForecastEmail] Email sent successfully. Keys recorded:', fresh.map(c => c.alertKey));
  }
}

/** Send a test email immediately (ignores dedup, uses low score threshold) */
export async function sendTestEmail(
  weather: WeatherData | null,
  settings: EmailAlertSettings,
  onSettingsUpdate: (patch: Partial<EmailAlertSettings>) => void
): Promise<{ ok: boolean; message: string }> {
  if (!settings.recipientEmail) return { ok: false, message: 'Please enter a recipient email address.' };

  // Provision sender
  let senderEmail = settings.senderEmail;
  let senderPassword = settings.senderPassword;
  if (!senderEmail || !senderPassword) {
    const creds = await provisionSenderAccount(settings);
    if (!creds) return { ok: false, message: 'Failed to create smtp.dev sender account. Check your API key.' };
    senderEmail = creds.email;
    senderPassword = creds.password;
    onSettingsUpdate({ senderEmail, senderPassword });
  }

  // Build test email (use real forecast if available, otherwise placeholder)
  let subject = '🧪 BioSentinel Test — Email Alert System Active';
  let html: string;

  if (weather && weather.dailyForecast.length > 0) {
    const candidates = analyseForecastWindow(weather, 168); // 7 days for test
    if (candidates.length > 0) {
      const built = buildEmailHtml(candidates.slice(0, 3), weather);
      subject = `🧪 TEST: ${built.subject}`;
      html = built.html;
    } else {
      html = testPlaceholderHtml(settings.recipientEmail);
    }
  } else {
    html = testPlaceholderHtml(settings.recipientEmail);
  }

  const sent = await sendViaSmtpJs(settings.recipientEmail, senderEmail, senderPassword, subject, html);
  return sent
    ? { ok: true, message: `Test email sent to ${settings.recipientEmail}! Check your inbox.` }
    : { ok: false, message: 'SMTP send failed. Ensure the recipient is a valid smtp.dev address.' };
}

function testPlaceholderHtml(recipientEmail: string): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f172a;border-radius:20px;color:#e2e8f0;">
      <div style="font-size:11px;font-weight:800;letter-spacing:.15em;color:#14b8a6;text-transform:uppercase;">BioSentinel</div>
      <div style="font-size:22px;font-weight:900;margin:8px 0 20px;color:#fff;">Email Alert System Active ✅</div>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
        This test confirms that BioSentinel can successfully send severe weather alerts to
        <strong style="color:#14b8a6;">${recipientEmail}</strong>.<br><br>
        When severe conditions are detected in your forecast, a detailed alert will be sent here
        automatically — before the weather arrives.
      </p>
      <div style="margin-top:20px;padding:14px 18px;background:#1e293b;border-radius:12px;font-size:12px;color:#64748b;">
        Your email is used exclusively for severe weather alerts. No spam, no data sharing.
      </div>
    </div>`;
}
