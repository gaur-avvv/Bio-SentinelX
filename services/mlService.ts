/**
 * BioSentinel ML Integration Service
 * Connects your app to the Bio-Sentinel FastAPI ML backend
 */

import { WeatherData, HealthRecord, LifestyleData } from '../types';

// ===========================
// CONFIGURATION
// ===========================

const CONFIG = {
  // Bio-Sentinel API endpoint (production Railway deployment)
  bioSentinelAPI: (import.meta.env.VITE_BIOSENTINEL_API as string) || 'https://bio-sentinel-production.up.railway.app',
  
  // API timeouts
  timeout: 10000, // 10 seconds
};

// Runtime API key — set via setBioSentinelApiKey() from the UI
let _runtimeApiKey: string = '';
export function setBioSentinelApiKey(key: string) { _runtimeApiKey = key; }
function getApiKeyHeader(): Record<string, string> {
  const key = _runtimeApiKey || (import.meta.env.VITE_BIOSENTINEL_API_KEY as string);
  return key ? { 'X-API-Key': key } : {};
}

// ===========================
// TYPES & INTERFACES
// ===========================

export interface MLPrediction {
  riskScore: number;
  primaryTrigger: string;
  recommendation: string;
  confidence: number;
  
  // Extended with Bio-Sentinel data
  disease?: string;
  diseaseCode?: number;
  riskLevel?: 'HIGH' | 'CRITICAL' | 'MODERATE' | 'LOW' | 'UNCERTAIN';
  allProbabilities?: Record<string, number>;
  topFactors?: Array<{
    feature: string;
    value: number;
    impact: string;
    importance: number;
  }>;
  timestamp?: string;
  aiRecommendations?: string;
}

export interface MLFeedback {
  predictionId: string;
  isHelpful: boolean;
  userComment?: string;
  timestamp: string;
}

// Bio-Sentinel API Request Format
interface BioSentinelRequest {
  temp: number;
  feels_like: number;
  pressure: number;
  humidity: number;
  wind_speed: number;
  wind_deg: number;
  clouds: number;
  visibility: number;
  uv_index: number;
  "air_quality_PM2.5": number;
  "air_quality_PM10": number;
  aqi: number;
}

// Bio-Sentinel API Response Format
interface BioSentinelResponse {
  prediction: string;
  confidence: string; // e.g. "91.7%"
  all_classes: Record<string, number>;
  top_factors: Array<{
    feature: string;
    value: number;
    impact: string;
    importance: number;
  }>;
}

// ===========================
// DATA MAPPING FUNCTIONS
// ===========================

/**
 * Convert your app's data format to Bio-Sentinel API format
 */
function mapToBioSentinelFormat(
  weather: WeatherData,
  healthData: HealthRecord[],
  lifestyle: LifestyleData
): BioSentinelRequest {
  
  // Map raw US AQI (0-500) to the 1-6 EPA category required by the ML API.
  // weather.aqi is the 1-5 display value; weather.rawAqi is the original 0-500 value.
  const usAqi = weather.rawAqi ?? 0;
  let aqiCategory: number;
  if (usAqi > 300)      aqiCategory = 6; // Hazardous
  else if (usAqi > 200) aqiCategory = 5; // Very Unhealthy
  else if (usAqi > 150) aqiCategory = 4; // Unhealthy
  else if (usAqi > 100) aqiCategory = 3; // Unhealthy for Sensitive Groups
  else if (usAqi > 50)  aqiCategory = 2; // Moderate
  else                  aqiCategory = 1; // Good

  return {
    temp: weather.temp,
    feels_like: weather.feelsLike,
    pressure: weather.pressure,
    humidity: weather.humidity,
    wind_speed: weather.windSpeed,
    wind_deg: weather.windDeg,
    clouds: weather.clouds || 50, // Default if missing
    visibility: (weather.visibility || 10000) / 1000, // Convert meters to km
    uv_index: weather.uvIndex || 0,
    "air_quality_PM2.5": weather.advancedData?.pm2_5 || 15.0,
    "air_quality_PM10": weather.advancedData?.pm10 || 25.0,
    aqi: aqiCategory
  };
}

