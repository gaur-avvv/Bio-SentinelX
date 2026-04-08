import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useDataCache, isCacheValid } from '../contexts/DataCacheContext';
import { Activity, AlertCircle, CloudRain, AlertOctagon, AlertTriangle, ArrowRight, BrainCircuit, CheckCircle, ChevronDown, ChevronRight, ChevronUp, Cpu, Database, FileDown, HeartPulse, Info, Loader2, MessageSquarePlus, RefreshCw, Send, ShieldAlert, ShieldCheck, Sparkles, Thermometer, ThermometerSun, ThumbsDown, ThumbsUp, TrendingUp, XCircle, Zap, Printer, List, Search, Waves, Bug, Wind, CloudFog, CloudSun, Bot, User, Hospital, MapPinned, Phone, Navigation, Droplets, ListChecks, RefreshCcw, ShieldX, Download, Camera, RotateCcw, Trash2, BarChart3, Calendar, Copy, Check, Clock, HelpCircle, BarChart2, ExternalLink, Glasses, PersonStanding, Umbrella, Dumbbell, Flame, FlaskConical, Brain, Heart, Leaf, Moon, Apple, Pill, Coffee, Sun } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, BarChart, Bar, Cell, ReferenceLine } from 'recharts';
import { WeatherData, LoadingState, GroundingChunk, RiskItem, SeverityLevel, ChatMessage, LifestyleData, DatabaseSettings, AiProvider } from '../types';
import { generateHealthRiskAssessment, chatWithWeatherAssistant } from '../services/geminiService';
import { predictBioRisks, MLPrediction, formatExplanations, submitFeedback, quickHealthCheck } from '../services/mlService';
import { saveReport, getReports, deleteReport, clearAllReports, StoredReport, reconstructReportContent } from '../services/memoryService';
import { saveSymptomData, fetchLocalOutbreakData, UserSymptomData } from '../services/dbService';
import { IndicLanguage, INDIC_LANGUAGE_LABELS, processFieldConversation, getFieldConversations } from '../services/indicDataService';
import { reverseGeocode } from '../services/geoService';
import { apiBatchIngest, apiHealth, apiMetrics, apiPredictCustom, apiSingleIngest, apiTrain, apiTrainAuto, apiTrainDetect, apiTrainStatus, type PredictCustomPayload } from '../services/backendApiService';
import { ReportRenderer } from './ReportRenderer';
import { SurveillanceIntegrationHub } from './surveillance/SurveillanceIntegrationHub';
import { stripHiddenModelReasoning } from '../utils/aiTextSanitizer';

import { checkCloudEarlyWarning, getActiveOutbreakAlerts, getOutbreakPredictionStats, type CloudEarlyWarning, type OutbreakAlert } from '../services/outbreakPredictionService';

import { isModelTrained, predictWithTrainedModel, getTrainedModelInfo, getTrainedModelPerformanceMetrics, trainModel, DEFAULT_TRAINING_CONFIG, autoDetectFeaturesAndLabel } from '../services/realtimeMLService';

interface AnalysisDashboardProps {
  weather: WeatherData | null;
  loadingState: LoadingState;
  setLoadingState: (state: LoadingState) => void;
  aiProvider: AiProvider;
  aiModel: string;
  aiKey?: string;
  onOpenAssistant?: () => void;
  databaseSettings?: DatabaseSettings;
  localIntelEnabled?: boolean;
}

interface UserProfileProps {
  data: LifestyleData;
  onChange: (data: LifestyleData) => void;
}

interface MLFeatureInputsProps {
  weather: WeatherData | null;
}

