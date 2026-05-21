import type { HospitalCaseReport, OutbreakPrediction, OutbreakRiskLevel, DiseaseCluster, WeatherData, LifestyleData } from '../types';
import { storeCaseReport, fetchCaseReports, searchSimilarCases } from './supabaseService';

const LOCAL_REPORTS_KEY = 'biosentinel_local_case_reports';
const PREDICTIONS_KEY = 'biosentinel_outbreak_predictions';

/**
 * Generate dense embeddings for a case report's description and symptoms.
 */
export async function generateCaseEmbedding(text: string, apiKey: string): Promise<number[]> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    });
    if (!res.ok) {
      throw new Error(`Embedding API returned HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.embedding?.values as number[];
  } catch (err) {
    console.warn('[OutbreakLLM] Failed to generate case embedding:', err);
    throw err;
  }
}

/**
 * Submits a new case report from hospital staff.
 * Tries to sync to Supabase and always saves locally.
 */
export async function submitCaseReport(
  reportData: Omit<HospitalCaseReport, 'id' | 'timestamp' | 'syncedToCloud' | 'embedding'>,
  apiKey?: string
): Promise<HospitalCaseReport> {
  const id = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = Date.now();

  const report: HospitalCaseReport = {
    ...reportData,
    id,
    timestamp,
    syncedToCloud: false,
  };

  // Attempt dense embedding generation if Gemini key is provided
  if (apiKey) {
    try {
      const embeddingText = `Disease: ${report.disease}. Symptoms: ${report.symptoms}. Location: ${report.city}, ${report.district}. Notes: ${report.additionalNotes}`;
      report.embedding = await generateCaseEmbedding(embeddingText, apiKey);
    } catch {
      // Non-fatal, continue without embedding
    }
  }

  // Attempt cloud storage in Supabase
  try {
    const cloudRes = await storeCaseReport(report);
    if (cloudRes.success) {
      report.syncedToCloud = true;
    }
  } catch (err) {
    console.warn('[OutbreakLLM] Supabase store failed, storing locally only:', err);
  }

  // Save to localStorage
  try {
    const localReports = getLocalCaseReports();
    localReports.unshift(report);
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(localReports));
  } catch (err) {
    console.error('[OutbreakLLM] Local storage save failed:', err);
  }

  return report;
}

/**
 * Get all case reports stored locally.
 */
export function getLocalCaseReports(): HospitalCaseReport[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Sync offline/unsynced local case reports to the cloud.
 */
export async function syncUnsyncedReports(): Promise<{ successCount: number; failedCount: number }> {
  const localReports = getLocalCaseReports();
  const unsynced = localReports.filter(r => !r.syncedToCloud);
  let successCount = 0;
  let failedCount = 0;

  for (const report of unsynced) {
    try {
      const res = await storeCaseReport(report);
      if (res.success) {
        report.syncedToCloud = true;
        successCount++;
      } else {
        failedCount++;
      }
    } catch {
      failedCount++;
    }
  }

  if (successCount > 0) {
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(localReports));
  }

  return { successCount, failedCount };
}

/**
 * Save an outbreak prediction to history.
 */
export function savePredictionToHistory(prediction: OutbreakPrediction): void {
  try {
    const history = getPredictionHistory();
    history.unshift(prediction);
    localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(history.slice(0, 50))); // Cap at 50 records
  } catch (err) {
    console.error('[OutbreakLLM] Failed to save prediction history:', err);
  }
}

/**
 * Get all past outbreak predictions.
 */
export function getPredictionHistory(): OutbreakPrediction[] {
  try {
    return JSON.parse(localStorage.getItem(PREDICTIONS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Helper to execute completion requests across various providers.
 */
async function executeLLMRequest(
  systemPrompt: string,
  userPrompt: string,
  provider: string,
  model: string,
  apiKey: string
): Promise<string> {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nUser Request/Context:\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        }
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini API returned status ${res.status}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // OpenAI-compatible endpoint configurations
  let endpoint = '';
  if (normalizedProvider === 'groq') {
    endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  } else if (normalizedProvider === 'openrouter') {
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  } else if (normalizedProvider === 'siliconflow') {
    endpoint = 'https://api.siliconflow.com/v1/chat/completions';
  } else if (normalizedProvider === 'cerebras') {
    endpoint = 'https://api.cerebras.ai/v1/chat/completions';
  } else if (normalizedProvider === 'ollama') {
    endpoint = 'http://localhost:11434/v1/chat/completions';
  } else {
    // Default fallback to OpenRouter
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `LLM Provider ${provider} returned status ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Runs the AI outbreak prediction logic using the accumulated data, local weather/environmental metrics, and active patient records.
 */
export async function runOutbreakPrediction(
  weather: WeatherData,
  lifestyle: LifestyleData | undefined,
  aiProvider: string,
  aiModel: string,
  aiKey: string
): Promise<OutbreakPrediction> {
  // 1. Fetch case reports from both cloud and local database
  let caseReports: HospitalCaseReport[] = [];
  try {
    caseReports = await fetchCaseReports(100);
  } catch (err) {
    console.warn('[OutbreakLLM] Cloud case reports fetch failed, relying on local:', err);
  }

  const localReports = getLocalCaseReports();
  // Merge and deduplicate by id
  const reportsMap = new Map<string, HospitalCaseReport>();
  localReports.forEach(r => reportsMap.set(r.id, r));
  caseReports.forEach(r => reportsMap.set(r.id, r));
  const allReports = Array.from(reportsMap.values());

  // Filter to active reports in the last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeReports = allReports.filter(r => r.timestamp >= thirtyDaysAgo);

  // 2. Aggregate statistics for context construction
  const totalCases = activeReports.reduce((sum, r) => sum + r.patientCount, 0);
  const diseaseBreakdown: Record<string, number> = {};
  const locationBreakdown: Record<string, number> = {};

  activeReports.forEach(r => {
    diseaseBreakdown[r.disease] = (diseaseBreakdown[r.disease] || 0) + r.patientCount;
    const locKey = `${r.city}, ${r.district}`;
    locationBreakdown[locKey] = (locationBreakdown[locKey] || 0) + r.patientCount;
  });

  // 3. Format context blocks
  const reportsContext = activeReports.map(r => 
    `- [Date: ${new Date(r.timestamp).toLocaleDateString()}] ${r.patientCount} cases of ${r.disease} reported at ${r.facilityName} in ${r.city}, ${r.district}, ${r.state}. Symptoms: ${r.symptoms}. Demographics: ${r.ageRange} age range, ${r.genderDistribution}. Notes: ${r.additionalNotes}`
  ).join('\n') || 'No active patient case reports reported in the last 30 days.';

  const weatherContext = `
Location: ${weather.city} (Lat: ${weather.lat}, Lon: ${weather.lon})
Temperature: ${weather.temp}°C (Feels like: ${weather.feelsLike}°C)
Humidity: ${weather.humidity}%
Pressure: ${weather.pressure} hPa
Air Quality Index (AQI): ${weather.aqi}
Wind Speed: ${weather.windSpeed} m/s
Boundary Layer Height: ${weather.advancedData?.boundaryLayerHeight ?? 'N/A'} m
Soil Moisture: ${weather.advancedData?.soilMoisture ?? 'N/A'} m³/m³
Soil Temperature: ${weather.advancedData?.soilTemperature ?? 'N/A'} °C
Evapotranspiration: ${weather.advancedData?.evapotranspiration ?? 'N/A'} mm
`;

  const lifestyleContext = lifestyle ? `
User Demographics & Health Profile:
- Age: ${lifestyle.age || 'N/A'}
- Gender: ${lifestyle.gender || 'N/A'}
- City Type: ${lifestyle.cityType || 'N/A'}
- Chronic Conditions: ${lifestyle.chronicConditions || 'None'}
- Allergies: ${lifestyle.allergies || 'None'}
` : 'No specific user health profile provided.';

  // 4. Formulate the Prompts
  const systemPrompt = `You are the Bio-SentinelX Epidemiological Intelligence Engine.
Your role is to analyze multi-source health signals, weather datasets, hospital staff case reports, and patient demographic indicators to predict infectious disease outbreaks and clustering with precision.

You MUST analyze the inputs and produce a highly structured outbreak prediction response strictly formatted as a valid JSON object. 
Do not include any preambles, introductory sentences, markdown styling except for a standard raw JSON structure.

JSON Response Schema Requirement:
{
  "overallRisk": "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "EPIDEMIC",
  "confidence": 0-100,
  "predictedDiseases": [
    {
      "disease": "Disease Name",
      "probability": 0.0 to 1.0,
      "estimatedCases": "e.g. 10-15 cases",
      "peakWindow": "e.g. Next 7-14 days"
    }
  ],
  "diseaseClusters": [
    {
      "disease": "Disease Name",
      "locations": ["City/District Name"],
      "totalCases": number,
      "trend": "rising" | "stable" | "declining",
      "riskLevel": "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "EPIDEMIC",
      "firstReported": timestamp,
      "lastReported": timestamp
    }
  ],
  "environmentalFactors": {
    "temperature": number,
    "humidity": number,
    "aqi": number,
    "riskMultiplier": number,
    "seasonalContext": "Epidemiological interpretation of temperature/humidity/AQI on vector breeding or airborne spread."
  },
  "geographicSpread": {
    "epicenter": "Location name",
    "affectedAreas": ["Area 1", "Area 2"],
    "spreadDirection": "Direction or pattern of spread, e.g., Northward along transit corridors"
  },
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"],
  "rawAnalysis": "Detailed epidemiological assessment explaining the vector dynamics, atmospheric multipliers, and clustering patterns observed in the case reports."
}

Make sure that:
1. "overallRisk" is set objectively based on total cases and environmental parameters (high temp + high humidity multiplies Dengue/Malaria risk; extreme cold/low humidity multiplies flu risk; high AQI worsens respiratory disease rates).
2. Recommendations are practical, clinical, and actionable for hospital staff, community leaders, and local residents.
3. Every single field matches the exact type constraints requested.`;

  const userPrompt = `
=== EPIDEMIOLOGICAL DATA SUMMARY ===
Active Case Reports (Last 30 Days):
Total Active Cases: ${totalCases}
Disease Distribution: ${JSON.stringify(diseaseBreakdown, null, 2)}
Geographic Distribution: ${JSON.stringify(locationBreakdown, null, 2)}

=== DETAILED CASE LOG ===
${reportsContext}

=== LOCAL CLIMATE & ENVIRONMENTAL FACTORS ===
${weatherContext}

=== PATIENT HEALTH PROFILE CONTRAST ===
${lifestyleContext}

Please execute the vector-similarity analysis, evaluate the epidemiological threat, and output the structured JSON outbreak assessment.`;

  // 5. Query the LLM
  try {
    const rawResult = await executeLLMRequest(systemPrompt, userPrompt, aiProvider, aiModel, aiKey);
    
    // Clean response to handle potential markdown wrappers
    let cleanJson = rawResult.trim();
    if (cleanJson.startsWith('```')) {
      const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        cleanJson = match[1].trim();
      }
    }

    const parsed = JSON.parse(cleanJson);
    
    // Construct valid OutbreakPrediction object
    const prediction: OutbreakPrediction = {
      id: `prediction-${Date.now()}`,
      timestamp: Date.now(),
      overallRisk: parsed.overallRisk || 'LOW',
      confidence: parsed.confidence || 50,
      predictedDiseases: parsed.predictedDiseases || [],
      diseaseClusters: (parsed.diseaseClusters || []).map((c: any) => ({
        ...c,
        firstReported: c.firstReported || Date.now() - 7 * 24 * 3600 * 1000,
        lastReported: c.lastReported || Date.now(),
      })),
      environmentalFactors: {
        temperature: parsed.environmentalFactors?.temperature ?? weather.temp,
        humidity: parsed.environmentalFactors?.humidity ?? weather.humidity,
        aqi: parsed.environmentalFactors?.aqi ?? weather.aqi,
        riskMultiplier: parsed.environmentalFactors?.riskMultiplier ?? 1.0,
        seasonalContext: parsed.environmentalFactors?.seasonalContext || 'Standard baseline risk conditions.',
      },
      geographicSpread: {
        epicenter: parsed.geographicSpread?.epicenter || weather.city,
        affectedAreas: parsed.geographicSpread?.affectedAreas || [weather.city],
        spreadDirection: parsed.geographicSpread?.spreadDirection || 'Local containment',
      },
      recommendations: parsed.recommendations || ['Maintain standard clinical hygiene.', 'Monitor local disease surveillance portals.'],
      rawAnalysis: parsed.rawAnalysis || rawResult,
      aiProvider,
      aiModel,
    };

    savePredictionToHistory(prediction);
    return prediction;

  } catch (err) {
    console.error('[OutbreakLLM] Outbreak prediction failed:', err);
    
    // Return a structured fallback object in case of error
    const fallbackPrediction: OutbreakPrediction = {
      id: `prediction-fallback-${Date.now()}`,
      timestamp: Date.now(),
      overallRisk: totalCases > 20 ? 'HIGH' : totalCases > 5 ? 'MODERATE' : 'LOW',
      confidence: 30,
      predictedDiseases: Object.entries(diseaseBreakdown).map(([disease, count]) => ({
        disease,
        probability: Math.min(0.9, count / 20),
        estimatedCases: `${count} active reports`,
        peakWindow: 'Next 7 days',
      })),
      diseaseClusters: Object.entries(diseaseBreakdown).map(([disease, count]) => ({
        disease,
        locations: [weather.city],
        totalCases: count,
        trend: 'stable',
        riskLevel: count > 10 ? 'HIGH' : 'MODERATE',
        firstReported: Date.now() - 5 * 24 * 3600 * 1000,
        lastReported: Date.now(),
      })),
      environmentalFactors: {
        temperature: weather.temp,
        humidity: weather.humidity,
        aqi: weather.aqi,
        riskMultiplier: weather.temp > 28 && weather.humidity > 70 ? 1.4 : 1.0,
        seasonalContext: 'Calculated from live atmospheric reports.',
      },
      geographicSpread: {
        epicenter: weather.city,
        affectedAreas: [weather.city],
        spreadDirection: 'Undetermined (limited RAG logs)',
      },
      recommendations: [
        'Ensure hospital syndromic logs are updated frequently.',
        'Review standard vector control practices if hot/humid.',
        'Advise patients with active symptoms to seek clinical verification.'
      ],
      rawAnalysis: `Automated rule-based backup report triggered. Local active case count stands at ${totalCases} patients across ${Object.keys(diseaseBreakdown).length || 1} syndromes. Environmental markers (Temp: ${weather.temp}°C, Humidity: ${weather.humidity}%) suggest standard baseline vectors. Details: ${err instanceof Error ? err.message : 'AI model response parsing exception.'}`,
      aiProvider,
      aiModel,
    };

    savePredictionToHistory(fallbackPrediction);
    return fallbackPrediction;
  }
}