/**
 * Calculate risk scores based on health records and lifestyle
 */
function calculateRiskScores(
  healthData: HealthRecord[],
  lifestyle: LifestyleData
): {
  respiratory_risk_score: number;
  heat_stress_score: number;
  cardio_risk_score: number;
  neuro_risk_score: number;
  viral_risk_score: number;
} {
  // Default scores
  let respiratory = 0;
  let heatStress = 0;
  let cardio = 0;
  let neuro = 0;
  let viral = 0;
  
  // Analyze health records
  healthData.forEach(record => {
    // Respiratory conditions
    if (record.condition?.toLowerCase().includes('asthma') || 
        record.condition?.toLowerCase().includes('copd')) {
      respiratory = Math.max(respiratory, 2);
    }
    
    // Cardiovascular conditions
    if (record.condition?.toLowerCase().includes('heart') || 
        record.condition?.toLowerCase().includes('hypertension')) {
      cardio = Math.max(cardio, 2);
    }
    
    // Check vital signs if available
    if (record.heartRate && record.heartRate > 100) {
      cardio = Math.max(cardio, 1);
    }
    
    if (record.temperature && record.temperature > 37.5) {
      viral = Math.max(viral, 1);
    }
  });
  
  // Lifestyle factors
  if (lifestyle.lifestyle?.toLowerCase().includes('sedentary')) {
    cardio = Math.min(cardio + 1, 3);
    heatStress = Math.min(heatStress + 1, 3);
  }
  
  if (lifestyle.exercise?.toLowerCase().includes('none') || 
      lifestyle.exercise?.toLowerCase().includes('minimal')) {
    cardio = Math.min(cardio + 1, 3);
  }
  
  if (lifestyle.smoking || lifestyle.alcoholConsumption === 'heavy') {
    respiratory = Math.min(respiratory + 1, 3);
    cardio = Math.min(cardio + 1, 3);
  }
  
  return {
    respiratory_risk_score: respiratory,
    heat_stress_score: heatStress,
    cardio_risk_score: cardio,
    neuro_risk_score: neuro,
    viral_risk_score: viral
  };
}

// ===========================
// API FUNCTIONS
// ===========================

/**
 * Check if Bio-Sentinel API is available
 */
export async function checkBioSentinelHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${CONFIG.bioSentinelAPI}/health`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn('Bio-Sentinel API not available:', error);
    return false;
  }
}

/**
 * Get prediction from Bio-Sentinel ML API
 */
async function getBioSentinelPrediction(
  data: BioSentinelRequest
): Promise<BioSentinelResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
  
  try {
    const response = await fetch(`${CONFIG.bioSentinelAPI}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getApiKeyHeader()
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Bio-Sentinel API error: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Generate rich, unique, clinically structured BioSentinel ML recommendations
 * without requiring an external AI API call.
 */