const MLFeatureInputs: React.FC<MLFeatureInputsProps> = ({ weather }) => {
  const modelInfo = getTrainedModelInfo();
  if (!modelInfo) return null;

  const getFeatureValue = (feature: string): string => {
    if (!weather) return 'N/A';
    const featureMap: Record<string, number | undefined> = {
      temp: weather.temp, temperature: weather.temp,
      feels_like: weather.feelsLike, pressure: weather.pressure,
      humidity: weather.humidity, wind_speed: weather.windSpeed,
      wind_deg: weather.windDeg, clouds: weather.clouds,
      visibility: weather.visibility ? weather.visibility / 1000 : undefined,
      uv_index: weather.uvIndex ?? undefined, aqi: weather.aqi,
      'air_quality_PM2.5': weather.advancedData?.pm2_5,
      'air_quality_PM10': weather.advancedData?.pm10,
      pm2_5: weather.advancedData?.pm2_5, pm10: weather.advancedData?.pm10,
      dew_point: weather.dewPoint ?? undefined,
    };
    const val = featureMap[feature] ?? featureMap[feature.toLowerCase()];
    return val !== undefined ? val.toFixed(2) : 'N/A';
  };

  return (
    <div className="mt-6 p-4 sm:p-6 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800">
      <div className="flex items-center gap-2 mb-4">
        <BrainCircuit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <h4 className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">ML Model Features (Live)</h4>
        <span className="ml-auto px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-full text-[8px] font-black text-indigo-600 dark:text-indigo-400 uppercase">
          {modelInfo.type} Model
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {modelInfo.featureNames.map((feature) => (
          <div key={feature} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
            <p className="text-[8px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-wider truncate" title={feature}>{feature.replace(/_/g, ' ')}</p>
            <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5">{getFeatureValue(feature)}</p>
          </div>
        ))}
      </div>
      {modelInfo.classNames.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Classes:</span>
          {modelInfo.classNames.map((cls) => (
            <span key={cls} className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-full text-[9px] font-bold text-indigo-700 dark:text-indigo-300">{cls}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const UserProfile: React.FC<UserProfileProps> = ({ data, onChange }) => {
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const options = {
    gender: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    bloodGroup: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    cityType: ['Urban', 'Semi-Urban', 'Rural', 'Coastal', 'Hilly'],
    stressLevel: ['Low', 'Moderate', 'High', 'Very High'],
    sleepHours: ['<5 hrs', '5-6 hrs', '6-7 hrs', '7-8 hrs', '8-9 hrs', '9+ hrs'],
    waterIntakeLiters: ['<1 L', '1-1.5 L', '1.5-2 L', '2-2.5 L', '2.5-3 L', '3+ L'],
    vaccinationStatus: ['Up to Date', 'Partial', 'Booster Due', 'Unknown', 'Not Vaccinated'],
    occupation: ['Student', 'Office Worker', 'Outdoor Worker', 'Healthcare Worker', 'Industrial Worker', 'Field Worker', 'Driver', 'Homemaker', 'Retired'],
    emergencyContact: ['Family Nearby', 'Family Remote', 'Caregiver Available', 'Lives Alone', 'Community Support', 'No Backup Contact'],
    lifestyle: ['Sedentary', 'Active', 'Athlete', 'Night Shift', 'Outdoor Worker', 'Remote Work', 'Frequent Traveler', 'Student', 'Healthcare Worker', 'High Exposure Worker'],
    exercise: ['None', 'Minimal', 'Moderate', 'Intense', 'Professional', 'Rehabilitation', 'Cardio Focus', 'Strength Focus', 'Yoga / Mobility'],
    smoking: ['No', 'Occasional', 'Daily', 'Former Smoker', 'Vaping'],
    alcoholConsumption: ['None', 'Social', 'Moderate', 'Heavy', 'Occasional', 'Weekly', 'Rarely'],
    medication: ['None', 'Antihistamines', 'Blood Pressure', 'Inhalers', 'Insulin', 'Vitamins', 'Immunosuppressants', 'Painkillers', 'Thyroid', 'Cardiac Medication'],
    chronicConditions: ['None', 'Asthma', 'Diabetes', 'Hypertension', 'Heart Disease', 'COPD', 'Kidney Disease', 'Thyroid Disorder', 'Autoimmune Condition'],
    foodHabits: ['Balanced', 'Vegan', 'Keto', 'High Protein', 'Fast Food', 'Gluten-Free', 'Vegetarian', 'Paleo', 'Low Sodium', 'Low Sugar', 'High Fiber'],
    allergies: ['None', 'Pollen', 'Dust', 'Mold', 'Peanuts', 'Shellfish', 'Lactose', 'Pet Dander', 'Insect Stings', 'Latex', 'Drug Allergy'],
    medicalHistory: ['None', 'Asthma', 'Diabetes', 'Hypertension', 'Heart Disease', 'COPD', 'Migraine', 'Arthritis', 'Eczema', 'Anxiety', 'Kidney Disease', 'Thyroid Disorder'],
    familyHistory: ['None', 'Diabetes', 'Hypertension', 'Heart Disease', 'Stroke', 'Cancer', 'Respiratory Disease', 'Thyroid Issues']
  };

  const singleSelectFields = new Set<keyof typeof options>([
    'gender',
    'bloodGroup',
    'cityType',
    'stressLevel',
    'sleepHours',
    'waterIntakeLiters',
    'vaccinationStatus',
    'occupation',
    'emergencyContact',
    'smoking'
  ]);

  const toggleOption = (field: keyof LifestyleData, val: string) => {
    if ((singleSelectFields as Set<string>).has(field as string)) {
      onChange({ ...data, [field]: val });
      return;
    }

    const current = data[field] as string;
    const items = current ? current.split(', ').filter(i => i) : [];

    let newItems;
    if (items.includes(val)) {
      newItems = items.filter(i => i !== val);
    } else {
      newItems = [...items, val];
    }

    onChange({ ...data, [field]: newItems.join(', ') });
  };

  const addCustomOption = (field: keyof LifestyleData) => {
    const raw = (customValues[field as string] || '').trim();
    if (!raw) return;

    if ((singleSelectFields as Set<string>).has(field as string)) {
      onChange({ ...data, [field]: raw });
      setCustomValues(prev => ({ ...prev, [field as string]: '' }));
      return;
    }

    const current = String(data[field] || '');
    const items = current ? current.split(', ').filter(i => i) : [];
    if (!items.includes(raw)) {
      onChange({ ...data, [field]: [...items, raw].join(', ') });
    }
    setCustomValues(prev => ({ ...prev, [field as string]: '' }));
  };

  return (
    <div className="space-y-4 sm:space-y-6 bg-slate-50 dark:bg-slate-700/40 p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100 dark:border-slate-600">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="space-y-2">
          <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Age</label>
          <input
            type="number"
            value={data.age}
            onChange={(e: any) => onChange({ ...data, age: e.target.value })}
            placeholder="e.g. 32"
            className="w-full p-2.5 sm:p-3 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Height (cm)</label>
          <input
            type="number"
            value={data.height || ''}
            onChange={(e: any) => onChange({ ...data, height: e.target.value })}
            placeholder="e.g. 175"
            className="w-full p-2.5 sm:p-3 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Weight (kg)</label>
          <input
            type="number"
            value={data.weight || ''}
            onChange={(e: any) => onChange({ ...data, weight: e.target.value })}
            placeholder="e.g. 70"
            className="w-full p-2.5 sm:p-3 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
          />
        </div>
      </div>

      {/* Live BMI Card */}
      {(() => {
        const h = parseFloat(data.height || '0');
        const w = parseFloat(data.weight || '0');
        if (!h || !w || h < 50 || w < 10) return null;
        const bmi = w / Math.pow(h / 100, 2);
        const bmiRounded = Math.round(bmi * 10) / 10;
        const { label, color, bg, border, bar, advice } =
          bmi < 16 ? { label: 'Severe Underweight', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', bar: 'bg-violet-500', advice: 'Critically low body mass. Medical evaluation recommended.' } :
            bmi < 18.5 ? { label: 'Underweight', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', bar: 'bg-blue-400', advice: 'Below healthy range. Consider increasing caloric intake.' } :
              bmi < 25 ? { label: 'Normal Weight', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', advice: 'Healthy BMI. Maintain current diet and activity level.' } :
                bmi < 30 ? { label: 'Overweight', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500', advice: 'Slightly above healthy range. Light exercise recommended.' } :
                  bmi < 35 ? { label: 'Obese Class I', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', advice: 'Increased cardiovascular and metabolic risk.' } :
                    bmi < 40 ? { label: 'Obese Class II', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', bar: 'bg-rose-500', advice: 'High risk. Consult a physician for a weight management plan.' } :
                      { label: 'Obese Class III', color: 'text-red-900', bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-700', advice: 'Severe obesity. Immediate medical guidance is strongly advised.' };
        // BMI scale: 10–45 mapped to 0–100%
        const pct = Math.min(100, Math.max(0, ((bmi - 10) / 35) * 100));
        // Ideal weight range for this height
        const idealMin = Math.round(18.5 * Math.pow(h / 100, 2));
        const idealMax = Math.round(24.9 * Math.pow(h / 100, 2));
        return (
          <div className={`p-4 sm:p-5 rounded-2xl border ${bg} ${border} space-y-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BMI Calculator</span>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${bg} ${border} ${color}`}>{label}</span>
            </div>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-black tracking-tighter ${color}`}>{bmiRounded}</span>
              <span className="text-xs font-black text-slate-400 mb-1">kg/m²</span>
              <div className="flex-1" />
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ideal Range</p>
                <p className={`text-xs font-black ${color}`}>{idealMin}–{idealMax} kg</p>
              </div>
            </div>
            {/* BMI scale bar */}
            <div className="relative h-3 bg-gradient-to-r from-violet-300 via-emerald-400 via-amber-400 to-red-600 rounded-full overflow-hidden">
              <div
                className="absolute top-0 w-3 h-3 bg-white border-2 border-slate-700 rounded-full shadow-md transition-all duration-700"
                style={{ left: `calc(${pct}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-wider">
              <span>10</span><span>18.5</span><span>25</span><span>30</span><span>40+</span>
            </div>
            <p className={`text-[10px] font-bold leading-relaxed ${color}`}>{advice}</p>
          </div>
        );
      })()}
      {(Object.keys(options) as Array<keyof typeof options>).map((field) => (
        <div key={field} className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{field.replace(/([A-Z])/g, ' $1')}</span>
            <span className="text-[7px] sm:text-[8px] font-black text-teal-600 uppercase">
              {(singleSelectFields as Set<string>).has(field as string) ? 'Select One' : 'Select Multiple'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {options[field].map((opt) => {
              const fieldKey = field as keyof LifestyleData;
              const currentValue = String(data[fieldKey] ?? '');
              const isActive = (singleSelectFields as Set<string>).has(field as string)
                ? currentValue === opt
                : currentValue.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggleOption(field, opt)}
                  className={`px-3 sm:px-4 py-2 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all border ${isActive
                    ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-200'
                    : 'bg-white dark:bg-slate-600 border-slate-200 dark:border-slate-500 text-slate-500 dark:text-slate-200 hover:border-teal-400'
                    }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customValues[field as string] || ''}
              onChange={(e: any) => setCustomValues(prev => ({ ...prev, [field as string]: e.target.value }))}
              onKeyDown={(e: any) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomOption(field as keyof LifestyleData);
                }
              }}
              placeholder="Not listed? Add custom"
              className="flex-1 p-2.5 sm:p-3 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
            />
            <button
              type="button"
              onClick={() => addCustomOption(field as keyof LifestyleData)}
              className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest hover:bg-teal-100 dark:hover:bg-teal-900/40"
            >
              Add
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};



const MLInferenceCard: React.FC<{ prediction: MLPrediction }> = ({ prediction }) => {
  const [feedback, setFeedback] = useState<'helpful' | 'not-helpful' | null>(null);
  const [comment, setComment] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleFeedback = async (isHelpful: boolean) => {
    if (submitted) return;
    setFeedback(isHelpful ? 'helpful' : 'not-helpful');
    setShowCommentInput(true);

    // Initial submission
    await submitFeedback({
      predictionId: `ml-${Date.now()}`,
      isHelpful,
      timestamp: new Date().toISOString()
    });
  };

  const submitComment = async () => {
    if (!comment.trim()) return;

    await submitFeedback({
      predictionId: `ml-${Date.now()}`,
      isHelpful: feedback === 'helpful',
      userComment: comment,
      timestamp: new Date().toISOString()
    });
    setSubmitted(true);
    setShowCommentInput(false);
  };

  const getTriggerSeverity = (trigger: string) => {
    const t = trigger.toLowerCase();
    if (t.includes('extreme') || t.includes('critical') || t.includes('severe')) return 1.0;
    if (t.includes('high') || t.includes('elevated')) return 0.75;
    if (t.includes('moderate')) return 0.5;
    return 0.25;
  };

  const triggerSeverity = getTriggerSeverity(prediction.primaryTrigger);
  const trainedPerf = getTrainedModelPerformanceMetrics();
  // Adjusted weighted combination logic
  const weightedScore = (prediction.riskScore * 0.4) + (prediction.confidence * 0.4) + (triggerSeverity * 0.2);

  let dynamicRiskLevel = 'LOW';
  if (weightedScore >= 0.8) dynamicRiskLevel = 'CRITICAL';
  else if (weightedScore >= 0.6) dynamicRiskLevel = 'HIGH';
  else if (weightedScore >= 0.4) dynamicRiskLevel = 'MODERATE';

  const getRiskColor = (level?: string) => {
    switch (level) {
      case 'CRITICAL': return 'text-purple-500 border-purple-200 bg-purple-50';
      case 'HIGH': return 'text-rose-500 border-rose-200 bg-rose-50';
      case 'MODERATE': return 'text-amber-500 border-amber-200 bg-amber-50';
      case 'LOW': return 'text-emerald-500 border-emerald-200 bg-emerald-50';
      default: return 'text-slate-500 border-slate-200 bg-slate-50';
    }
  };

  const sortedFactors = (prediction.factorContributions && prediction.factorContributions.length > 0
    ? [...prediction.factorContributions]
      .sort((a, b) => Math.abs(b.signedContribution) - Math.abs(a.signedContribution))
      .slice(0, 8)
    : (prediction.topFactors || []).map(f => ({
      feature: f.feature,
      value: f.value,
      importance: f.importance,
      signedContribution: f.importance * (f.impact === 'increases' ? 1 : -1),
      direction: f.impact === 'increases' ? 'increases' as const : 'decreases' as const,
    }))
      .sort((a, b) => Math.abs(b.signedContribution) - Math.abs(a.signedContribution))
      .slice(0, 8)
  );
  const showInternalPanels = localStorage.getItem('biosentinel_show_internal_panels') === 'true';

  const causalPathways = sortedFactors.slice(0, 4).map(f => {
    const feature = f.feature.toLowerCase();
    if (feature.includes('pm2') || feature.includes('pm10') || feature.includes('aqi')) {
      return `Air particulates elevated (${f.feature}) -> airway inflammation -> respiratory flare risk`;
    }
    if (feature.includes('temp') || feature.includes('heat') || feature.includes('uv')) {
      return `Thermal load increased (${f.feature}) -> dehydration/heat strain -> cardiovascular and heat illness risk`;
    }
    if (feature.includes('humidity') || feature.includes('dew')) {
      return `High moisture burden (${f.feature}) -> pathogen/allergen persistence -> infectious and allergic symptom risk`;
    }
    if (feature.includes('pressure') || feature.includes('wind')) {
      return `Atmospheric instability (${f.feature}) -> physiological stress response -> headache and cardiopulmonary risk`;
    }
    return `${f.feature} anomaly -> environmental stress accumulation -> elevated disease vulnerability`;
  });

  const exportSnapshotJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      disease: prediction.disease || 'General Assessment',
      confidence: prediction.confidence,
      confidenceBreakdown: prediction.confidenceBreakdown,
      topPredictorSnapshot: prediction.topPredictorSnapshot || [],
      factorContributions: prediction.factorContributions || [],
      probabilities: prediction.allProbabilities || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml_snapshot_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportSnapshotCsv = () => {
    const rows = (prediction.factorContributions || []).map(f => [
      f.feature,
      String(f.value ?? ''),
      f.importance.toFixed(6),
      f.signedContribution.toFixed(6),
      f.direction,
    ]);
    const header = ['feature', 'value', 'importance', 'signedContribution', 'direction'];
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml_snapshot_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 sm:space-y-10 p-5 sm:p-10 bg-slate-900 rounded-[2rem] sm:rounded-[3rem] border border-slate-800 shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-teal-500/5 rounded-full -mr-24 sm:-mr-32 -mt-24 sm:-mt-32 blur-2xl sm:blur-3xl" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-8 relative z-10">
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="p-2.5 sm:p-4 bg-teal-500 rounded-xl sm:rounded-2xl shadow-xl shadow-teal-500/20 shrink-0">
            <Cpu className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
          </div>
          <div>
            <h3 className="text-xl sm:text-3xl font-black text-teal-400 uppercase leading-none">AI Risk Inference</h3>
            <p className="text-[8px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1 sm:mt-2">Bio-Sentinel Custom Model Output</p>
          </div>
        </div>

        <div className={`self-start md:self-auto px-3 sm:px-6 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 font-black uppercase tracking-widest text-[9px] sm:text-xs flex items-center gap-1.5 sm:gap-3 ${getRiskColor(dynamicRiskLevel)}`}>
          <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse ${dynamicRiskLevel === 'CRITICAL' ? 'bg-purple-500' : dynamicRiskLevel === 'HIGH' ? 'bg-rose-500' : dynamicRiskLevel === 'MODERATE' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {dynamicRiskLevel} RISK LEVEL
        </div>
      </div>

      <div className="flex flex-col gap-6 sm:gap-12 relative z-10">
        {trainedPerf && (
          <div className="p-4 sm:p-6 bg-slate-800/60 rounded-2xl border border-slate-700/60">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-teal-400" />
              <h4 className="text-[10px] sm:text-xs font-black text-teal-300 uppercase tracking-widest">Model Performance Metrics</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Accuracy</p>
                <p className="text-sm sm:text-base font-black text-emerald-300">{(trainedPerf.accuracy * 100).toFixed(2)}%</p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Loss</p>
                <p className="text-sm sm:text-base font-black text-amber-300">{trainedPerf.loss.toFixed(4)}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">F1 Score</p>
                <p className="text-sm sm:text-base font-black text-cyan-300">{(trainedPerf.f1Score * 100).toFixed(2)}%</p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Train Time</p>
                <p className="text-sm sm:text-base font-black text-violet-300">{trainedPerf.trainTime.toFixed(1)}s</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-2">
              <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-700">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Precision</p>
                <p className="text-sm font-black text-slate-200">{(trainedPerf.precision * 100).toFixed(2)}%</p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-700">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Recall</p>
                <p className="text-sm font-black text-slate-200">{(trainedPerf.recall * 100).toFixed(2)}%</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
          <div className="p-5 sm:p-8 bg-slate-800/50 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-700/50 backdrop-blur-sm h-full flex flex-col justify-center">
            <h4 className="text-[9px] sm:text-xs font-black text-slate-300 uppercase tracking-widest mb-3 sm:mb-6 flex items-center gap-2">
              Primary Diagnosis <span className="px-2 py-0.5 bg-teal-500/20 text-teal-300 rounded-md text-[8px]">Real-time WebLLM Trained</span>
            </h4>
            <div className="space-y-2 sm:space-y-4">
              <h5 className="text-xl sm:text-4xl font-black text-white tracking-tighter uppercase leading-none break-words">{prediction.disease || 'General Assessment'}</h5>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                <div className="flex-1 h-1.5 sm:h-2 bg-slate-700 rounded-full overflow-hidden w-full">
                  <div
                    className="h-full bg-teal-500 transition-all duration-1000"
                    style={{ width: `${(prediction.confidence || 0) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] sm:text-xs font-black text-teal-300 uppercase whitespace-nowrap">{(prediction.confidence * 100).toFixed(0)}% Confidence</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 p-5 sm:p-8 bg-slate-800/50 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-700/50 backdrop-blur-sm h-full">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] sm:text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5 sm:gap-2">
                <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-teal-400" /> Feature Impact
              </h4>
              <div className="group relative">
                <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4 text-slate-300 cursor-help" />
                <div className="absolute right-0 bottom-full mb-2 w-48 sm:w-64 p-2 sm:p-3 bg-slate-800 text-slate-100 text-[9px] sm:text-[10px] rounded-lg sm:rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl">
                  SHAP (SHapley Additive exPlanations) values show how much each feature contributes to the final prediction. Red increases risk, green decreases it.
                </div>
              </div>
            </div>
            <div className="space-y-3 sm:space-y-3">
              {sortedFactors.length > 0 ? (
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={sortedFactors.map(f => ({
                        feature: f.feature,
                        value: f.value,
                        impact: f.direction,
                        importance: f.importance,
                        signedContribution: f.signedContribution,
                        fill: f.signedContribution >= 0 ? '#f43f5e' : '#10b981'
                      }))}
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="feature"
                        type="category"
                        width={80}
                        tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs font-bold text-slate-100 space-y-1">
                                <p className="text-slate-300 uppercase tracking-widest text-[9px] mb-2">{data.feature}</p>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Value:</span>
                                  <span>{data.value?.toFixed(2) || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Impact:</span>
                                  <span className={data.impact === 'increases' ? 'text-rose-400 uppercase' : 'text-emerald-400 uppercase'}>
                                    {data.impact}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine x={0} stroke="#475569" />
                      <Bar dataKey="signedContribution" radius={[0, 4, 4, 0]} barSize={20}>
                        {sortedFactors.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.signedContribution >= 0 ? '#f43f5e' : '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] w-full flex items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-400 text-xs font-black uppercase tracking-widest">
                  Feature insights will appear after prediction data loads
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Causal pathway mini-graph (text flow) */}
      {causalPathways.length > 0 && (
        <div className="relative z-10 p-5 sm:p-6 bg-slate-800/50 rounded-2xl border border-slate-700/60">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-teal-400" />
            <h4 className="text-[10px] sm:text-xs font-black text-teal-300 uppercase tracking-widest">Causal Pathway Analysis</h4>
          </div>
          <div className="space-y-2">
            {causalPathways.map((path, idx) => (
              <p key={`${path}-${idx}`} className="text-xs sm:text-sm font-bold text-slate-200 leading-relaxed">
                {idx + 1}. {path}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ML-Driven Recommendations - Full Width Below */}
      {prediction.recommendation && (
        <div id="section-ml-recommendations" className="w-full mt-2 pt-8 border-t border-slate-800 scroll-mt-24">
          <div className="flex items-center gap-3 sm:gap-4 mb-6">
            <div className="p-2.5 sm:p-3 bg-teal-500/20 rounded-xl border border-teal-500/30 shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-teal-400" />
            </div>
            <div>
              <h4 className="text-base sm:text-lg font-black text-teal-300 uppercase tracking-widest">ML-Driven Recommendations</h4>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">BioSentinel Intelligence Report</p>
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-2xl sm:rounded-3xl border border-slate-700/60 p-6 sm:p-10">
            {showInternalPanels ? (
              <div className="flex flex-wrap justify-end gap-2 mb-4">
                <button
                  type="button"
                  onClick={exportSnapshotJson}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Export Snapshot JSON
                </button>
                <button
                  type="button"
                  onClick={exportSnapshotCsv}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Export Snapshot CSV
                </button>
              </div>
            ) : null}
            <ReportRenderer markdown={prediction.recommendation} />
          </div>

          {/* Feedback Section */}
          <div className="mt-6 pt-6 border-t border-teal-500/10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Was this helpful?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFeedback(true)}
                  disabled={submitted}
                  className={`p-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 ${feedback === 'helpful' ? 'bg-teal-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  aria-label="Mark as helpful"
                >
                  <ThumbsUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedback(false)}
                  disabled={submitted}
                  className={`p-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-rose-500 ${feedback === 'not-helpful' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  aria-label="Mark as not helpful"
                >
                  <ThumbsDown className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            {showCommentInput && !submitted && (
              <div className="animate-fade-in space-y-2">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us more about your experience..."
                  className="w-full bg-slate-900/50 border border-teal-500/20 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500/50 transition-colors resize-none h-20"
                />
                <button
                  type="button"
                  onClick={submitComment}
                  className="w-full py-2 bg-teal-500 hover:bg-teal-400 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  Submit Feedback
                </button>
              </div>
            )}
            {submitted && (
              <div className="text-center py-2 text-xs font-bold text-teal-400 animate-fade-in">
                Thank you for your feedback!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Isolated chat input – keystrokes only re-render this tiny component ──────
const ChatInputForm = memo(({ onSubmit, disabled }: { onSubmit: (msg: string) => void; disabled: boolean }) => {
  const [value, setValue] = useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };
  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-8 bg-slate-900 border-t border-slate-800 flex gap-2 sm:gap-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type your inquiry..."
        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-300"
        aria-label="Chat message input"
      />
      <button
        type="submit"
        disabled={disabled}
        className="p-3 sm:p-4 bg-teal-600 text-white rounded-xl sm:rounded-2xl hover:bg-teal-500 shadow-xl shadow-teal-900/20 transition-all active:scale-95 shrink-0 disabled:opacity-50"
        aria-label="Send message"
      >
        <Send className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
    </form>
  );
});

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({
  databaseSettings,
  weather,
  loadingState,
  setLoadingState,
  aiProvider,
  aiModel,
  aiKey,
  onOpenAssistant,
  localIntelEnabled = true,
}) => {
  const [userFeedback, setUserFeedback] = useState<string>(() => {
    try { return localStorage.getItem('biosentinel_user_feedback') || ''; } catch { return ''; }
  });
  const [weatherFeedback, setWeatherFeedback] = useState<string>("");
  const { analysis: analysisCache, setAnalysis: setAnalysisCache } = useDataCache();
  const cacheValid = isCacheValid(analysisCache.lastFetched, analysisCache.lastLocation, weather?.city ?? '');
  const [analysis, setAnalysis] = useState<string>(() => cacheValid ? analysisCache.report : "");
  const [mlPrediction, setMlPrediction] = useState<MLPrediction | null>(() => cacheValid ? analysisCache.mlPrediction : null);
  const [mlWarnings, setMlWarnings] = useState<string[]>([]);
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);
  const [error, setError] = useState<string>("");

  const [cloudWarnings, setCloudWarnings] = useState<CloudEarlyWarning[]>([]);


  // Dashboard Feedback State
  const [dashboardComment, setDashboardComment] = useState("");
  const [showDashboardCommentInput, setShowDashboardCommentInput] = useState(false);
  const [dashboardFeedbackSubmitted, setDashboardFeedbackSubmitted] = useState(false);
  const [dashboardFeedback, setDashboardFeedback] = useState<'helpful' | 'not-helpful' | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  // Report history state
  const [showReportHistory, setShowReportHistory] = useState(false);
  const [reportHistory, setReportHistory] = useState<StoredReport[]>([]);
  const [viewingReport, setViewingReport] = useState<StoredReport | null>(null);
  const [viewingReportContent, setViewingReportContent] = useState<string>('');
  const [mlApiBusy, setMlApiBusy] = useState<string>('');
  const [mlApiResult, setMlApiResult] = useState<string>('');
  const [trainLabelColumn, setTrainLabelColumn] = useState<string>('risk_label');
  const [trainDatasetJson, setTrainDatasetJson] = useState<string>('[]');
  const [outbreakCity, setOutbreakCity] = useState<string>(weather?.city || '');
  const [outbreakThreshold, setOutbreakThreshold] = useState<number>(15);
  const [outbreakBusy, setOutbreakBusy] = useState(false);
  const [outbreakApiWarnings, setOutbreakApiWarnings] = useState<CloudEarlyWarning[]>([]);
  const [outbreakApiStats, setOutbreakApiStats] = useState<ReturnType<typeof getOutbreakPredictionStats> | null>(null);
  const [outbreakApiAlerts, setOutbreakApiAlerts] = useState<OutbreakAlert[]>([]);

  const createSampleTrainingDataset = useCallback(() => {
    if (!weather) return [] as Record<string, unknown>[];
    return Array.from({ length: 24 }, (_, i) => {
      const phase = i % 3;
      const tempDelta = phase === 0 ? -2.5 : phase === 1 ? 0 : 3.5;
      const humidityDelta = phase === 2 ? 10 : phase === 0 ? -8 : 0;
      const pmBoost = phase === 2 ? 12 : 0;
      const temp = Math.max(8, weather.temp + tempDelta);
      const humidity = Math.min(100, Math.max(20, weather.humidity + humidityDelta));
      const pm2 = Math.max(3, (weather.advancedData?.pm2_5 || 10) + pmBoost);
      const riskLabel = temp >= 34 || pm2 >= 35 ? 'high' : temp >= 28 || pm2 >= 20 ? 'moderate' : 'low';

      return {
        temp,
        feels_like: Math.max(8, weather.feelsLike + tempDelta),
        pressure: weather.pressure,
        humidity,
        wind_speed: weather.windSpeed,
        wind_deg: weather.windDeg,
        clouds: weather.clouds,
        visibility: (weather.visibility || 10000) / 1000,
        uv_index: weather.uvIndex || 0,
        air_quality_PM2_5: pm2,
        air_quality_PM10: Math.max(5, (weather.advancedData?.pm10 || 18) + pmBoost),
        aqi: weather.aqi,
        risk_label: riskLabel
      };
    });
  }, [weather]);

  const refreshOutbreakApiPanel = useCallback(async () => {
    setOutbreakBusy(true);
    try {
      setOutbreakApiStats(getOutbreakPredictionStats());
      setOutbreakApiAlerts(getActiveOutbreakAlerts().slice(0, 5));
      if (!outbreakCity.trim()) {
        setOutbreakApiWarnings([]);
        return;
      }
      const warnings = await checkCloudEarlyWarning(outbreakCity.trim(), outbreakThreshold);
      setOutbreakApiWarnings(warnings);
    } catch (error) {
      console.error('Failed to refresh outbreak panel:', error);
      setOutbreakApiWarnings([]);
    } finally {
      setOutbreakBusy(false);
    }
  }, [outbreakCity, outbreakThreshold]);

  const runMlApiHealth = useCallback(async () => {
    setMlApiBusy('health');
    try {
      const [health, metrics, status] = await Promise.all([apiHealth(), apiMetrics(), apiTrainStatus()]);
      const report = {
        health: health.error ? health.error : health.response.data,
        train_status: status.error ? status.error : status.response.data,
        metrics_excerpt: metrics.error ? metrics.error : String(metrics.response.data).split('\n').slice(0, 10).join('\n'),
        request_id: health.response.requestId || status.response.requestId || metrics.response.requestId || null
      };
      setMlApiResult(JSON.stringify(report, null, 2));
    } catch (error) {
      setMlApiResult(JSON.stringify({ error: error instanceof Error ? error.message : 'Health check failed.' }, null, 2));
    } finally {
      setMlApiBusy('');
    }
  }, []);

  const runMlApiDetect = useCallback(async () => {
    setMlApiBusy('detect');
    try {
      const parsed = JSON.parse(trainDatasetJson);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setMlApiResult('Provide a non-empty JSON array dataset before detect.');
        return;
      }
      const res = await apiTrainDetect({ data: parsed as Record<string, unknown>[] });
      setMlApiResult(JSON.stringify(res.error ? res.error : res.response.data, null, 2));
    } catch {
      setMlApiResult('Invalid JSON in training dataset input.');
    } finally {
      setMlApiBusy('');
    }
  }, [trainDatasetJson]);

  const runMlApiTrain = useCallback(async (mode: 'train' | 'auto') => {
    setMlApiBusy(mode);
    try {
      const parsed = JSON.parse(trainDatasetJson);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setMlApiResult('Provide a non-empty JSON array dataset before train.');
        return;
      }
      const payload = {
        data: parsed as Record<string, unknown>[],
        label_column: trainLabelColumn.trim() || undefined,
        model_type: 'xgboost'
      };
      const res = mode === 'auto' ? await apiTrainAuto(payload) : await apiTrain(payload);
      setMlApiResult(JSON.stringify(res.error ? res.error : res.response.data, null, 2));
    } catch {
      setMlApiResult('Invalid JSON in training dataset input.');
    } finally {
      setMlApiBusy('');
    }
  }, [trainDatasetJson, trainLabelColumn]);

  const runMlApiPredictCustom = useCallback(async () => {
    if (!weather) return;
    setMlApiBusy('predict');
    try {
      const payload: PredictCustomPayload = {
        temp: weather.temp,
        feels_like: weather.feelsLike,
        pressure: weather.pressure,
        humidity: weather.humidity,
        wind_speed: weather.windSpeed,
        wind_deg: weather.windDeg,
        clouds: weather.clouds || 0,
        visibility: (weather.visibility || 10000) / 1000,
        uv_index: weather.uvIndex || 0,
        air_quality_PM2_5: weather.advancedData?.pm2_5 || 0,
        air_quality_PM10: weather.advancedData?.pm10 || 0,
        aqi: weather.aqi
      };
      const res = await apiPredictCustom(payload);
      setMlApiResult(JSON.stringify({
        payload,
        result: res.error ? res.error : res.response.data,
        request_id: res.response.requestId || null
      }, null, 2));
    } catch (error) {
      setMlApiResult(JSON.stringify({ error: error instanceof Error ? error.message : 'Prediction failed.' }, null, 2));
    } finally {
      setMlApiBusy('');
    }
  }, [weather]);

  // Store the main analysis report when it's generated
  useEffect(() => {
    if (analysis && loadingState !== LoadingState.ANALYZING) {
      try {
        saveReport({
          city: weather?.city || 'Unknown',
          content: analysis,
          riskScore: mlPrediction ? mlPrediction.riskScore * 100 : undefined,
          primaryRisk: mlPrediction?.primaryTrigger,
          provider: aiProvider,
          model: aiModel,
        });
        // Refresh history list
        setReportHistory(getReports());
      } catch (e) {
        console.error('Failed to save report to memory', e);
      }
    }
  }, [analysis, loadingState]);

  // Load report history on mount
  useEffect(() => {
    setReportHistory(getReports());
  }, []);

  useEffect(() => {
    if (!outbreakCity && weather?.city) {
      setOutbreakCity(weather.city);
    }
  }, [weather?.city, outbreakCity]);

  useEffect(() => {
    if (trainDatasetJson === '[]' && weather) {
      setTrainDatasetJson(JSON.stringify(createSampleTrainingDataset(), null, 2));
    }
  }, [weather, trainDatasetJson, createSampleTrainingDataset]);

  useEffect(() => {
    refreshOutbreakApiPanel();
  }, [refreshOutbreakApiPanel]);

  const handleDashboardFeedback = async (isHelpful: boolean) => {
    if (dashboardFeedbackSubmitted) return;
    setDashboardFeedback(isHelpful ? 'helpful' : 'not-helpful');
    setShowDashboardCommentInput(true);

    await submitFeedback({
      predictionId: `analysis-${Date.now()}`,
      isHelpful,
      timestamp: new Date().toISOString()
    });
  };

  const submitDashboardComment = async () => {
    if (!dashboardComment.trim()) return;

    await submitFeedback({
      predictionId: `analysis-${Date.now()}`,
      isHelpful: dashboardFeedback === 'helpful',
      userComment: dashboardComment,
      timestamp: new Date().toISOString()
    });
    setDashboardFeedbackSubmitted(true);
    setShowDashboardCommentInput(false);
  };

  // Simulated hourly air quality data
  const hourlyAirQuality = React.useMemo(() => {
    if (!weather?.advancedData) return [];
    return Array.from({ length: 24 }, (_, i) => {
      const hour = i;
      const o3Base = weather.advancedData?.o3 || 40;
      const o3 = o3Base + Math.sin((hour - 14) * Math.PI / 12) * 10 + (Math.random() * 5);
      const no2Base = weather.advancedData?.no2 || 20;
      const no2 = no2Base + (Math.exp(-Math.pow(hour - 8, 2) / 4) * 10) + (Math.exp(-Math.pow(hour - 18, 2) / 4) * 10) + (Math.random() * 2);
      const pm25Base = weather.advancedData?.pm2_5 || 10;
      const pm25 = pm25Base + Math.cos((hour - 4) * Math.PI / 12) * 5 + (Math.random() * 3);
      const so2 = weather.advancedData?.so2 || 5;

      return {
        hour: `${hour}:00`,
        o3: Math.max(0, Math.round(o3)),
        no2: Math.max(0, Math.round(no2)),
        pm25: Math.max(0, Math.round(pm25)),
        so2: Math.max(0, Math.round(so2))
      };
    });
  }, [weather]);

  const [lifestyleData, setLifestyleData] = useState<LifestyleData>(() => {
    try {
      const saved = localStorage.getItem('biosentinel_lifestyle_data');
      if (saved) {
        const parsed = JSON.parse(saved) as LifestyleData & { smoking?: string | boolean };
        if (typeof parsed.smoking === 'boolean') {
          parsed.smoking = parsed.smoking ? 'Daily' : 'No';
        }
        return parsed;
      }
    } catch { /* fall through */ }
    return {
      age: "",
      height: "",
      weight: "",
      gender: "",
      bloodGroup: "",
      occupation: "",
      cityType: "",
      lifestyle: "",
      medication: "",
      chronicConditions: "",
      vaccinationStatus: "",
      foodHabits: "",
      sleepHours: "",
      waterIntakeLiters: "",
      stressLevel: "",
      allergies: "",
      medicalHistory: "",
      familyHistory: "",
      emergencyContact: "",
      exercise: "",
      smoking: "",
      alcoholConsumption: ""
    };
  });

  // Persist lifestyle + feedback whenever they change
  useEffect(() => {
    try { localStorage.setItem('biosentinel_lifestyle_data', JSON.stringify(lifestyleData)); } catch { /* noop */ }
  }, [lifestyleData]);

  useEffect(() => {
    try { localStorage.setItem('biosentinel_user_feedback', userFeedback); } catch { /* noop */ }
  }, [userFeedback]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('biosentinel_chat_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load chat history", e);
      return [];
    }
  });
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<number, boolean>>({});
  const [feedbackComments, setFeedbackComments] = useState<Record<number, string>>({});
  const [showCommentInput, setShowCommentInput] = useState<number | null>(null);
  const [activeInputTab, setActiveInputTab] = useState<'profile' | 'intel' | 'assistant'>('profile');
  const [addedObs, setAddedObs] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const showTechnicalPanels = localStorage.getItem('biosentinel_show_internal_panels') === 'true';

  useEffect(() => {
    if (!localIntelEnabled && activeInputTab === 'intel') {
      setActiveInputTab('profile');
    }
  }, [localIntelEnabled, activeInputTab]);

  // Stable ref so sendMessage callback never changes reference during typing
  const chatCtxRef = useRef({ weather, isChatLoading, aiKey, mlPrediction, aiProvider, aiModel, chatMessages } as any);
  chatCtxRef.current = { weather, isChatLoading, aiKey, mlPrediction, aiProvider, aiModel, chatMessages };

  useEffect(() => {
    localStorage.setItem('biosentinel_chat_v1', JSON.stringify(chatMessages));
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const addObservation = (val: string) => {
    setUserFeedback(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return val;
      if (trimmed.includes(val)) return prev;
      return `${trimmed}\n${val}`;
    });
    setAddedObs(val);
    setTimeout(() => setAddedObs(null), 2000);
  };
  const [customObs, setCustomObs] = useState("");

  // Quick Surveillance States
  const [showSurveillanceForm, setShowSurveillanceForm] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomSeverity, setSymptomSeverity] = useState<number>(3);
  const [symptomDetails, setSymptomDetails] = useState('');
  const [symptomDuration, setSymptomDuration] = useState<'<24h' | '1-3d' | '4-7d' | '>7d'>('<24h');
  const [symptomTrend, setSymptomTrend] = useState<'worsening' | 'stable' | 'improving'>('stable');
  const [exposureFactors, setExposureFactors] = useState<string[]>([]);
  const [symptomImageDataUrl, setSymptomImageDataUrl] = useState<string>('');
  const [symptomImageName, setSymptomImageName] = useState<string>('');
  const [isSubmittingSymptom, setIsSubmittingSymptom] = useState(false);
  const [symptomSuccess, setSymptomSuccess] = useState(false);
  const [localSymptomRecords, setLocalSymptomRecords] = useState<UserSymptomData[]>([]);
  const [localOutbreakSignal, setLocalOutbreakSignal] = useState<{ level: 'low' | 'watch' | 'high'; score: number; summary: string } | null>(null);
  const [intakeLanguage, setIntakeLanguage] = useState<IndicLanguage>('hi');
  const [intakeDistrict, setIntakeDistrict] = useState('');
  const [intakeState, setIntakeState] = useState('');
  const [intakeText, setIntakeText] = useState('');
  const [intakeImageUrl, setIntakeImageUrl] = useState('');
  const [intakeProcessing, setIntakeProcessing] = useState(false);
  const [intakeMessage, setIntakeMessage] = useState('');
  const [recentExtractions, setRecentExtractions] = useState<ReturnType<typeof getFieldConversations>>([]);
  const [lastIngestRequestId, setLastIngestRequestId] = useState<string>('');

  const initialQuickSymptoms = ['Feeling unwell', 'Headache', 'Cough', 'Fever', 'Nausea'];
  const advancedSymptoms = ['Chills', 'Fatigue', 'Body Ache', 'Shortness of breath', 'Diarrhea', 'Rash', 'Sore Throat', 'Vomiting'];
  const exposureOptions = ['Travel', 'Crowded indoor area', 'Flood water contact', 'Known sick contact', 'Mosquito-dense area', 'Poor air quality'];

  const dedupeSymptomRecords = (records: UserSymptomData[]): UserSymptomData[] => {
    const seen = new Set<string>();
    return records.filter((r) => {
      const signature = [
        r.city,
        new Date(r.timestamp).toISOString().slice(0, 19),
        [...(r.symptoms || [])].sort().join('|'),
        r.additionalDetails || '',
      ].join('::');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  };

  const dedupeExtractions = (items: ReturnType<typeof getFieldConversations>) => {
    const seen = new Set<string>();
    return items.filter((it) => {
      const signature = `${it.district}::${it.state}::${it.language}::${it.text.toLowerCase().trim()}::${it.timestamp}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  };

  const handleSymptomToggle = (symptom: string) => {
    setSelectedSymptoms(prev =>
      prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]
    );
    if (!showSurveillanceForm) {
      setShowSurveillanceForm(true);
    }
  };

  const submitSymptoms = async () => {
    if (!weather?.city || selectedSymptoms.length === 0) return;

    setIsSubmittingSymptom(true);

    const data: UserSymptomData = {
      city: weather.city,
      symptoms: selectedSymptoms,
      severity: symptomSeverity,
      location: { lat: weather.lat, lon: weather.lon },
      timestamp: new Date().toISOString(),
      additionalDetails: `Duration: ${symptomDuration}\nTrend: ${symptomTrend}\nExposure: ${exposureFactors.join(', ') || 'None reported'}\n${symptomDetails}${symptomImageDataUrl ? `\n[IMAGE_UPLOAD:${symptomImageName || 'symptom-image'}]` : ''}`,
      imageDataUrl: symptomImageDataUrl || undefined,
    };

    try {
      // Mirror quick symptom submissions to backend batch ingest while preserving existing UI flow.
      const batchEvents = selectedSymptoms.map((symptom) => ({
        text: `${symptom}. ${symptomDetails || ''}`.trim(),
        state: intakeState || 'Unknown State',
        district: intakeDistrict || weather.city,
        duration: symptomDuration,
        trend: symptomTrend,
        severity: symptomSeverity,
        exposure_factors: exposureFactors,
        source: 'quick_symptom_checker'
      }));

      if (batchEvents.length > 0) {
        const ingestEnvelope = await apiBatchIngest(batchEvents);
        if (ingestEnvelope.response.requestId) {
          setLastIngestRequestId(ingestEnvelope.response.requestId);
        }
      }

      if (databaseSettings) {
        await saveSymptomData(databaseSettings, data);
        const latest = await fetchLocalOutbreakData(databaseSettings, weather.city);
        setLocalSymptomRecords(dedupeSymptomRecords(latest));
      }
      setSymptomSuccess(true);
      setTimeout(() => {
        setSymptomSuccess(false);
        setShowSurveillanceForm(false);
        setSelectedSymptoms([]);
        setSymptomDetails('');
        setSymptomDuration('<24h');
        setSymptomTrend('stable');
        setExposureFactors([]);
        setSymptomImageDataUrl('');
        setSymptomImageName('');
      }, 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingSymptom(false);
    }
  };


  const quickObservations = [
    { label: 'Mosquitoes ↑', value: 'High mosquito activity noticed in the area', icon: Bug },
    { label: 'Stagnant Water', value: 'Stagnant water pools visible after recent rains', icon: Droplets },
    { label: 'Air Quality ↓', value: 'Air feels heavy, visible smog/dust', icon: Wind },
    { label: 'Fever Cases ↑', value: 'Multiple neighbors reporting fever', icon: ThermometerSun },
    { label: 'It\'s raining here today', value: 'It\'s raining here today', icon: CloudRain },
    { label: 'High humidity', value: 'High humidity', icon: CloudFog },
    { label: 'Heat wave', value: 'Heat wave', icon: Flame },
    { label: 'Unusually Cold', value: 'Unusually Cold', icon: Thermometer },
    { label: 'Water Contamination', value: 'Water looks/smells contaminated', icon: Waves },
    { label: 'Crowded Clinics', value: 'Crowded clinics and increased patient waiting observed', icon: Hospital },
    { label: 'School Absences ↑', value: 'Unusual increase in school absences reported', icon: Calendar },
    { label: 'Vector Bite Complaints', value: 'Residents reporting frequent vector/insect bites', icon: ShieldAlert },
    { label: 'Food Poisoning Rumors', value: 'Possible local food poisoning cases being discussed', icon: AlertTriangle },
    { label: 'Low Medicine Stock', value: 'Nearby pharmacies reporting low stock of common medicines', icon: Pill },
    { label: 'Water Logging', value: 'Water logging seen in streets and residential lanes', icon: Umbrella },
  ];

  useEffect(() => {
    setRecentExtractions(dedupeExtractions(getFieldConversations()).slice(0, 5));
  }, []);

  useEffect(() => {
    const fillLocation = async () => {
      if (!weather?.lat || !weather?.lon) return;
      if (intakeDistrict && intakeState) return;
      const info = await reverseGeocode(weather.lat, weather.lon);
      if (info) {
        if (!intakeDistrict) setIntakeDistrict(info.district || info.city || weather.city || 'Unknown District');
        if (!intakeState) setIntakeState(info.state || 'Unknown State');
      } else if (!intakeDistrict && weather.city) {
        setIntakeDistrict(weather.city);
      }
    };
    fillLocation();
  }, [weather?.lat, weather?.lon, weather?.city, intakeDistrict, intakeState]);

  useEffect(() => {
    const run = async () => {
      if (!databaseSettings || !weather?.city) {
        setLocalSymptomRecords([]);
        setLocalOutbreakSignal(null);
        return;
      }

      const records = await fetchLocalOutbreakData(databaseSettings, weather.city);
      setLocalSymptomRecords(dedupeSymptomRecords(records));
    };

    run();

    const timer = setInterval(run, 45000);
    return () => clearInterval(timer);
  }, [databaseSettings, weather?.city]);

  useEffect(() => {
    if (localSymptomRecords.length === 0) {
      setLocalOutbreakSignal(null);
      return;
    }

    const now = Date.now();
    const last48h = localSymptomRecords.filter(r => now - new Date(r.timestamp).getTime() <= 48 * 3600 * 1000);
    const recentCount = last48h.length;
    const avgSeverity = recentCount > 0
      ? last48h.reduce((acc, r) => acc + (r.severity || 0), 0) / recentCount
      : 0;
    const feverLikeCount = last48h.filter(r => r.symptoms.some(s => /fever|cough|chills|breath|diarrhea/i.test(s))).length;

    // Simple cluster score for local outbreak watch.
    const score = Math.min(100, Math.round((recentCount * 8) + (avgSeverity * 10) + (feverLikeCount * 4)));
    const level: 'low' | 'watch' | 'high' = score >= 70 ? 'high' : score >= 40 ? 'watch' : 'low';
    const summary = level === 'high'
      ? `Cluster signal is high in ${weather?.city}. ${recentCount} recent symptom reports with average severity ${avgSeverity.toFixed(1)}.`
      : level === 'watch'
        ? `Watch signal in ${weather?.city}: ${recentCount} recent reports detected.`
        : `Low cluster signal in ${weather?.city}. Continue monitoring.`;

    setLocalOutbreakSignal({ level, score, summary });
  }, [localSymptomRecords, weather?.city]);

  const handleAddCustomObs = () => {
    if (!customObs.trim()) return;
    addObservation(customObs);
    setCustomObs("");
  };

  const handleAutoFillIntakeLocation = () => {
    if (weather?.city && !intakeDistrict) setIntakeDistrict(weather.city);
    if (!intakeState) setIntakeState('Unknown');
  };

  const handleSymptomImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSymptomImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setSymptomImageDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const toggleExposureFactor = (factor: string) => {
    setExposureFactors(prev => prev.includes(factor) ? prev.filter(f => f !== factor) : [...prev, factor]);
  };

  const sendIntelToAssistant = async () => {
    const intelSummary = [
      `Location: ${weather?.city || intakeDistrict || 'unknown'}`,
      `Selected symptoms: ${selectedSymptoms.join(', ') || 'none'}`,
      `Severity: ${symptomSeverity}/5`,
      `Duration: ${symptomDuration}`,
      `Trend: ${symptomTrend}`,
      `Exposure factors: ${exposureFactors.join(', ') || 'none'}`,
      `Clinical notes: ${symptomDetails || userFeedback || 'none'}`,
    ].join('\n');

    setActiveInputTab('assistant');
    await sendMessage(`Deep analysis request from local intel:\n${intelSummary}`);
  };

  const handleProcessClinicalIntake = async () => {
    if (!intakeText.trim() || !intakeDistrict.trim() || !intakeState.trim()) {
      setIntakeMessage('Please fill patient description, district, and state.');
      return;
    }

    setIntakeProcessing(true);
    setIntakeMessage('');

    try {
      const conversation = processFieldConversation(
        intakeText.trim(),
        intakeLanguage,
        intakeDistrict.trim(),
        intakeState.trim()
      );

      if (databaseSettings && databaseSettings.preferredDb !== 'none') {
        const symptomPayload: UserSymptomData = {
          city: weather?.city || intakeDistrict.trim(),
          symptoms: conversation.extractedSyndromes.length > 0
            ? conversation.extractedSyndromes
            : ['Unusual fever cluster'],
          severity: conversation.confidence >= 0.75 ? 5 : conversation.confidence >= 0.55 ? 4 : 3,
          location: { lat: weather?.lat || 0, lon: weather?.lon || 0 },
          timestamp: new Date().toISOString(),
          additionalDetails: `${conversation.text}${intakeImageUrl ? ` | Image: ${intakeImageUrl}` : ''}`,
          diseaseTags: conversation.icd10Codes,
        };

        await saveSymptomData(databaseSettings, symptomPayload);
        const latest = await fetchLocalOutbreakData(databaseSettings, weather?.city || intakeDistrict.trim());
        setLocalSymptomRecords(dedupeSymptomRecords(latest));
      }

      setRecentExtractions(dedupeExtractions(getFieldConversations()).slice(0, 5));

      if (conversation.extractedSyndromes.length > 0) {
        addObservation(`Clinical intake extracted: ${conversation.extractedSyndromes.join(', ')}`);
      } else {
        addObservation(`Clinical intake logged from ${intakeDistrict}`);
      }

      const intakeEnvelope = await apiSingleIngest({
        text: conversation.text,
        state: intakeState.trim(),
        district: intakeDistrict.trim(),
        language: intakeLanguage,
        local_intel: {
          source_type: 'field_worker',
          source_reliability: conversation.confidence >= 0.75 ? 'high' : conversation.confidence >= 0.55 ? 'medium' : 'low',
          locality_type: weather?.city ? 'urban' : 'unknown',
          population_density: 'unknown'
        },
        health_profile: {
          age_group: lifestyleData.age || 'unknown',
          vulnerability: lifestyleData.medicalHistory || 'general',
          symptom_trend: symptomTrend,
          duration: symptomDuration
        },
        extracted_syndromes: conversation.extractedSyndromes,
        icd10_codes: conversation.icd10Codes,
        image_url: intakeImageUrl || undefined
      });

      const reqId = intakeEnvelope.response.requestId || intakeEnvelope.error?.requestId || '';
      if (reqId) {
        setLastIngestRequestId(reqId);
      }

      if (intakeEnvelope.error) {
        setIntakeMessage(`Clinical intake saved locally; backend ingest failed (${intakeEnvelope.error.kind}): ${intakeEnvelope.error.message}`);
      } else {
        setIntakeMessage(`Clinical intake processed and stored from Home. request_id: ${reqId || 'N/A'}`);
      }
      setIntakeText('');
      setIntakeImageUrl('');
    } catch (err) {
      setIntakeMessage(`Failed to process intake: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIntakeProcessing(false);
    }
  };

  // Stable callback – reads from ref so its identity never changes while typing
  const sendMessage = useCallback(async (message: string) => {
    const { weather, isChatLoading, aiKey, mlPrediction, aiProvider, aiModel, chatMessages } = chatCtxRef.current;
    if (!message.trim() || !weather || isChatLoading) return;
    const userMsg = message.trim();
    setChatError(null);
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);
    try {
      const response = await chatWithWeatherAssistant(weather, chatMessages, userMsg, aiKey, mlPrediction, aiProvider, aiModel);
      const clean = stripHiddenModelReasoning(response);
      setChatMessages(prev => [...prev, { role: 'model', text: clean }]);
    } catch (err: any) {
      console.error("Chat Assistant Error:", err);
      setChatError(err?.message || "Bio-Assistant link interrupted. Check your network or API key.");
    } finally {
      setIsChatLoading(false);
    }
  }, []); // [] – safe because all values are read from chatCtxRef

  const clearChat = () => {
    setChatMessages([]);
    setChatError(null);
    setSelectedOptions([]);
    localStorage.removeItem('biosentinel_chat_v1');
  };

  const handleFeedback = async (msgIdx: number, isHelpful: boolean) => {
    if (feedbackStatus[msgIdx]) return;

    setFeedbackStatus(prev => ({ ...prev, [msgIdx]: true }));
    setShowCommentInput(msgIdx);

    // Initial submission
    await submitFeedback({
      predictionId: `chat-msg-${msgIdx}-${Date.now()}`,
      isHelpful,
      timestamp: new Date().toISOString()
    });
  };

  const submitComment = async (msgIdx: number) => {
    const comment = feedbackComments[msgIdx];
    if (!comment) return;

    // Update existing feedback with comment
    await submitFeedback({
      predictionId: `chat-msg-${msgIdx}-${Date.now()}`,
      isHelpful: true, // We already know it's helpful/not from previous step
      userComment: comment,
      timestamp: new Date().toISOString()
    });

    setShowCommentInput(null);
  };

  const runAnalysis = async (retryCount = 0) => {
    if (!weather) return;

    setLoadingState(LoadingState.ANALYZING);
    setError("");
    setAnalysis("");
    setGroundingChunks([]);
    setMlWarnings([]);

    // 1. Fetch Cloud-Enhanced Outbreak Early Warnings
    if (weather.city) {
      checkCloudEarlyWarning(weather.city, 15).then(warnings => {
        setCloudWarnings(warnings);
      }).catch(err => console.error("Cloud warning fetch error:", err));
    }


    try {
      const summary = "";

      // Quick warnings check (fast, no model call)
      const check = await quickHealthCheck(weather, [], lifestyleData).catch(e => {
        console.warn("Quick health check failed:", e);
        return { warnings: [], requiresFullAnalysis: true, immediateActionRequired: false };
      });
      setMlWarnings(check.warnings || []);

      // Use locally trained model if available, otherwise call Bio-Sentinel API
      const localModelPrediction = isModelTrained() ? (() => {
        const age = Number(lifestyleData?.age || 0);
        const heightCm = Number(lifestyleData?.height || 0);
        const weightKg = Number(lifestyleData?.weight || 0);
        const bmi = heightCm > 0 && weightKg > 0 ? weightKg / Math.pow(heightCm / 100, 2) : 0;

        const fullModelInput: Record<string, unknown> = {
          // Core weather
          temp: weather.temp,
          temperature: weather.temp,
          feels_like: weather.feelsLike,
          feelsLike: weather.feelsLike,
          pressure: weather.pressure,
          humidity: weather.humidity,
          dew_point: weather.dewPoint ?? 0,
          wind_speed: weather.windSpeed,
          windSpeed: weather.windSpeed,
          wind_deg: weather.windDeg,
          windDeg: weather.windDeg,
          clouds: weather.clouds || 50,
          visibility: (weather.visibility || 10000) / 1000,
          uv_index: weather.uvIndex || 0,
          uvIndex: weather.uvIndex || 0,
          aqi: weather.aqi || 1,
          rawAqi: weather.rawAqi || 0,

          // Pollutants + advanced atmospherics
          pm2_5: weather.advancedData?.pm2_5 ?? 15,
          pm10: weather.advancedData?.pm10 ?? 25,
          'air_quality_PM2.5': weather.advancedData?.pm2_5 ?? 15,
          'air_quality_PM10': weather.advancedData?.pm10 ?? 25,
          o3: weather.advancedData?.o3 ?? 0,
          no2: weather.advancedData?.no2 ?? 0,
          so2: weather.advancedData?.so2 ?? 0,
          co: weather.advancedData?.co ?? 0,
          co2: weather.advancedData?.co2 ?? 0,
          dust: weather.advancedData?.dust ?? 0,
          ammonia: weather.advancedData?.ammonia ?? 0,
          methane: weather.advancedData?.methane ?? 0,
          boundary_layer_height: weather.advancedData?.boundaryLayerHeight ?? 0,
          cape: weather.advancedData?.cape ?? 0,
          lifted_index: weather.advancedData?.liftedIndex ?? 0,
          convective_inhibition: weather.advancedData?.convectiveInhibition ?? 0,
          freezing_level_height: weather.advancedData?.freezingLevelHeight ?? 0,
          wind_gusts: weather.advancedData?.windGusts ?? 0,
          vapour_pressure_deficit: weather.advancedData?.vapourPressureDeficit ?? 0,
          wet_bulb_temperature: weather.advancedData?.wetBulbTemperature ?? 0,
          shortwave_radiation: weather.advancedData?.shortwaveRadiation ?? 0,
          sunshine_duration: weather.advancedData?.sunshineDurationHourly ?? 0,
          cloud_cover_low: weather.advancedData?.cloudCoverLow ?? 0,
          cloud_cover_mid: weather.advancedData?.cloudCoverMid ?? 0,
          cloud_cover_high: weather.advancedData?.cloudCoverHigh ?? 0,
          soil_temperature: weather.advancedData?.soilTemperature ?? 0,
          soil_moisture: weather.advancedData?.soilMoisture ?? 0,
          evapotranspiration: weather.advancedData?.evapotranspiration ?? 0,

          // Pollen/allergen signals
          alder_pollen: weather.advancedData?.alder_pollen ?? 0,
          birch_pollen: weather.advancedData?.birch_pollen ?? 0,
          grass_pollen: weather.advancedData?.grass_pollen ?? 0,
          mugwort_pollen: weather.advancedData?.mugwort_pollen ?? 0,
          olive_pollen: weather.advancedData?.olive_pollen ?? 0,
          ragweed_pollen: weather.advancedData?.ragweed_pollen ?? 0,

          // Location/context/time
          city: weather.city,
          condition: weather.description,
          description: weather.description,
          lat: weather.lat,
          lon: weather.lon,
          latitude: weather.lat,
          longitude: weather.lon,
          hour: new Date().getHours(),
          day_of_week: new Date().getDay(),
          month: new Date().getMonth() + 1,

          // User/lifestyle context for personalized models
          age,
          height_cm: heightCm,
          weight_kg: weightKg,
          bmi,
          smoking: lifestyleData?.smoking || '',
          lifestyle: lifestyleData?.lifestyle || '',
          medication: lifestyleData?.medication || '',
          food_habits: lifestyleData?.foodHabits || '',
          allergies: lifestyleData?.allergies || '',
          medical_history: lifestyleData?.medicalHistory || '',
          exercise: lifestyleData?.exercise || '',
          alcohol_consumption: lifestyleData?.alcoholConsumption || '',

          // Local intel text features
          user_feedback: userFeedback || '',
          feedback_length: (userFeedback || '').length,
          has_fog: (userFeedback || '').toLowerCase().includes('fog') ? 1 : 0,
          has_smoke: (userFeedback || '').toLowerCase().includes('smoke') ? 1 : 0,
          has_pollen: (userFeedback || '').toLowerCase().includes('pollen') ? 1 : 0,
          has_water_stagnation: (userFeedback || '').toLowerCase().includes('standing water') ? 1 : 0,

          // Map specifically to Weather-related disease prediction CSV
          'Age': age,
          'Gender': (lifestyleData?.gender === 'Male' || lifestyleData?.gender === '1') ? 1 : 0,
          'Temperature (C)': weather.temp,
          'Humidity': weather.humidity,
          'Wind Speed (km/h)': weather.windSpeed,
        };

        // Auto-extract 45 symptoms as binary flags 0 or 1 for the local model from user text
        const symptomsList = [
          'nausea', 'joint_pain', 'abdominal_pain', 'high_fever', 'chills', 'fatigue', 'runny_nose',
          'pain_behind_the_eyes', 'dizziness', 'headache', 'chest_pain', 'vomiting', 'cough',
          'shivering', 'asthma_history', 'high_cholesterol', 'diabetes', 'obesity', 'hiv_aids',
          'nasal_polyps', 'asthma', 'high_blood_pressure', 'severe_headache', 'weakness', 'trouble_seeing',
          'fever', 'body_aches', 'sore_throat', 'sneezing', 'diarrhea', 'rapid_breathing', 'rapid_heart_rate',
          'pain_behind_eyes', 'swollen_glands', 'rashes', 'sinus_headache', 'facial_pain', 'shortness_of_breath',
          'reduced_smell_and_taste', 'skin_irritation', 'itchiness', 'throbbing_headache', 'confusion',
          'back_pain', 'knee_ache'
        ];

        const feedbackLower = (userFeedback || '').toLowerCase() + ' ' + (lifestyleData?.medicalHistory || '').toLowerCase();
        for (const symptom of symptomsList) {
          const symptomWords = symptom.replace(/_/g, ' ');
          fullModelInput[symptom] = (feedbackLower.includes(symptomWords) || feedbackLower.includes(symptom)) ? 1 : 0;
        }

        let modelInput = fullModelInput;
        try {
          const useSelectedOnly = localStorage.getItem('biosentinel_live_features_only') === 'true';
          if (useSelectedOnly) {
            const trainedInfo = getTrainedModelInfo();
            if (trainedInfo?.featureNames?.length) {
              const canonical = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
              const availableEntries = Object.entries(fullModelInput);
              const availableMap = new Map<string, unknown>();
              for (const [k, v] of availableEntries) {
                availableMap.set(k, v);
                availableMap.set(canonical(k), v);
              }

              const filteredInput: Record<string, unknown> = {};
              for (const f of trainedInfo.featureNames) {
                const exact = availableMap.get(f);
                const canonicalHit = availableMap.get(canonical(f));
                filteredInput[f] = exact ?? canonicalHit ?? 0;
              }
              modelInput = filteredInput;
            }
          }
        } catch {
          // keep full payload on storage/read issues
        }

        return predictWithTrainedModel(modelInput);
      })() : null;

      // Trigger Custom ML Model Prediction alongside Gemini in parallel
      const [mlResult, geminiResult] = await Promise.allSettled([
        localModelPrediction
          ? Promise.resolve({
            riskScore: localModelPrediction.confidence,
            primaryTrigger: localModelPrediction.topFactors[0]?.feature || 'Environmental Factors',
            recommendation: (() => {
              const sortedProbabilities = Object.entries(localModelPrediction.probabilities || {})
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 5)
                .map(([label, pct]) => `- **${label}:** ${(pct as number).toFixed(2)}%`)
                .join('\n');

              const confidenceLines = localModelPrediction.confidenceBreakdown
                ? `- **Top Class:** ${localModelPrediction.confidenceBreakdown.topClass} (${localModelPrediction.confidenceBreakdown.topClassProbabilityPct.toFixed(2)}%)\n- **Runner-Up:** ${localModelPrediction.confidenceBreakdown.secondClass} (${localModelPrediction.confidenceBreakdown.secondClassProbabilityPct.toFixed(2)}%)\n- **Decision Margin:** ${localModelPrediction.confidenceBreakdown.marginPct.toFixed(2)}%`
                : '- Confidence decomposition unavailable.';

              const predictorSnapshot = (localModelPrediction.topPredictorSnapshot || [])
                .slice(0, 8)
                .map(p => `- **${p.feature}:** ${String(p.value ?? 'N/A')} (importance ${(p.importance * 100).toFixed(1)}%)`)
                .join('\n');

              const whyChosen = localModelPrediction.topFactors.length > 0
                ? localModelPrediction.topFactors.slice(0, 3)
                  .map(f => `${f.feature} (${f.impact}, ${(f.importance * 100).toFixed(0)}%)`)
                  .join(', ')
                : 'No feature-level attribution available';

              return `### 1. Trained Model Prediction\n- **Predicted Disease Class:** ${localModelPrediction.prediction}\n- **Confidence:** ${(localModelPrediction.confidence * 100).toFixed(2)}%\n\n### 2. Why This Disease Was Chosen\n- The model selected **${localModelPrediction.prediction}** because the strongest weighted predictors were: ${whyChosen}.\n\n### 3. Confidence Breakdown\n${confidenceLines}\n\n### 4. Class Probability Distribution\n${sortedProbabilities || '- No class probabilities available.'}\n\n### 5. Model Input Snapshot (Top Predictors + Values Used)\n${predictorSnapshot || '- Input snapshot unavailable.'}`;
            })(),
            confidence: localModelPrediction.confidence,
            disease: localModelPrediction.prediction,
            riskLevel: (localModelPrediction.confidence > 0.7 ? 'HIGH' : localModelPrediction.confidence > 0.4 ? 'MODERATE' : 'LOW') as 'HIGH' | 'MODERATE' | 'LOW',
            allProbabilities: localModelPrediction.probabilities,
            topFactors: localModelPrediction.topFactors,
            confidenceBreakdown: localModelPrediction.confidenceBreakdown,
            topPredictorSnapshot: localModelPrediction.topPredictorSnapshot,
            factorContributions: localModelPrediction.factorContributions,
            timestamp: new Date().toISOString(),
          } as MLPrediction)
          : predictBioRisks(weather, [], lifestyleData),
        generateHealthRiskAssessment(
          weather,
          summary,
          userFeedback,
          weatherFeedback,
          lifestyleData,
          undefined,
          aiProvider,
          aiModel,
          aiKey,
          localModelPrediction
        )
      ]);

      let prediction: MLPrediction | null = null;
      let geminiMarkdown = "";
      let chunks: GroundingChunk[] = [];

      if (mlResult.status === 'fulfilled') {
        prediction = mlResult.value;
        setMlPrediction(prediction);
        setAnalysisCache({ mlPrediction: prediction, lastLocation: weather?.city ?? '', lastFetched: Date.now() });
        console.log("AI Risk Prediction:", prediction);
      } else {
        console.error("ML Prediction failed:", mlResult.reason);
        // We don't throw here because we can still show the Gemini analysis
      }

      if (geminiResult.status === 'fulfilled') {
        geminiMarkdown = geminiResult.value.markdown;
        chunks = geminiResult.value.groundingChunks || [];
        setGroundingChunks(chunks);
      } else {
        console.error("Gemini Analysis failed:", geminiResult.reason);
        const errorMessage = geminiResult.reason instanceof Error ? geminiResult.reason.message : String(geminiResult.reason);

        // Handle specific API errors
        if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
          throw new Error("Invalid Gemini API Key. Please check your configuration.");
        } else if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
          throw new Error("Network error. Please check your internet connection and try again.");
        } else if (errorMessage.includes("quota") || errorMessage.includes("rate limit") || errorMessage.includes("429")) {
          throw new Error("API rate limit exceeded. Please wait a moment and try again.");
        } else {
          throw new Error(`Analysis failed: ${errorMessage}`);
        }
      }

      // Append ML insights to the analysis if available
      let augmentedAnalysis = stripHiddenModelReasoning(geminiMarkdown);
      if (prediction && !geminiMarkdown.includes("AI Model Insights")) {
        const modelInfo = getTrainedModelInfo();
        const perf = getTrainedModelPerformanceMetrics();
        const modelType = modelInfo ? `${modelInfo.type.toUpperCase()} (${modelInfo.featureNames.length} features, ${modelInfo.numClasses} classes)` : 'Bio-Sentinel API';
        const probSection = prediction.allProbabilities
          ? Object.entries(prediction.allProbabilities)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 5)
            .map(([cls, prob]) => `  - ${cls}: ${(prob as number).toFixed(1)}%`)
            .join('\n')
          : '';
        const factorsSection = prediction.topFactors && prediction.topFactors.length > 0
          ? prediction.topFactors.slice(0, 5).map(f => `  - **${f.feature}:** ${f.value?.toFixed(2) ?? 'N/A'} (${f.impact} risk, importance: ${(f.importance * 100).toFixed(0)}%)`).join('\n')
          : '  - Feature-level attributions are unavailable for this model output. Retrain with explicit predictor columns for richer explanations.';
        augmentedAnalysis += `\n\n### 8. Realtime ML Model Insights\n- **Model:** ${modelType}\n- **Prediction:** ${prediction.disease || 'General Assessment'}\n- **Risk Score:** ${(prediction.riskScore * 100).toFixed(0)}%\n- **Confidence:** ${(prediction.confidence * 100).toFixed(0)}%\n- **Primary Trigger:** ${prediction.primaryTrigger}`;
        if (perf) {
          augmentedAnalysis += `\n- **Model Accuracy:** ${(perf.accuracy * 100).toFixed(2)}%\n- **Model Loss:** ${perf.loss.toFixed(4)}\n- **F1 Score:** ${(perf.f1Score * 100).toFixed(2)}%\n- **Precision / Recall:** ${(perf.precision * 100).toFixed(2)}% / ${(perf.recall * 100).toFixed(2)}%\n- **Training Time:** ${perf.trainTime.toFixed(1)}s`;
        }
        if (probSection) augmentedAnalysis += `\n- **Class Probabilities:**\n${probSection}`;
        if (factorsSection) augmentedAnalysis += `\n- **Top Contributing Factors:**\n${factorsSection}`;
        if (prediction.recommendation) augmentedAnalysis += `\n- **Recommendation:** ${prediction.recommendation}`;
      }

      const cleanAugmented = stripHiddenModelReasoning(augmentedAnalysis);
      setAnalysis(cleanAugmented);
      if (prediction) { setMlPrediction(prediction); }
      setAnalysisCache({ report: cleanAugmented, lastLocation: weather?.city ?? '', lastFetched: Date.now() });
      setLoadingState(LoadingState.SUCCESS); // Restore to SUCCESS

    } catch (err) {
      console.error("Analysis Error:", err);

      // Implement a simple retry mechanism for network/transient errors
      const isTransientError = err instanceof Error &&
        (err.message.includes("Network error") || err.message.includes("fetch") || err.message.includes("network") || err.message.includes("timeout") || err.message.includes("rate limit") || err.message.includes("429"));

      if (isTransientError && retryCount < 2) {
        console.log(`Retrying analysis due to transient error... Attempt ${retryCount + 1}`);
        setError(`Connection/Timeout issue detected. Retrying computation... (${retryCount + 1}/2)`);
        setTimeout(() => runAnalysis(retryCount + 1), 3000); // 3 second backoff
        return;
      }

      const userFriendlyError = err instanceof Error ? err.message : "Analysis computation error. Please check your data and configuration, then try again.";
      setError(`Bio-Sentinel Analysis Failed: ${userFriendlyError}`);
      setLoadingState(LoadingState.ERROR);
    }
  };

  const exportReport = (format: 'md' | 'html' = 'md') => {
    if (!analysis) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const city = weather?.city || 'Global';

    if (format === 'html') {
      const htmlContent = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>BioSentinel Report - ${city}</title>
<style>
  body { font-family: 'Inter', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 24px; background: #f8fafc; color: #1e293b; }
  h1, h2, h3 { color: #0f172a; } h3 { border-bottom: 2px solid #14b8a6; padding-bottom: 8px; margin-top: 32px; }
  strong { color: #0d9488; } ul { padding-left: 20px; } li { margin: 6px 0; line-height: 1.6; }
  .header { background: #0f172a; color: white; padding: 24px 32px; border-radius: 16px; margin-bottom: 32px; }
  .header h1 { color: #14b8a6; margin: 0; } .header p { color: #94a3b8; margin: 4px 0 0; font-size: 14px; }
  .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; }
</style></head><body>
<div class="header"><h1>BioSentinel Health Intelligence</h1><p>${city} - ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
${analysis.replace(/### (\d+)\./g, '<h3>$1.').replace(/### /g, '<h3>').replace(/\n- \*\*/g, '\n<li><strong>').replace(/\*\*/g, '</strong>').replace(/\n- /g, '\n<li>')}
<div class="footer">Generated by BioSentinel Health Intelligence. Not medical advice.</div>
</body></html>`;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const element = document.createElement("a");
      element.href = URL.createObjectURL(blob);
      element.download = `BioSentinel_Report_${city}_${timestamp}.html`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } else {
      const element = document.createElement("a");
      const file = new Blob([analysis], { type: 'text/markdown' });
      element.href = URL.createObjectURL(file);
      element.download = `BioSentinel_Report_${city}_${timestamp}.md`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const parseReport = (markdown: string) => {
    // Flexible section extractor: finds ### N. Title ... up until the next ### N. section or end
    const extractSection = (md: string, ...patterns: string[]): string => {
      for (const pattern of patterns) {
        const re = new RegExp(`###\\s*(?:\\d+\\.\\s*)?${pattern}[\\s\\S]*?(?=###\\s*(?:\\d+\\.\\s*)?[A-Z]|$)`, 'i');
        const m = md.match(re);
        if (m) {
          // Strip the matched header line itself, return only body
          return m[0].replace(/^###[^\n]*\n/, '').trim();
        }
      }
      return '';
    };

    // Find the index of the first numbered/named section so intro can be sliced
    const firstSectionIdx = markdown.search(/###\s*(?:\d+\.\s*)?(?:Prevention|Telemetry|Predictive|Weather|Disease|Verified|Personalized|Bio-Safety|Medical Disclaimer)/i);
    const introPart = firstSectionIdx > 0 ? markdown.substring(0, firstSectionIdx).trim() : markdown;

    const correlationPart = extractSection(markdown, 'Weather.?Health Correlation', 'Correlation Analysis');
    const outbreakPart = extractSection(markdown, 'Disease Outbreak', 'Outbreak Early Warning', 'Outbreak Potential');
    const resourcePart = extractSection(markdown, 'Verified Medical Resources', 'Medical Radar', 'Medical Resources');
    const biosafePart = extractSection(markdown, 'Bio.Safety Action Plan', 'Bio.Safety Protocol', 'Bio.Safety');
    const disclaimerPart = extractSection(markdown, 'Medical Disclaimer', 'Disclaimer');

    // Extract risk section for structured risk cards
    const riskSectionRegex = /(###\s*(?:\d+\.\s*)?Predictive Health Risks[^\n]*\n)([\s\S]*?)(###\s*(?:\d+\.\s*)?[A-Z]|$)/i;
    const riskMatch = markdown.match(riskSectionRegex);
    let riskPart = riskMatch ? riskMatch[2] : '';
    let parsedRisks: RiskItem[] = [];

    if (riskPart) {
      const riskItemRegex = /-\s*\[(LOW|MODERATE|HIGH|CRITICAL)\]\s*\*?\*?(.*?)\*?\*?:\s*(.*)/gi;
      let rMatch;
      while ((rMatch = riskItemRegex.exec(riskPart)) !== null) {
        parsedRisks.push({
          severity: rMatch[1].toUpperCase() as SeverityLevel,
          title: rMatch[2].trim().replace(/\*/g, ''),
          description: rMatch[3].trim()
        });
      }
    }

    return { introPart, correlationPart, outbreakPart, parsedRisks, resourcePart, biosafePart, disclaimerPart, originalMarkdown: markdown };
  };

  const cleanAnalysisForRender = useMemo(() => stripHiddenModelReasoning(analysis), [analysis]);
  const { introPart, correlationPart, outbreakPart, parsedRisks, resourcePart, biosafePart, disclaimerPart, originalMarkdown } = parseReport(cleanAnalysisForRender);
  const showStructuredRisks = parsedRisks.length > 0;

  const getSeverityStyles = (severity: SeverityLevel) => {
    switch (severity) {
      case 'CRITICAL':
        return {
          bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', badge: 'bg-rose-600 text-white',
          icon: AlertOctagon, iconColor: 'text-rose-600', accent: 'bg-rose-600', value: 100,
          desc: 'Immediate danger. Pulsing alert.'
        };
      case 'HIGH':
        return {
          bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', badge: 'bg-orange-500 text-white',
          icon: ShieldAlert, iconColor: 'text-orange-500', accent: 'bg-orange-500', value: 75,
          desc: 'Significant risk. High priority.'
        };
      case 'MODERATE':
        return {
          bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', badge: 'bg-amber-500 text-white',
          icon: Activity, iconColor: 'text-amber-500', accent: 'bg-amber-500', value: 50,
          desc: 'Elevated stress. Monitor closely.'
        };
      case 'LOW':
      default:
        return {
          bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', badge: 'bg-emerald-500 text-white',
          icon: ShieldCheck, iconColor: 'text-emerald-500', accent: 'bg-emerald-500', value: 25,
          desc: 'Baseline state. Low risk.'
        };
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-24 px-4 sm:px-0">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-teal-500 animate-ping" />
            <h2 className="text-[10px] font-black text-teal-600 uppercase tracking-[0.4em]">Analysis Engine v2.5 Online</h2>
          </div>
          <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">Intelligence Core</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-6 py-4 bg-slate-900 rounded-[1.5rem] flex items-center gap-4 border border-slate-800 shadow-2xl">
            <div className="p-2 bg-teal-500/10 rounded-xl">
              <Zap className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest">Inflow Stream</span>
              <span className="text-xs font-black text-white uppercase tracking-widest">Active Syncing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Intelligence Intake Dashboard */}
      {error && (
        <div className="p-6 bg-rose-50 border border-rose-100 rounded-[2rem] shadow-sm flex items-start gap-4 animate-fade-in">
          <div className="p-3 bg-rose-500 rounded-xl shadow-lg shadow-rose-200">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-black text-rose-900 uppercase tracking-widest mb-1">Analysis Error</h4>
            <p className="text-xs font-bold text-rose-800 leading-relaxed">{error}</p>
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-2">Action: Verify dataset format, check Gemini API key, or refresh connection.</p>
          </div>
          <button onClick={() => setError("")} className="p-2 hover:bg-rose-100 rounded-lg text-rose-400 transition-all"><XCircle className="w-5 h-5" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12 space-y-8">
          <div className="bg-white dark:bg-slate-800 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-700 p-6 sm:p-8 md:p-12 hover:shadow-2xl transition-all duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 sm:mb-12 gap-4 sm:gap-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2.5 sm:p-3 bg-slate-900 rounded-xl sm:rounded-2xl shadow-lg shrink-0"><BrainCircuit className="w-5 h-5 sm:w-6 sm:h-6 text-teal-400" /></div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Intelligence Input</h3>
                  <p className="text-[8px] sm:text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.2em]">Local Observations & Sensitivity</p>
                </div>
              </div>

              <div className="flex bg-slate-100 dark:bg-slate-700 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl gap-1 overflow-x-auto custom-scrollbar" role="tablist" aria-label="Input methods">
                {[
                  { id: 'profile', label: 'Health Profile', icon: Activity },
                  ...(localIntelEnabled ? [{ id: 'intel', label: 'Local Intel', icon: MessageSquarePlus }] : []),
                  { id: 'assistant', label: 'Bio-Assistant', icon: Bot }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeInputTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                    id={`tab-${tab.id}`}
                    tabIndex={activeInputTab === tab.id ? 0 : -1}
                    onClick={() => setActiveInputTab(tab.id as any)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-teal-500 ${activeInputTab === tab.id
                      ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
                      }`}
                  >
                    <tab.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[300px] sm:min-h-[400px]">



              {/* Cloud-Enhanced Early Outbreak Warnings */}
              {cloudWarnings.length > 0 && (
                <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                  {cloudWarnings.map((cw, idx) => (
                    <div key={idx} className="bg-rose-900 border border-rose-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Bug className="w-12 h-12 text-rose-400" />
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-rose-500 text-white">
                          Cloud Outbreak Warning
                        </span>
                      </div>
                      <h4 className="text-xl font-black text-white uppercase tracking-tighter mb-1">{cw.syndromeName}</h4>
                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-4">Location: {cw.city}</p>

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-[9px] font-black text-rose-200 uppercase mb-1">
                            <span>Reported Cases</span>
                            <span>{cw.caseCount} / 15 threshold</span>
                          </div>
                          <div className="h-1.5 bg-rose-950 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-rose-500"
                              style={{ width: `${Math.min((cw.caseCount / 15) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-rose-300 font-bold leading-tight">{cw.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeInputTab === 'profile' && (
                <div className="space-y-6 animate-fade-in" id="panel-profile" role="tabpanel" aria-labelledby="tab-profile">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Health Profile & Lifestyle
                    </label>
                  </div>
                  <UserProfile data={lifestyleData} onChange={setLifestyleData} />
                  <MLFeatureInputs weather={weather} />
                </div>
              )}


              {activeInputTab === 'intel' && (
                <div className="space-y-6 animate-fade-in" id="panel-intel" role="tabpanel" aria-labelledby="tab-intel">
                  <label className="text-[11px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2"><MessageSquarePlus className="w-4 h-4" /> Local Intelligence & Surveillance</label>

                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                    <div className="xl:col-span-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">Quick Observations</p>
                        <span className="text-[9px] font-black text-teal-600 uppercase tracking-widest">Tap to append</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {quickObservations.map((obs) => (
                          <button
                            key={obs.label}
                            onClick={() => addObservation(obs.value)}
                            className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-[9px] font-black text-slate-500 dark:text-slate-300 hover:bg-teal-500 hover:text-white transition-all flex items-center gap-1 shrink-0 whitespace-nowrap"
                          >
                            {addedObs === obs.value ? <Check className="w-3 h-3 text-emerald-500" /> : <obs.icon className="w-3 h-3" />}
                            {obs.label}
                          </button>
                        ))}
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-2 shrink-0">
                          <input
                            type="text"
                            value={customObs}
                            onChange={(e) => setCustomObs(e.target.value)}
                            placeholder="Custom"
                            className="w-24 bg-transparent text-[9px] font-bold text-slate-700 dark:text-slate-200 outline-none"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCustomObs()}
                          />
                          <button onClick={handleAddCustomObs} className="p-1 hover:bg-teal-100 rounded-lg text-teal-600">
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">Field Notes</p>
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{(userFeedback || '').length} chars</span>
                        </div>
                        <textarea value={userFeedback} onChange={(e) => setUserFeedback(e.target.value)} placeholder="Add local symptoms, environmental signals, and unusual events..." className="w-full min-h-[150px] sm:min-h-[220px] p-4 sm:p-5 bg-white dark:bg-slate-700/70 border border-slate-200 dark:border-slate-600 rounded-2xl text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 transition-all resize-none placeholder:text-slate-400" />
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Clear notes improve analysis quality.</p>
                      </div>
                    </div>

                    <div className="xl:col-span-2 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest mb-3">Surveillance Hub</p>
                      <SurveillanceIntegrationHub
                        mode="monitor"
                        embedded
                        prefillState={intakeState}
                        prefillDistrict={intakeDistrict || weather?.city || ''}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeInputTab === 'assistant' && (
                <div
                  className="h-[350px] sm:h-[450px] bg-slate-900 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden animate-fade-in shadow-inner"
                  id="panel-assistant"
                  role="tabpanel"
                  aria-labelledby="tab-assistant"
                >
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                        <Bot className="w-10 h-10 text-teal-400 opacity-50" />
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Start a diagnostic session here</p>
                        <button
                          onClick={() => onOpenAssistant?.()}
                          className="px-6 py-3 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-500 transition-all"
                        >
                          Open Full Assistant
                        </button>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-bold ${msg.role === 'user'
                            ? 'bg-teal-600 text-white rounded-br-none'
                            : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                            }`}>
                            {msg.text}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-4 bg-slate-950 border-t border-slate-800">
                    <button
                      onClick={() => onOpenAssistant?.()}
                      className="w-full py-3 bg-slate-800 text-teal-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-3 h-3" /> View Full Report
                    </button>
                  </div>
                </div>
              )}

            </div>

            {weather && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12 pt-12 border-t border-slate-100 dark:border-slate-700">
                <button onClick={() => runAnalysis()} disabled={loadingState === LoadingState.ANALYZING} className="group w-full sm:w-auto flex items-center justify-center gap-6 px-8 sm:px-16 py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-2xl hover:bg-teal-600 transition-all">
                  {loadingState === LoadingState.ANALYZING ? "Syncing..." : <><Cpu className="w-6 h-6 text-teal-400" /><span>Trigger Bio-Scan</span></>}
                </button>
                <button
                  onClick={() => { setReportHistory(getReports()); setShowReportHistory(true); }}
                  className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-[2rem] font-black text-lg shadow-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 transition-all border border-slate-200 dark:border-slate-600"
                >
                  <Calendar className="w-6 h-6 text-teal-500" />
                  <span>Report History</span>
                  {reportHistory.length > 0 && (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black">{reportHistory.length}</span>
                  )}
                </button>
              </div>
            )}

            {/* ── Report History Modal ──────────────────────────────────────────── */}
            {showReportHistory && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setShowReportHistory(false); setViewingReport(null); setViewingReportContent(''); }}>
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <div
                  className="relative bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between px-6 py-5 bg-slate-900 text-white">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-teal-400" />
                      <span className="font-black text-base uppercase tracking-wider">
                        {viewingReport ? viewingReport.title : 'Report History'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {viewingReport && (
                        <button
                          onClick={() => setViewingReport(null)}
                          className="px-3 py-1.5 text-[10px] font-black text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-all uppercase tracking-widest"
                        >
                          ← Back
                        </button>
                      )}
                      <button
                        onClick={() => { setShowReportHistory(false); setViewingReport(null); setViewingReportContent(''); }}
                        className="p-2 hover:bg-white/10 rounded-xl transition-all"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {viewingReport ? (
                      /* ── View single report ── */
                      <div className="p-6 space-y-4">
                        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                          <span className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg">{viewingReport.city}</span>
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">{new Date(viewingReport.timestamp).toLocaleString()}</span>
                          {viewingReport.riskScore !== undefined && (
                            <span className={`px-2.5 py-1 rounded-lg border ${viewingReport.riskScore >= 70 ? 'bg-red-50 text-red-700 border-red-200' :
                              viewingReport.riskScore >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-green-50 text-green-700 border-green-200'
                              }`}>Risk: {viewingReport.riskScore.toFixed(0)}%</span>
                          )}
                          {viewingReport.primaryRisk && (
                            <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">{viewingReport.primaryRisk}</span>
                          )}
                        </div>
                        <div className="bg-slate-900 rounded-2xl overflow-hidden">
                          <ReportRenderer markdown={viewingReportContent} />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              setAnalysis(viewingReportContent);
                              setShowReportHistory(false);
                              setViewingReport(null);
                              setViewingReportContent('');
                            }}
                            className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                          >
                            Load into Dashboard
                          </button>
                          <button
                            onClick={() => {
                              const el = document.createElement('a');
                              const file = new Blob([viewingReportContent], { type: 'text/plain' });
                              el.href = URL.createObjectURL(file);
                              el.download = `BioSentinel_${viewingReport!.city}_${new Date(viewingReport!.timestamp).toISOString().slice(0, 10)}.txt`;
                              el.click();
                            }}
                            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                          >
                            <FileDown className="w-4 h-4" /> Export
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Report list ── */
                      reportHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                          <Database className="w-12 h-12 mb-4 opacity-30" />
                          <p className="font-black text-sm uppercase tracking-widest">No saved reports yet</p>
                          <p className="text-xs mt-2">Run a Bio-Scan to save your first report</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {reportHistory.map(report => (
                            <div key={report.id} className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setViewingReport(report); setViewingReportContent(reconstructReportContent(report)); }}>
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="font-black text-sm text-slate-900 dark:text-slate-100 truncate">{report.title}</span>
                                  {report.riskScore !== undefined && (
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${report.riskScore >= 70 ? 'bg-red-100 text-red-600' :
                                      report.riskScore >= 40 ? 'bg-amber-100 text-amber-600' :
                                        'bg-green-100 text-green-600'
                                      }`}>{report.riskScore.toFixed(0)}% risk</span>
                                  )}
                                  {report.sectionCount !== undefined && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{report.sectionCount} sections</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(report.timestamp).toLocaleDateString()}</span>
                                  <span className="flex items-center gap-1"><MapPinned className="w-3 h-3" />{report.city}</span>
                                  {report.primaryRisk && <span className="text-rose-500">{report.primaryRisk}</span>}
                                </div>
                                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{report.summary}</p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  onClick={() => { setViewingReport(report); setViewingReportContent(reconstructReportContent(report)); }}
                                  className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                  title="View report"
                                >
                                  <Search className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    deleteReport(report.id);
                                    setReportHistory(getReports());
                                  }}
                                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Delete report"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>

                  {/* Footer */}
                  {!viewingReport && reportHistory.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{reportHistory.length} saved report{reportHistory.length !== 1 ? 's' : ''}</span>
                      <button
                        onClick={() => {
                          if (!confirm('Delete all saved reports? This cannot be undone.')) return;
                          clearAllReports();
                          setReportHistory([]);
                        }}
                        className="text-[10px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest"
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {analysis && (
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-fade-in-up w-full max-w-[100vw] sm:max-w-none">
          <div className="bg-slate-900 px-6 sm:px-10 py-6 sm:py-8 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 text-teal-400 shrink-0" />
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase">Inference Report</h3>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handlePrint}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg"
              >
                <Printer className="w-4 h-4" />
                Print Report
              </button>
              <button
                onClick={() => exportReport('md')}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-teal-900/20"
              >
                <FileDown className="w-4 h-4" />
                Markdown
              </button>
              <button
                onClick={() => exportReport('html')}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/20"
              >
                <Download className="w-4 h-4" />
                HTML
              </button>
            </div>
          </div>

          {/* Sticky Table of Contents */}
          <div className="sticky top-0 z-30 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-700 px-6 sm:px-10 py-4 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-slate-400 shrink-0 mr-2">
                <List className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Quick Jump:</span>
              </div>
              {([
                { href: '#section-ml-api-controls', icon: Cpu, label: 'ML API Panel', cond: showTechnicalPanels },
                { href: '#section-outbreak-api-controls', icon: Bug, label: 'Outbreak API', cond: showTechnicalPanels },
                { href: '#section-warnings', icon: AlertTriangle, label: 'Warnings', always: true },
                { href: '#section-telemetry', icon: Database, label: 'Weather Data', always: true },
                { href: '#section-prevention', icon: ShieldCheck, label: 'Prevention', always: true },
                { href: '#section-correlation', icon: Leaf, label: 'Env. Factors', cond: !!correlationPart },
                { href: '#section-ml', icon: BrainCircuit, label: 'ML Inference', cond: !!mlPrediction },
                { href: '#section-ml-recommendations', icon: Sparkles, label: 'ML Report', cond: !!mlPrediction },
                { href: '#section-risks', icon: HeartPulse, label: 'Bio-Risks', cond: showStructuredRisks },
                { href: '#section-mental-health', icon: Brain, label: 'Mental Health', always: true },
                { href: '#section-cardiovascular', icon: Heart, label: 'Cardio Risk', always: true },
                { href: '#section-immune', icon: ShieldAlert, label: 'Immune', always: true },
                { href: '#section-nutrition', icon: Apple, label: 'Nutrition', always: true },
                { href: '#section-outbreak', icon: Bug, label: 'Outbreak', cond: !!outbreakPart },
                { href: '#section-resources', icon: Hospital, label: 'Medical Radar', cond: !!resourcePart },
                { href: '#section-biosafe', icon: ShieldX, label: 'Bio-Safety', cond: !!biosafePart },
                { href: '#section-disclaimer', icon: Info, label: 'Disclaimer', cond: !!disclaimerPart },
              ] as Array<{ href: string; icon: React.ElementType; label: string; always?: boolean; cond?: boolean }>)
                .filter(i => i.always || i.cond)
                .map(item => {
                  const Icon = item.icon;
                  return (
                    <a key={item.href} href={item.href}
                      onClick={(e) => { e.preventDefault(); const el = document.querySelector(item.href); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      className="flex items-center gap-1.5 text-[10px] font-black text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 border border-slate-100 dark:border-slate-700 hover:border-teal-200 dark:hover:border-teal-700 uppercase tracking-widest whitespace-nowrap px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      {item.label}
                    </a>
                  );
                })}
            </div>
          </div>

          <div className="p-6 sm:p-10 md:p-16 space-y-16 sm:space-y-24">
            {showTechnicalPanels ? (
            <section id="section-ml-api-controls" className="space-y-4 scroll-mt-24">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-teal-600" />
                <h4 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">ML API Interface</h4>
              </div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-300">Run health, detect, train, status and prediction directly against the ML backend and inspect responses in this report.</p>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <button onClick={runMlApiHealth} disabled={!!mlApiBusy} className="px-4 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 disabled:opacity-50 transition-all">{mlApiBusy === 'health' ? 'Running Health...' : 'Fetch Health + Status + Metrics'}</button>
                <button onClick={runMlApiDetect} disabled={!!mlApiBusy} className="px-4 py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-50 transition-all">{mlApiBusy === 'detect' ? 'Detecting...' : 'Detect Train Schema'}</button>
                <button onClick={runMlApiPredictCustom} disabled={!!mlApiBusy || !weather} className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 transition-all">{mlApiBusy === 'predict' ? 'Predicting...' : 'Predict Current Weather'}</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Training Label Column</label>
                  <input
                    value={trainLabelColumn}
                    onChange={(e) => setTrainLabelColumn(e.target.value)}
                    placeholder="label column name"
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setTrainDatasetJson(JSON.stringify(createSampleTrainingDataset(), null, 2))} className="flex-1 px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">Load Sample Dataset</button>
                    <button onClick={() => runMlApiTrain('train')} disabled={!!mlApiBusy} className="flex-1 px-3 py-2 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">{mlApiBusy === 'train' ? 'Training...' : 'Train Model'}</button>
                    <button onClick={() => runMlApiTrain('auto')} disabled={!!mlApiBusy} className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">{mlApiBusy === 'auto' ? 'Auto Training...' : 'Train Auto'}</button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Training Dataset JSON</label>
                  <textarea
                    value={trainDatasetJson}
                    onChange={(e) => setTrainDatasetJson(e.target.value)}
                    rows={8}
                    className="w-full p-3 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 text-[11px] font-mono"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">ML API Output</p>
                <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-all max-h-80 overflow-y-auto">{mlApiResult || 'No ML API call executed yet.'}</pre>
              </div>
            </section>
            ) : null}

            {showTechnicalPanels ? (
            <section id="section-outbreak-api-controls" className="space-y-4 scroll-mt-24">
              <div className="flex items-center gap-3">
                <Bug className="w-5 h-5 text-rose-600" />
                <h4 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">Outbreak Prediction API Interface</h4>
              </div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-300">Query cloud early-warning thresholds and inspect local outbreak analytics in one place.</p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input value={outbreakCity} onChange={(e) => setOutbreakCity(e.target.value)} placeholder="City" className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold" />
                <input type="number" min={1} value={outbreakThreshold} onChange={(e) => setOutbreakThreshold(Number(e.target.value) || 15)} placeholder="Threshold" className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold" />
                <button onClick={refreshOutbreakApiPanel} disabled={outbreakBusy} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 disabled:opacity-50">Refresh Outbreak Data</button>
                <button onClick={() => { setOutbreakCity(weather?.city || ''); setOutbreakThreshold(15); }} className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest">Reset</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tracked Signals</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{outbreakApiStats?.totalSignals ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Alerts</p>
                  <p className="text-2xl font-black text-rose-600 mt-1">{outbreakApiStats?.activeAlerts ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">District Coverage</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{outbreakApiStats?.districtsCovered ?? 0}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cloud Early Warnings</p>
                  {outbreakApiWarnings.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400">No cloud warning over current threshold.</p>
                  ) : outbreakApiWarnings.map((w, idx) => (
                    <div key={`${w.syndromeId}-${idx}`} className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700">
                      <p className="text-xs font-black text-rose-700 dark:text-rose-300">{w.syndromeName}</p>
                      <p className="text-[10px] font-bold text-rose-600 dark:text-rose-300">{w.message}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Local Active Outbreak Alerts</p>
                  {outbreakApiAlerts.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400">No local active outbreak alerts.</p>
                  ) : outbreakApiAlerts.map((a) => (
                    <div key={a.id} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                      <p className="text-xs font-black text-amber-700 dark:text-amber-300">{a.syndromeName} • {a.status.toUpperCase()}</p>
                      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">{a.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            ) : null}

            {/* Warnings Section */}
            {mlWarnings.length > 0 && (
              <div id="section-warnings" className="space-y-4 scroll-mt-24">
                {mlWarnings.map((w, i) => {
                  const clean = w.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA9F}\u{231A}-\u{23FF}\u{25AA}-\u{25FE}\u{2B50}\u{2B55}\u{FE0F}\u26A0]/gu, '').trim();
                  return (
                    <div key={i} className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 font-bold text-xs sm:text-sm shadow-sm animate-fade-in">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      {clean}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Advanced Atmospheric Telemetry Section */}
            {weather && (
              <div id="section-telemetry" className="space-y-8 sm:space-y-10 p-6 sm:p-10 bg-slate-50/50 dark:bg-slate-700/30 rounded-[2rem] sm:rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-inner scroll-mt-24">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="p-3 sm:p-4 bg-teal-600 rounded-xl sm:rounded-2xl shadow-xl shadow-teal-200 shrink-0">
                    <Database className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Weather Details</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 sm:mt-2">Granular Environmental Sensors</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {/* Health-Relevant Atmospheric Data Display */}
                  {[
                    { label: 'Air Quality Index', value: weather.rawAqi ?? weather.aqi, unit: 'US AQI', type: 'aqi' },
                    { label: 'UV Index', value: weather.uvIndex || 0, unit: 'Index', type: 'uv' },
                    { label: 'PM2.5 Particles', value: weather.advancedData?.pm2_5 || 0, unit: 'μg/m³', type: 'pm25' },
                    { label: 'PM10 Particles', value: weather.advancedData?.pm10 || 0, unit: 'μg/m³', type: 'pm10' },
                    { label: 'Ozone (O3)', value: weather.advancedData?.o3 || 0, unit: 'μg/m³', type: 'o3' },
                    { label: 'Nitrogen Dioxide', value: weather.advancedData?.no2 || 0, unit: 'μg/m³', type: 'no2' }
                  ].map((metric) => {
                    const getStatus = (val: number, type: string) => {
                      if (type === 'aqi') {
                        if (val > 300) return { label: 'HAZARDOUS', color: 'text-red-900 bg-red-50 border-red-100', progress: 100, bg: 'bg-red-900' };
                        if (val > 200) return { label: 'VERY UNHEALTHY', color: 'text-purple-500 bg-purple-50 border-purple-100', progress: 80, bg: 'bg-purple-500' };
                        if (val > 150) return { label: 'UNHEALTHY', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: 60, bg: 'bg-rose-500' };
                        if (val > 100) return { label: 'SENSITIVE', color: 'text-orange-500 bg-orange-50 border-orange-100', progress: 40, bg: 'bg-orange-500' };
                        if (val > 50) return { label: 'MODERATE', color: 'text-yellow-500 bg-yellow-50 border-yellow-100', progress: 20, bg: 'bg-yellow-500' };
                        return { label: 'GOOD', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: 10, bg: 'bg-emerald-500' };
                      }
                      if (type === 'uv') {
                        if (val >= 8) return { label: 'VERY HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val / 11) * 100), bg: 'bg-rose-500' };
                        if (val >= 6) return { label: 'HIGH', color: 'text-orange-500 bg-orange-50 border-orange-100', progress: Math.min(100, (val / 11) * 100), bg: 'bg-orange-500' };
                        if (val >= 3) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val / 11) * 100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val / 11) * 100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'pm25') {
                        if (val > 35) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val / 50) * 100), bg: 'bg-rose-500' };
                        if (val > 12) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val / 50) * 100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val / 50) * 100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'pm10') {
                        if (val > 150) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val / 200) * 100), bg: 'bg-rose-500' };
                        if (val > 54) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val / 200) * 100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val / 200) * 100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'o3') {
                        if (val > 100) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val / 150) * 100), bg: 'bg-rose-500' };
                        if (val > 60) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val / 150) * 100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val / 150) * 100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'no2') {
                        if (val > 100) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val / 150) * 100), bg: 'bg-rose-500' };
                        if (val > 50) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val / 150) * 100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val / 150) * 100), bg: 'bg-emerald-500' };
                      }
                      return { label: 'NORMAL', color: 'text-slate-500 bg-slate-50 border-slate-100', progress: 0, bg: 'bg-slate-500' };
                    };
                    const status = getStatus(metric.value, metric.type);

                    return (
                      <div key={metric.label} className="p-5 sm:p-6 bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col gap-3 sm:gap-4 group hover:shadow-md transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">{metric.label}</span>
                          <div className={`px-2 py-1 rounded-lg text-[8px] font-black border ${status.color}`}>
                            {status.label}
                          </div>
                        </div>
                        <div className="flex items-end justify-between">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{typeof metric.value === 'number' && metric.value % 1 !== 0 ? metric.value.toFixed(1) : metric.value}</span>
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-500">{metric.unit}</span>
                          </div>
                          <div className="w-12 sm:w-16 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-1000 ${status.bg}`}
                              style={{ width: `${status.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Hourly Air Quality Chart */}
                <div className="mt-8 p-6 bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-600" /> 24-Hour Air Quality Trends
                  </h4>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyAirQuality}>
                        <defs>
                          <linearGradient id="colorPM25" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorO3" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                          tickLine={false}
                          axisLine={false}
                          interval={3}
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                        />
                        <Area type="monotone" dataKey="pm25" stroke="#f43f5e" strokeWidth={2} fill="url(#colorPM25)" name="PM2.5" />
                        <Area type="monotone" dataKey="o3" stroke="#f59e0b" strokeWidth={2} fill="url(#colorO3)" name="Ozone" />
                        <Area type="monotone" dataKey="no2" stroke="#8b5cf6" strokeWidth={2} fill="transparent" name="NO2" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            <div id="section-prevention" className="p-8 sm:p-12 bg-white dark:bg-slate-800 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden scroll-mt-24">
              <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 dark:bg-teal-900/20 rounded-bl-full opacity-50 pointer-events-none" />
              <h4 className="text-[10px] sm:text-xs font-black text-teal-600 uppercase tracking-[0.3em] mb-6 sm:mb-8 flex items-center gap-3">
                <BrainCircuit className="w-5 h-5" /> Prevention, Precautions & Lifestyle Strategy
              </h4>

              {/* Prevention Action Tiles */}
              {weather && (() => {
                const heatIndex = weather.temp + 0.33 * (weather.humidity / 100 * 6.105 * Math.exp(17.27 * weather.temp / (237.7 + weather.temp))) - 4;
                const hydrationLiters = weather.temp > 35 ? 3.5 : weather.temp > 28 ? 2.5 : 2.0;
                const hydrationLabel = weather.temp > 35 ? 'Critical' : weather.temp > 28 ? 'High' : 'Standard';
                const hydrationColor = weather.temp > 35 ? 'text-rose-500' : weather.temp > 28 ? 'text-orange-500' : 'text-teal-600';

                const sunspf = (weather.uvIndex ?? 0) >= 8 ? 'SPF 50+' : (weather.uvIndex ?? 0) >= 6 ? 'SPF 30+' : (weather.uvIndex ?? 0) >= 3 ? 'SPF 15+' : 'Optional';
                const sunLabel = (weather.uvIndex ?? 0) >= 8 ? 'Essential' : (weather.uvIndex ?? 0) >= 6 ? 'Recommended' : (weather.uvIndex ?? 0) >= 3 ? 'Advised' : 'Not Needed';
                const sunColor = (weather.uvIndex ?? 0) >= 8 ? 'text-rose-500' : (weather.uvIndex ?? 0) >= 6 ? 'text-orange-500' : (weather.uvIndex ?? 0) >= 3 ? 'text-amber-500' : 'text-teal-600';

                const pm25 = weather.advancedData?.pm2_5 ?? 0;
                const maskLabel = pm25 > 35 ? 'N95 Required' : pm25 > 12 ? 'Mask Advised' : 'Not Needed';
                const maskGrade = pm25 > 35 ? 'N95' : pm25 > 12 ? 'Surgical' : 'None';
                const maskColor = pm25 > 35 ? 'text-rose-500' : pm25 > 12 ? 'text-amber-500' : 'text-teal-600';

                const aqi = weather.rawAqi ?? weather.aqi;
                const activityLabel = aqi > 150 || (weather.uvIndex ?? 0) >= 8 || weather.temp > 38 ? 'Avoid Outdoors' : aqi > 100 || weather.temp > 33 ? 'Limit Duration' : 'Safe to Exercise';
                const activityColor = aqi > 150 || (weather.uvIndex ?? 0) >= 8 || weather.temp > 38 ? 'text-rose-500' : aqi > 100 || weather.temp > 33 ? 'text-amber-500' : 'text-teal-600';
                const activityWindow = aqi > 150 || weather.temp > 38 ? 'Stay Indoors' : aqi > 100 || weather.temp > 33 ? '< 30 min' : 'Any Time';

                const ventLabel = aqi > 150 ? 'Keep Closed' : aqi > 100 ? 'Use Filter' : (weather.advancedData?.boundaryLayerHeight ?? 0) > 1000 ? 'Open Wide' : 'Ventilate';
                const ventNote = aqi > 150 ? 'High outdoor pollution' : aqi > 100 ? 'HEPA filter recommended' : 'Good air exchange';
                const ventColor = aqi > 150 ? 'text-rose-500' : aqi > 100 ? 'text-amber-500' : 'text-teal-600';

                const heatLabel = heatIndex > 41 ? 'Danger' : heatIndex > 32 ? 'Caution' : heatIndex > 27 ? 'Moderate' : 'Comfortable';
                const heatNote = heatIndex > 41 ? 'Heat emergency risk' : heatIndex > 32 ? 'Rest in shade often' : heatIndex > 27 ? 'Stay cool & hydrated' : 'Feels normal';
                const heatColor = heatIndex > 41 ? 'text-rose-500' : heatIndex > 32 ? 'text-orange-500' : heatIndex > 27 ? 'text-amber-500' : 'text-teal-600';

                const tiles = [
                  { icon: Droplets, label: 'Hydration Need', value: `${hydrationLiters} L/day`, status: hydrationLabel, note: 'Daily water intake', color: hydrationColor, cardStyle: 'from-cyan-50 to-white border-cyan-100' },
                  { icon: Umbrella, label: 'Sun Protection', value: sunspf, status: sunLabel, note: 'UV defence level', color: sunColor, cardStyle: 'from-sky-50 to-white border-sky-100' },
                  { icon: Wind, label: 'Mask Guidance', value: maskGrade, status: maskLabel, note: 'Air quality shield', color: maskColor, cardStyle: 'from-violet-50 to-white border-violet-100' },
                  { icon: Dumbbell, label: 'Outdoor Activity', value: activityWindow, status: activityLabel, note: 'Safe exercise window', color: activityColor, cardStyle: 'from-emerald-50 to-white border-emerald-100' },
                  { icon: CloudFog, label: 'Ventilation', value: ventLabel, status: ventNote, note: 'Window/AC guidance', color: ventColor, cardStyle: 'from-blue-50 to-white border-blue-100' },
                  { icon: Flame, label: 'Heat Stress', value: heatLabel, status: heatNote, note: 'Apparent heat index', color: heatColor, cardStyle: 'from-rose-50 to-white border-rose-100' },
                ];

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8 sm:mb-10">
                    {tiles.map((t) => {
                      const Icon = t.icon;
                      return (
                        <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                            <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                          </div>
                          <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                          <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                          <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-600/50">
                            <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">{t.note}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="prose prose-slate max-w-none prose-p:text-xl sm:prose-p:text-2xl prose-p:font-black prose-p:text-slate-900 dark:prose-p:text-white prose-p:tracking-tighter prose-p:leading-[1.2] sm:prose-p:leading-[1.1] prose-headings:text-slate-900 dark:prose-headings:text-white prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-li:leading-relaxed prose-li:marker:text-slate-400 dark:prose-li:marker:text-slate-500 prose-a:text-teal-700 dark:prose-a:text-teal-300 prose-strong:text-teal-600 dark:prose-strong:text-teal-300">
                <ReactMarkdown>{introPart}</ReactMarkdown>
              </div>
            </div>

            {/* Weather-Health Correlation Analysis Section */}
            {correlationPart && (
              <div id="section-correlation" className="space-y-8 sm:space-y-10 p-8 sm:p-10 bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-indigo-950/40 dark:via-slate-800 dark:to-purple-950/40 rounded-[3rem] border border-indigo-100 dark:border-indigo-800/50 shadow-xl relative overflow-hidden group scroll-mt-24">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-2xl ml-8 mb-8 pointer-events-none" />

                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200 shrink-0 group-hover:scale-110 transition-transform duration-500">
                    <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Weather-Health Correlation</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1 sm:mt-2">How Environmental Factors Drive Disease & Health Outcomes</p>
                  </div>
                </div>

                {/* Environmental Factor Impact Tiles */}
                {weather && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
                    {[
                      { label: 'Temperature', value: `${weather.temp}°C`, impact: weather.temp > 35 ? 'Heat Stress' : weather.temp < 10 ? 'Cold Stress' : 'Stable', statusClass: weather.temp > 35 ? 'text-orange-600' : weather.temp < 10 ? 'text-blue-600' : 'text-emerald-600', disease: weather.temp > 35 ? '↑ Heatstroke, CVD' : weather.temp < 10 ? '↑ Flu, Asthma' : 'Low Risk', cardStyle: 'from-orange-50 to-white border-orange-100', icon: Thermometer },
                      { label: 'Humidity', value: `${weather.humidity}%`, impact: weather.humidity > 70 ? 'High — Mold/Vector Risk' : weather.humidity < 30 ? 'Low — Dry Airways' : 'Optimal', statusClass: weather.humidity > 70 ? 'text-blue-600' : weather.humidity < 30 ? 'text-amber-600' : 'text-emerald-600', disease: weather.humidity > 70 ? '↑ Dengue, Fungal' : weather.humidity < 30 ? '↑ Bronchitis, Sinusitis' : 'Low Risk', cardStyle: 'from-sky-50 to-white border-sky-100', icon: Droplets },
                      { label: 'AQI', value: `${weather.rawAqi ?? weather.aqi}`, impact: (weather.rawAqi ?? weather.aqi) > 150 ? 'Unhealthy' : (weather.rawAqi ?? weather.aqi) > 100 ? 'Sensitive' : (weather.rawAqi ?? weather.aqi) > 50 ? 'Moderate' : 'Good', statusClass: (weather.rawAqi ?? weather.aqi) > 150 ? 'text-rose-600' : (weather.rawAqi ?? weather.aqi) > 100 ? 'text-orange-600' : (weather.rawAqi ?? weather.aqi) > 50 ? 'text-amber-600' : 'text-emerald-600', disease: (weather.rawAqi ?? weather.aqi) > 150 ? '↑ COPD, Asthma' : (weather.rawAqi ?? weather.aqi) > 50 ? '↑ Respiratory Irrit.' : 'Low Risk', cardStyle: 'from-rose-50 to-white border-rose-100', icon: Wind },
                      { label: 'UV Index', value: `${weather.uvIndex ?? 'N/A'}`, impact: (weather.uvIndex ?? 0) >= 8 ? 'Very High' : (weather.uvIndex ?? 0) >= 6 ? 'High' : (weather.uvIndex ?? 0) >= 3 ? 'Moderate' : 'Low', statusClass: (weather.uvIndex ?? 0) >= 8 ? 'text-rose-600' : (weather.uvIndex ?? 0) >= 6 ? 'text-orange-600' : (weather.uvIndex ?? 0) >= 3 ? 'text-amber-600' : 'text-emerald-600', disease: (weather.uvIndex ?? 0) >= 6 ? '↑ Skin Cancer, Melanoma' : (weather.uvIndex ?? 0) >= 3 ? '↑ Sunburn' : 'Low Risk', cardStyle: 'from-yellow-50 to-white border-yellow-100', icon: ThermometerSun },
                      { label: 'PM2.5', value: `${weather.advancedData?.pm2_5?.toFixed(1) ?? 'N/A'} µg`, impact: (weather.advancedData?.pm2_5 ?? 0) > 35 ? 'High' : (weather.advancedData?.pm2_5 ?? 0) > 12 ? 'Moderate' : 'Low', statusClass: (weather.advancedData?.pm2_5 ?? 0) > 35 ? 'text-rose-600' : (weather.advancedData?.pm2_5 ?? 0) > 12 ? 'text-amber-600' : 'text-emerald-600', disease: (weather.advancedData?.pm2_5 ?? 0) > 35 ? '↑ Lung Disease, CVD' : '↑ Mild Irritation', cardStyle: 'from-purple-50 to-white border-purple-100', icon: CloudFog },
                      { label: 'Pressure', value: `${weather.pressure} hPa`, impact: weather.pressure < 1000 ? 'Low — Migraine Risk' : weather.pressure > 1020 ? 'High — Joint Risk' : 'Normal', statusClass: weather.pressure < 1000 ? 'text-purple-600' : weather.pressure > 1020 ? 'text-indigo-600' : 'text-emerald-600', disease: weather.pressure < 1000 ? '↑ Migraine, Arthritis' : weather.pressure > 1020 ? '↑ Joint Inflammation' : 'Low Risk', cardStyle: 'from-teal-50 to-white border-teal-100', icon: Activity },
                    ].map((factor) => {
                      const Icon = factor.icon;
                      return (
                        <div key={factor.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${factor.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{factor.label}</span>
                            <Icon className={`w-3.5 h-3.5 ${factor.statusClass}`} />
                          </div>
                          <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">{factor.value}</span>
                          <span className={`text-[9px] font-bold leading-tight ${factor.statusClass}`}>{factor.impact}</span>
                          <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-600/50">
                            <span className={`text-[8px] font-black uppercase tracking-wide ${factor.statusClass} opacity-80`}>{factor.disease}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="prose prose-slate prose-sm sm:prose-base max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-strong:text-indigo-600 prose-headings:text-slate-900 dark:prose-headings:text-white relative z-10">
                  <ReactMarkdown>{correlationPart}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* AI Risk Inference Section */}
            {mlPrediction && <div id="section-ml" className="scroll-mt-24"><MLInferenceCard prediction={mlPrediction} /></div>}

            {/* Predictive Bio-Risks - Enhanced Severity Icons */}
            {showStructuredRisks && (
              <div id="section-risks" className="space-y-10 p-10 bg-slate-50/50 dark:bg-slate-700/30 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-inner scroll-mt-24">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="p-3 sm:p-4 bg-rose-500 rounded-xl sm:rounded-2xl shadow-xl shadow-rose-200 shrink-0">
                    <HeartPulse className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Predictive Bio-Risks</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 sm:mt-2">Environment-Based Threats</p>
                  </div>
                </div>

                {/* Severity Quick Reference */}
                <div className="flex flex-wrap gap-3">
                  {(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] as SeverityLevel[]).map((level) => {
                    const style = getSeverityStyles(level);
                    const Icon = style.icon;
                    return (
                      <div key={level} className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${style.bg} ${style.border}`}>
                        <div className={`w-2 h-2 rounded-full ${style.accent} ${level === 'CRITICAL' ? 'animate-ping' : ''}`} />
                        <Icon className={`w-3.5 h-3.5 ${style.iconColor}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>{level}</span>
                        <span className={`text-[9px] font-bold ${style.text} opacity-60`}>{style.value}%</span>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                  {parsedRisks.map((risk, idx) => {
                    const style = getSeverityStyles(risk.severity);
                    const Icon = style.icon;

                    return (
                      <div key={idx} className={`relative overflow-hidden group p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border ${style.bg} ${style.border} flex flex-col gap-4 sm:gap-5 shadow-sm hover:shadow-2xl transition-all duration-500`}>
                        <div className={`absolute top-0 left-0 bottom-0 w-2 sm:w-2.5 ${style.accent}`} />

                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-2">
                            <div className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${style.badge} shadow-md`}>
                              <Icon className={`w-3 h-3 sm:w-4 sm:h-4 ${risk.severity === 'CRITICAL' ? 'animate-pulse' : ''}`} />
                              {risk.severity} LEVEL
                            </div>
                          </div>
                          <div className="p-2 sm:p-3 bg-white/50 rounded-xl sm:rounded-2xl backdrop-blur-sm shadow-sm">
                            <Icon className={`w-5 h-5 sm:w-7 sm:h-7 ${style.iconColor}`} />
                          </div>
                        </div>

                        {/* Visual Severity Meter */}
                        <div className="space-y-1.5 sm:space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest">Severity Meter</span>
                            <span className={`text-[8px] sm:text-[9px] font-black uppercase ${style.text}`}>{style.value}%</span>
                          </div>
                          <div className="h-1.5 sm:h-2 w-full bg-white/50 rounded-full overflow-hidden border border-white/20">
                            <div
                              className={`h-full transition-all duration-1000 ease-out ${style.accent}`}
                              style={{ width: `${style.value}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-start gap-4 sm:gap-6 mt-2">
                          <div className={`p-3 sm:p-4 rounded-2xl sm:rounded-3xl ${style.bg} border-2 ${style.border} shrink-0 shadow-lg`}>
                            <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${style.iconColor} ${risk.severity === 'CRITICAL' ? 'animate-pulse' : ''}`} />
                          </div>
                          <div className="flex-1">
                            <h4 className={`text-xl sm:text-2xl font-black uppercase mb-2 sm:mb-3 ${style.text} tracking-tight leading-none`}>{risk.title}</h4>
                            <p className={`text-xs sm:text-sm font-bold leading-relaxed ${style.text} opacity-80`}>{risk.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Mental Health & Circadian Rhythm ── */}
            {weather && (
              <div id="section-mental-health" className="space-y-8 sm:space-y-10 p-8 sm:p-10 bg-gradient-to-br from-violet-50 via-purple-50 to-white dark:from-violet-950/40 dark:via-purple-950/40 dark:to-slate-800 rounded-[3rem] border border-violet-100 dark:border-violet-800/50 shadow-xl relative overflow-hidden group scroll-mt-24">
                <div className="absolute top-0 right-0 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-violet-600 rounded-2xl shadow-xl shadow-violet-200 shrink-0 group-hover:scale-110 transition-transform duration-500">
                    <Brain className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Mental Health & Circadian</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-violet-500 uppercase tracking-widest mt-1 sm:mt-2">Mood · Sleep Quality · Cognitive Load · Stress Response</p>
                  </div>
                </div>

                {(() => {
                  const uvVal = weather.uvIndex ?? 0;
                  const clouds = weather.clouds ?? 0;
                  const aqi = weather.rawAqi ?? weather.aqi;
                  const temp = weather.temp;
                  const pressure = weather.pressure;
                  const humidity = weather.humidity;

                  // Seasonal Mood Risk
                  const moodRisk = uvVal < 2 && clouds > 70 ? 'High' : clouds > 50 ? 'Moderate' : 'Low';
                  const moodCol = moodRisk === 'High' ? 'text-violet-600' : moodRisk === 'Moderate' ? 'text-purple-500' : 'text-emerald-600';
                  const moodNote = moodRisk === 'High' ? 'Low light triggers seasonal depression risk' : moodRisk === 'Moderate' ? 'Limited sunlight may affect serotonin' : 'Adequate light supports mood stability';

                  // Sleep Quality
                  const sleepScore = temp > 30 ? 'Poor' : temp > 26 ? 'Disrupted' : temp < 10 ? 'Cold Disruption' : 'Good';
                  const sleepCol = sleepScore === 'Poor' ? 'text-rose-500' : sleepScore === 'Disrupted' ? 'text-orange-500' : sleepScore === 'Cold Disruption' ? 'text-blue-500' : 'text-emerald-600';
                  const sleepNote = sleepScore === 'Poor' ? 'High temp impairs melatonin production' : sleepScore === 'Disrupted' ? 'Warm night air raises core body temp' : sleepScore === 'Cold Disruption' ? 'Cold may fragment sleep cycles' : 'Temperature favours deep sleep cycles';

                  // Cognitive Load
                  const cogLoad = aqi > 150 ? 'Severely Impaired' : aqi > 100 ? 'Impaired' : aqi > 50 ? 'Mildly Reduced' : 'Optimal';
                  const cogCol = aqi > 150 ? 'text-rose-600' : aqi > 100 ? 'text-orange-500' : aqi > 50 ? 'text-amber-500' : 'text-emerald-600';
                  const cogNote = aqi > 100 ? 'Poor air reduces oxygen to brain tissues' : aqi > 50 ? 'Moderate AQI slightly reduces focus' : 'Clean air supports cognitive performance';

                  // Circadian Rhythm
                  const circadianRisk = uvVal < 1 && clouds > 80 ? 'Disrupted' : uvVal < 3 ? 'Mildly Off' : 'Aligned';
                  const circCol = circadianRisk === 'Disrupted' ? 'text-violet-600' : circadianRisk === 'Mildly Off' ? 'text-amber-500' : 'text-emerald-600';
                  const circNote = circadianRisk === 'Disrupted' ? 'Heavy overcast disrupts natural light cues' : circadianRisk === 'Mildly Off' ? 'Low UV may shift internal clock slightly' : 'Natural light anchors circadian rhythm';

                  // Stress Response
                  const stressLabel = pressure < 1000 ? 'Elevated' : humidity > 80 ? 'Moderate' : 'Normal';
                  const stressCol = pressure < 1000 ? 'text-rose-500' : humidity > 80 ? 'text-amber-500' : 'text-emerald-600';
                  const stressNote = pressure < 1000 ? 'Low pressure correlates with tension headaches' : humidity > 80 ? 'Oppressive humidity increases irritability' : 'Stable conditions, normal stress baseline';

                  // Fatigue Risk
                  const heatIdx = temp + 0.33 * (humidity / 100 * 6.105 * Math.exp(17.27 * temp / (237.7 + temp))) - 4;
                  const fatigueLabel = heatIdx > 40 ? 'Critical' : heatIdx > 32 ? 'High' : heatIdx > 27 ? 'Moderate' : 'Low';
                  const fatigueCol = heatIdx > 40 ? 'text-rose-600' : heatIdx > 32 ? 'text-orange-500' : heatIdx > 27 ? 'text-amber-500' : 'text-emerald-600';

                  const tiles = [
                    { icon: Moon, label: 'Seasonal Mood Risk', value: moodRisk, status: moodNote, color: moodCol, cardStyle: 'from-violet-50 to-white border-violet-100' },
                    { icon: Moon, label: 'Sleep Quality', value: sleepScore, status: sleepNote, color: sleepCol, cardStyle: 'from-indigo-50 to-white border-indigo-100' },
                    { icon: Brain, label: 'Cognitive Load', value: cogLoad, status: cogNote, color: cogCol, cardStyle: 'from-purple-50 to-white border-purple-100' },
                    { icon: Sun, label: 'Circadian Rhythm', value: circadianRisk, status: circNote, color: circCol, cardStyle: 'from-fuchsia-50 to-white border-fuchsia-100' },
                    { icon: Activity, label: 'Stress Response', value: stressLabel, status: stressNote, color: stressCol, cardStyle: 'from-pink-50 to-white border-pink-100' },
                    { icon: Zap, label: 'Fatigue Risk', value: fatigueLabel, status: `Heat index ${Math.round(heatIdx)}°C`, color: fatigueCol, cardStyle: 'from-rose-50 to-white border-rose-100' },
                  ];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
                      {tiles.map((t) => {
                        const Icon = t.icon; return (
                          <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                              <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                            </div>
                            <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                            <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Cardiovascular Stress Monitor ── */}
            {weather && (
              <div id="section-cardiovascular" className="space-y-8 sm:space-y-10 p-8 sm:p-10 bg-gradient-to-br from-red-50 via-orange-50 to-white dark:from-red-950/40 dark:via-orange-950/40 dark:to-slate-800 rounded-[3rem] border border-red-100 dark:border-red-900/50 shadow-xl relative overflow-hidden group scroll-mt-24">
                <div className="absolute top-0 right-0 w-72 h-72 bg-red-500/5 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-red-600 rounded-2xl shadow-xl shadow-red-200 shrink-0 group-hover:scale-110 transition-transform duration-500">
                    <Heart className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Cardiovascular Stress Monitor</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-red-500 uppercase tracking-widest mt-1 sm:mt-2">Heart · Blood Pressure · Arterial Load · Exercise Safety</p>
                  </div>
                </div>

                {(() => {
                  const temp = weather.temp;
                  const humidity = weather.humidity;
                  const pressure = weather.pressure;
                  const aqi = weather.rawAqi ?? weather.aqi;
                  const pm25 = weather.advancedData?.pm2_5 ?? 0;
                  const heatIdx = temp + 0.33 * (humidity / 100 * 6.105 * Math.exp(17.27 * temp / (237.7 + temp))) - 4;

                  // Heat Stress on Heart
                  const heartHeat = heatIdx > 41 ? 'Danger Zone' : heatIdx > 35 ? 'High Stress' : heatIdx > 28 ? 'Moderate' : 'Safe';
                  const heartHeatCol = heatIdx > 41 ? 'text-rose-700' : heatIdx > 35 ? 'text-red-600' : heatIdx > 28 ? 'text-orange-500' : 'text-emerald-600';
                  const heartHeatNote = heatIdx > 35 ? 'Extreme heat forces heart to work harder' : heatIdx > 28 ? 'Increased cardiac output to cool the body' : 'Heart rate and output within normal range';

                  // Blood Pressure Impact
                  const bpImpact = pressure < 995 ? 'Low Pressure Alert' : pressure > 1025 ? 'High Pressure Alert' : pressure < 1005 ? 'Slightly Low' : 'Stable';
                  const bpCol = pressure < 995 ? 'text-violet-600' : pressure > 1025 ? 'text-red-600' : pressure < 1005 ? 'text-amber-500' : 'text-emerald-600';
                  const bpNote = pressure < 1000 ? 'Low barometric pressure may dilate vessels' : pressure > 1020 ? 'High pressure associated with hypertension risk' : 'Barometric conditions pose minimal BP impact';

                  // PM2.5 CVD Risk
                  const cvdPm = pm25 > 55 ? 'Critical CVD Risk' : pm25 > 35 ? 'Elevated CVD' : pm25 > 12 ? 'Moderate Risk' : 'Low Risk';
                  const cvdPmCol = pm25 > 55 ? 'text-rose-700' : pm25 > 35 ? 'text-red-600' : pm25 > 12 ? 'text-amber-500' : 'text-emerald-600';
                  const cvdPmNote = pm25 > 35 ? 'Fine particles enter bloodstream, stress arteries' : pm25 > 12 ? 'Moderate PM2.5 may irritate vessel lining' : 'Clean air presents minimal cardiovascular load';

                  // Exercise Intensity Limit
                  const exLimit = temp > 38 || aqi > 150 ? 'No Outdoor Exercise' : temp > 33 || aqi > 100 ? 'Low Intensity Only' : temp > 28 || aqi > 50 ? 'Moderate Limit' : 'No Restriction';
                  const exCol = temp > 38 || aqi > 150 ? 'text-rose-600' : temp > 33 || aqi > 100 ? 'text-orange-500' : temp > 28 ? 'text-amber-500' : 'text-emerald-600';
                  const exNote = temp > 33 || aqi > 100 ? 'Avoid peak exertion to protect heart under load' : 'Heart-safe conditions for moderate workout';

                  // Dehydration / Clot Risk
                  const clotRisk = temp > 35 && humidity < 40 ? 'Elevated' : temp > 30 ? 'Moderate' : 'Low';
                  const clotCol = clotRisk === 'Elevated' ? 'text-red-600' : clotRisk === 'Moderate' ? 'text-orange-500' : 'text-emerald-600';
                  const clotNote = clotRisk === 'Elevated' ? 'Dehydration thickens blood, raising clot risk' : clotRisk === 'Moderate' ? 'Maintain hydration to thin blood naturally' : 'Hydration risk is low under current conditions';

                  // Arrhythmia Trigger Index
                  const arrhythmia = (weather.advancedData?.cape ?? 0) > 500 || pressure < 998 ? 'Risk Elevated' : temp > 36 ? 'Moderate Risk' : 'Low Risk';
                  const arrhCol = arrhythmia === 'Risk Elevated' ? 'text-rose-600' : arrhythmia === 'Moderate Risk' ? 'text-amber-500' : 'text-emerald-600';
                  const arrhNote = arrhythmia === 'Risk Elevated' ? 'Pressure instability can trigger irregular heart rhythm' : 'Stable atmospheric conditions, low arrhythmia trigger';

                  const tiles = [
                    { icon: Flame, label: 'Heart Heat Stress', value: heartHeat, status: heartHeatNote, color: heartHeatCol, cardStyle: 'from-red-50 to-white border-red-100' },
                    { icon: Activity, label: 'Blood Pressure', value: bpImpact, status: bpNote, color: bpCol, cardStyle: 'from-orange-50 to-white border-orange-100' },
                    { icon: Wind, label: 'CVD Pollution Risk', value: cvdPm, status: cvdPmNote, color: cvdPmCol, cardStyle: 'from-rose-50 to-white border-rose-100' },
                    { icon: Dumbbell, label: 'Exercise Limit', value: exLimit, status: exNote, color: exCol, cardStyle: 'from-amber-50 to-white border-amber-100' },
                    { icon: Droplets, label: 'Clot / Dehydration', value: clotRisk, status: clotNote, color: clotCol, cardStyle: 'from-orange-50 to-white border-orange-100' },
                    { icon: HeartPulse, label: 'Arrhythmia Index', value: arrhythmia, status: arrhNote, color: arrhCol, cardStyle: 'from-red-50 to-white border-red-100' },
                  ];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
                      {tiles.map((t) => {
                        const Icon = t.icon; return (
                          <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                              <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                            </div>
                            <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                            <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Immune Defense Status ── */}
            {weather && (
              <div id="section-immune" className="space-y-8 sm:space-y-10 p-8 sm:p-10 bg-gradient-to-br from-emerald-50 via-teal-50 to-white dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-slate-800 rounded-[3rem] border border-emerald-100 dark:border-emerald-800/50 shadow-xl relative overflow-hidden group scroll-mt-24">
                <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-emerald-600 rounded-2xl shadow-xl shadow-emerald-200 shrink-0 group-hover:scale-110 transition-transform duration-500">
                    <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Immune Defense Status</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1 sm:mt-2">Vitamin D · Pathogen Risk · Allergy Load · Immune Suppression</p>
                  </div>
                </div>

                {(() => {
                  const uvVal = weather.uvIndex ?? 0;
                  const clouds = weather.clouds ?? 0;
                  const humidity = weather.humidity;
                  const temp = weather.temp;
                  const aqi = weather.rawAqi ?? weather.aqi;
                  const windSpeed = weather.windSpeed ?? 0;
                  const pm25 = weather.advancedData?.pm2_5 ?? 0;

                  // Vitamin D Synthesis
                  const vitD = uvVal >= 3 && clouds < 60 ? 'Active Synthesis' : uvVal >= 2 ? 'Minimal Synthesis' : 'Insufficient';
                  const vitDCol = vitD === 'Active Synthesis' ? 'text-emerald-600' : vitD === 'Minimal Synthesis' ? 'text-amber-500' : 'text-rose-500';
                  const vitDNote = vitD === 'Active Synthesis' ? `UV ${uvVal} — 10–15 min sun-exposure optimal` : vitD === 'Minimal Synthesis' ? 'Consider supplementation today' : 'No vitamin D synthesis possible — supplement';

                  // Pathogen Spread Risk
                  const pathogen = humidity > 75 && temp > 25 ? 'High — Hot & Humid' : humidity > 60 && temp > 20 ? 'Moderate' : temp < 5 ? 'Cold Pathogen Risk' : 'Low';
                  const pathCol = pathogen.startsWith('High') ? 'text-rose-600' : pathogen === 'Moderate' ? 'text-amber-500' : pathogen.startsWith('Cold') ? 'text-blue-600' : 'text-emerald-600';
                  const pathNote = pathogen.startsWith('High') ? 'Hot humid air is ideal for bacterial & viral spread' : pathogen === 'Moderate' ? 'Moderate humid conditions, reasonable caution' : pathogen.startsWith('Cold') ? 'Cold dry air aids airborne respiratory virus spread' : 'Conditions unfavourable for most pathogens';

                  // Cold/Flu Risk
                  const fluRisk = temp < 5 ? 'High' : temp < 15 ? 'Moderate' : 'Low';
                  const fluCol = fluRisk === 'High' ? 'text-blue-600' : fluRisk === 'Moderate' ? 'text-cyan-500' : 'text-emerald-600';
                  const fluNote = fluRisk === 'High' ? 'Cold weather dries mucous membranes, enables virus entry' : fluRisk === 'Moderate' ? 'Cool conditions mildly increase influenza transmission' : 'Temperature range reduces cold/flu virus viability';

                  // Mold Spore Risk
                  const moldRisk = humidity > 75 ? 'Elevated' : humidity > 60 ? 'Moderate' : 'Low';
                  const moldCol = moldRisk === 'Elevated' ? 'text-rose-600' : moldRisk === 'Moderate' ? 'text-amber-500' : 'text-emerald-600';
                  const moldNote = moldRisk === 'Elevated' ? 'High humidity promotes mold spore dispersal' : moldRisk === 'Moderate' ? 'Moderate indoor mold risk — ventilate' : 'Dry conditions suppress mold spore activity';

                  // Allergy Load
                  const allergyLoad = windSpeed > 30 && humidity < 50 ? 'Very High — Pollen Storm' : windSpeed > 20 || humidity < 40 ? 'High' : pm25 > 35 ? 'Moderate (Particulates)' : 'Low';
                  const allergyCol = allergyLoad.startsWith('Very') ? 'text-rose-700' : allergyLoad === 'High' ? 'text-orange-600' : allergyLoad.startsWith('Mod') ? 'text-amber-500' : 'text-emerald-600';

                  // Immune Stress Level (AQI)
                  const immuneStress = aqi > 150 ? 'Severe Suppression' : aqi > 100 ? 'Moderate Suppression' : aqi > 50 ? 'Mild Impact' : 'No Suppression';
                  const immuneCol = aqi > 150 ? 'text-rose-700' : aqi > 100 ? 'text-red-600' : aqi > 50 ? 'text-amber-500' : 'text-emerald-600';
                  const immuneNote = aqi > 100 ? 'High AQI suppresses immune cell function in airways' : aqi > 50 ? 'Mild air pollution increases respiratory immune load' : 'Clean air supports optimal immune system function';

                  const tiles = [
                    { icon: Sun, label: 'Vitamin D Synthesis', value: vitD, status: vitDNote, color: vitDCol, cardStyle: 'from-yellow-50 to-white border-yellow-100' },
                    { icon: Bug, label: 'Pathogen Spread', value: pathogen, status: pathNote, color: pathCol, cardStyle: 'from-teal-50 to-white border-teal-100' },
                    { icon: Thermometer, label: 'Cold / Flu Risk', value: fluRisk, status: fluNote, color: fluCol, cardStyle: 'from-sky-50 to-white border-sky-100' },
                    { icon: CloudFog, label: 'Mold Spore Risk', value: moldRisk, status: moldNote, color: moldCol, cardStyle: 'from-emerald-50 to-white border-emerald-100' },
                    { icon: Wind, label: 'Allergy Load', value: allergyLoad, status: `Wind ${windSpeed} km/h, Humidity ${humidity}%`, color: allergyCol, cardStyle: 'from-lime-50 to-white border-lime-100' },
                    { icon: ShieldAlert, label: 'Immune AQI Stress', value: immuneStress, status: immuneNote, color: immuneCol, cardStyle: 'from-green-50 to-white border-green-100' },
                  ];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
                      {tiles.map((t) => {
                        const Icon = t.icon; return (
                          <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                              <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                            </div>
                            <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                            <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Nutrition & Hydration Intelligence ── */}
            {weather && (
              <div id="section-nutrition" className="space-y-8 sm:space-y-10 p-8 sm:p-10 bg-gradient-to-br from-lime-50 via-green-50 to-white dark:from-lime-950/40 dark:via-green-950/40 dark:to-slate-800 rounded-[3rem] border border-lime-100 dark:border-lime-900/50 shadow-xl relative overflow-hidden group scroll-mt-24">
                <div className="absolute top-0 right-0 w-72 h-72 bg-lime-500/5 rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-green-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-lime-600 rounded-2xl shadow-xl shadow-lime-200 shrink-0 group-hover:scale-110 transition-transform duration-500">
                    <Leaf className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Nutrition & Hydration</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-lime-600 uppercase tracking-widest mt-1 sm:mt-2">Fluid Strategy · Electrolytes · Diet Adaptation · Metabolism</p>
                  </div>
                </div>

                {(() => {
                  const temp = weather.temp;
                  const humidity = weather.humidity;
                  const uvVal = weather.uvIndex ?? 0;
                  const aqi = weather.rawAqi ?? weather.aqi;
                  const windSpeed = weather.windSpeed ?? 0;
                  const heatIdx = temp + 0.33 * (humidity / 100 * 6.105 * Math.exp(17.27 * temp / (237.7 + temp))) - 4;

                  // Daily Water Intake
                  const waterL = heatIdx > 38 ? 4.0 : heatIdx > 32 ? 3.0 : heatIdx > 26 ? 2.5 : 2.0;
                  const waterLabel = heatIdx > 38 ? 'Critical — 4.0 L' : heatIdx > 32 ? 'High — 3.0 L' : heatIdx > 26 ? 'Moderate — 2.5 L' : 'Standard — 2.0 L';
                  const waterCol = heatIdx > 38 ? 'text-rose-600' : heatIdx > 32 ? 'text-orange-500' : heatIdx > 26 ? 'text-amber-500' : 'text-emerald-600';

                  // Electrolyte Loss Risk
                  const electro = heatIdx > 35 ? 'High — Add Sodium' : heatIdx > 28 ? 'Moderate — Replenish' : 'Low — Standard Diet';
                  const electroCol = heatIdx > 35 ? 'text-rose-600' : heatIdx > 28 ? 'text-amber-500' : 'text-emerald-600';
                  const electroNote = heatIdx > 28 ? 'Heavy sweating depletes Na⁺, K⁺ — add electrolyte drink' : 'Normal conditions, no extra electrolytes needed';

                  // Vitamin D (dietary)
                  const vitDDiet = uvVal < 2 ? 'Supplement Needed' : uvVal < 4 ? 'Monitor Levels' : 'Sunlight Sufficient';
                  const vitDDietCol = vitDDiet === 'Supplement Needed' ? 'text-violet-600' : vitDDiet === 'Monitor Levels' ? 'text-amber-500' : 'text-emerald-600';

                  // Anti-Inflammatory Diet
                  const antiInflam = aqi > 100 ? 'Strongly Advised' : aqi > 50 ? 'Recommended' : 'Beneficial';
                  const antiInflamCol = aqi > 100 ? 'text-rose-600' : aqi > 50 ? 'text-amber-500' : 'text-emerald-600';
                  const antiInflamNote = aqi > 100 ? 'High AQI: omega-3, turmeric & berries to reduce inflammation' : aqi > 50 ? 'Include anti-oxidant-rich foods today' : 'Standard balanced diet is sufficient';

                  // Caloric Adjustment
                  const calLabel = temp > 32 ? 'Reduce Heavy Meals' : temp < 10 ? 'Increase Caloric Intake' : 'Maintain Baseline';
                  const calCol = temp > 32 ? 'text-orange-500' : temp < 10 ? 'text-blue-600' : 'text-emerald-600';
                  const calNote = temp > 32 ? 'Heat suppresses appetite — eat light, frequent meals' : temp < 10 ? 'Cold boosts caloric need for thermoregulation' : 'Temperature does not significantly alter caloric demands';

                  // Heat-Safe Meal Timing
                  const mealTiming = temp > 35 ? 'Avoid Midday Meals Outside' : temp > 28 ? 'Light Lunch Advised' : 'No Restrictions';
                  const mealCol = temp > 35 ? 'text-rose-600' : temp > 28 ? 'text-amber-500' : 'text-emerald-600';
                  const mealNote = temp > 28 ? 'Digestion generates heat — avoid heavy meals during peak sun hours' : 'Cool conditions permit normal meal timing';

                  const tiles = [
                    { icon: Droplets, label: 'Daily Water Goal', value: waterLabel, status: `Heat index ${Math.round(heatIdx)}°C`, color: waterCol, cardStyle: 'from-cyan-50 to-white border-cyan-100' },
                    { icon: FlaskConical, label: 'Electrolyte Loss', value: electro, status: electroNote, color: electroCol, cardStyle: 'from-lime-50 to-white border-lime-100' },
                    { icon: Sun, label: 'Vitamin D Diet', value: vitDDiet, status: `UV Index: ${uvVal}`, color: vitDDietCol, cardStyle: 'from-yellow-50 to-white border-yellow-100' },
                    { icon: Leaf, label: 'Anti-Inflammatory', value: antiInflam, status: antiInflamNote, color: antiInflamCol, cardStyle: 'from-green-50 to-white border-green-100' },
                    { icon: Coffee, label: 'Caloric Adjustment', value: calLabel, status: calNote, color: calCol, cardStyle: 'from-orange-50 to-white border-orange-100' },
                    { icon: Apple, label: 'Meal Timing', value: mealTiming, status: mealNote, color: mealCol, cardStyle: 'from-rose-50 to-white border-rose-100' },
                  ];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
                      {tiles.map((t) => {
                        const Icon = t.icon; return (
                          <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                              <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                            </div>
                            <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                            <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Disease Outbreak Early Warning */}
            {outbreakPart && (
              <div id="section-outbreak" className="space-y-6 p-8 sm:p-10 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-800 rounded-[3rem] border border-amber-100 dark:border-amber-900/50 shadow-xl relative overflow-hidden scroll-mt-24">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-amber-500 rounded-2xl shadow-xl shadow-amber-200 shrink-0">
                    <Bug className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Outbreak Early Warning</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-amber-500 uppercase tracking-widest mt-1 sm:mt-2">Disease Spread Forecast & Vector Risk</p>
                  </div>
                </div>
                <div className="prose prose-slate prose-sm sm:prose-base max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-strong:text-amber-600 prose-headings:text-slate-900 dark:prose-headings:text-white relative z-10">
                  <ReactMarkdown>{outbreakPart}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Verified Medical Resources / Medical Radar */}
            {resourcePart && (
              <div id="section-resources" className="space-y-6 p-8 sm:p-10 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-slate-800 rounded-[3rem] border border-blue-100 dark:border-blue-900/50 shadow-xl relative overflow-hidden scroll-mt-24">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-blue-600 rounded-2xl shadow-xl shadow-blue-200 shrink-0">
                    <Hospital className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Medical Radar</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1 sm:mt-2">Verified Facilities Within 1km Radius</p>
                  </div>
                </div>
                <div className="prose prose-slate prose-sm sm:prose-base max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-strong:text-blue-600 prose-headings:text-slate-900 dark:prose-headings:text-white relative z-10">
                  <ReactMarkdown>{resourcePart}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Bio-Safety Action Plan */}
            {biosafePart && (
              <div id="section-biosafe" className="space-y-6 p-8 sm:p-10 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/40 dark:to-slate-800 rounded-[3rem] border border-rose-100 dark:border-rose-900/50 shadow-xl relative overflow-hidden scroll-mt-24">
                <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                <div className="flex items-center gap-4 sm:gap-6 relative z-10">
                  <div className="p-3 sm:p-4 bg-rose-600 rounded-2xl shadow-xl shadow-rose-200 shrink-0">
                    <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase leading-none">Bio-Safety Protocol</h3>
                    <p className="text-[9px] sm:text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1 sm:mt-2">Emergency Response & Containment Measures</p>
                  </div>
                </div>
                <div className="prose prose-slate prose-sm sm:prose-base max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-strong:text-rose-600 prose-headings:text-slate-900 dark:prose-headings:text-white relative z-10">
                  <ReactMarkdown>{biosafePart}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Medical Disclaimer */}
            {disclaimerPart && (
              <div id="section-disclaimer" className="p-6 sm:p-8 bg-slate-50 dark:bg-slate-700/40 rounded-2xl border border-slate-200 dark:border-slate-600 scroll-mt-24">
                <div className="flex items-center gap-3 mb-4">
                  <Info className="w-5 h-5 text-slate-400 shrink-0" />
                  <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Medical Disclaimer</h4>
                </div>
                <div className="prose prose-slate prose-xs max-w-none prose-p:text-slate-500 dark:prose-p:text-slate-400 prose-p:text-xs prose-p:leading-relaxed prose-strong:text-slate-600 dark:prose-strong:text-slate-300">
                  <ReactMarkdown>{disclaimerPart}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Analysis Feedback Section */}
            <div className="mt-12 pt-12 border-t border-slate-100 dark:border-slate-700 flex flex-col items-center gap-6 animate-fade-in">
              <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Was this analysis helpful?</h4>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleDashboardFeedback(true)}
                  disabled={dashboardFeedbackSubmitted}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${dashboardFeedback === 'helpful'
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200 scale-105'
                    : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600'
                    }`}
                >
                  <ThumbsUp className="w-4 h-4" /> Helpful
                </button>
                <button
                  onClick={() => handleDashboardFeedback(false)}
                  disabled={dashboardFeedbackSubmitted}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${dashboardFeedback === 'not-helpful'
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-200 scale-105'
                    : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600'
                    }`}
                >
                  <ThumbsDown className="w-4 h-4" /> Not Helpful
                </button>
              </div>

              {showDashboardCommentInput && !dashboardFeedbackSubmitted && (
                <div className="w-full max-w-lg space-y-4 animate-fade-in-up">
                  <textarea
                    value={dashboardComment}
                    onChange={(e) => setDashboardComment(e.target.value)}
                    placeholder="Help us improve. What was missing or inaccurate?"
                    className="w-full p-4 bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700 outline-none resize-none h-32 transition-all"
                  />
                  <button
                    onClick={submitDashboardComment}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-teal-600 transition-all shadow-lg"
                  >
                    Submit Feedback
                  </button>
                </div>
              )}

              {dashboardFeedbackSubmitted && (
                <div className="flex items-center gap-2 text-teal-600 animate-fade-in">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-xs font-black uppercase tracking-widest">Thank you for your feedback!</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
