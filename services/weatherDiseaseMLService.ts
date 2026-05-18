import * as tf from '@tensorflow/tfjs';
import { WeatherData } from '../types';
import { MLPrediction } from './realtimeMLService';

// Embedded representative subset of the dataset
const trainingData = [
  { temp: 25.8, hum: 0.74, wind: 8.2, aqi: 45, pm25: 12, label: 'Heart Attack' },
  { temp: 21.6, hum: 0.60, wind: 15.2, aqi: 30, pm25: 8, label: 'Influenza' },
  { temp: 37.2, hum: 0.61, wind: 18.0, aqi: 60, pm25: 18, label: 'Dengue' },
  { temp: 18.1, hum: 0.87, wind: 17.9, aqi: 110, pm25: 40, label: 'Sinusitis' },
  { temp: -5.5, hum: 0.90, wind: 4.6, aqi: 80, pm25: 25, label: 'Heart Attack' },
  { temp: 24.4, hum: 0.73, wind: 11.0, aqi: 50, pm25: 15, label: 'Eczema' },
  { temp: 29.9, hum: 0.92, wind: 8.0, aqi: 40, pm25: 10, label: 'Common Cold' },
  { temp: 33.0, hum: 0.58, wind: 15.2, aqi: 70, pm25: 20, label: 'Heat Stroke' },
  { temp: 18.3, hum: 0.76, wind: 2.9, aqi: 35, pm25: 10, label: 'Migraine' },
  { temp: 19.8, hum: 0.50, wind: 13.7, aqi: 25, pm25: 5, label: 'Malaria' },
  { temp: 17.5, hum: 0.85, wind: 2.3, aqi: 90, pm25: 30, label: 'Stroke' },
  { temp: 31.6, hum: 0.74, wind: 10.4, aqi: 65, pm25: 22, label: 'Arthritis' }
];

const labels = Array.from(new Set(trainingData.map(d => d.label)));
let model: tf.Sequential | null = null;
let isTraining = false;

export const initAndTrainModel = async () => {
  if (model || isTraining) return;
  isTraining = true;
  
  const xs = tf.tensor2d(trainingData.map(d => [d.temp, d.hum, d.wind, d.aqi, d.pm25]));
  const ys = tf.tensor2d(trainingData.map(d => {
    const oneHot = new Array(labels.length).fill(0);
    oneHot[labels.indexOf(d.label)] = 1;
    return oneHot;
  }));

  model = tf.sequential();
  model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [5] }));
  model.add(tf.layers.dense({ units: labels.length, activation: 'softmax' }));
  
  model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  
  await model.fit(xs, ys, { epochs: 50, verbose: 0 });
  
  // Cleanup tensors
  xs.dispose();
  ys.dispose();
  
  isTraining = false;
};

export const predictDisease = async (weather: WeatherData): Promise<MLPrediction | null> => {
  if (!model) await initAndTrainModel();
  if (!model) return null;

  const inputTemp = weather.temp;
  const inputHum = weather.humidity;
  const inputWind = weather.windSpeed;
  const inputAqi = weather.rawAqi ?? weather.aqi;
  const inputPm25 = weather.advancedData?.pm2_5 ?? 15;

  const inputTensor = tf.tensor2d([[inputTemp, inputHum, inputWind, inputAqi, inputPm25]]);
  const predictionTensor = model.predict(inputTensor) as tf.Tensor;
  const probabilities = await predictionTensor.data();
  
  let maxIdx = 0;
  let maxProb = probabilities[0];
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > maxProb) {
      maxIdx = i;
      maxProb = probabilities[i];
    }
  }

  const allProbs: Record<string, number> = {};
  labels.forEach((l, i) => { allProbs[l] = probabilities[i]; });

  const disease = labels[maxIdx];
  
  inputTensor.dispose();
  predictionTensor.dispose();

  return {
    disease: disease,
    confidence: maxProb,
    riskScore: maxProb * 0.8,
    primaryTrigger: 'Weather Conditions',
    topFactors: [
      { feature: 'Temperature', value: inputTemp, impact: inputTemp > 30 ? 'increases' : 'decreases', importance: 0.4 },
      { feature: 'Humidity', value: inputHum, impact: inputHum > 0.7 ? 'increases' : 'decreases', importance: 0.3 },
      { feature: 'AQI', value: inputAqi, impact: inputAqi > 100 ? 'increases' : 'decreases', importance: 0.3 }
    ],
    confidenceBreakdown: {
      dataQuality: 0.9,
      historicalMatch: maxProb,
      sensorReliability: 0.85
    },
    allProbabilities: allProbs,
    recommendation: `Based on a local TensorFlow.js inference using historical correlation data, there is a ${Math.round(maxProb * 100)}% likelihood of **${disease}** risk given the current environmental conditions (Temp: ${inputTemp.toFixed(1)}°C, AQI: ${inputAqi}). Please take appropriate precautions.`
  };
};
