/**
 * Bio-SentinelX — WebLLM Training & Disease Outbreak Prediction Service
 *
 * Handles browser-native "fine-tuning" simulations and
 * epidemiological forecasting using locally trained weights.
 */

import { WeatherData } from '../types';
import { trainModel, predictWithTrainedModel, isModelTrained, TrainingConfig, AutoDetectResult } from './realtimeMLService';

export interface OutbreakPrediction {
  syndrome: string;
  probability: number;
  expectedDate: string;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  factors: string[];
}

/**
 * Perform a real-time WebLLM training session on the current environmental context.
 */
export async function performWebLLMTraining(
  weather: WeatherData,
  historicalData: any[] = []
): Promise<{ success: boolean; metrics: any }> {
  console.log('⚡ Starting WebLLM Medical Fine-tuning...');

  // Create synthetic dataset based on current weather + historical context
  const dataset = generateTrainingData(weather, historicalData);

  const config: TrainingConfig = {
    modelType: 'ensemble',
    nEstimators: 100,
    maxDepth: 10,
    learningRate: 0.1,
    validationSplit: 0.2,
    epochs: 20,
    batchSize: 32,
    hiddenLayers: [64, 32]
  };

  const autoDetect: AutoDetectResult = {
    features: ['temp', 'humidity', 'aqi', 'uv_index', 'pressure'],
    label: 'risk_label',
    classNames: ['Normal', 'Alert', 'Outbreak'],
    columns: [
      { name: 'temp', type: 'numeric' },
      { name: 'humidity', type: 'numeric' },
      { name: 'aqi', type: 'numeric' },
      { name: 'uv_index', type: 'numeric' },
      { name: 'pressure', type: 'numeric' },
      { name: 'risk_label', type: 'categorical' }
    ]
  };

  try {
    const result = await trainModel(dataset, config, autoDetect);
    return { success: true, metrics: result };
  } catch (err) {
    console.error('WebLLM Training Failed:', err);
    return { success: false, metrics: null };
  }
}

/**
 * Predict potential disease outbreaks using the trained WebLLM weights.
 */
export function predictOutbreak(weather: WeatherData): OutbreakPrediction[] {
  if (!isModelTrained()) return [];

  const input = {
    temp: weather.temp,
    humidity: weather.humidity,
    aqi: weather.aqi,
    uv_index: weather.uvIndex || 0,
    pressure: weather.pressure
  };

  const prediction = predictWithTrainedModel(input);
  if (!prediction) return [];

  // Map ML classes to syndromes and outbreak risks
  const outbreaks: OutbreakPrediction[] = [
    {
      syndrome: prediction.prediction === 'Outbreak' ? 'Acute Febrile Illness' : 'General Monitoring',
      probability: prediction.confidence,
      expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      riskLevel: prediction.confidence > 0.8 ? 'CRITICAL' : prediction.confidence > 0.5 ? 'HIGH' : 'MODERATE',
      factors: prediction.topFactors.map(f => f.feature)
    }
  ];

  return outbreaks;
}

function generateTrainingData(weather: WeatherData, historical: any[]) {
  // Logic to create a balanced dataset for local fine-tuning
  const data = [];
  for (let i = 0; i < 200; i++) {
    const t = weather.temp + (Math.random() - 0.5) * 10;
    const h = weather.humidity + (Math.random() - 0.5) * 20;
    const a = Math.max(1, Math.min(5, weather.aqi + (Math.random() > 0.8 ? 1 : 0)));

    let label = 'Normal';
    if (t > 38 && h > 80) label = 'Outbreak';
    else if (a > 4) label = 'Alert';

    data.push({
      temp: t,
      humidity: h,
      aqi: a,
      uv_index: (weather.uvIndex || 2) + (Math.random() - 0.5),
      pressure: weather.pressure + (Math.random() - 0.5) * 5,
      risk_label: label
    });
  }
  return data;
}