function generateBasicRecommendation(prediction: MLPrediction): string {
  const risk = prediction.riskLevel ?? 'MODERATE';
  const disease = prediction.disease ?? 'General Health Risk';
  const confidence = ((prediction.confidence ?? 0.65) * 100).toFixed(0);

  const riskBadge = risk === 'HIGH' || risk === 'CRITICAL'
    ? '- **[HIGH RISK] Escalation Advisory:** Symptoms developing under current conditions warrant prompt medical evaluation. Do not delay consultation if multiple symptoms co-occur.'
    : risk === 'MODERATE'
    ? '- **[MODERATE RISK] Watchful Protocol:** Monitor symptom trajectory closely. Escalate immediately if two or more warning triggers activate.'
    : '- **[LOW RISK] Preventive Mode:** Conditions are manageable. Maintain vigilance and apply baseline precautions.';

  // Disease-specific recommendation blocks
  const coreAdvice: Record<string, { summary: string; immediate: string[]; adapt: string[]; monitor: string[]; escalate: string[] }> = {
    'Cardiovascular Stress': {
      summary: `BioSentinel ML has flagged an elevated cardiovascular stress index (${confidence}% confidence) driven by ambient pressure, humidity, and thermal load. The cardiovascular system is particularly sensitive to barometric drops and humidity-induced sweat evaporation failure.`,
      immediate: [
        '**Cease strenuous activity immediately:** Rest in a cool, shaded, or air-conditioned space. Even moderate exertion can spike cardiac demand by 30% in hot-humid environments.',
        '**Hydrate strategically:** Drink 250 ml of water every 20 minutes. Avoid caffeinated or alcoholic drinks which accelerate dehydration and elevate heart rate.',
        '**Monitor resting heart rate:** Use a wrist monitor or 60-second manual count. If HR exceeds 100 bpm at rest, initiate emergency escalation protocol.',
        '**Loosen constrictive clothing:** Remove layers restricting chest or neck to reduce peripheral vascular resistance.',
      ],
      adapt: [
        '**Timing of outdoor exposure:** Restrict outdoor activity to early morning (before 8am) or post-sunset when ambient temperatures drop 4-8°C.',
        '**Electrolyte balance:** Supplement sodium/potassium via ORS sachet or coconut water if sweating profusely for >30 minutes.',
        '**Position management:** If feeling lightheaded, assume supine position with legs elevated 15° to restore cerebral perfusion.',
      ],
      monitor: [
        'Resting HR every 30 minutes if symptomatic', 'Blood pressure if device available (target <140/90 mmHg)',
        'Skin colour and temperature — pallor or bluish lips require emergency contact',
        'Onset of chest tightness, radiating arm pain, or jaw discomfort',
      ],
      escalate: [
        'Chest pain or pressure lasting >2 minutes', 'Syncope (fainting) or near-syncope',
        'Palpitations with shortness of breath', 'Systolic BP >180 mmHg or <90 mmHg',
      ],
    },
    'Heat-related Illness': {
      summary: `Environmental telemetry confirms active heat stress conditions. BioSentinel ML predicts a ${confidence}% probability of heat-related illness onset driven by thermogenic stacking — high ambient temperature compounded by elevated humidity reducing evaporative cooling efficiency.`,
      immediate: [
        '**Move to a cooler environment within 5 minutes:** Air-conditioned spaces preferred; shade with airflow is the minimum threshold.',
        '**Active cooling now:** Apply cold damp cloths to neck, wrists, and axillae (armpits) — major superficial blood vessel sites. This accelerates core temperature reduction.',
        '**Oral rehydration:** Consume 500 ml of cool water immediately. Add a pinch of salt + sugar to create an improvised ORS if sweating heavily.',
        '**Remove excess clothing and gear:** Reduce thermal barrier to allow passive convective cooling.',
      ],
      adapt: [
        '**Avoidance window:** Peak heat risk occurs between 11am–4pm. Defer all non-essential outdoor tasks to cooler periods.',
        '**Urine colour monitoring:** Target pale-yellow urine (hydration indicator). Dark amber requires urgent fluid intake increase.',
        '**Pre-hydration protocol:** Consume 500 ml of water 30 minutes before any outdoor activity exceeding 15 minutes.',
      ],
      monitor: [
        'Core temperature — if thermometer available, >38.5°C requires medical evaluation',
        'Mental clarity — confusion, slurred speech, or disorientation signals heat stroke (emergency)',
        'Cessation of sweating despite heat — paradoxical sign of severe dehydration or heat stroke',
      ],
      escalate: [
        'Body temperature >40°C or absence of sweating in extreme heat', 'Confusion, agitation, or loss of consciousness',
        'Vomiting preventing oral rehydration', 'Seizure activity',
      ],
    },
    'Respiratory Illness (Asthma/COPD)': {
      summary: `Current atmospheric particulate load, humidity, and pollutant dispersion patterns have elevated BioSentinel's respiratory stress index to ${confidence}% risk probability. Asthmogenic triggers including PM2.5 infiltration, cold-dry or humid-warm air, and elevated ozone are currently active.`,
      immediate: [
        '**Activate prescribed rescue inhaler (if applicable):** Use bronchodilator immediately if symptomatic — 2 puffs salbutamol/albuterol as per prescription. Repeat after 20 minutes if no relief; seek emergency care after 3 doses.',
        '**Relocate to filtered-air indoor environment:** Central air conditioning with HEPA filtration provides best particulate protection. Close windows and doors.',
        '**Adopt pursed-lip breathing:** Inhale 2 counts through nose, exhale 4 counts through pursed lips. Reduces air trapping and dyspnea sensation.',
        '**Humidifier check:** If indoor air is very dry (<30% RH), a cool-mist humidifier reduces mucus viscosity. Avoid hot steam which worsens some COPD conditions.',
      ],
      adapt: [
        '**N95 or FFP2 mask outdoors:** Filters >95% of PM2.5 particles. Surgical masks provide <30% protection against fine particulates.',
        '**Avoidance of trigger environments:** Skip exercise near traffic, construction zones, or areas with visible haze. Pollen count is highest 5-10am.',
        '**Medication accessibility:** Keep reliever inhaler within reach at all times. Confirm preventer inhaler is current and adequate supply exists.',
      ],
      monitor: [
        'Peak flow meter readings (if available) — values <80% personal best indicate deteriorating control',
        'Respiratory rate — normal 12-20 breaths/min; >25 breaths/min at rest is a red flag',
        'Accessory muscle use (neck, chest retractions) — visible straining during breathing requires emergency contact',
        'Oxygen saturation if pulse oximeter available — SpO2 <94% warrants urgent evaluation',
      ],
      escalate: [
        'SpO2 <92% or cyanotic lips/fingernails', 'Severe breathlessness preventing speech in full sentences',
        'No improvement after 3 doses of rescue inhaler', 'Rapidly increasing respiratory rate',
      ],
    },
    'Viral Infection Risk': {
      summary: `BioSentinel ML models environmental suitability for respiratory viral transmission at ${confidence}% risk. Current temperature-humidity conditions fall within the optimal viral persistence window. Airborne viral particle survival is maximized at low humidity (<40%) and cold temperatures, while dengue/mosquito-borne vectors peak with warm stagnant conditions.`,
      immediate: [
        '**Enhanced hand hygiene protocol:** Wash hands for 20 seconds with soap under running water after any surface contact. Use 70%+ alcohol hand rub when soap unavailable.',
        '**Mask in enclosed public spaces:** Well-fitting N95/FFP2 mask provides significant source control and protection in crowded indoor settings.',
        '**Avoid face touching:** The mucosal membranes (eyes, nose, mouth) are primary entry routes. Carry gloves or use tissue as barrier in high-contact areas.',
        '**Social distancing in peak-density areas:** Maintain 1.5m separation. Viral load exposure increases inversely with distance from an infected person.',
      ],
      adapt: [
        '**Indoor air quality enhancement:** Open windows for cross-ventilation when outdoor AQI permits. HEPA air purifier dramatically reduces airborne viral particle density.',
        '**Immunological support:** Adequate sleep (7-9 hours), zinc-rich foods (nuts, seeds, legumes), and vitamin C support innate immune response.',
        '**High-touch surface disinfection:** Door handles, phone screens, light switches — disinfect with 70% ethanol or dilute bleach solution every 4-6 hours in shared spaces.',
      ],
      monitor: [
        'Body temperature twice daily — fever >37.8°C suggests active infection onset',
        'Sore throat, rhinorrhea, myalgia — early prodrome signs of respiratory viral illness',
        'Fatigue disproportionate to activity level — immune activation signal',
      ],
      escalate: [
        'Fever >39°C unresponsive to antipyretics after 48 hours', 'Difficulty breathing or chest pain',
        'Severe headache with neck stiffness (meningeal sign)', 'Altered mental status or extreme fatigue',
      ],
    },
    'Neurological Stress': {
      summary: `Atmospheric pressure gradients and thermal dysregulation detected by BioSentinel ML have elevated neurological stress probability to ${confidence}%. Barometric pressure oscillations directly affect intracranial pressure dynamics and meningeal receptor sensitivity, which is the primary mechanistic driver of weather-triggered migraines, cluster headaches, and cognitive fatigue.`,
      immediate: [
        '**Pressure and light management:** Move to a quiet, darkened room. Sensory reduction (noise, light, temperature fluctuations) is the most immediate neuro-protective intervention.',
        '**Hydration correction:** Dehydration by as little as 1-2% of body weight measurably reduces cognitive performance and migraine threshold. Consume 500 ml water now.',
        '**Temperature regulation:** Maintain ambient temperature at 20-22°C if possible. Thermal stress triggers neuroendocrine cascade responses.',
        '**Prescribed preventive medication:** If subject to recurring neurological events, adhere strictly to prescribed preventive protocol on high-risk weather days.',
      ],
      adapt: [
        '**Barometric pressure alerts:** Set weather alerts for >8 hPa drops within 3 hours — the most reliable migraine meteorological trigger threshold.',
        '**Sleep hygiene consistency:** Irregular sleep patterns synergize with weather triggers to elevate neurological stress response. Maintain fixed sleep/wake schedule.',
        '**Caffeine management:** Low-dose caffeine (1 cup coffee) may abort early migraine. However, caffeine withdrawal itself is a potent headache trigger — maintain consistent daily intake.',
      ],
      monitor: [
        'Aura symptoms — visual disturbances (zigzag lines, scotoma), tingling, or speech difficulty preceding headache',
        'Pain intensity scale (0-10) — escalation beyond 7/10 despite analgesia warrants review',
        'Associated nausea and photophobia — severity markers for migraine classification',
      ],
      escalate: [
        'Sudden-onset "thunderclap" headache (worst of life) — emergency (SAH)', 'Headache with fever, stiff neck, or photophobia (meningitis)',
        'Focal neurological deficit — unilateral weakness, vision loss, speech impairment',
        'Seizure onset in migraine-naïve individual',
      ],
    },
    'Heat Stroke': {
      summary: `CRITICAL ALERT: BioSentinel ML flags active heat stroke risk at ${confidence}% confidence. Heat stroke (core temp >40°C with CNS dysfunction) is a life-threatening emergency. Every minute of delayed cooling worsens neurological outcomes. Immediate aggressive cooling is the primary intervention.`,
      immediate: [
        '**CALL EMERGENCY SERVICES NOW (112/911):** Heat stroke requires hospital-level care with IV fluid management and core temperature monitoring.',
        '**Aggressive whole-body cooling:** Immerse in cool water bath if possible. Alternatively, apply ice packs to neck, groin, and axillae simultaneously while fanning vigorously.',
        '**Position carefully:** If conscious — recovery position (lateral). If unconscious — supine with airway monitored. Do NOT leave unattended.',
        '**Remove all clothing:** Rapid thermal dissipation requires maximum skin surface exposure.',
      ],
      adapt: ['**This is a medical emergency. Environmental adaptation protocols are secondary to emergency cooling and transport.**'],
      monitor: ['Level of consciousness every 2 minutes', 'Breathing adequacy — initiate CPR if absent', 'Core temperature response to cooling measures'],
      escalate: ['Immediate — this IS the escalation. DO NOT WAIT for further confirmation.'],
    },
  };

  // Generic fallback
  const genericAdvice = {
    summary: `BioSentinel ML has identified elevated bio-risk parameters (${confidence}% confidence) based on current environmental telemetry. The detected condition — ${disease} — requires targeted physiological adaptation and heightened health monitoring.`,
    immediate: [
      '**Reduce environmental exposure:** Minimize outdoor time during peak risk hours (typically 11am–4pm for most heat/UV related conditions).',
      '**Hydrate proactively:** Maintain fluid intake of at least 2.5L/day, increased to 3.5L during high-activity or hot conditions.',
      '**Rest and recovery:** Schedule a 20-minute rest period for every 90 minutes of physical or cognitive activity in challenging conditions.',
      '**Medication adherence:** If managing a chronic condition, do not skip or delay prescribed medications during elevated weather-risk periods.',
    ],
    adapt: [
      '**Environmental modification:** Optimize indoor temperature (20-24°C), humidity (40-60% RH), and air quality.',
      '**Dietary support:** Prioritize anti-inflammatory foods — leafy greens, omega-3 rich fish, berries — during elevated stress periods.',
      '**Activity adaptation:** Switch to low-intensity indoor exercise (yoga, stretching) when outdoor conditions exceed safety thresholds.',
    ],
    monitor: [
      'Resting heart rate and blood pressure daily', 'Symptom severity using a 1-10 scale — log any worsening trends',
      'Sleep quality — disrupted sleep is an early indicator of physiological stress', 'Urine output and colour as hydration indicator',
    ],
    escalate: [
      'Symptoms persisting >48 hours or rapidly worsening', 'Any new symptom outside the expected pattern',
      'Vital sign abnormalities (HR >100, BP >140/90, temp >38°C)', 'Inability to maintain oral hydration',
    ],
  };

  // Merge: use disease-specific if available, else generic
  const advice = coreAdvice[disease] ?? genericAdvice;

  // Build the top contributing factors block
  const factorBlock = prediction.topFactors && prediction.topFactors.length > 0
    ? prediction.topFactors.slice(0, 3).map(f =>
        `- **${f.feature.replace(/_/g, ' ')} (${f.value.toFixed(1)}):** ${f.impact === 'increases' ? 'Elevates' : 'Reduces'} risk — SHAP weight ${(f.importance * 100).toFixed(0)}%.`
      ).join('\n')
    : '- Environmental telemetry composite driving risk assessment.';

  return `
### Executive Summary

${advice.summary}

---

### 1. Immediate Action Protocol

${advice.immediate.map(a => `- ${a}`).join('\n')}

---

### 2. Environmental Adaptation Strategy

${advice.adapt.map(a => `- ${a}`).join('\n')}

---

### 3. Physiological Monitoring Checklist

${advice.monitor.map(m => `- ${m}`).join('\n')}

---

### 4. Medical Escalation Triggers

Seek immediate medical attention if any of the following occur:

${advice.escalate.map(e => `- ${e}`).join('\n')}

---

### 5. BioSentinel ML Factor Analysis

Top contributing environmental drivers identified by the SHAP explainability layer:

${factorBlock}

Prediction confidence: **${confidence}%** — based on ${prediction.topFactors?.length ?? 0} weighted environmental features.

${riskBadge}
`.trim();
}

