import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useDataCache, isCacheValid } from '../contexts/DataCacheContext';
import { Activity, AlertCircle, AlertOctagon, AlertTriangle, ArrowRight, BrainCircuit, CheckCircle, ChevronDown, ChevronRight, ChevronUp, Cpu, Database, FileDown, HeartPulse, Info, Loader2, MessageSquarePlus, RefreshCw, Send, ShieldAlert, ShieldCheck, Sparkles, Thermometer, ThermometerSun, ThumbsDown, ThumbsUp, TrendingUp, XCircle, Zap, Printer, List, Search, Waves, Bug, Wind, CloudFog, CloudSun, Bot, User, Hospital, MapPinned, Phone, Navigation, Droplets, ListChecks, RefreshCcw, ShieldX, Download, Camera, RotateCcw, Trash2, BarChart3, Calendar, Copy, Check, Clock, HelpCircle, BarChart2, ExternalLink, Glasses, PersonStanding, Umbrella, Dumbbell, Flame, FlaskConical, Brain, Heart, Leaf, Moon, Apple, Pill, Coffee, Sun } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, BarChart, Bar, Cell, ReferenceLine } from 'recharts';
import { WeatherData, LoadingState, GroundingChunk, RiskItem, SeverityLevel, ChatMessage, LifestyleData } from '../types';
import { generateHealthRiskAssessment, chatWithWeatherAssistant } from '../services/geminiService';
import { predictBioRisks, MLPrediction, formatExplanations, submitFeedback, quickHealthCheck } from '../services/mlService';
import { saveReport, getReports, deleteReport, clearAllReports, StoredReport, reconstructReportContent } from '../services/memoryService';
import { ReportRenderer } from './ReportRenderer';
import { stripHiddenModelReasoning } from '../utils/aiTextSanitizer';

interface AnalysisDashboardProps {
  weather: WeatherData | null;
  loadingState: LoadingState;
  setLoadingState: (state: LoadingState) => void;
  aiProvider?: string;
  aiModel?: string;
  aiKey?: string;
  onOpenAssistant?: () => void;
}

