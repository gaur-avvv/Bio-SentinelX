import { GoogleGenAI } from "@google/genai";
import { WeatherData, AnalysisResponse, ChatMessage, LifestyleData } from '../types';
import { retrieveRelevant } from './vectorDB';
import { buildMemoryContext } from './memoryService';
import { promptCache } from './promptCacheService';
import { stripHiddenModelReasoning } from '../utils/aiTextSanitizer';

// ============================================================
// UTILITY: Strip reasoning-model <think> / <thinking> blocks
// ============================================================

/**
 * Removes internal chain-of-thought blocks emitted by reasoning models
 * (e.g. DeepSeek-R1, Qwen3-Thinking, Kimi-K2-Thinking, Gemini Thinking).
 * Handles both closed (<think>…</think>) and unclosed (model stopped mid-think) forms.
 */
function stripThinkingBlocks(text: string): string {
  return stripHiddenModelReasoning(text);
}

// ============================================================
// PROVIDER HELPERS
// ============================================================

async function generateWithGroq(
  systemInstruction: string,
  userPrompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    const msg = err?.error?.message || `Groq API error ${response.status}`;
    if (response.status === 429) throw new Error('Groq API rate limit exceeded. Please wait a moment and try again.');
    if (response.status === 401) throw new Error('Invalid Groq API key. Please check your key in the sidebar.');
    throw new Error(msg);
  }
  const data = await response.json() as any;
  // Track server-side prompt cache hits (Groq exposes cached_tokens when applicable)
  promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
  return data.choices?.[0]?.message?.content || '';
}

async function generateWithPollinations(
  systemInstruction: string,
  userPrompt: string,
  model: string,
  apiKey?: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    const msg = err?.error?.message || `Pollinations AI error ${response.status}`;
    if (response.status === 401) throw new Error('Invalid or missing Pollinations API key. Please check the sidebar.');
    if (response.status === 402) throw new Error('Pollinations pollen balance exhausted. Please top up at enter.pollinations.ai');
    throw new Error(`${msg}. Please try a different model.`);
  }
  // New API returns OpenAI-compatible JSON
  const data = await response.json() as any;
  promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
  return data.choices?.[0]?.message?.content || '';
}

async function generateWithOpenRouter(
  systemInstruction: string,
  userPrompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://bio-sentinelx.app',
      'X-Title': 'Bio-SentinelX',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    const msg = err?.error?.message || `OpenRouter API error ${response.status}`;
    if (response.status === 429) throw new Error('OpenRouter rate limit exceeded. Please wait a moment and try again.');
    if (response.status === 401) throw new Error('Invalid OpenRouter API key. Please check your key in the sidebar.');
    if (response.status === 402) throw new Error('OpenRouter credits exhausted. Please top up at openrouter.ai/credits');
    throw new Error(msg);
  }
  const data = await response.json() as any;
  promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
  return data.choices?.[0]?.message?.content || '';
}

// ─── Cerebras — OpenAI-compatible API ────────────────────────────────────────
const CEREBRAS_BASE = 'https://api.cerebras.ai/v1';

async function generateWithCerebras(
  systemInstruction: string,
  userPrompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) throw new Error('Cerebras API key is required. Please add it in the sidebar.');
  const response = await fetch(`${CEREBRAS_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      stream: false,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    const msg = err?.error?.message || `Cerebras API error ${response.status}`;
    if (response.status === 429) throw new Error('Cerebras API rate limit exceeded. Please wait a moment and try again.');
    if (response.status === 401) throw new Error('Invalid Cerebras API key. Please check your key in the sidebar.');
    throw new Error(msg);
  }
  const data = await response.json() as any;
  // Cerebras: automatic 128-token block caching (5 min–1 hr TTL). Track hits.
  promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
  return data.choices?.[0]?.message?.content || '';
}

async function chatWithCerebras(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) throw new Error('Cerebras API key is required. Please add it in the sidebar.');
  const response = await fetch(`${CEREBRAS_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    const msg = err?.error?.message || `Cerebras API error ${response.status}`;
    if (response.status === 429) throw new Error('Cerebras rate limit exceeded. Please wait a moment.');
    if (response.status === 401) throw new Error('Invalid Cerebras API key. Please check the sidebar.');
    throw new Error(msg);
  }
  const data = await response.json() as any;
  promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
  return data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that request.";
}