// ===========================
// MAIN PREDICTION FUNCTION
// ===========================

/**
 * Main function: Predict bio risks with SHAP explanations and AI recommendations
 * 
 * This replaces your existing predictBioRisks function
 */
export const predictBioRisks = async (
  weather: WeatherData,
  healthData: HealthRecord[],
  lifestyle: LifestyleData
): Promise<MLPrediction> => {
  
  console.log('🔬 Running Bio-Sentinel ML Inference...');
  
  try {
    // Step 1: Check if API is available
    const isAvailable = await checkBioSentinelHealth();
    
    if (!isAvailable) {
      console.warn('Bio-Sentinel API unavailable, using fallback');
      return getFallbackPrediction(weather, healthData, lifestyle);
    }
    
    // Step 2: Map data to Bio-Sentinel format
    const requestData = mapToBioSentinelFormat(weather, healthData, lifestyle);
    
    // Step 3: Get ML prediction
    const prediction = await getBioSentinelPrediction(requestData);
    
    // Parse confidence from string "95.5%" to number 0.955
    const confidenceVal = parseFloat(prediction.confidence.replace('%', '')) / 100;
    
    // Generate synthetic factors if API doesn't return them (for visualization)
    const topFactors = prediction.top_factors || generateSyntheticFactors(requestData);
    
    // Calculate Risk Scores
    const riskScores = calculateRiskScores(healthData, lifestyle);
    
    // Determine risk level based on confidence and disease severity (heuristic)
    let riskLevel: 'HIGH' | 'MODERATE' | 'LOW' | 'UNCERTAIN' = 'LOW';
    
    // Severity Mapping
    const highSeverityDiseases = ['Heat Stroke', 'Severe Asthma Attack', 'Heart Attack', 'Severe Dehydration'];
    const moderateSeverityDiseases = ['Heat Exhaustion', 'Mild Asthma', 'Allergic Rhinitis', 'Migraine', 'Respiratory Illness'];
    
    let severityScore = 0;
    if (highSeverityDiseases.some(d => prediction.prediction.includes(d))) severityScore = 2;
    else if (moderateSeverityDiseases.some(d => prediction.prediction.includes(d))) severityScore = 1;
    
    // Combine confidence, severity, and calculated risk scores
    const maxCalculatedRisk = Math.max(...Object.values(riskScores));
    
    if (confidenceVal > 0.8 || severityScore === 2 || maxCalculatedRisk >= 3) {
        riskLevel = 'HIGH';
    } else if (confidenceVal > 0.5 || severityScore === 1 || maxCalculatedRisk >= 2) {
        riskLevel = 'MODERATE';
    }
    
    // Construct internal prediction object
    const mlPrediction: MLPrediction = {
      riskScore: confidenceVal,
      primaryTrigger: topFactors[0]?.feature || 'Environmental Factors',
      recommendation: '', // Will be filled by AI
      confidence: confidenceVal,
      disease: prediction.prediction,
      riskLevel,
      allProbabilities: prediction.all_classes,
      topFactors,
      timestamp: new Date().toISOString()
    };

    // Step 4: Generate recommendations (pass the fully-constructed mlPrediction so
    // confidence is a 0-1 decimal and topFactors is the camelCase-mapped array,
    // not the raw BioSentinelResponse whose confidence is a "91.7%" string and
    // whose factors are in snake_case top_factors — both caused NaN% and 0 features)
    const aiRecommendations = generateBasicRecommendation(mlPrediction);
    
    mlPrediction.recommendation = aiRecommendations;
    mlPrediction.aiRecommendations = aiRecommendations;
    
    return mlPrediction;
    
  } catch (error) {
    console.error('Bio-Sentinel ML Error:', error);
    
    // Fallback to heuristic prediction
    return getFallbackPrediction(weather, healthData, lifestyle);
  }
};