interface UserProfileProps {
  data: LifestyleData;
  onChange: (data: LifestyleData) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ data, onChange }) => {
  const options = {
    gender: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    lifestyle: ['Sedentary', 'Active', 'Athlete', 'Night Shift', 'Outdoor Worker', 'Remote Work', 'Frequent Traveler'],
    exercise: ['None', 'Minimal', 'Moderate', 'Intense', 'Professional', 'Rehabilitation'],
    smoking: ['Yes', 'No', 'Former Smoker', 'Vaping'],
    alcoholConsumption: ['None', 'Social', 'Moderate', 'Heavy', 'Occasional'],
    medication: ['None', 'Antihistamines', 'Blood Pressure', 'Inhalers', 'Insulin', 'Vitamins', 'Immunosuppressants', 'Painkillers'],
    foodHabits: ['Balanced', 'Vegan', 'Keto', 'High Protein', 'Fast Food', 'Gluten-Free', 'Vegetarian', 'Paleo', 'Low Sodium'],
    allergies: ['None', 'Pollen', 'Dust', 'Mold', 'Peanuts', 'Shellfish', 'Lactose', 'Pet Dander', 'Insect Stings', 'Latex'],
    medicalHistory: ['Asthma', 'Diabetes', 'Hypertension', 'Heart Disease', 'COPD', 'None', 'Migraine', 'Arthritis', 'Eczema', 'Anxiety']
  };

  const toggleOption = (field: keyof LifestyleData, val: string) => {
    if (field === 'smoking') {
      onChange({ ...data, smoking: val === 'Yes' });
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

  return (
    <div className="space-y-4 sm:space-y-6 bg-slate-50 dark:bg-slate-700/40 p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100 dark:border-slate-600">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="space-y-2">
          <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Age</label>
          <input 
            type="number" 
            value={data.age}
            onChange={(e) => onChange({...data, age: e.target.value})}
            placeholder="e.g. 32"
            className="w-full p-2.5 sm:p-3 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Height (cm)</label>
          <input 
            type="number" 
            value={data.height || ''}
            onChange={(e) => onChange({...data, height: e.target.value})}
            placeholder="e.g. 175"
            className="w-full p-2.5 sm:p-3 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Weight (kg)</label>
          <input 
            type="number" 
            value={data.weight || ''}
            onChange={(e) => onChange({...data, weight: e.target.value})}
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
          bmi < 16   ? { label: 'Severe Underweight', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', bar: 'bg-violet-500', advice: 'Critically low body mass. Medical evaluation recommended.' } :
          bmi < 18.5 ? { label: 'Underweight',        color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   bar: 'bg-blue-400',   advice: 'Below healthy range. Consider increasing caloric intake.' } :
          bmi < 25   ? { label: 'Normal Weight',      color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200',bar: 'bg-emerald-500',advice: 'Healthy BMI. Maintain current diet and activity level.' } :
          bmi < 30   ? { label: 'Overweight',         color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  bar: 'bg-amber-500',  advice: 'Slightly above healthy range. Light exercise recommended.' } :
          bmi < 35   ? { label: 'Obese Class I',      color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', advice: 'Increased cardiovascular and metabolic risk.' } :
          bmi < 40   ? { label: 'Obese Class II',     color: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-200',   bar: 'bg-rose-500',   advice: 'High risk. Consult a physician for a weight management plan.' } :
                       { label: 'Obese Class III',    color: 'text-red-900',    bg: 'bg-red-50',    border: 'border-red-200',    bar: 'bg-red-700',    advice: 'Severe obesity. Immediate medical guidance is strongly advised.' };
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
            <span className="text-[7px] sm:text-[8px] font-black text-teal-600 uppercase">Select Multiple</span>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {options[field].map((opt) => {
              const isActive = field === 'smoking' 
                ? (data.smoking ? opt === 'Yes' : opt === 'No')
                : (data[field] as string)?.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggleOption(field, opt)}
                  className={`px-3 sm:px-4 py-2 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all border ${
                    isActive 
                      ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-200' 
                      : 'bg-white dark:bg-slate-600 border-slate-200 dark:border-slate-500 text-slate-500 dark:text-slate-200 hover:border-teal-400'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {field !== 'smoking' && (
            <input 
              type="text" 
              value={data[field] as string}
              onChange={(e) => onChange({...data, [field]: e.target.value})}
              placeholder={`Custom ${field}...`}
              className="w-full p-2.5 sm:p-3 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
            />
          )}
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

  // Sort top factors by absolute impact
  const sortedFactors = (prediction.topFactors || [])
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .slice(0, 5);
  const maxImpact = Math.max(...sortedFactors.map(f => Math.abs(f.importance)), 0.1);

  return (
    <div className="space-y-6 sm:space-y-10 p-5 sm:p-10 bg-slate-900 rounded-[2rem] sm:rounded-[3rem] border border-slate-800 shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-teal-500/5 rounded-full -mr-24 sm:-mr-32 -mt-24 sm:-mt-32 blur-2xl sm:blur-3xl" />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-8 relative z-10">
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="p-2.5 sm:p-4 bg-teal-500 rounded-xl sm:rounded-2xl shadow-xl shadow-teal-500/20 shrink-0">
            <Cpu className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
          </div>
          <div>
            <h3 className="text-xl sm:text-3xl font-black text-teal-400 uppercase leading-none">Neural ML Inference</h3>
            <p className="text-[8px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1 sm:mt-2">Bio-Sentinel Custom Model Output</p>
          </div>
        </div>
        
        <div className={`self-start md:self-auto px-3 sm:px-6 py-1.5 sm:py-3 rounded-xl sm:rounded-2xl border-2 font-black uppercase tracking-widest text-[9px] sm:text-xs flex items-center gap-1.5 sm:gap-3 ${getRiskColor(dynamicRiskLevel)}`}>
          <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse ${dynamicRiskLevel === 'CRITICAL' ? 'bg-purple-500' : dynamicRiskLevel === 'HIGH' ? 'bg-rose-500' : dynamicRiskLevel === 'MODERATE' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {dynamicRiskLevel} RISK LEVEL
        </div>
      </div>

      <div className="flex flex-col gap-6 sm:gap-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
          <div className="p-5 sm:p-8 bg-slate-800/50 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-700/50 backdrop-blur-sm h-full flex flex-col justify-center">
            <h4 className="text-[9px] sm:text-xs font-black text-slate-300 uppercase tracking-widest mb-3 sm:mb-6">Primary Diagnosis</h4>
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
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={sortedFactors.map(f => ({
                      feature: f.feature,
                      value: f.value,
                      impact: f.impact,
                      importance: f.importance,
                      contribution: f.importance * (f.impact === 'increases' ? 1 : -1),
                      fill: f.impact === 'increases' ? '#f43f5e' : '#10b981'
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
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">Importance:</span>
                                <span>{data.importance?.toFixed(3) || 'N/A'}</span>
                              </div>
                              <p className="text-[9px] text-slate-500 mt-2 pt-2 border-t border-slate-700">
                                SHAP value indicates feature contribution to the model's prediction.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine x={0} stroke="#475569" />
                    <Bar dataKey="contribution" radius={[0, 4, 4, 0]} barSize={20}>
                      {sortedFactors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.impact === 'increases' ? '#f43f5e' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

      </div>

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
  weather, 
  loadingState, 
  setLoadingState,
  aiProvider,
  aiModel,
  aiKey,
  onOpenAssistant,
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
      if (saved) return JSON.parse(saved);
    } catch { /* fall through */ }
    return {
      age: "",
      height: "",
      weight: "",
      gender: "",
      lifestyle: "",
      medication: "",
      foodHabits: "",
      allergies: "",
      medicalHistory: "",
      exercise: "",
      smoking: false,
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
  
  const quickObservations = [
    { label: 'Heavy Fog', icon: CloudFog, value: 'Localized heavy fog reported.' },
    { label: 'Standing Water', icon: Waves, value: 'Noticed standing water nearby (mosquito breeding risk).' },
    { label: 'Pest Activity', icon: Bug, value: 'High pest/insect activity observed.' },
    { label: 'Strong Gusts', icon: Wind, value: 'Frequent strong wind gusts.' },
    { label: 'Sudden Chill', icon: Thermometer, value: 'Unexpected sharp drop in temperature.' },
    { label: 'Poor Visibility', icon: Search, value: 'Air feels thick or hazy with low visibility.' },
    { label: 'Pollen Surge', icon: CloudSun, value: 'Visible pollen dust in air.' },
    { label: 'Moldy Odor', icon: Droplets, value: 'Damp, moldy smell detected outdoors.' },
    { label: 'Smoke/Haze', icon: CloudFog, value: 'Smoke or haze from unknown source.' },
    { label: 'Heat Island', icon: ThermometerSun, value: 'Urban heat island effect felt strongly.' }
  ];

  const handleAddCustomObs = () => {
    if (!customObs.trim()) return;
    addObservation(customObs);
    setCustomObs("");
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
    
    try {
      const summary = "";

      // Quick warnings check (fast, no model call)
      const check = await quickHealthCheck(weather, [], lifestyleData).catch(e => {
        console.warn("Quick health check failed:", e);
        return { warnings: [], requiresFullAnalysis: true, immediateActionRequired: false };
      });
      setMlWarnings(check.warnings || []);
      
      // Trigger Custom ML Model Prediction alongside Gemini in parallel
      const [mlResult, geminiResult] = await Promise.allSettled([
        predictBioRisks(weather, [], lifestyleData),
        generateHealthRiskAssessment(
          weather, 
          summary, 
          userFeedback, 
          weatherFeedback,
          lifestyleData,
          undefined,
          aiProvider || 'gemini',
          aiModel || 'gemini-2.5-flash',
          aiKey
        )
      ]);

      let prediction: MLPrediction | null = null;
      let geminiMarkdown = "";
      let chunks: GroundingChunk[] = [];

      if (mlResult.status === 'fulfilled') {
        prediction = mlResult.value;
        setMlPrediction(prediction);
        setAnalysisCache({ mlPrediction: prediction, lastLocation: weather?.city ?? '', lastFetched: Date.now() });
        console.log("Neural ML Prediction:", prediction);
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
      if (prediction && !geminiMarkdown.includes("Neural ML Model Insights")) {
        augmentedAnalysis += `\n\n### 9. Neural ML Model Insights\n- **Risk Score:** ${(prediction.riskScore * 100).toFixed(0)}% probability of health impact under current conditions.\n- **Primary Trigger:** ${prediction.primaryTrigger} identified as the dominant environmental health stressor.\n- **ML Confidence:** ${(prediction.confidence * 100).toFixed(0)}% confidence based on current telemetry data.\n- **Recommendation:** ${prediction.recommendation}`;
      }
      
      const cleanAugmented = stripHiddenModelReasoning(augmentedAnalysis);
      setAnalysis(cleanAugmented);
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
      
      const userFriendlyError = err instanceof Error ? err.message : "Neural core computation error. Please check your data and configuration, then try again.";
      setError(`Bio-Sentinel Analysis Failed: ${userFriendlyError}`);
      setLoadingState(LoadingState.ERROR);
    }
  };

  const exportReport = () => {
    if (!analysis) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `BioSentinel_Report_${weather?.city || 'Global'}_${timestamp}.txt`;
    
    const element = document.createElement("a");
    const file = new Blob([analysis], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
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
    const outbreakPart    = extractSection(markdown, 'Disease Outbreak', 'Outbreak Early Warning', 'Outbreak Potential');
    const resourcePart    = extractSection(markdown, 'Verified Medical Resources', 'Medical Radar', 'Medical Resources');
    const biosafePart     = extractSection(markdown, 'Bio.Safety Action Plan', 'Bio.Safety Protocol', 'Bio.Safety');
    const disclaimerPart  = extractSection(markdown, 'Medical Disclaimer', 'Disclaimer');

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
            <h2 className="text-[10px] font-black text-teal-600 uppercase tracking-[0.4em]">Neural Engine v2.5 Online</h2>
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
            <h4 className="text-sm font-black text-rose-900 uppercase tracking-widest mb-1">Neural Core Error</h4>
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
                  { id: 'intel', label: 'Local Intel', icon: MessageSquarePlus },
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
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                      activeInputTab === tab.id 
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
              {activeInputTab === 'profile' && (
                <div className="space-y-6 animate-fade-in" id="panel-profile" role="tabpanel" aria-labelledby="tab-profile">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Health Profile & Lifestyle
                    </label>
                  </div>
                  <UserProfile data={lifestyleData} onChange={setLifestyleData} />
                </div>
              )}

              {activeInputTab === 'intel' && (
                <div className="space-y-6 animate-fade-in" id="panel-intel" role="tabpanel" aria-labelledby="tab-intel">
                  <label className="text-[11px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2"><MessageSquarePlus className="w-4 h-4" /> Local Intelligence</label>
                  <div className="flex flex-col h-full space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {quickObservations.map((obs) => (
                        <button 
                          key={obs.label} 
                          onClick={() => addObservation(obs.value)} 
                          className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl text-[9px] font-black text-slate-500 dark:text-slate-300 hover:bg-teal-500 hover:text-white transition-all flex items-center gap-1 shrink-0 whitespace-nowrap"
                        >
                          {addedObs === obs.value ? <Check className="w-3 h-3 text-emerald-500" /> : <obs.icon className="w-3 h-3" />}
                          {obs.label}
                        </button>
                      ))}
                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl px-2 shrink-0">
                        <input 
                          type="text" 
                          value={customObs} 
                          onChange={(e) => setCustomObs(e.target.value)} 
                          placeholder="Custom..." 
                          className="w-20 bg-transparent text-[9px] font-bold text-slate-700 dark:text-slate-200 outline-none"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomObs()}
                        />
                        <button onClick={handleAddCustomObs} className="p-1 hover:bg-teal-100 rounded-lg text-teal-600">
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <textarea value={userFeedback} onChange={(e) => setUserFeedback(e.target.value)} placeholder="Input observations or symptoms..." className="w-full min-h-[150px] sm:min-h-[250px] p-4 sm:p-6 bg-slate-50 dark:bg-slate-700/60 border border-slate-100 dark:border-slate-600 rounded-[1.5rem] sm:rounded-[2.5rem] text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-700 focus:border-teal-500 transition-all resize-none placeholder:text-slate-400" />
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Your observations are used to ground the neural analysis in local reality.</p>
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
                          <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-bold ${
                            msg.role === 'user' 
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
                            <span className={`px-2.5 py-1 rounded-lg border ${
                              viewingReport.riskScore >= 70 ? 'bg-red-50 text-red-700 border-red-200' :
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
                              el.download = `BioSentinel_${viewingReport!.city}_${new Date(viewingReport!.timestamp).toISOString().slice(0,10)}.txt`;
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
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                      report.riskScore >= 70 ? 'bg-red-100 text-red-600' :
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
                 onClick={exportReport}
                 className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-teal-900/20"
               >
                 <FileDown className="w-4 h-4" />
                 Export Report
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
                { href:'#section-warnings',       icon: AlertTriangle,  label:'Warnings',      always:true },
                { href:'#section-telemetry',       icon: Database,       label:'Weather Data',  always:true },
                { href:'#section-prevention',      icon: ShieldCheck,    label:'Prevention',    always:true },
                { href:'#section-correlation',     icon: Leaf,           label:'Env. Factors',  cond:!!correlationPart },
                { href:'#section-ml',              icon: BrainCircuit,   label:'ML Inference',  cond:!!mlPrediction },
                { href:'#section-ml-recommendations', icon: Sparkles,    label:'ML Report',     cond:!!mlPrediction },
                { href:'#section-risks',           icon: HeartPulse,     label:'Bio-Risks',     cond:showStructuredRisks },
                { href:'#section-mental-health',   icon: Brain,          label:'Mental Health', always:true },
                { href:'#section-cardiovascular',  icon: Heart,          label:'Cardio Risk',   always:true },
                { href:'#section-immune',          icon: ShieldAlert,    label:'Immune',        always:true },
                { href:'#section-nutrition',       icon: Apple,          label:'Nutrition',     always:true },
                { href:'#section-outbreak',        icon: Bug,            label:'Outbreak',      cond:!!outbreakPart },
                { href:'#section-resources',       icon: Hospital,       label:'Medical Radar', cond:!!resourcePart },
                { href:'#section-biosafe',         icon: ShieldX,        label:'Bio-Safety',    cond:!!biosafePart },
                { href:'#section-disclaimer',      icon: Info,           label:'Disclaimer',    cond:!!disclaimerPart },
              ] as Array<{ href:string; icon:React.ElementType; label:string; always?:boolean; cond?:boolean }>)
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
                        if (val >= 8) return { label: 'VERY HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val/11)*100), bg: 'bg-rose-500' };
                        if (val >= 6) return { label: 'HIGH', color: 'text-orange-500 bg-orange-50 border-orange-100', progress: Math.min(100, (val/11)*100), bg: 'bg-orange-500' };
                        if (val >= 3) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val/11)*100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val/11)*100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'pm25') {
                        if (val > 35) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val/50)*100), bg: 'bg-rose-500' };
                        if (val > 12) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val/50)*100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val/50)*100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'pm10') {
                        if (val > 150) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val/200)*100), bg: 'bg-rose-500' };
                        if (val > 54) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val/200)*100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val/200)*100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'o3') {
                        if (val > 100) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val/150)*100), bg: 'bg-rose-500' };
                        if (val > 60) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val/150)*100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val/150)*100), bg: 'bg-emerald-500' };
                      }
                      if (type === 'no2') {
                        if (val > 100) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-100', progress: Math.min(100, (val/150)*100), bg: 'bg-rose-500' };
                        if (val > 50) return { label: 'MODERATE', color: 'text-amber-500 bg-amber-50 border-amber-100', progress: Math.min(100, (val/150)*100), bg: 'bg-amber-500' };
                        return { label: 'LOW', color: 'text-emerald-500 bg-emerald-50 border-emerald-100', progress: Math.min(100, (val/150)*100), bg: 'bg-emerald-500' };
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
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorO3" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="hour" 
                          tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 700}} 
                          tickLine={false} 
                          axisLine={false}
                          interval={3}
                        />
                        <YAxis hide />
                        <Tooltip 
                          contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold'}}
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
                   { icon: Droplets,         label: 'Hydration Need',    value: `${hydrationLiters} L/day`,  status: hydrationLabel,   note: 'Daily water intake', color: hydrationColor, cardStyle: 'from-cyan-50 to-white border-cyan-100' },
                   { icon: Umbrella,         label: 'Sun Protection',    value: sunspf,                        status: sunLabel,          note: 'UV defence level',   color: sunColor,      cardStyle: 'from-sky-50 to-white border-sky-100' },
                   { icon: Wind,             label: 'Mask Guidance',     value: maskGrade,                     status: maskLabel,         note: 'Air quality shield',  color: maskColor,     cardStyle: 'from-violet-50 to-white border-violet-100' },
                   { icon: Dumbbell,         label: 'Outdoor Activity',  value: activityWindow,                status: activityLabel,     note: 'Safe exercise window', color: activityColor, cardStyle: 'from-emerald-50 to-white border-emerald-100' },
                   { icon: CloudFog,         label: 'Ventilation',       value: ventLabel,                     status: ventNote,          note: 'Window/AC guidance',  color: ventColor,     cardStyle: 'from-blue-50 to-white border-blue-100' },
                   { icon: Flame,            label: 'Heat Stress',       value: heatLabel,                     status: heatNote,          note: 'Apparent heat index', color: heatColor,     cardStyle: 'from-rose-50 to-white border-rose-100' },
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

            {/* Neural ML Inference Section */}
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
                      {tiles.map((t) => { const Icon = t.icon; return (
                        <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                            <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                          </div>
                          <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                          <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                        </div>
                      );})}
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
                      {tiles.map((t) => { const Icon = t.icon; return (
                        <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                            <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                          </div>
                          <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                          <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                        </div>
                      );})}
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
                      {tiles.map((t) => { const Icon = t.icon; return (
                        <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                            <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                          </div>
                          <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                          <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                        </div>
                      );})}
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
                      {tiles.map((t) => { const Icon = t.icon; return (
                        <div key={t.label} className={`p-4 rounded-2xl border bg-gradient-to-br ${t.cardStyle} dark:from-slate-700/80 dark:to-slate-800 dark:border-slate-600/50 flex flex-col gap-2 group hover:shadow-md transition-shadow`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</span>
                            <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                          </div>
                          <span className="text-base font-black text-slate-900 dark:text-white tracking-tighter leading-none">{t.value}</span>
                          <span className={`text-[9px] font-bold leading-tight ${t.color}`}>{t.status}</span>
                        </div>
                      );})}
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
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                    dashboardFeedback === 'helpful' 
                      ? 'bg-teal-600 text-white shadow-lg shadow-teal-200 scale-105' 
                      : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" /> Helpful
                </button>
                <button
                  onClick={() => handleDashboardFeedback(false)}
                  disabled={dashboardFeedbackSubmitted}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                    dashboardFeedback === 'not-helpful' 
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