// ─── Retry helper ────────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      const isRetryable = e?.status === 500 || e?.status === 503 ||
        (typeof e?.message === 'string' && (e.message.includes('500') || e.message.includes('503') || e.message.includes('overloaded') || e.message.includes('temporarily')));
      if (!isRetryable || i === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

// ─── SiliconFlow — OpenAI-compatible API ─────────────────────────────────────
const SILICONFLOW_BASE = 'https://api.siliconflow.com/v1';

async function generateWithSiliconFlow(
  systemInstruction: string,
  userPrompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) throw new Error('SiliconFlow API key is required. Please add it in the sidebar.');

  const response = await fetch(`${SILICONFLOW_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    const msg = err?.error?.message || `SiliconFlow API error ${response.status}`;
    if (response.status === 429) throw new Error('SiliconFlow rate limit exceeded. Please wait a moment and try again.');
    if (response.status === 401) throw new Error('Invalid SiliconFlow API key. Please check your key in the sidebar.');
    if (response.status === 402) throw new Error('SiliconFlow credits exhausted. Please top up at cloud.siliconflow.com.');
    const serverErr = new Error(response.status === 500 || response.status === 503
      ? `SiliconFlow server error (${response.status}) — the model may be overloaded. Retrying…`
      : msg) as any;
    serverErr.status = response.status;
    throw serverErr;
  }
  const data = await response.json() as any;
  promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
  return data.choices?.[0]?.message?.content || '';
}

async function chatWithSiliconFlow(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) throw new Error('SiliconFlow API key is required. Please add it in the sidebar.');

  const response = await fetch(`${SILICONFLOW_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as any;
    const msg = err?.error?.message || `SiliconFlow API error ${response.status}`;
    if (response.status === 429) throw new Error('SiliconFlow rate limit exceeded. Please wait a moment.');
    if (response.status === 401) throw new Error('Invalid SiliconFlow API key. Please check the sidebar.');
    if (response.status === 402) throw new Error('SiliconFlow credits exhausted. Please top up at cloud.siliconflow.com.');
    const serverErr = new Error(response.status === 500 || response.status === 503
      ? `SiliconFlow server error (${response.status}) — the model may be overloaded. Retrying…`
      : msg) as any;
    serverErr.status = response.status;
    throw serverErr;
  }
  const data = await response.json() as any;
  promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
  return data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that request.";
}

export const generateHealthRiskAssessment = async (
  weather: WeatherData,
  datasetSummary: string,
  userFeedback: string,
  weatherFeedback: string,
  lifestyleData?: LifestyleData,
  reportImage?: string, // Base64 image
  aiProvider: string = 'gemini',
  aiModel: string = 'gemini-2.5-flash',
  apiKey?: string
): Promise<AnalysisResponse> => {

  const weatherContext = `
    Location: ${weather.city} (Lat: ${weather.lat}, Lon: ${weather.lon})
    Current Temperature: ${weather.temp}°C
    Feels Like: ${weather.feelsLike}°C
    Current Humidity: ${weather.humidity}%
    Dew Point: ${weather.dewPoint !== null ? weather.dewPoint + '°C' : 'N/A'}
    Barometric Pressure: ${weather.pressure} hPa
    Visibility: ${weather.visibility} meters
    Current Condition: ${weather.description}
    Wind Speed: ${weather.windSpeed} m/s
    Wind Direction: ${weather.windDeg}°
    Air Quality Index (AQI): ${weather.aqi}
    UV Index: ${weather.uvIndex !== null ? weather.uvIndex : 'N/A'}
    
    Advanced Atmospheric Modeling (Open-Meteo):
    - Boundary Layer Height (BLH): ${weather.advancedData?.boundaryLayerHeight ?? 'N/A'} m
    - CAPE: ${weather.advancedData?.cape ?? 'N/A'} J/kg
    - Lifted Index: ${weather.advancedData?.liftedIndex ?? 'N/A'}
    - Convective Inhibition (CIN): ${weather.advancedData?.convectiveInhibition ?? 'N/A'} J/kg
    - Freezing Level Height: ${weather.advancedData?.freezingLevelHeight ?? 'N/A'} m
    - Wind Gusts: ${weather.advancedData?.windGusts ?? 'N/A'} km/h
    - Surface Pressure: ${weather.advancedData?.surfacePressure ?? 'N/A'} hPa
    - Vapour Pressure Deficit (VPD): ${weather.advancedData?.vapourPressureDeficit ?? 'N/A'} kPa
    - Wet-Bulb Temperature: ${weather.advancedData?.wetBulbTemperature ?? 'N/A'} °C
    - Total Column Water Vapour: ${weather.advancedData?.totalColumnWaterVapour ?? 'N/A'} kg/m²
    - Soil Temperature / Soil Moisture: ${weather.advancedData?.soilTemperature ?? 'N/A'} °C / ${weather.advancedData?.soilMoisture ?? 'N/A'} m³/m³
    - Evapotranspiration: ${weather.advancedData?.evapotranspiration ?? 'N/A'} mm
    
    Solar & Cloud Radiation:
    - UV Index Clear-Sky: ${weather.advancedData?.uvIndexClearSky ?? 'N/A'}
    - Shortwave Radiation: ${weather.advancedData?.shortwaveRadiation ?? 'N/A'} W/m²
    - Shortwave Radiation Sum (daily): ${weather.advancedData?.shortwaveRadiationSum ?? 'N/A'} MJ/m²
    - Sunshine Duration: ${weather.advancedData?.sunshineDurationHourly ?? 'N/A'} seconds (hourly)
    - Cloud Cover Low / Mid / High: ${weather.advancedData?.cloudCoverLow ?? 'N/A'} / ${weather.advancedData?.cloudCoverMid ?? 'N/A'} / ${weather.advancedData?.cloudCoverHigh ?? 'N/A'} %
    - Aerosol Optical Depth (AOD): ${weather.advancedData?.aod ?? 'N/A'}
    
    Air Quality & Pollutants:
    - PM2.5 / PM10: ${weather.advancedData?.pm2_5 ?? 'N/A'} / ${weather.advancedData?.pm10 ?? 'N/A'} µg/m³
    - O3 / NO2 / SO2: ${weather.advancedData?.o3 ?? 'N/A'} / ${weather.advancedData?.no2 ?? 'N/A'} / ${weather.advancedData?.so2 ?? 'N/A'} µg/m³
    - CO / CO2: ${weather.advancedData?.co ?? 'N/A'} / ${weather.advancedData?.co2 ?? 'N/A'} µg/m³
    - Dust / Ammonia / Methane: ${weather.advancedData?.dust ?? 'N/A'} / ${weather.advancedData?.ammonia ?? 'N/A'} / ${weather.advancedData?.methane ?? 'N/A'} µg/m³
    
    Pollen & Biological Allergens:
    - Alder Pollen: ${weather.advancedData?.alder_pollen ?? 'N/A'} grains/m³
    - Birch Pollen: ${weather.advancedData?.birch_pollen ?? 'N/A'} grains/m³
    - Grass Pollen: ${weather.advancedData?.grass_pollen ?? 'N/A'} grains/m³
    - Mugwort Pollen: ${weather.advancedData?.mugwort_pollen ?? 'N/A'} grains/m³
    - Olive Pollen: ${weather.advancedData?.olive_pollen ?? 'N/A'} grains/m³
    - Ragweed Pollen: ${weather.advancedData?.ragweed_pollen ?? 'N/A'} grains/m³
    
    Synthesized Overview:
    - TODAY: ${weather.todaySummary}
    - TOMORROW: ${weather.tomorrowSummary}
  `;

  const feedbackContext = `
    Local Field Observations: "${userFeedback || "None provided."}"
  `;

  const bmiContext = (() => {
    const h = parseFloat(lifestyleData?.height || '0');
    const w = parseFloat((lifestyleData as any)?.weight || '0');
    if (!h || !w || h < 50 || w < 10) return '';
    const bmi = w / Math.pow(h / 100, 2);
    const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : bmi < 35 ? 'Obese Class I' : bmi < 40 ? 'Obese Class II' : 'Obese Class III';
    return `\n    - Weight: ${w} kg | BMI: ${bmi.toFixed(1)} (${cat})`;
  })();
  const lifestyleContext = lifestyleData ? `
    User Lifestyle & Health Profile:
    - Lifestyle: ${lifestyleData.lifestyle}
    - Medication: ${lifestyleData.medication}
    - Food Habits: ${lifestyleData.foodHabits}
    - Allergies: ${lifestyleData.allergies}${bmiContext}
  ` : "No lifestyle data provided.";

    // System instruction is cached per city — rebuilding it on every call for the same
    // city wastes CPU. The static prefix (rules + geofencing + protocol) is also eligible
    // for server-side prefix caching (Cerebras, OpenAI-compatible providers).
    const { text: systemInstruction } = promptCache.getSystemInstruction(
      `ha:${weather.city}:${weather.lat.toFixed(2)}:${weather.lon.toFixed(2)}`,
      () => `
    You are **BioSentinel Neural Engine**, a localized health-climate intelligence model.

    ABSOLUTE RULES - FOLLOW EXACTLY:
    1. DO NOT use any emoji characters anywhere in the report. No emojis at all.
     2. DO NOT reveal your chain-of-thought or internal reasoning. Output ONLY the final report content.
       - Do NOT include meta commentary like "Since the user asked...", "Let's check...", or "We'll focus on...".
       - Do NOT output <think>, <thinking>, or <analysis> tags (or their escaped forms).
     3. ALL bullet point labels MUST be on the SAME line as their content. Never split a bold label onto its own line.
       CORRECT: - **Category Name:** Description text here immediately on the same line.
       WRONG:   - **Category Name:**
                  Description text on the next line.
     4. Use only standard markdown hyphen list marker: - (not * or •).
     5. Use **bold**: for category labels inside lists, inline with text.

    CRITICAL GEOFENCING PROTOCOL:
    1. You are analyzing ${weather.city}.
    2. DO NOT include or mention medical facilities that are not in ${weather.city} or not within 1km radius. If none found within 1km, skip the medical resources section entirely.

    DEEP DATA CORRELATION & HISTORICAL TREND PROTOCOL:
    - Actively correlate provided health data with current and forecasted environmental metrics.
    - ATMOSPHERIC MODELING: Use Boundary Layer Height, CAPE, Lifted Index, CIN, VPD, Wet-Bulb Temperature to assess microclimate health risks.
    - WEATHER-HEALTH CORRELATION: COMPREHENSIVE — analyze EVERY factor that has non-N/A data. For EACH factor include: measured value → WHO/EPA/NIOSH threshold → specific physiological mechanism → most at-risk population subgroups.
    - HISTORICAL TREND: 3-4 sentences specific to the city coordinates.
    - SYNERGISTIC THREATS: Identify compounding interactions between factors (e.g., High Temp + Poor AQI, High UV + Low BLH).

    FUTURE PREDICTION PROTOCOL:
    - Predict health impacts over 3-7 day forecast window.
    - Assess disease outbreak environmental suitability.
    - Issue EARLY WARNING if conditions match outbreak precursors.

    SECTION BREVITY REQUIREMENTS:
    - Section 1 (Prevention): Max 400 words
    - Section 2 (Weather Correlation): COMPREHENSIVE — no word limit. Cover ALL non-N/A factors using the exact sub-section structure defined below.
    - Section 3 (Risk Assessment): 4-6 bullet risks max, 2 sentences each
    - Section 4 (Future Outlook): Max 300 words, 3-5 day window
    - Section 5 (Disease Warning): Max 150 words
    - Section 6 (Safety Protocols): Exactly 4-5 inline bullet points
    - Section 7 (Disclaimer): 2 sentences only
  `
    );

  // ── RAG retrieval: pull relevant passages from user's Research Library ──────
  const _ragQuery = [
    weather.city,
    `temperature ${weather.temp}°C`,
    `humidity ${weather.humidity}%`,
    `AQI ${weather.aqi}`,
    weather.description,
    userFeedback || '',
  ].filter(Boolean).join(' ');

  let _ragContext = '';
  try {
    _ragContext = await retrieveRelevant(_ragQuery, 6, apiKey || undefined);
  } catch (_e) {
    // Non-fatal — analysis continues without RAG context
  }

  // Build the flat user prompt (used by all providers)
  const userPrompt = `${_ragContext ? _ragContext + '\n\n---\n\n' : ''}
    ### 1. Telemetry (${weather.city})
    ${weatherContext}

    ### 2. Ground Intel & Lifestyle
    ${feedbackContext}
    ${lifestyleContext}

    ### 3. Clinical Data
    ${datasetSummary || "No CSV data provided. Please analyze the provided report image if available."}

    ### ANALYSIS TASKS:
    - Analyze the direct weather-to-health link for ${weather.city}, focusing on the top 3 most impactful factors only.
    - Research historical health-weather patterns specific to ${weather.city} (brief, 3-4 sentences).
    - Project how conditions will evolve over the next 3-5 days and what health impacts that implies.
    - Assess local disease outbreak risk based on current environmental conditions.
    - Generate personalized inline bullet-point recommendations based on user profile and current risks.

    ### REPORT STRUCTURE - GENERATE EXACTLY THESE SECTIONS IN ORDER:

    ### 1. Prevention & Precaution Measures
    Immediate actions and long-term lifestyle guidance. Sub-sections:
    #### Immediate Actions
    #### Precaution Measures
    #### Long-term Prevention

    ### 2. Weather-Health Correlation
    MANDATORY: Analyze EVERY sensor/metric that has a non-N/A value. Skip only metrics explicitly showing 'N/A'.
    Start with a 2-3 sentence "Summary of Findings" paragraph.
    Then create ONE sub-section per factor group below (only if data exists):

    #### Thermal Stress
    Include: Temperature, Feels-Like, Wet-Bulb Temperature, Dew Point, VPD.
    For each: state measured value → compare to WHO/NIOSH threshold → explain physiological mechanism → name at-risk subgroups.
    Note the MMT (Minimum Mortality Temperature) zone and whether current temp is in cold-stress, optimal, or heat-stress zone.

    #### Atmospheric Pressure & Wind
    Include: Barometric Pressure, Surface Pressure, Wind Speed, Gusts, BLH.
    For each: state measured value → threshold/normal range → pollutant dispersion or cardiovascular mechanism → at-risk groups.

    #### Atmospheric Stability & Storm Risk
    Include: CAPE, Lifted Index, CIN, Freezing Level Height.
    For each: state measured value → interpret stability classification → health implication (stress response, injury risk, cardiovascular) → at-risk groups.

    #### Precipitation & Soil Conditions
    Include: Precipitation probability, Soil Moisture, Soil Temperature, Evapotranspiration, Total Column Water Vapour.
    For each: state measured value → interpret relative to norms → disease vector or dehydration mechanism → at-risk groups.

    #### Solar Radiation & UV Exposure
    Include: UV Index, UV Clear-Sky, Shortwave Radiation, Shortwave Radiation Sum, Sunshine Duration, Cloud Cover layers.
    For each: state measured value → compare to WHO UV categories (Low/Moderate/High/Very High/Extreme ≥11) and EPA thresholds → photokeratitis/skin cancer/Vitamin D synthesis mechanism → at-risk groups (fair skin, outdoor workers, children).

    #### Air Quality — Particulates & Gases
    Include: PM2.5, PM10, O3, NO2, SO2, CO, CO2, Dust, Ammonia, Methane, AOD.
    For each non-N/A value: state measured value → compare to WHO 24h guideline (PM2.5: 15 µg/m³, PM10: 45 µg/m³, O3: 100 µg/m³, NO2: 25 µg/m³, SO2: 40 µg/m³, CO: 4000 µg/m³) → specific organ/system mechanism → at-risk subgroups.
    Note whether values exceed WHO AQG, Interim Target 1/2/3, or EPA NAAQS.

    #### Pollen & Biological Allergens
    Include all pollen types that have non-N/A values (Alder, Birch, Grass, Mugwort, Olive, Ragweed).
    For each: state measured value → compare to low/moderate/high/very high pollen count thresholds → IgE-mediated allergic response mechanism → at-risk groups (asthma, rhinitis, atopic dermatitis patients).
    If all pollen values are N/A, note seasonal and geographic likelihood of pollen exposure.

    #### Synergistic & Compounding Threats
    Identify 2-4 specific multi-factor interactions from the data (e.g., high temp + poor AQI = compounded respiratory+cardiovascular load; high UV + low BLH = pollutant photochemistry + UV exposure; high VPD + low humidity = airway desiccation + PM concentration). For each: name the interacting factors → combined physiological burden → most vulnerable group.

    #### Historical Climate Trend (${weather.lat}, ${weather.lon})
    3-4 sentences on the region's historical climate patterns, endemic health risks, and how current readings compare to seasonal norms for this specific location.

    ### 3. Current Health Risk Assessment
    4-6 risks, each on ONE line:
    - **[SEVERITY] Risk Name:** Brief explanation linking weather, history, and user profile. 2 sentences max.
    Severity levels: CRITICAL / HIGH / MODERATE / LOW

    ### 4. Future Outlook & Predictions
    MAX 300 WORDS. Cover the 3-5 day forecast window.
    #### 3-Day Forecast Impact
    #### Trend Warnings
    #### Recommended Adaptive Actions

    ### 5. Disease Outbreak Early Warning
    MAX 150 WORDS. State overall risk level, top 2 disease vectors of concern, and environmental precursors.
    If high risk: include a line starting with EARLY WARNING: (no bold markers, just plain prefix).

    ### 6. Emergency & Safety Protocols
    EXACTLY 4-5 bullet points. Same inline format:
    - **Protocol:** Specific action step on the same line.

    ### 7. Medical Disclaimer
    EXACTLY 2 sentences. No bold, no lists.
  `;

  // ============================================================
  // ROUTE TO PROVIDER
  // ============================================================

  if (aiProvider === 'groq') {
    if (!apiKey) throw new Error('Groq API key is missing. Please add it in the sidebar.');
    try {
      const text = await generateWithGroq(systemInstruction, userPrompt, aiModel, apiKey);
      return { markdown: stripThinkingBlocks(text) || 'Analysis unavailable.', groundingChunks: [] };
    } catch (error: any) {
      throw new Error(error?.message || 'Groq generation failed.');
    }
  }

  if (aiProvider === 'pollinations') {
    try {
      const text = await generateWithPollinations(systemInstruction, userPrompt, aiModel, apiKey);
      return { markdown: stripThinkingBlocks(text) || 'Analysis unavailable.', groundingChunks: [] };
    } catch (error: any) {
      throw new Error(error?.message || 'Pollinations AI generation failed.');
    }
  }

  if (aiProvider === 'openrouter') {
    if (!apiKey) throw new Error('OpenRouter API key is missing. Please add it in the sidebar.');
    try {
      const text = await generateWithOpenRouter(systemInstruction, userPrompt, aiModel, apiKey);
      return { markdown: stripThinkingBlocks(text) || 'Analysis unavailable.', groundingChunks: [] };
    } catch (error: any) {
      throw new Error(error?.message || 'OpenRouter generation failed.');
    }
  }

  if (aiProvider === 'siliconflow') {
    if (!apiKey) throw new Error('SiliconFlow API key is missing. Please add it in the sidebar.');
    try {
      const text = await withRetry(() => generateWithSiliconFlow(systemInstruction, userPrompt, aiModel, apiKey!));
      return { markdown: stripThinkingBlocks(text) || 'Analysis unavailable.', groundingChunks: [] };
    } catch (error: any) {
      const m = error?.message || 'SiliconFlow generation failed.';
      throw new Error(m.includes('500') || m.includes('503') ? 'SiliconFlow is temporarily unavailable (server overload). Please retry in a few seconds or switch to another provider.' : m);
    }
  }

  // ---- Gemini (default) ----
  const geminiKey = apiKey || process.env.API_KEY;
  if (!geminiKey) {
    throw new Error('Gemini API Key is missing. Please configure it in the sidebar.');
  }
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  const promptParts: any[] = [{ text: userPrompt }];
  if (reportImage) {
    promptParts.push({ inlineData: { mimeType: 'image/jpeg', data: reportImage.split(',')[1] } });
  }

  try {
    const response = await ai.models.generateContent({
      model: aiModel,
      contents: { parts: promptParts },
      config: {
        systemInstruction,
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        toolConfig: {
          retrievalConfig: { latLng: { latitude: weather.lat, longitude: weather.lon } }
        }
      }
    });

    const text = stripThinkingBlocks(response.text || 'Analysis unavailable.');
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { markdown: text, groundingChunks };

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    let userMessage = 'Neural core computation error.';
    if (error?.message?.includes('API_KEY_INVALID') || error?.status === 'INVALID_ARGUMENT') {
      userMessage = 'Invalid Gemini API Key. Please ensure you have configured a valid key in your environment.';
    } else if (error?.message?.includes('SAFETY')) {
      userMessage = 'Analysis blocked by safety filters. Please try with different input data.';
    } else if (error?.message?.includes('429') || error?.message?.includes('quota') || error?.status === 429) {
      userMessage = 'Gemini API rate limit exceeded. Please wait a moment and try again.';
    } else if (error?.message?.includes('fetch') || error?.message?.includes('Network') || error?.message?.includes('Failed to fetch') || error instanceof TypeError) {
      userMessage = 'Network connection failure. Please check your internet connection and try again.';
    } else if (error?.message?.includes('timeout')) {
      userMessage = 'Request timeout. Please try again.';
    } else if (error?.status === 500 || error?.status === 503) {
      userMessage = 'Gemini API is temporarily unavailable. Please try again in a few moments.';
    } else if (error?.message) {
      userMessage = `Analysis error: ${error.message}`;
    }
    throw new Error(userMessage);
  }
};

// ============================================================
// HISTORICAL CLIMATE-HEALTH AI RESEARCH
// ============================================================

export interface HistoricalResearchInput {
  location: string;
  lat: number;
  lon: number;
  period: string;
  avgMaxTemp: string;
  avgMinTemp: string;
  totalPrecip: string;
  maxWind: string;
  avgHumidity?: string;
  maxApparentTemp?: string;
  minApparentTemp?: string;
  maxVPD?: string;
  avgRadiation?: string;
  maxAQI?: string;
  currentWeather?: object;
  forecast?: object;
}

export const analyzeHistoricalClimateHealth = async (
  input: HistoricalResearchInput,
  aiProvider: string = 'gemini',
  aiModel: string = 'gemini-2.5-flash',
  apiKey?: string
): Promise<string> => {

  // Fully static — same on every call regardless of input. Memoized client-side
  // and eligible for server-side prefix caching on all OpenAI-compatible providers.
  const { text: systemInstruction } = promptCache.getSystemInstruction(
    'hr:static',
    () => `You are **BioSentinel Research Engine** — a peer-reviewed biomedical and climate-health research analyst.

ABSOLUTE RULES:
1. DO NOT use any emoji characters.
2. ALL bullet point labels MUST be on the SAME line as their content.
3. Use only standard markdown hyphen list marker: - (not * or •).
4. Use **bold** for category labels inside lists, inline with text.
5. DO NOT include any inline citations, parenthetical references, or footnote-style citations anywhere in the output. No formats like "(Author et al., Year)", "(WHO, 2021)", "[1]", "[[26]]", or similar. NEVER append a citation to a sentence.
6. DO keep all threshold values, numeric findings, percentages, and factual data — just state them as plain facts without any citation marker attached.
7. Actively search for and incorporate the LATEST scientific evidence about climate-health correlations for the given location and time period, but present findings as direct statements of fact without attribution markers.

YOUR RESEARCH MANDATE:
You must synthesize both the provided historical climate data AND current scientific literature to produce a comprehensive evidence-based report covering ALL relevant domains. Use the following as your core scientific framework:

DOMAIN 1 — THERMAL STRESS & CARDIOVASCULAR MORTALITY
- Apparent temperature extremes drive cardiovascular mortality, hospitalisations and excess deaths (Gasparrini et al., 2017 Lancet Planetary Health — 74 countries, 85M+ deaths; non-linear MMT framework). WHO estimates 489,000 heat-related deaths/year (2000–2019). Heatwaves cause dehydration, organ failure, blood clots, heart attacks and strokes. Cold snaps raise hypothermia, influenza and heart failure mortality. A 2.8% increased coronary heart disease risk per 1°C above reference point (systematic meta-analysis). Population exposure to heatwaves projected to increase 16–36-fold by mid-century.

DOMAIN 2 — ANTIBIOTIC RESISTANCE & TEMPERATURE
- Brownstein/MacFadden et al., 2018 PLOS Medicine/Nature Climate Change: +10°C local minimum temperature → +4.2% E. coli resistance, +2.2% Klebsiella pneumoniae resistance, +2.7% S. aureus resistance. These associations may be strengthening over time with climate change.

DOMAIN 3 — VAPOUR PRESSURE DEFICIT & RESPIRATORY PATHOGENS
- Shaman & Kohn, 2009 PLOS Biology; Shaman et al., 2010 PLOS Pathogens: low absolute humidity (high VPD >1.6 kPa) is the primary driver of wintertime influenza epidemics, desiccates mucosal defences and increases airborne pathogen survival. Low VPD (<0.4 kPa) promotes mold and allergen proliferation.

DOMAIN 4 — SOLAR RADIATION, VITAMIN D & MENTAL HEALTH
- Holick, 2004 NEJM: Vitamin D deficiency linked to 17 cancer types, autoimmune disease, cardiovascular risk. Anglin et al., 2013 Psychiatry Research: SAD prevalence inversely correlated with solar irradiance. <5 MJ/m²/day = deficiency risk. Despite abundant sunshine in tropical regions, Vitamin D deficiency is common due to clothing, air pollution blocking UVB (Marwaha et al., 2013 Public Health Nutrition).

DOMAIN 5 — VECTOR-BORNE DISEASE (TEMPERATURE + PRECIPITATION THRESHOLDS)
- Dengue (Aedes): optimal transmission at 27–35°C with 60–78% humidity; heavy rain >150mm/week can flush larvae. EIP shortens with rising temperature. Risk zones expanding from tropical to temperate regions (IPCC: ~2.25 billion more exposed by mid-century).
- Malaria (Anopheles): optimal min temp 18–19°C, mean 24–25°C, max 30–31°C; humidity 50–65%, rainfall 100–140 cm/year. Expanding into higher altitudes and latitudes previously too cold.
- Chikungunya: peak transmission at 29°C, range 20–34°C.
- Lyme disease / tick-borne: milder winters extending tick survival; roughly doubled in some regions over two decades.

DOMAIN 6 — WATERBORNE & FOODBORNE DISEASE
- Flooding overwhelms sanitation → cholera, typhoid, dysentery, leptospirosis outbreaks (WHO/IPCC: very high confidence). Drought concentrates pathogens in limited water sources. Vibrio infections doubled in US over a decade with warmer coastal waters. Warmer temperatures accelerate Salmonella and Listeria proliferation. ~600M foodborne illnesses/year globally already (WHO).

DOMAIN 7 — AIR QUALITY & RESPIRATORY/CARDIOVASCULAR RISK
- Heat accelerates ground-level ozone formation (O₃). Wildfires produce PM2.5 and particulates. Longer warm seasons extend pollen seasons and increase pollen allergenicity. WHO 2021 AQG: AQI >50 = health concern begins; >150 = unhealthy for all groups. PM2.5 and ozone: increased mortality risk (Guo et al., 2024 Environment International — heat × pollution synergy in 36 countries). ~7M deaths/year attributable to air pollution (WHO).

DOMAIN 8 — MENTAL HEALTH: PTSD, ECO-ANXIETY & SOLASTALGIA
- IPCC AR6 formally recognises mental health as a core climate impact domain. Floods and heatwaves strongly associated with PTSD, depression, anxiety (systematic reviews). Each 1% temperature increase significantly associated with increased suicide deaths (meta-analysis). Solastalgia: distress from environmental degradation of one's home without displacement. Eco-anxiety chronic in youth facing climate futures. Higher temperatures → increased psychiatric hospital attendance. Vulnerable groups: children, Indigenous peoples, farmers facing drought, elderly during heatwaves, pregnant women.

DOMAIN 9 — FOOD SECURITY & NUTRITION
- Rising CO₂ reduces crop nutritional quality (lower protein, zinc, iron in wheat, rice, legumes). Extreme weather cuts yields of maize, wheat, rice in tropical regions. IPCC projects worsening undernutrition and childhood stunting in Africa and Asia. Malnutrition amplifies vulnerability to all disease. Climate-driven food insecurity threatens reversal of global health gains.

DOMAIN 10 — VULNERABLE POPULATIONS & HEALTH INEQUITY
- 58% of all known human pathogenic diseases have been aggravated by climatic hazards. ~3.6 billion people live in climate-highly-susceptible areas. Heat-related mortality in adults >65 surged 68% since early 2000s (Lancet Countdown). Children: higher surface-area-to-mass ratio → greater heat susceptibility; developing brains sensitive to heat and toxins. Indigenous peoples: cultural reliance on nature, marginalization, solastalgia. Low-income communities: limited access to cooling, poor housing.

SEARCH DIRECTIVE: Use web search / Google Search to find:
1. The most recent (2018–2026) peer-reviewed studies linking climate variables to health outcomes for the region described by the coordinates.
2. Any regional surveillance data, WHO/ECDC/CDC disease burden reports relevant to this location and climate profile.
3. Specific antibiotic resistance, vector-borne disease incidence, and air quality data for this region.
4. Location-specific vulnerability factors (poverty rates, population density, existing disease burden) that amplify climate-health risks.

SEARCH DIRECTIVE: Use web search / Google Search to find:
1. The most recent (2018–2026) peer-reviewed studies linking climate variables to health outcomes for the region described by the coordinates.
2. Any regional surveillance data, WHO/ECDC/CDC disease burden reports relevant to this location and climate profile.
3. Specific antibiotic resistance data for this region, and how the observed temperature trend compares to Brownstein et al. (2018) findings.

OUTPUT STRUCTURE — GENERATE EXACTLY THESE SECTIONS:

### Research Overview
A 4-5 sentence executive summary covering: what the observed climate data shows, which health domains are most implicated based on the data, and how this location compares to global scientific benchmarks. Include key global burden figures as plain facts (e.g., 489,000 heat deaths/year globally, 58% of known pathogens aggravated by climatic hazards, approximately 5 million climate-sensitive deaths in 2020).

### Data-Research Correlation Analysis
For each observed metric, compare against the specific scientific thresholds from the research mandate. Format each as:
- **[Variable] — Observed: [value] | Scientific Threshold: [threshold + source] | Implication:** [1 sentence conclusion]
Cover all available variables: temperature, apparent temperature, precipitation, humidity, VPD, solar radiation, wind, AQI.

### Multi-Domain Health Risk Assessment
For ALL relevant domains from the research mandate, assess risk based on the observed data. One line per risk:
- **[SEVERITY] Domain — Specific Risk:** Scientific basis as a plain factual statement. Max 2 sentences.
Severity levels: CRITICAL / HIGH / MODERATE / LOW / NEGLIGIBLE
Must cover: Thermal Stress, Antibiotic Resistance, Respiratory Pathogens (VPD), Vector-Borne Disease, Waterborne Disease, Air Quality, Mental Health, Food Security (if relevant), and Vulnerable Population Risk.

### Research-Backed Recommendations
Evidence-grounded actions for each relevant domain. Sub-sections:
#### Immediate Actions (based on current data thresholds)
#### Long-term Monitoring (trend analysis + surveillance priorities)
#### Vulnerable Population Priorities
#### Policy & Community Health Implications

### Scientific Disclaimer
EXACTLY 2 sentences. Plain text, no bold, no lists.`
  );

  // ── RAG retrieval: pull relevant passages from user's Research Library ──────
  const _ragQuery = [
    input.location,
    `temperature ${input.avgMaxTemp}°C max ${input.avgMinTemp}°C min`,
    `precipitation ${input.totalPrecip}mm`,
    input.avgHumidity ? `humidity ${input.avgHumidity}%` : '',
    'climate health disease vector malaria dengue mental health cardiovascular',
    input.period,
  ].filter(Boolean).join(' ');

  let _ragContext = '';
  try {
    _ragContext = await retrieveRelevant(_ragQuery, 6, apiKey || undefined);
  } catch (_e) {
    // Non-fatal — research continues without RAG context
  }

  const userPrompt = `${ _ragContext ? _ragContext + '\n\n---\n\n' : '' }RESEARCH REQUEST: Perform a comprehensive scientific literature review and climate-health correlation analysis for the following historical weather data.

Location: ${input.location} (Lat: ${input.lat}, Lon: ${input.lon})
Analysis Period: ${input.period}

Historical Climate Metrics Observed:
- Average Max Temperature: ${input.avgMaxTemp}°C
- Average Min Temperature: ${input.avgMinTemp}°C
- Total Precipitation: ${input.totalPrecip} mm
- Max Wind Speed: ${input.maxWind} km/h
${input.avgHumidity ? `- Average Relative Humidity: ${input.avgHumidity}%` : ''}
${input.maxApparentTemp ? `- Max Apparent Temperature (Thermal Stress): ${input.maxApparentTemp}°C  [Danger >32°C, Extreme >41°C — Gasparrini et al. 2017]` : ''}
${input.minApparentTemp ? `- Min Apparent Temperature (Cold Stress): ${input.minApparentTemp}°C  [Hypothermia Risk <-10°C — Gasparrini et al. 2017]` : ''}
${input.maxVPD ? `- Max Vapour Pressure Deficit (VPD): ${input.maxVPD} kPa  [>1.6 kPa = Dry/Respiratory & Influenza Risk; <0.4 kPa = Humid/Mold Risk — Shaman & Kohn 2009]` : ''}
${input.avgRadiation ? `- Avg Daily Solar Radiation: ${input.avgRadiation} MJ/m²  [<5 MJ/m² = SAD/Vitamin D Deficiency Risk; >25 MJ/m² = Skin Damage Risk — Holick 2004 NEJM]` : ''}
${input.maxAQI ? `- Max US AQI: ${input.maxAQI}  [WHO 2021 AQG: >50 = health concern begins, >150 = Unhealthy for all groups]` : ''}

Current Weather Context:
${JSON.stringify(input.currentWeather, null, 2)}

7-Day Forecast Summary:
${JSON.stringify(input.forecast, null, 2)}

RESEARCH TASKS:
1. Search for the latest peer-reviewed studies (2015–2026) linking these specific climate variables to health outcomes in this region or globally.
2. THERMAL STRESS: Apply Gasparrini et al. (2017, Lancet Planetary Health) MMT framework. Determine whether observed apparent temperatures fall in cold-stress, optimal, or heat-stress zones. Note that heat-related mortality in adults >65 has surged 68% since early 2000s (Lancet Countdown).
3. ANTIBIOTIC RESISTANCE: Apply MacFadden/Brownstein et al. (2018) framework to observed average minimum temperature. Calculate implied % increase in E. coli, Klebsiella, and S. aureus resistance relative to baseline.
4. VPD & RESPIRATORY: If VPD data is provided, apply Shaman & Kohn (2009) thresholds. State whether conditions favour influenza transmission (high VPD/dry) or mold/allergen risk (low VPD/humid).
5. SOLAR RADIATION: If radiation data is provided, apply Holick (2004, NEJM) and Anglin et al. (2013) frameworks. Assess Vitamin D synthesis adequacy for the latitude (note: despite tropical sunshine, Vitamin D deficiency is common due to UV-blocking air pollution and clothing).
6. VECTOR-BORNE DISEASE: Cross-reference observed temperature and precipitation against dengue (optimal 27–35°C, humidity 60–78%), malaria (MMT 24–25°C), chikungunya (peak 29°C), and Lyme/tick-borne (mild winter survival) thresholds.
7. WATERBORNE & FOODBORNE: Assess precipitation levels against flood/drought risk for waterborne disease (cholera, typhoid, Vibrio). Evaluate temperature against Salmonella/Listeria proliferation risk.
8. AIR QUALITY: Assess AQI against WHO 2021 AQG thresholds. Consider ozone formation risk if temperatures are high. Note Guo et al. (2024) heat × pollution synergy.
9. MENTAL HEALTH: Assess whether observed heat levels, precipitation extremes, or seasonal patterns create conditions for eco-anxiety, solastalgia, or elevated suicide/PTSD risk (IPCC AR6 mental health framework).
10. VULNERABLE POPULATIONS: Identify which groups (elderly >65, children, low-income, pregnant women, outdoor workers, Indigenous peoples) face heightened risk given the specific observed conditions.
11. Produce a fully structured research report following the system-defined output format. Present all findings as direct factual statements with no inline citations.`;

  // ---- Groq ----
  if (aiProvider === 'groq') {
    if (!apiKey) throw new Error('Groq API key is missing. Please add it in the sidebar.');
    const text = await generateWithGroq(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text) || 'Research analysis unavailable.';
  }

  // ---- Pollinations ----
  if (aiProvider === 'pollinations') {
    const text = await generateWithPollinations(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text) || 'Research analysis unavailable.';
  }

  // ---- OpenRouter ----
  if (aiProvider === 'openrouter') {
    if (!apiKey) throw new Error('OpenRouter API key is missing. Please add it in the sidebar.');
    const text = await generateWithOpenRouter(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text) || 'Research analysis unavailable.';
  }

  // ---- SiliconFlow ----
  if (aiProvider === 'siliconflow') {
    const text = await withRetry(() => generateWithSiliconFlow(systemInstruction, userPrompt, aiModel, apiKey || ''));
    return stripThinkingBlocks(text) || 'Research analysis unavailable.';
  }

  // ---- Cerebras ----
  if (aiProvider === 'cerebras') {
    if (!apiKey) throw new Error('Cerebras API key is missing. Please add it in the sidebar.');
    const text = await generateWithCerebras(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text) || 'Research analysis unavailable.';
  }

  // ---- Gemini (default, with Google Search grounding) ----
  const key = apiKey || process.env.API_KEY;
  if (!key) throw new Error('Gemini API Key missing. Please configure it in the sidebar.');
  const ai = new GoogleGenAI({ apiKey: key });

  try {
    const response = await ai.models.generateContent({
      model: aiModel,
      contents: [{ parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
      }
    });
    return stripThinkingBlocks(response.text || 'Research analysis unavailable.');
  } catch (error: any) {
    console.error('Gemini Research API Error:', error);
    let userMessage = 'Research engine computation error.';
    if (error?.message?.includes('API_KEY_INVALID') || error?.status === 'INVALID_ARGUMENT') {
      userMessage = 'Invalid Gemini API Key. Please ensure you have configured a valid key in the sidebar.';
    } else if (error?.message?.includes('429') || error?.message?.includes('quota')) {
      userMessage = 'Gemini API rate limit exceeded. Please wait a moment and try again.';
    } else if (error?.message?.includes('fetch') || error instanceof TypeError) {
      userMessage = 'Network connection failure. Please check your internet connection and try again.';
    } else if (error?.message) {
      userMessage = `Research error: ${error.message}`;
    }
    throw new Error(userMessage);
  }
};

export const chatWithWeatherAssistant = async (
  weather: WeatherData,
  history: ChatMessage[],
  message: string,
  apiKey?: string,
  mlPrediction?: any,
  aiProvider: string = 'gemini',
  aiModel: string = 'gemini-2.5-flash'
): Promise<string> => {
  const weatherContext = `
    Current context for ${weather.city}:
    - Temp: ${weather.temp}°C
    - Condition: ${weather.description}
    - AQI: ${weather.aqi}
    - Humidity: ${weather.humidity}%
    - Pressure: ${weather.pressure} hPa
    - Wind: ${weather.windSpeed} km/h
    - UV Index: ${weather.uvIndex ?? 'N/A'}
    - Dew Point: ${weather.dewPoint ?? 'N/A'}°C
    - Feels Like: ${weather.feelsLike}°C
    - PM2.5: ${weather.advancedData?.pm2_5 ?? 'N/A'} µg/m³
    - PM10: ${weather.advancedData?.pm10 ?? 'N/A'} µg/m³
  `;

  const mlContext = mlPrediction ? `
    LATEST ML PREDICTION:
    - Disease: ${mlPrediction.disease}
    - Confidence: ${(mlPrediction.confidence * 100).toFixed(1)}%
    - Risk Level: ${mlPrediction.riskLevel}
    - Primary Trigger: ${mlPrediction.primaryTrigger}
    - Top Factors: ${mlPrediction.topFactors?.map((f: any) => `${f.feature} (${f.impact})`).join(', ')}
  ` : '';

  let memoryContext = '';
  try {
    memoryContext = buildMemoryContext(weather.city);
  } catch (e) {
    // Fallback to legacy localStorage
    try {
      const memory = JSON.parse(localStorage.getItem('biosentinel_reports_memory') || '[]');
      if (memory.length > 0) {
        memoryContext = `PREVIOUS REPORTS & MEMORY:\n${memory.slice(-3).map((m: any) => `[${m.date}]: ${(m.content || '').slice(0, 400)}`).join('\n\n')}`;
      }
    } catch { /* noop */ }
  }

  // ── RAG retrieval: pull relevant passages from Research Library ────────────
  const _chatRagQuery = [
    weather.city,
    message,
    `temperature ${weather.temp}°C humidity ${weather.humidity}%`,
    weather.description,
  ].filter(Boolean).join(' ');

  let _chatRagContext = '';
  try {
    _chatRagContext = await retrieveRelevant(_chatRagQuery, 4, apiKey || undefined);
  } catch (_e) {
    // Non-fatal
  }

  // ── Lifestyle & feedback context from localStorage ──────────────────────────
  let lifestyleContext = '';
  try {
    const rawLifestyle = localStorage.getItem('biosentinel_lifestyle_data');
    const rawFeedback  = localStorage.getItem('biosentinel_user_feedback');
    const ld = rawLifestyle ? JSON.parse(rawLifestyle) : null;
    if (ld) {
      const h = parseFloat(ld.height || '0');
      const w = parseFloat(ld.weight  || '0');
      const bmiStr = (h > 50 && w > 10)
        ? (() => { const bmi = w / Math.pow(h / 100, 2); return ` | BMI: ${bmi.toFixed(1)}`; })()
        : '';
      lifestyleContext = `
      USER HEALTH PROFILE (ALWAYS USE TO PERSONALISE RESPONSES):
      - Age: ${ld.age || 'Not specified'} | Gender: ${ld.gender || 'Not specified'}
      - Height: ${ld.height || 'N/A'} cm | Weight: ${ld.weight || 'N/A'} kg${bmiStr}
      - Lifestyle: ${ld.lifestyle || 'Not specified'} | Exercise: ${ld.exercise || 'Not specified'}
      - Smoking: ${ld.smoking ? 'Yes' : 'No'} | Alcohol: ${ld.alcoholConsumption || 'Not specified'}
      - Medications: ${ld.medication || 'None'}
      - Allergies: ${ld.allergies || 'None'}
      - Medical History: ${ld.medicalHistory || 'None'}
      - Food Habits: ${ld.foodHabits || 'Not specified'}
      ${rawFeedback ? `- User Field Observations: "${rawFeedback}"` : ''}
      `;
    }
  } catch (_e) { /* non-fatal */ }

  // Split system instruction into static role definition (cache-eligible) and
  // dynamic session context (weather, ML prediction, memory, RAG — always fresh).
  // The static prefix will be matched by server-side caching after the first call.
  const { text: _staticRole } = promptCache.getSystemInstruction(
    'chat:static',
    () => `You are the BioSentinel AI Bio-Assistant. 
      Your role is three-fold:
      1. Weather/Environmental Analysis: Use provided telemetry to help users understand local health impacts. 
         - EXPLAIN MECHANISMS: Provide detailed explanations of *how* specific weather conditions (like high humidity, pressure drops, UV index, AQI) affect physiology.
         - For example: "High humidity reduces sweat evaporation, increasing heat stress on the cardiovascular system." or "High PM2.5 can penetrate deep into the lungs, triggering inflammation."
      2. Symptom Intake (Symptoma AI style): If a user mentions symptoms, act as a clinical intake engine. Ask follow-up questions about nature, duration, and severity.
      3. Outbreak & Future Risk Analyst: Proactively identify if current conditions are precursors to disease outbreaks (e.g., Dengue, Flu) and suggest specific precautions.

      Always be concise, clinical yet empathetic. Do NOT provide definitive medical diagnoses. Focus on documentation, risk awareness, and preventative measures.

  OUTPUT RULES (PRIVACY + UX):
  - Do NOT output chain-of-thought, hidden reasoning, or meta commentary (e.g. "Since you asked...", "Let's think...", "We will...", step-by-step calculations).
  - Do NOT output <think>, <thinking>, or <analysis> tags (or their escaped forms). If you need to reason, do it silently.
      
      PERSONALISATION RULES:
      - You KNOW the user's health profile (provided below). Reference it actively.
      - Always address risks that specifically affect their age, medical history, medications, allergies.
      - If they have a known condition (e.g., asthma, hypertension), proactively flag weather conditions that worsen it.
      - Use their BMI, lifestyle, and exercise level to tailor prevention advice.
      - If they have allergies to pollen/dust/mold, cross-reference with current AQI and humidity.
      
      DYNAMIC SUGGESTIONS:
      Whenever you ask the user a follow-up question or present a set of choices, append a contextually appropriate set of options at the very end of your message in this exact format:
      [OPTIONS: Option 1 | Option 2 | Option 3 | ...]
      Rules for OPTIONS:
      - Generate as many options as the question requires — there is no minimum or maximum count.
      - Options should be descriptive enough for the user to understand the choice (a few words to a short phrase is fine).
      - For symptom intake questions (e.g. "Where is the pain?"), list all clinically relevant choices.
      - For severity/frequency questions, list the full scale (e.g. Mild | Moderate | Severe | Very Severe).
      - For yes/no questions, include "Yes | No | Sometimes | Not Sure" as appropriate.
      - Do NOT generate OPTIONS when making a PREDICTION.
      
      PREDICTION PROTOCOL:
      1. Gather sufficient information about symptoms (location, nature, duration, severity, associated symptoms).
      2. Once you have enough information to form a hypothesis, provide a final prediction.
      3. Format the final prediction exactly like this at the end of your message:
      [PREDICTION: Potential Risk Name | CONFIDENCE: XX% | SUMMARY: A brief summary of findings and next steps.]
      4. When you provide a [PREDICTION], do NOT provide [OPTIONS].`
  );
  // Dynamic context is appended AFTER the static prefix so the prefix remains
  // identical across requests and qualifies for server-side prompt caching.
  const systemInstruction = `${_staticRole}
      
      CONTEXT: ${weatherContext}
      ${mlContext}
      ${memoryContext}
      ${lifestyleContext}
      ${_chatRagContext ? `\nRESEARCH LIBRARY CONTEXT (use to ground your response in user-uploaded evidence):\n${_chatRagContext}` : ''}`;

  // ---- Build OpenAI-format messages (shared by Groq & Pollinations) ----
  const oaiMessages = [
    { role: 'system', content: systemInstruction },
    ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: message },
  ];

  // ---- Groq ----
  if (aiProvider === 'groq') {
    if (!apiKey) throw new Error('Groq API key is missing. Please add it in the sidebar.');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: aiModel, messages: oaiMessages, temperature: 0.7, max_tokens: 2048 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      const msg = err?.error?.message || `Groq API error ${res.status}`;
      if (res.status === 429) throw new Error('Groq rate limit exceeded. Please wait a moment.');
      if (res.status === 401) throw new Error('Invalid Groq API key. Please check the sidebar.');
      throw new Error(msg);
    }
    const data = await res.json() as any;
    promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
    return stripThinkingBlocks(data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that request.");
  }

  // ---- Pollinations ----
  if (aiProvider === 'pollinations') {
    const pollinationsHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) pollinationsHeaders['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: pollinationsHeaders,
      body: JSON.stringify({ model: aiModel, messages: oaiMessages }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      const msg = err?.error?.message || `Pollinations AI error ${res.status}`;
      if (res.status === 401) throw new Error('Invalid or missing Pollinations API key. Please check the sidebar.');
      if (res.status === 402) throw new Error('Pollinations pollen balance exhausted. Please top up at enter.pollinations.ai');
      if (res.status === 429) throw new Error('Pollinations rate limit exceeded. Please wait a moment.');
      throw new Error(`${msg}. Try a different model.`);
    }
    const data = await res.json() as any;
    promptCache.recordServerCacheHit(promptCache.extractCachedTokens(data));
    return stripThinkingBlocks(data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that request.");
  }

  // ---- OpenRouter ----
  if (aiProvider === 'openrouter') {
    if (!apiKey) throw new Error('OpenRouter API key is missing. Please add it in the sidebar.');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bio-sentinelx.app',
        'X-Title': 'Bio-SentinelX',
      },
      body: JSON.stringify({ model: aiModel, messages: oaiMessages, temperature: 0.7, max_tokens: 2048 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      const msg = err?.error?.message || `OpenRouter API error ${res.status}`;
      if (res.status === 429) throw new Error('OpenRouter rate limit exceeded. Please wait a moment.');
      if (res.status === 401) throw new Error('Invalid OpenRouter API key. Please check the sidebar.');
      if (res.status === 402) throw new Error('OpenRouter credits exhausted. Top up at openrouter.ai/credits');
      throw new Error(msg);
    }
    const orData = await res.json() as any;
    promptCache.recordServerCacheHit(promptCache.extractCachedTokens(orData));
    return stripThinkingBlocks(orData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that request.");
  }

  // ---- SiliconFlow ----
  if (aiProvider === 'siliconflow') {
    const text = await withRetry(() => chatWithSiliconFlow(
      oaiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      aiModel,
      apiKey || ''
    ));
    return stripThinkingBlocks(text);
  }

  // ---- Cerebras ----
  if (aiProvider === 'cerebras') {
    const text = await chatWithCerebras(
      oaiMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      aiModel,
      apiKey || ''
    );
    return stripThinkingBlocks(text);
  }

  // ---- Gemini (default) ----
  const key = apiKey || process.env.API_KEY;
  if (!key) throw new Error('Gemini API Key missing. Please configure it in the sidebar.');
  const ai = new GoogleGenAI({ apiKey: key });

  // Map history to Gemini format
  const chatHistory = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  const chat = ai.chats.create({
    model: aiModel,
    history: chatHistory,
    config: { systemInstruction },
  });

  const response = await chat.sendMessage({ message });
  return stripThinkingBlocks(response.text || "I'm sorry, I couldn't process that request.");
};

// ============================================================
// FLOOD RISK ANALYSIS
// ============================================================

export interface FloodAnalysisInput {
  /** Controls whether we include full daily tables vs compact summary */
  detailLevel?: 'compact' | 'full';
  locationName: string;
  lat: number;
  lon: number;
  pastDays: number;
  forecastDays: number;
  histAvgDischarge: string;
  histMaxDischarge: string;
  histMinDischarge: string;
  histP50: string;
  histP75: string;
  histP90: string;
  forecastPeakMedian: string;
  forecastPeakDate: string;
  forecastMeanDischarge: string;
  seasonLabel: string;
  isFloodSeason: boolean;
  seasonNote: string;
  riskLevel: string;
  riskScore: number;
  todayDischarge: string | null;
  recentTrend: string;
  trendWithinNorm: boolean;
  p75Exceedance: string;
  currentWeather: {
    temp: number;
    precipitation: number | null | undefined;
    humidity: number;
    description: string;
  };
  futureWeather?: {
    days: number;
    precipitation7dTotalMm?: number | null;
    precipitationMaxDayMm?: number | null;
    precipitationMaxDayDate?: string | null;
    precipitationDailyMm?: Array<{ date: string; precipitationSumMm: number | null; popPct: number | null }>;
  };
  forecastDischargeDaily?: Array<{
    date: string;
    dischargeMedian: number | null;
    dischargeP75?: number | null;
    dischargeMax?: number | null;
  }>;
  forecastDischargeMonthly?: Array<{
    month: string;
    dischargeMedianMean: number | null;
    dischargeMedianMax: number | null;
    days: number;
  }>;
  futurePrediction?: {
    windows: Array<{
      label: string;
      mostLikelyMean: number | null;
      bestCaseLow: number | null;
      worstCaseHigh: number | null;
      daysMedianExceedsHistP75: number;
      daysEnsembleP75ExceedsHistP75: number;
      precipTotalMm: number | null;
    }>;
  };
  // ML model outputs — enriches analysis when Bio-SentinelX ML API is connected
  mlPrediction?: {
    flood_probability: number;
    flood_risk_level: string;
    estimated_inundation_depth_m: number;
    confidence: number;
    contributing_factors: Record<string, number>;
    recommendation: string;
  };
  mlModelStats?: {
    accuracy?: number;
    f1_score?: number;
    roc_auc?: number;
    training_samples?: number;
    feature_importances?: Record<string, number>;
  };
}

export const analyzeFloodRisk = async (
  input: FloodAnalysisInput,
  aiProvider: string = 'gemini',
  aiModel: string = 'gemini-2.5-flash',
  apiKey?: string
): Promise<string> => {
  const systemInstruction = `You are an expert hydrologist, flood risk analyst, and urban disaster management specialist with deep knowledge of GloFAS v4 global river discharge models, precipitation-driven catchment response, machine learning flood prediction systems, river catchment hydrology, urban drainage infrastructure, and WHO/UNDRR disaster risk frameworks. When ML model data is available, synthesise it with hydrological data for a combined multi-model consensus view. Always cite specific numerical values and be direct about uncertainty.

ABSOLUTE OUTPUT RULES (follow exactly):
1. Do NOT reveal chain-of-thought, internal reasoning, or meta commentary (e.g., "Okay, let me…", "First I will…", "Hmm…", "scrolling…"). Output ONLY the final report.
2. Output MUST be valid GitHub-flavored Markdown.
3. The first line MUST be: "## 1. Executive Summary" (no preamble text before it).
4. Use concise, direct language; avoid filler.
`;

  // ── RAG retrieval ────────────────────────────────────────────────────────
  const _floodRagQuery = [
    input.locationName,
    'flood risk river discharge hydrology',
    `precipitation ${input.currentWeather.precipitation ?? 0}mm`,
    input.seasonLabel,
    input.riskLevel,
  ].filter(Boolean).join(' ');

  let _floodRagContext = '';
  try {
    _floodRagContext = await retrieveRelevant(_floodRagQuery, 4, apiKey || undefined);
  } catch (_e) { /* Non-fatal */ }

  // ── ML section (injected when ML API is connected) ───────────────────────
  const mlSection = input.mlPrediction ? `

**BIO-SENTINELX ML MODEL (Stacked Ensemble: RF + XGBoost + LightGBM)**
- Flood Probability: ${(input.mlPrediction.flood_probability * 100).toFixed(1)}%
- ML Risk Level: ${input.mlPrediction.flood_risk_level}
- Estimated Inundation Depth: ${input.mlPrediction.estimated_inundation_depth_m.toFixed(3)} m
- Model Confidence: ${(input.mlPrediction.confidence * 100).toFixed(1)}%
- ML Recommendation: ${input.mlPrediction.recommendation}
- Contributing Factors:
${Object.entries(input.mlPrediction.contributing_factors)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `  · ${k}: ${(v * 100).toFixed(1)}%`).join('\n')}
${input.mlModelStats ? `- Model Quality: Accuracy ${((input.mlModelStats.accuracy ?? 0) * 100).toFixed(2)}%, F1 ${(input.mlModelStats.f1_score ?? 0).toFixed(4)}, ROC-AUC ${(input.mlModelStats.roc_auc ?? 0).toFixed(4)} (trained on ${input.mlModelStats.training_samples?.toLocaleString()} samples)
- Top Predictive Features: ${input.mlModelStats.feature_importances ? Object.entries(input.mlModelStats.feature_importances).slice(0, 3).map(([k, v]) => `${k} (${(v * 100).toFixed(1)}%)`).join(', ') : 'N/A'}` : ''}` : '';
  const compactOrFull = input.detailLevel ?? 'compact';
  
  const futureWeatherSummary = input.futureWeather ? `
  
**FUTURE WEATHER (near-term precipitation forecast)**
- Forecast horizon: ${input.futureWeather.days} days available
- Next 7 days total precipitation: ${input.futureWeather.precipitation7dTotalMm != null ? `${input.futureWeather.precipitation7dTotalMm.toFixed(1)} mm` : 'N/A'}
- Peak daily precipitation: ${input.futureWeather.precipitationMaxDayMm != null ? `${input.futureWeather.precipitationMaxDayMm.toFixed(1)} mm` : 'N/A'}${input.futureWeather.precipitationMaxDayDate ? ` on ${input.futureWeather.precipitationMaxDayDate}` : ''}
` : '';
  
  const monthlyBlock = input.forecastDischargeMonthly && input.forecastDischargeMonthly.length ? `
  
**MONTHLY DISCHARGE OUTLOOK (derived from daily ensemble median)**
${input.forecastDischargeMonthly
  .slice(0, 8)
  .map(m => `- ${m.month}: mean ${m.dischargeMedianMean != null ? m.dischargeMedianMean.toFixed(2) : 'N/A'} m³/s · max ${m.dischargeMedianMax != null ? m.dischargeMedianMax.toFixed(2) : 'N/A'} m³/s (${m.days} days)`)
  .join('\n')}
` : '';

  const futurePredictionBlock = input.futurePrediction?.windows?.length ? `

**FUTURE FLOOD PREDICTION (computed from GloFAS daily forecast)**
${input.futurePrediction.windows.map(w => {
  const ml = w.mostLikelyMean != null ? `${w.mostLikelyMean.toFixed(2)} m³/s` : 'N/A';
  const best = w.bestCaseLow != null ? w.bestCaseLow.toFixed(2) : '—';
  const worst = w.worstCaseHigh != null ? w.worstCaseHigh.toFixed(2) : '—';
  const precip = w.precipTotalMm != null ? `${w.precipTotalMm.toFixed(1)} mm` : 'N/A';
  return `- ${w.label}: most-likely ${ml} · best ${best} · worst ${worst} · precip ${precip} · days median>P75 ${w.daysMedianExceedsHistP75} · days forecastP75>P75 ${w.daysEnsembleP75ExceedsHistP75}`;
}).join('\n')}
` : '';
  
  const dailyTable = (compactOrFull === 'full' && (input.forecastDischargeDaily?.length || input.futureWeather?.precipitationDailyMm?.length)) ? (() => {
    const dischargeByDate = new Map((input.forecastDischargeDaily ?? []).map(d => [d.date, d] as const));
    const precipByDate = new Map((input.futureWeather?.precipitationDailyMm ?? []).map(p => [p.date, p] as const));
    const dates = Array.from(new Set([
      ...(input.forecastDischargeDaily ?? []).map(d => d.date),
      ...(input.futureWeather?.precipitationDailyMm ?? []).map(p => p.date),
    ])).sort();
  
    const rows = dates.slice(0, 30).map(date => {
      const d = dischargeByDate.get(date);
      const p = precipByDate.get(date);
      const qMed = d?.dischargeMedian;
      const qP75 = d?.dischargeP75;
      const qMax = d?.dischargeMax;
      const pr = p?.precipitationSumMm;
      const pop = p?.popPct;
  
      return `| ${date} | ${pr != null ? pr.toFixed(1) : '—'} | ${pop != null ? `${Math.round(pop)}%` : '—'} | ${qMed != null ? qMed.toFixed(2) : '—'} | ${qP75 != null ? qP75.toFixed(2) : '—'} | ${qMax != null ? qMax.toFixed(2) : '—'} |`;
    });
  
    return `
  
**FULL DAILY OUTLOOK (precipitation + discharge)**
| Date | Precip (mm) | POP | Discharge Median (m³/s) | Discharge P75 (m³/s) | Discharge Max (m³/s) |
|---|---:|---:|---:|---:|---:|
${rows.join('\n')}
`;
  })() : '';

  const hasMl = !!input.mlPrediction;
  const userPrompt = `${_floodRagContext ? _floodRagContext + '\n\n---\n\n' : ''}IMPORTANT: Output ONLY the final report. Do not include any planning/thinking text. The first line MUST be exactly: "## 1. Executive Summary".

Analyse flood risk for **${input.locationName}** (${input.lat.toFixed(4)}°N, ${input.lon.toFixed(4)}°E) using the following multi-source real-time data.

**GLOFAS v4 HISTORICAL (past ${input.pastDays} days)**
- Today's discharge: ${input.todayDischarge ?? 'N/A'} m³/s | P50: ${input.histP50} | P75: ${input.histP75} | P90: ${input.histP90} | Max: ${input.histMaxDischarge} m³/s
- Recent 7-day trend: ${input.recentTrend} (within seasonal norm: ${input.trendWithinNorm})

**GLOFAS v4 FORECAST (next ${input.forecastDays} days — 50-member ensemble)**
- Peak forecast (median): ${input.forecastPeakMedian} m³/s on ${input.forecastPeakDate}
- Forecast mean: ${input.forecastMeanDischarge} m³/s | Days exceeding P75: ${input.p75Exceedance}

**SEASONAL CONTEXT**
- ${input.seasonLabel} | Flood season active: ${input.isFloodSeason ? 'YES' : 'NO'}
- ${input.seasonNote}

**CURRENT WEATHER**
- ${input.currentWeather.temp}°C · ${input.currentWeather.precipitation ?? 0} mm precipitation · ${input.currentWeather.humidity}% RH · ${input.currentWeather.description}

${futureWeatherSummary}${futurePredictionBlock}${monthlyBlock}${dailyTable}

**GLOFAS RISK SCORE: ${input.riskScore}/100 — ${input.riskLevel}**
${mlSection}

COMPLETENESS REQUIREMENT (do not skip): explicitly reference and interpret each of the following in your report:
- Risk score/level (${input.riskScore}/100, ${input.riskLevel})
- Today vs historical percentiles (P50/P75/P90)
- Recent trend (${input.recentTrend}) and whether it is within seasonal norm (${input.trendWithinNorm})
- Forecast peak median + date (${input.forecastPeakMedian} on ${input.forecastPeakDate}) and days exceeding P75 (${input.p75Exceedance})
- Near-term precipitation totals/peak day (if provided)
- If ML data is present: ML probability, inundation depth, confidence, and top 3 contributing factors

Produce a comprehensive flood risk report with these sections:

## 1. Executive Summary
3–4 sentence verdict combining all data sources. State clearly if emergency action is needed now.

Then add a sub-block titled: "### Overall Confidence & Predictions" with exactly these 3 bullets:
- **Overall Confidence:** A single percentage from 0–100% reflecting combined confidence in your overall verdict (briefly justify it using ensemble spread + trend stability + precipitation certainty + ML confidence if available).
- **Flood Prediction (Now):** Current flood risk level + probability (use GloFAS risk + ML probability if available) in one sentence.
- **Future Prediction:** Summarize the most-likely outcome for **7-day**, **30-day**, and **6-month** windows in one line, including expected discharge range and timing if known.

## 2. GloFAS Hydrological Analysis
Interpret today's discharge vs P50/P75/P90. What does the ensemble spread say about forecast reliability? Are ensemble extremes credible given current catchment conditions?

Include a **GitHub-flavored Markdown table** (GFM) with a header separator row. Use exactly these columns:
| Metric | Value | Interpretation vs. Historical Percentiles |
|---|---:|---|
Populate it with at least: Today's discharge, P50, P75, P90, Forecast peak (median), Days exceeding P75.

${hasMl ? `## 3. ML Model Analysis
Interpret the ${(input.mlPrediction!.flood_probability * 100).toFixed(1)}% ML flood probability. Explain the top 3 contributing factors and what the ${input.mlPrediction!.estimated_inundation_depth_m.toFixed(3)}m inundation depth means for roads, basements, and ground-floor residences.

## 4. Multi-Model Consensus
Compare GloFAS risk (${input.riskScore}/100 → ${input.riskLevel}) vs ML prediction (${(input.mlPrediction!.flood_probability * 100).toFixed(1)}% → ${input.mlPrediction!.flood_risk_level}). Where do they agree? Where do they diverge and why? What combined confidence level does this give?

` : ''}## ${hasMl ? 5 : 3}. Seasonal & Trend Analysis
Is the river behaving outside its seasonal envelope? How does the ${input.recentTrend} trend compound risk given it is ${input.isFloodSeason ? 'currently' : 'not currently'} flood season?

## ${hasMl ? 6 : 4}. Weather-Hydrology Coupling
How do ${input.currentWeather.precipitation ?? 0}mm precipitation, ${input.currentWeather.humidity}% humidity, and ${input.currentWeather.temp}°C interact with catchment saturation to amplify or dampen flood risk over the next 48–72 hours?

## ${hasMl ? 7 : 5}. Risk Forecast & Timeline
Probability and expected timing for: **7-day window** · **30-day window** · **6-month outlook**. Include most-likely, best-case, and worst-case discharge scenarios with specific m³/s thresholds.

## ${hasMl ? 8 : 6}. Tiered Action Plan
- 🔴 **Emergency services**: immediate actions if flood probability > 60%
- 🟠 **Municipal authorities**: infrastructure and drainage priorities
- 🟡 **Residents**: household preparation and evacuation triggers

## ${hasMl ? 9 : 7}. Monitoring Triggers
List 5 specific numerical thresholds that should trigger escalated response (e.g., "Activate Emergency Operations if discharge exceeds X m³/s or ML probability exceeds Y%").`;

  // ---- Groq ----
  if (aiProvider === 'groq') {
    if (!apiKey) throw new Error('Groq API key is missing. Please add it in the sidebar.');
    const text = await generateWithGroq(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text);
  }
  // ---- Pollinations ----
  if (aiProvider === 'pollinations') {
    const text = await generateWithPollinations(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text);
  }
  // ---- OpenRouter ----
  if (aiProvider === 'openrouter') {
    if (!apiKey) throw new Error('OpenRouter API key is missing. Please add it in the sidebar.');
    const text = await generateWithOpenRouter(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text);
  }
  // ---- Cerebras ----
  if (aiProvider === 'cerebras') {
    if (!apiKey) throw new Error('Cerebras API key is missing. Please add it in the sidebar.');
    const text = await generateWithCerebras(systemInstruction, userPrompt, aiModel, apiKey);
    return stripThinkingBlocks(text);
  }
  // ---- SiliconFlow ----
  if (aiProvider === 'siliconflow') {
    const text = await withRetry(() => generateWithSiliconFlow(systemInstruction, userPrompt, aiModel, apiKey || ''));
    return stripThinkingBlocks(text);
  }
  // ---- Gemini (default) ----
  const key = apiKey || process.env.API_KEY;
  if (!key) throw new Error('Gemini API Key missing. Please configure it in the sidebar.');
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: aiModel,
    contents: userPrompt,
    config: { systemInstruction },
  });
  return stripThinkingBlocks(response.text || 'Unable to generate flood analysis.');
};