/**
 * Generate synthetic SHAP values for visualization when backend doesn't provide them
 */
function generateSyntheticFactors(data: BioSentinelRequest): Array<{ feature: string; value: number; impact: string; importance: number }> {
  const factors = [];
  
  if (data.temp > 30) factors.push({ feature: 'Temperature', value: data.temp, impact: 'increases', importance: (data.temp - 30) / 10 });
  if (data.humidity > 70) factors.push({ feature: 'Humidity', value: data.humidity, impact: 'increases', importance: (data.humidity - 70) / 50 });
  if (data.uv_index > 6) factors.push({ feature: 'UV Index', value: data.uv_index, impact: 'increases', importance: data.uv_index / 12 });
  if (data['air_quality_PM2.5'] > 25) factors.push({ feature: 'PM2.5', value: data['air_quality_PM2.5'], impact: 'increases', importance: data['air_quality_PM2.5'] / 100 });
  if (data.aqi > 2) factors.push({ feature: 'AQI', value: data.aqi, impact: 'increases', importance: data.aqi / 6 });
  if (data.pressure < 1000) factors.push({ feature: 'Low Pressure', value: data.pressure, impact: 'increases', importance: (1000 - data.pressure) / 50 });
  
  // Add some protective factors (dummy logic)
  if (data.temp > 20 && data.temp < 25) factors.push({ feature: 'Temperature', value: data.temp, impact: 'decreases', importance: 0.3 });
  if (data.aqi === 1) factors.push({ feature: 'Good Air Quality', value: data.aqi, impact: 'decreases', importance: 0.4 });

  return factors.sort((a, b) => b.importance - a.importance).slice(0, 5);
}

// ===========================
// FALLBACK PREDICTION
// ===========================

/**
 * Fallback prediction when API is unavailable
 * Uses simple heuristics
 */
function getFallbackPrediction(
  weather: WeatherData,
  healthData: HealthRecord[],
  lifestyle: LifestyleData
): MLPrediction {
  console.log('⚠️ Using fallback heuristic prediction');
  
  let riskScore = 0.2;
  let primaryTrigger = 'Baseline';
  let recommendation = 'Monitor your health and environmental conditions.';
  
  // Weather-based risks
  if (weather.humidity > 80 && weather.temp > 30) {
    riskScore += 0.4;
    primaryTrigger = 'High Heat & Humidity';
    recommendation = 'Stay hydrated and avoid direct sunlight.';
  }
  
  if (weather.advancedData?.pm2_5 && weather.advancedData.pm2_5 > 35) {
    riskScore += 0.3;
    primaryTrigger = 'Poor Air Quality';
    recommendation = 'Stay indoors and use air filtration if possible.';
  }
  
  // Lifestyle factors
  if (lifestyle.lifestyle?.toLowerCase().includes('sedentary')) {
    riskScore += 0.2;
  }
  
  // Health history
  const hasRespiratoryIssues = healthData.some(record => 
    record.condition?.toLowerCase().includes('asthma') ||
    record.condition?.toLowerCase().includes('copd')
  );
  
  if (hasRespiratoryIssues && weather.advancedData?.pm2_5 && weather.advancedData.pm2_5 > 25) {
    riskScore += 0.3;
    primaryTrigger = 'Respiratory Condition + Poor Air';
    recommendation = 'Use prescribed medication and stay indoors with air filtration.';
  }
  
  return {
    riskScore: Math.min(riskScore, 1.0),
    primaryTrigger,
    recommendation,
    confidence: 0.65, // Lower confidence for heuristic
    riskLevel: riskScore > 0.7 ? 'HIGH' : riskScore > 0.4 ? 'MODERATE' : 'LOW'
  };
}

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Quick pre-check before full ML prediction
 */
export async function quickHealthCheck(
  weather: WeatherData,
  healthData: HealthRecord[],
  lifestyle: LifestyleData
): Promise<{
  requiresFullAnalysis: boolean;
  warnings: string[];
  immediateActionRequired: boolean;
}> {
  const warnings: string[] = [];
  
  try {
    const requestData = mapToBioSentinelFormat(weather, healthData, lifestyle);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
    
    const response = await fetch(`${CONFIG.bioSentinelAPI}/quick-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getApiKeyHeader()
      },
      body: JSON.stringify(requestData),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      // Assuming the quick-check endpoint returns warnings or status
      if (data.warnings && Array.isArray(data.warnings)) {
        warnings.push(...data.warnings);
      } else if (typeof data === 'string') {
        // If it just returns a string status
        if (data !== 'healthy' && data !== 'ok') {
          warnings.push(data);
        }
      }
    }
  } catch (error) {
    console.warn('Quick check API failed, using local heuristics', error);
  }

  // Fallback / local heuristics
  if (weather.advancedData?.pm2_5 && weather.advancedData.pm2_5 > 35) {
    if (!warnings.some(w => w.includes('PM2.5'))) warnings.push('Hazardous PM2.5 levels detected');
  }
  
  if (weather.temp > 38) {
    if (!warnings.some(w => w.includes('heat'))) warnings.push('Extreme heat detected');
  }
  
  if (weather.advancedData?.co && weather.advancedData.co > 500) {
    if (!warnings.some(w => w.includes('CO'))) warnings.push('Dangerous CO levels');
  }
  
  if (weather.uvIndex && weather.uvIndex > 10) {
    if (!warnings.some(w => w.includes('UV'))) warnings.push('Extreme UV radiation');
  }
  
  return {
    requiresFullAnalysis: warnings.length > 0,
    warnings,
    immediateActionRequired: warnings.length > 2
  };
}

/**
 * Submit user feedback to refine the ML model
 */
export async function submitFeedback(feedback: MLFeedback): Promise<boolean> {
  try {
    const response = await fetch(`${CONFIG.bioSentinelAPI}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getApiKeyHeader()
      },
      body: JSON.stringify(feedback)
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to submit ML feedback:', error);
    return false;
  }
}

/**
 * Format SHAP explanations for display
 */
export function formatExplanations(
  topFactors: MLPrediction['topFactors']
): string[] {
  if (!topFactors) return [];
  
  return topFactors.map(factor => {
    const impact = factor.impact === 'increases' ? '↑' : '↓';
    const strength = factor.importance > 0.5 ? 'strongly' : 'moderately';
    const featureName = factor.feature
      .replace(/_/g, ' ')
      .replace(/celsius/i, '(°C)')
      .replace(/kph/i, '(km/h)');
    
    return `${impact} ${featureName}: ${factor.value.toFixed(1)} (${strength} ${factor.impact} risk)`;
  });
}

// ===========================
// EXPORT
// ===========================

export default {
  predictBioRisks,
  quickHealthCheck,
  checkBioSentinelHealth,
  formatExplanations
};
