import ReactMarkdown from 'react-markdown';
/**
 * Indian Syndromic Surveillance Dashboard
 * Unified UI for Bio-SentinelX's Indian healthcare surveillance features:
 *   - Field conversation intake (Hinglish/regional language processing)
 *   - Syndromic extraction with ICD-10 mapping
 *   - Outbreak prediction with 4-week temporal baseline
 *   - Environmental health knowledge graph explorer
 *   - Privacy-first architecture dashboard
 *   - Interconnected Regional Outbreak Monitor (Cloud + AI)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Activity, Shield, GitBranch, Globe2, AlertTriangle,
  CheckCircle2, XCircle, Info, Clock, Play, Trash2, ChevronDown,
  ChevronRight, FileText, Thermometer, Droplets, Wind, Eye,
  Lock, Upload, Search, BarChart3, TrendingUp, MapPin, Loader2,
  Crosshair, Target, Cloud, Share2, Network
} from 'lucide-react';

import {
  IDSP_SYNDROMES, INDIC_LANGUAGE_LABELS,
  extractSyndromes, processFieldConversation, getFieldConversations,
  clearIndicData,
  type IndicLanguage, type FieldConversation,
} from '../services/indicDataService';
import {
  hasHFToken, getHFToken, setHFToken, aiExtractSyndromes, analyzeClinicialImage,
  aiAnalyzeOutbreakRisk, hfInference, aiAnalyzeRegionalOutbreak,
  getAvailableModels, checkModelAvailability, getDefaultModel, MEDGEMMA_MODELS,
  type AISyndromeExtraction, type AIImageAnalysis, type AIOutbreakAnalysis,
} from '../services/huggingFaceService';
import {
  recordSyndromicSignal, analyzeDistrict, getOutbreakAlerts,
  getOutbreakPredictionStats, clearOutbreakAlerts, clearSyndromicSignals,
  assessClimateContribution,
  type OutbreakAlert, type DistrictSurveillance, type OutbreakPredictionStats,
} from '../services/outbreakPredictionService';
import {
  initializeKnowledgeGraph, queryKnowledgeGraph, analyzeEnvironmentalImpact,
  type KGQueryResult,
} from '../services/knowledgeGraphService';
import {
  getPrivacyDashboard, getAuditLog, getConsentSettings, updateConsentSettings,
  anonymizeText, clearPrivacyData, createAnonymizedSignal,
  type PrivacyDashboard, type PrivacyAuditEntry, type ConsentSettings,
} from '../services/privacyService';
import { reverseGeocode } from '../services/geoService';
import { syncSignalsToCloud, syncAlertsToCloud, fetchGlobalAlerts, fetchRegionalData } from '../services/supabaseService';
import { type WeatherData } from '../types';

// ─── Sub-tab type ───────────────────────────────────────────────────────────

type SurveillanceTab = 'intake' | 'outbreak' | 'knowledge' | 'privacy';

// ─── Status helpers ─────────────────────────────────────────────────────────

const outbreakStatusColor = (status: string) => {
  switch (status) {
    case 'outbreak': return 'bg-rose-500 text-white';
    case 'alert': return 'bg-amber-500 text-white';
    case 'watch': return 'bg-yellow-400 text-yellow-900';
    default: return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
  }
};

const severityBadge = (severity: string) => {
  switch (severity) {
    case 'critical': return 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700';
    case 'high': return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700';
    case 'moderate': return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700';
    default: return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';
  }
};

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  weather?: WeatherData | null;
}

export const IndianSurveillance: React.FC<Props> = ({ onBack, weather }) => {
  const [activeTab, setActiveTab] = useState<SurveillanceTab>('intake');

  // Initialize knowledge graph on mount
  useEffect(() => { initializeKnowledgeGraph(); }, []);

  const tabs: { key: SurveillanceTab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'intake', label: 'Field Intake', icon: <FileText className="w-3.5 h-3.5" />, color: 'teal' },
    { key: 'outbreak', label: 'Outbreak Watch', icon: <Activity className="w-3.5 h-3.5" />, color: 'rose' },
    { key: 'knowledge', label: 'Knowledge Graph', icon: <GitBranch className="w-3.5 h-3.5" />, color: 'violet' },
    { key: 'privacy', label: 'Privacy', icon: <Shield className="w-3.5 h-3.5" />, color: 'blue' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
          </button>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Indian Syndromic Surveillance</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bio-SentinelX — Outbreak Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-teal-500" />
          <span className="text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest">11 IDSP Syndromes</span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.key
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'intake' && <FieldIntakePanel weather={weather} />}
      {activeTab === 'outbreak' && <OutbreakWatchPanel weather={weather} />}
      {activeTab === 'knowledge' && <KnowledgeGraphPanel weather={weather} />}
      {activeTab === 'privacy' && <PrivacyPanel />}
    </div>
  );
};

// ─── Field Intake Panel ─────────────────────────────────────────────────────

const FieldIntakePanel: React.FC<{ weather?: WeatherData | null }> = ({ weather }) => {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<IndicLanguage>('hi');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [conversations, setConversations] = useState<FieldConversation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<FieldConversation | null>(null);
  const [aiExtraction, setAiExtraction] = useState<AISyndromeExtraction | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<AIImageAnalysis | null>(null);
  const [agenticSearchContext, setAgenticSearchContext] = useState<string | null>(null);
  const [searchingAgentic, setSearchingAgentic] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [hfToken, setHfToken] = useState(getHFToken());
  const [showHfSetup, setShowHfSetup] = useState(!hasHFToken());
  const [selectedModel, setSelectedModel] = useState<string>(getDefaultModel().id);
  const [modelStatus, setModelStatus] = useState<string>('');
  const [isLocating, setIsLocating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const models = getAvailableModels();
  const [kgContext, setKgContext] = useState<KGQueryResult | null>(null);

  const refreshData = useCallback(() => {
    setConversations(getFieldConversations());
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleAutoLocate = useCallback(async () => {
    setIsLocating(true);
    try {
      let lat = weather?.lat;
      let lon = weather?.lon;
      if (!lat || !lon) {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej)
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      }
      if (lat && lon) {
        const info = await reverseGeocode(lat, lon);
        if (info) {
          setDistrict(info.district);
          setState(info.state);
        }
      }
    } catch (err) {
      console.warn('[FieldIntake] Auto-location failed:', err);
    } finally {
      setIsLocating(false);
    }
  }, [weather]);

  useEffect(() => {
    if (weather?.lat && weather?.lon && !district) {
      handleAutoLocate();
    }
  }, [weather, handleAutoLocate, district]);

  const handleProcess = async () => {
    if (!text.trim() || !district.trim() || !state.trim()) return;
    setProcessing(true);
    setAiExtraction(null);
    setImageAnalysis(null);
    setKgContext(null);
    try {
      const result = processFieldConversation(text.trim(), language, district.trim(), state.trim());
      setLastResult(result);

      if (result.extractedSyndromes.length > 0) {
        const kgQuery = result.extractedSyndromes.join(' ');
        const kgResult = queryKnowledgeGraph(kgQuery);
        if (kgResult.chains.length > 0) setKgContext(kgResult);

        // Auto-sync anonymized signal to cloud
        const consent = getConsentSettings();
        if (consent.syndromeDataSync === 'granted') {
          setIsSyncing(true);
          try {
            const topSyndrome = result.extractedSyndromes[0];
            const syndrome = IDSP_SYNDROMES.find(s => s.name === topSyndrome);
            const anonymized = createAnonymizedSignal(
              syndrome?.id || 'unknown',
              result.icd10Codes,
              district,
              state,
              1, // Individual case
              'low' // Default severity
            );
            await syncSignalsToCloud([anonymized], weather?.city);
          } catch (err) {
            console.error('[FieldIntake] Cloud sync failed:', err);
          } finally {
            setIsSyncing(false);
          }
        }
      }

      if (hasHFToken()) {
        setAiProcessing(true);
        try {
          const aiResult = await aiExtractSyndromes(text.trim(), imageUrl.trim() || undefined);
          setAiExtraction(aiResult);
          // Agentic Enhancement: Execute regional search if query provided
          if ((aiResult as any).agentic_search_query) {
            setSearchingAgentic(true);
            try {
              // Using hfInference as a proxy for agentic search tool
              const searchPrompt = `Perform a regional search and provide a summary of current health reports for: ${(aiResult as any).agentic_search_query}. Focus on district-level news from regional sources in India.`;
              const searchResult = await hfInference(searchPrompt, 'google/medgemma-27b-text-it', {
                systemPrompt: 'You are an agentic search tool for regional epidemiological intelligence. Search and synthesize current localized reports.',
                maxTokens: 512
              });
              setAgenticSearchContext(searchResult);
            } catch (searchErr) {
              console.warn('Agentic regional search failed:', searchErr);
            } finally {
              setSearchingAgentic(false);
            }
          }

          if (aiResult.syndromes.length > 0 && !kgContext) {
            const aiKgQuery = aiResult.syndromes.map(s => s.name).join(' ');
            const kgResult = queryKnowledgeGraph(aiKgQuery);
            if (kgResult.chains.length > 0) setKgContext(kgResult);
          }
          if (imageUrl.trim()) {
            try {
              const imgResult = await analyzeClinicialImage(imageUrl.trim(), text.trim());
              setImageAnalysis(imgResult);
            } catch {}
          }
        } catch {} finally {
          setAiProcessing(false);
        }
      }

      setText('');
      setImageUrl('');
      refreshData();
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveHfToken = () => {
    if (hfToken.trim()) {
      setHFToken(hfToken.trim());
      setShowHfSetup(false);
    }
  };

  const handleCheckModel = async () => {
    setModelStatus('Checking...');
    const status = await checkModelAvailability(selectedModel);
    if (status.available) setModelStatus('Model available and ready');
    else if (status.loading) setModelStatus('Model is loading — retry in a few minutes');
    else setModelStatus(`Unavailable: ${status.error || 'Unknown error'}`);
  };

  const preview = text.trim() ? extractSyndromes(text.trim()) : null;

  return (
    <div className="space-y-6">
      {showHfSetup && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <h3 className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> MedGemma AI — Hugging Face Setup
          </h3>
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mb-3">
            Connect to MedGemma for AI-powered syndromic extraction. Get your token from{' '}
            <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline font-black">huggingface.co/settings/tokens</a>
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="password"
              value={hfToken}
              onChange={e => setHfToken(e.target.value)}
              placeholder="hf_xxxxxxxxxxxxxxxxxxxxx"
              className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-100 placeholder-amber-300 dark:placeholder-amber-600 outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSaveHfToken}
              disabled={!hfToken.trim()}
              className="px-4 py-2 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-500 disabled:opacity-40 transition-all"
            >
              Save Token
            </button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-200 outline-none"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.isDefault ? ' (default)' : ''}</option>
              ))}
            </select>
            <button
              onClick={handleCheckModel}
              disabled={!hfToken.trim()}
              className="px-3 py-2 bg-white dark:bg-slate-700 border border-amber-200 dark:border-amber-700 rounded-xl text-[10px] font-black text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-40 transition-all"
            >
              Check
            </button>
          </div>
          {modelStatus && (
            <p className={`text-[9px] font-bold ${modelStatus.includes('available') ? 'text-emerald-600' : modelStatus.includes('Checking') ? 'text-amber-600' : 'text-rose-600'}`}>
              {modelStatus}
            </p>
          )}
        </div>
      )}

      {!showHfSetup && hasHFToken() && (
        <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">MedGemma AI Connected</span>
            <span className="text-[9px] font-bold text-emerald-500">{getDefaultModel().name}</span>
          </div>
          <button onClick={() => setShowHfSetup(true)} className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hover:text-emerald-800 transition-colors">
            Configure
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-teal-500" />
            Clinical Intake — Process Field Conversation
          </h3>
          <div className="flex items-center gap-2">
            {isSyncing && <Cloud className="w-3 h-3 text-blue-500 animate-pulse" />}
            <button
              onClick={handleAutoLocate}
              disabled={isLocating}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 text-slate-600 dark:text-slate-400 hover:text-teal-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
            >
              {isLocating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
              Auto-Detect Location
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as IndicLanguage)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
            >
              {(Object.entries(INDIC_LANGUAGE_LABELS) as [IndicLanguage, string][]).map(([code, name]) => (
                <option key={code} value={code}>{name} ({code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">District</label>
            <input
              type="text" value={district} onChange={e => setDistrict(e.target.value)}
              placeholder="e.g., Varanasi"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">State</label>
            <input
              type="text" value={state} onChange={e => setState(e.target.value)}
              placeholder="e.g., Uttar Pradesh"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Patient Description (Informal / Hinglish OK)</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="e.g., बहुत तेज़ बुखार और ठंड लग रही है, 3 दिन से diarrhea..."
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 resize-none"
          />
        </div>

        <div className="mb-3">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block flex items-center gap-1.5">
            <Upload className="w-3 h-3" /> Clinical Image URL (Optional — MedGemma 4B Vision)
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://... (rash photo, water sample, clinical image)"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-violet-500"
          />
          {imageUrl.trim() && (
            <div className="mt-2 flex items-center gap-2">
              <img src={imageUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-600" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="text-[9px] font-bold text-violet-500">Image will be analyzed by MedGemma 4B multimodal model</span>
            </div>
          )}
        </div>

        {preview && preview.syndromes.length > 0 && (
          <div className="mb-4 p-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-800 rounded-xl">
            <p className="text-[9px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-2">Live Extraction Preview</p>
            <div className="flex flex-wrap gap-1.5">
              {preview.syndromes.map(s => (
                <span key={s.id} className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${severityBadge(s.severity)}`}>
                  {s.name}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {preview.icd10Codes.map(code => (
                <span key={code} className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                  {code}
                </span>
              ))}
            </div>
            <p className="text-[9px] font-bold text-teal-500 mt-1">Confidence: {(preview.confidence * 100).toFixed(0)}%</p>
          </div>
        )}

        <button
          onClick={handleProcess}
          disabled={!text.trim() || !district.trim() || !state.trim() || processing}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Process & Extract
        </button>
      </div>

      {lastResult && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5">
          <h4 className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> Extraction Complete
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="font-bold text-slate-500 dark:text-slate-400">District:</span> <span className="font-black text-slate-800 dark:text-white">{lastResult.district}, {lastResult.state}</span></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Language:</span> <span className="font-black text-slate-800 dark:text-white">{INDIC_LANGUAGE_LABELS[lastResult.language]}</span></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Syndromes:</span> <span className="font-black text-slate-800 dark:text-white">{lastResult.extractedSyndromes.join(', ') || 'None detected'}</span></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">ICD-10:</span> <span className="font-mono font-bold text-slate-800 dark:text-white">{lastResult.icd10Codes.join(', ') || 'N/A'}</span></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Confidence:</span> <span className="font-black text-slate-800 dark:text-white">{(lastResult.confidence * 100).toFixed(0)}%</span></div>
          </div>
        </div>
      )}

      {aiProcessing && (
        <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-2xl">
          <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
          <div>
            <p className="text-[10px] font-black text-violet-700 dark:text-violet-300 uppercase tracking-widest">MedGemma AI Processing</p>
            <p className="text-[9px] font-semibold text-violet-500">Running deep clinical analysis via Hugging Face Inference API...</p>
          </div>
        </div>
      )}
      {aiExtraction && aiExtraction.syndromes.length > 0 && (
        <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-2xl p-5">
          <h4 className="text-[10px] font-black text-violet-700 dark:text-violet-300 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> MedGemma AI Extraction
            <span className="text-[8px] font-bold text-violet-400 normal-case tracking-normal ml-auto">{aiExtraction.processing_time_ms}ms</span>
          </h4>
          {aiExtraction.summary && (
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-300 mb-3">{aiExtraction.summary}</p>
          )}
          <div className="space-y-2">
            {aiExtraction.syndromes.map((s, i) => (
              <div key={i} className="p-3 bg-white/60 dark:bg-slate-800/60 rounded-xl border border-violet-100 dark:border-violet-800">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${severityBadge(s.severity)}`}>{s.severity}</span>
                  <span className="text-xs font-black text-slate-800 dark:text-white">{s.name}</span>
                  <span className="ml-auto text-[9px] font-bold text-violet-500">{(s.confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {s.icd10Codes.map(code => (
                    <span key={code} className="px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded text-[9px] font-mono font-bold">{code}</span>
                  ))}
                </div>
                {s.reasoning && <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">{s.reasoning}</p>}
              </div>
            ))}
          </div>
          {aiExtraction.language_detected && (
            <p className="text-[9px] font-bold text-violet-400 mt-2">Language detected: {aiExtraction.language_detected}</p>
          )}
        </div>
      )}

      {imageAnalysis && (
        <div className="bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800 rounded-2xl p-5">
          <h4 className="text-[10px] font-black text-pink-700 dark:text-pink-300 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> MedGemma 4B Vision — Image Analysis
            <span className="text-[8px] font-bold text-pink-400 normal-case tracking-normal ml-auto">{imageAnalysis.processing_time_ms}ms · {imageAnalysis.model_used}</span>
          </h4>
          <p className="text-xs font-semibold text-pink-600 dark:text-pink-300 mb-3">{imageAnalysis.findings}</p>
          {imageAnalysis.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {imageAnalysis.conditions.map((c, i) => (
                <span key={i} className="px-2 py-1 bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 rounded-lg text-[10px] font-bold">{c}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${severityBadge(imageAnalysis.severity)}`}>{imageAnalysis.severity}</span>
          </div>
          {imageAnalysis.recommendations.length > 0 && (
            <div className="space-y-1">
              {imageAnalysis.recommendations.map((r, i) => (
                <p key={i} className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                  <span className="text-pink-500 mt-0.5">•</span> {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

            {agenticSearchContext && (
        <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-2xl p-5 animate-fade-in mb-6">
          <h4 className="text-[10px] font-black text-sky-700 dark:text-sky-300 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Search className="w-3.5 h-3.5" /> Regional Agentic Search — Regional Outbreak Context
          </h4>
          <div className="prose prose-xs dark:prose-invert max-w-none text-xs font-semibold text-sky-600 dark:text-sky-300 leading-relaxed">
            <ReactMarkdown>{agenticSearchContext}</ReactMarkdown>
          </div>
        </div>
      )}

      {kgContext && kgContext.chains.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5">
          <h4 className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-3 flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5" /> Knowledge Graph — Causal Pathways
            <span className="text-[8px] font-bold text-indigo-400 normal-case tracking-normal ml-auto">{kgContext.chains.length} pathway(s) found</span>
          </h4>
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 mb-3">{kgContext.summary}</p>
          <div className="space-y-2">
            {kgContext.chains.slice(0, 5).map((chain, i) => (
              <div key={i} className="p-3 bg-white/60 dark:bg-slate-800/60 rounded-xl border border-indigo-100 dark:border-indigo-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{chain.explanation}</span>
                  <span className="text-[9px] font-black text-indigo-500 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-full">
                    {(chain.totalStrength * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chain.nodes.map((node, j) => (
                    <React.Fragment key={node.id}>
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-bold ${
                        node.type === 'health_condition' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300' :
                        node.type === 'environmental_factor' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' :
                        node.type === 'vector' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300' :
                        node.type === 'pathogen' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300' :
                        node.type === 'intervention' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300' :
                        'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                      }`}>{node.label}</span>
                      {j < chain.nodes.length - 1 && <span className="text-indigo-300 dark:text-indigo-600 self-center text-xs">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {conversations.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">Recent Extractions</h3>
            <button onClick={() => { clearIndicData(); refreshData(); setLastResult(null); }}
              className="flex items-center gap-1 text-[9px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600 transition-colors">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {conversations.slice(0, 20).map(c => (
              <div key={c.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{c.district}, {c.state} — {INDIC_LANGUAGE_LABELS[c.language]}</span>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{new Date(c.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1 mb-1">{c.text}</p>
                <div className="flex flex-wrap gap-1">
                  {c.extractedSyndromes.map(s => (
                    <span key={s} className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 rounded text-[9px] font-bold">{s}</span>
                  ))}
                  {c.icd10Codes.map(code => (
                    <span key={code} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-[9px] font-mono font-bold">{code}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Outbreak Watch Panel ───────────────────────────────────────────────────

const OutbreakWatchPanel: React.FC<{ weather?: WeatherData | null }> = ({ weather }) => {
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [surveillance, setSurveillance] = useState<DistrictSurveillance | null>(null);
  const [alerts, setAlerts] = useState<OutbreakAlert[]>([]);
  const [predStats, setPredStats] = useState<OutbreakPredictionStats | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiOutbreak, setAiOutbreak] = useState<AIOutbreakAnalysis | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [sitRep, setSitRep] = useState<string | null>(null);
  const [generatingSitRep, setGeneratingSitRep] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Regional/Interconnected State
  const [regionalTotals, setRegionalTotals] = useState<Record<string, number>>({});
  const [regionalAnalysis, setRegionalAnalysis] = useState<string | null>(null);
  const [analyzingRegional, setAnalyzingRegional] = useState(false);
  const [globalAlerts, setGlobalAlerts] = useState<OutbreakAlert[]>([]);

  const [signalSyndrome, setSignalSyndrome] = useState('afi');
  const [signalCases, setSignalCases] = useState('');
  const [signalDistrict, setSignalDistrict] = useState('');
  const [signalState, setSignalState] = useState('');

  const refreshData = useCallback(async () => {
    setAlerts(getOutbreakAlerts());
    setPredStats(getOutbreakPredictionStats());

    // Fetch global signals from cloud for interconnected view
    const cloudAlerts = await fetchGlobalAlerts();
    setGlobalAlerts(cloudAlerts);
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleAutoLocate = useCallback(async () => {
    setIsLocating(true);
    try {
      let lat = weather?.lat;
      let lon = weather?.lon;
      if (!lat || !lon) {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej)
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      }
      if (lat && lon) {
        const info = await reverseGeocode(lat, lon);
        if (info) {
          setDistrict(info.district);
          setState(info.state);
          setSignalDistrict(info.district);
          setSignalState(info.state);
        }
      }
    } catch (err) {
      console.warn('[OutbreakWatch] Auto-location failed:', err);
    } finally {
      setIsLocating(false);
    }
  }, [weather]);

  useEffect(() => {
    if (weather?.lat && weather?.lon && !district) {
      handleAutoLocate();
    }
  }, [weather, handleAutoLocate, district]);

  const handleAnalyze = async () => {
    if (!district.trim() || !state.trim()) return;
    setAnalyzing(true);
    setAiOutbreak(null);
    setSitRep(null);
    try {
      const climate = {
        temperature: weather?.temp ?? 30,
        humidity: weather?.humidity ?? 70,
        precipitation: weather?.precipitationSum ?? 0,
        lai: 0.4,
        uvIndex: weather?.uvIndex ?? undefined,
        aqi: weather?.rawAqi ?? weather?.aqi,
        pressure: weather?.pressure,
        soilMoisture: weather?.advancedData?.soilMoisture,
      };

      const result = analyzeDistrict(district.trim(), state.trim(), climate);
      setSurveillance(result);
      refreshData();

      const consent = getConsentSettings();
      if (consent.anonymizedAlerts === 'granted') {
        const active = getOutbreakAlerts(district).filter(a => a.status === 'alert' || a.status === 'outbreak');
        if (active.length > 0) {
          setIsSyncing(true);
          try { await syncAlertsToCloud(active, weather?.city); }
          catch {} finally { setIsSyncing(false); }
        }
      }

      if (hasHFToken() && result.syndromes.length > 0) {
        setAiAnalyzing(true);
        try {
          const topSyndrome = result.syndromes.reduce((prev, curr) =>
            curr.currentWeekCases > prev.currentWeekCases ? curr : prev, result.syndromes[0]);
          const aiResult = await aiAnalyzeOutbreakRisk({
            district: district.trim(),
            state: state.trim(),
            syndrome: topSyndrome.syndromeName,
            currentCases: topSyndrome.currentWeekCases,
            weeklyHistory: topSyndrome.weeklyHistory,
            climate,
          });
          setAiOutbreak(aiResult);
        } catch (err) {
          console.error("AI Outbreak Analysis failed:", err);
        } finally {
          setAiAnalyzing(false);
        }
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRegionalAnalysis = async () => {
    if (!state.trim() || !hasHFToken()) return;
    setAnalyzingRegional(true);
    try {
      const totals = await fetchRegionalData(state.trim());
      setRegionalTotals(totals);

      const analysis = await aiAnalyzeRegionalOutbreak({
        state: state.trim(),
        regionalTotals: totals,
        activeAlerts: globalAlerts.filter(a => a.state.toLowerCase() === state.toLowerCase()),
      });
      setRegionalAnalysis(analysis);
    } catch (err) {
      console.error('[Regional] Analysis failed:', err);
    } finally {
      setAnalyzingRegional(false);
    }
  };

  const handleGenerateSitRep = async () => {
    if (!surveillance || !hasHFToken()) return;
    setGeneratingSitRep(true);
    try {
      const model27b = MEDGEMMA_MODELS.find(m => m.id.includes('27b'));
      const syndromesSummary = surveillance.syndromes
        .map(s => `${s.syndromeName}: ${s.currentWeekCases} cases (baseline: ${s.baselineMean.toFixed(1)}, trend: ${s.trend}, status: ${s.status})`)
        .join('\n');

      const prompt = `Generate a professional Situation Report (SitRep) for disease surveillance:

District: ${surveillance.district}, ${surveillance.state}
Overall Status: ${surveillance.overallStatus}
Active Alerts: ${surveillance.activeAlerts}
Report Period: Current week

Syndrome Data:
${syndromesSummary}

${aiOutbreak ? `AI Risk Assessment: ${aiOutbreak.risk_level} (score: ${aiOutbreak.risk_score})\nFactors: ${aiOutbreak.contributing_factors.join(', ')}\n` : ''}

Write a concise, professional SitRep covering:
1. Executive Summary
2. Current Situation (case counts, trends)
3. Risk Assessment
4. Recommended Actions
5. Resource Requirements`;

      const result = await hfInference(prompt, model27b?.id, {
        systemPrompt: 'You are an epidemiological report writer for the Indian Integrated Disease Surveillance Programme (IDSP). Generate clear, actionable situation reports for district health officers.',
        maxTokens: 2048,
        temperature: 0.3,
      });
      setSitRep(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SitRep generation failed';
      setSitRep(`Error generating SitRep: ${msg}`);
    } finally {
      setGeneratingSitRep(false);
    }
  };

  const handleRecordSignal = () => {
    if (!signalDistrict.trim() || !signalState.trim() || !signalCases) return;
    recordSyndromicSignal(signalSyndrome, signalDistrict.trim(), signalState.trim(), parseInt(signalCases));
    setSignalCases('');
    refreshData();
  };

  return (
    <div className="space-y-6">
      {predStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Signals', value: predStats.totalSignals, icon: <BarChart3 className="w-4 h-4" /> },
            { label: 'Active Alerts', value: predStats.activeAlerts, icon: <AlertTriangle className="w-4 h-4" />, danger: predStats.activeAlerts > 0 },
            { label: 'Districts', value: predStats.districtsCovered, icon: <MapPin className="w-4 h-4" /> },
            { label: 'Syndromes', value: predStats.syndromesMonitored, icon: <Activity className="w-4 h-4" /> },
          ].map(s => (
            <div key={s.label} className={`border rounded-xl p-4 text-center ${
              s.danger ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'
            }`}>
              <div className={`flex justify-center mb-2 ${s.danger ? 'text-rose-500' : 'text-teal-500'}`}>{s.icon}</div>
              <div className={`text-lg font-black ${s.danger ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>{s.value}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Record Signal */}
      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Upload className="w-3.5 h-3.5 text-teal-500" />
            Record Weekly Syndromic Signal
          </h3>
          <button
            onClick={handleAutoLocate}
            disabled={isLocating}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-600 dark:text-slate-400 hover:text-teal-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
          >
            {isLocating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
            Auto-Detect
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Syndrome</label>
            <select value={signalSyndrome} onChange={e => setSignalSyndrome(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500">
              {IDSP_SYNDROMES.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Cases</label>
            <input type="number" value={signalCases} onChange={e => setSignalCases(e.target.value)}
              placeholder="e.g., 15"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">District</label>
            <input type="text" value={signalDistrict} onChange={e => setSignalDistrict(e.target.value)}
              placeholder="e.g., Patna"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">State</label>
            <input type="text" value={signalState} onChange={e => setSignalState(e.target.value)}
              placeholder="e.g., Bihar"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500" />
          </div>
        </div>
        <button onClick={handleRecordSignal}
          disabled={!signalDistrict.trim() || !signalState.trim() || !signalCases}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Upload className="w-3 h-3" /> Record Signal
        </button>
      </div>

      {/* Analyze District */}
      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-rose-500" />
            Analyze District — Outbreak Detection (N &gt; μ + 2σ)
          </h3>
          {isSyncing && <Cloud className="w-3 h-3 text-blue-500 animate-pulse" />}
        </div>
        <div className="flex gap-3 mb-4">
          <input type="text" value={district} onChange={e => setDistrict(e.target.value)}
            placeholder="District name"
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500" />
          <input type="text" value={state} onChange={e => setState(e.target.value)}
            placeholder="State"
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500" />
          <button onClick={handleAnalyze}
            disabled={!district.trim() || !state.trim() || analyzing}
            className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            Analyze
          </button>
        </div>

        {surveillance && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${outbreakStatusColor(surveillance.overallStatus)}`}>
                {surveillance.overallStatus}
              </span>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {surveillance.district}, {surveillance.state} — {surveillance.activeAlerts} active alert(s)
              </span>
            </div>

            <div className="space-y-2">
              {surveillance.syndromes.map(s => (
                <div key={s.syndromeId} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${outbreakStatusColor(s.status)}`}>
                    {s.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-white">{s.syndromeName}</p>
                    <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">
                      Current: {s.currentWeekCases} | Baseline: {s.baselineMean.toFixed(1)} | Threshold: {s.baselineThreshold.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className={`w-3 h-3 ${
                      s.trend === 'rising' ? 'text-rose-500' : s.trend === 'declining' ? 'text-emerald-500 rotate-180' : 'text-slate-400'
                    }`} />
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{s.trend}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Regional Interconnected Dashboard */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest flex items-center gap-2">
            <Network className="w-3.5 h-3.5" />
            Interconnected Regional Outbreak Monitor (Cloud + AI)
          </h3>
          <button
            onClick={handleRegionalAnalysis}
            disabled={!state.trim() || analyzingRegional}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 disabled:opacity-40 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
          >
            {analyzingRegional ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe2 className="w-3 h-3" />}
            Regional Scan ({state || 'All'})
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Global Alert Stream */}
          <div className="space-y-2">
            <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Share2 className="w-3 h-3" /> Live Interconnected Alerts
            </h4>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {globalAlerts.length > 0 ? globalAlerts.map(a => (
                <div key={a.id} className="p-2.5 bg-white/60 dark:bg-slate-800/60 border border-indigo-50 dark:border-indigo-900 rounded-xl">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[10px] font-black text-slate-800 dark:text-white truncate">{a.syndromeName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${outbreakStatusColor(a.status)}`}>{a.status}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                    <MapPin className="w-2.5 h-2.5" /> {a.district}, {a.state}
                    <span className="ml-auto opacity-60">{new Date(a.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-slate-400 italic text-xs">No interconnected alerts found in cloud.</div>
              )}
            </div>
          </div>

          {/* Regional AI Analysis */}
          <div className="space-y-2">
            <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Regional Outbreak Prediction (MedGemma 27B)
            </h4>
            {regionalAnalysis ? (
              <div className="p-4 bg-white/80 dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-800 rounded-xl min-h-[10rem]">
                <pre className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed animate-fade-in">{regionalAnalysis}</pre>
                {Object.keys(regionalTotals).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-indigo-50 dark:border-indigo-900 flex flex-wrap gap-2">
                    {Object.entries(regionalTotals).map(([code, count]) => (
                      <span key={code} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 rounded text-[9px] font-black border border-indigo-100 dark:border-indigo-800">
                        {code}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[10rem] bg-indigo-50/30 dark:bg-indigo-900/10 border-2 border-dashed border-indigo-100 dark:border-indigo-900/30 rounded-xl text-center p-6">
                <Loader2 className={`w-8 h-8 text-indigo-300 mb-2 ${analyzingRegional ? 'animate-spin' : ''}`} />
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                  {analyzingRegional ? 'Synthesizing Regional Intelligence...' : 'Run Regional Scan to Analyze Trends'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {aiAnalyzing && (
        <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-2xl">
          <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
          <div>
            <p className="text-[10px] font-black text-violet-700 dark:text-violet-300 uppercase tracking-widest">MedGemma AI Outbreak Analysis</p>
            <p className="text-[9px] font-semibold text-violet-500">Analyzing risk factors, climate correlations, and temporal patterns...</p>
          </div>
        </div>
      )}
      {aiOutbreak && (
        <div className={`border rounded-2xl p-5 ${
          aiOutbreak.risk_level === 'outbreak' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' :
          aiOutbreak.risk_level === 'alert' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' :
          aiOutbreak.risk_level === 'watch' ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' :
          'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
        }`}>
          <h4 className="text-[10px] font-black text-violet-700 dark:text-violet-300 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> MedGemma AI Risk Assessment
            <span className={`ml-auto px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${outbreakStatusColor(aiOutbreak.risk_level)}`}>
              {aiOutbreak.risk_level} — {(aiOutbreak.risk_score * 100).toFixed(0)}% risk
            </span>
          </h4>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-3">{aiOutbreak.reasoning}</p>
          {aiOutbreak.contributing_factors.length > 0 && (
            <div className="mb-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Contributing Factors</p>
              <div className="flex flex-wrap gap-1.5">
                {aiOutbreak.contributing_factors.map((f, i) => (
                  <span key={i} className="px-2 py-1 bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-600">{f}</span>
                ))}
              </div>
            </div>
          )}
          {aiOutbreak.recommended_actions.length > 0 && (
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Recommended Actions</p>
              <div className="space-y-1">
                {aiOutbreak.recommended_actions.map((a, i) => (
                  <p key={i} className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                    <span className="text-violet-500 mt-0.5">•</span> {a}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {surveillance && hasHFToken() && (
        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> AI Situation Report (MedGemma 27B)
            </h3>
            <button onClick={handleGenerateSitRep} disabled={generatingSitRep}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              {generatingSitRep ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Generate SitRep
            </button>
          </div>
          {generatingSitRep && (
            <p className="text-[9px] font-semibold text-blue-500">Generating situation report via MedGemma 27B...</p>
          )}
          {sitRep && (
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 max-h-96 overflow-y-auto">
              <pre className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{sitRep}</pre>
            </div>
          )}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Local Alerts
            </h3>
            <button onClick={() => { clearOutbreakAlerts(); clearSyndromicSignals(); refreshData(); setSurveillance(null); }}
              className="flex items-center gap-1 text-[9px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600 transition-colors">
              <Trash2 className="w-3 h-3" /> Clear All
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts.slice(0, 20).map(a => (
              <div key={a.id} className={`p-3 rounded-xl border ${
                a.status === 'outbreak' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
              }`}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${outbreakStatusColor(a.status)}`}>{a.status}</span>
                    <span className="text-xs font-black text-slate-800 dark:text-white">{a.syndromeName}</span>
                  </div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{a.district}, {a.state}</span>
                </div>
                <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{a.message}</p>
                {a.climateFactors && (
                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-1">
                    Climate: {a.climateFactors.seasonalContext} (risk ×{a.climateFactors.riskMultiplier})
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Knowledge Graph Panel ──────────────────────────────────────────────────

const KnowledgeGraphPanel: React.FC<{ weather?: WeatherData | null }> = ({ weather }) => {
  useEffect(() => {
    if (weather) {
      const envResult = analyzeEnvironmentalImpact({
        temperature: weather.temp,
        humidity: weather.humidity,
        aqi: weather.rawAqi || weather.aqi,
        pm25: weather.advancedData?.pm2_5,
        uvIndex: weather.uvIndex || undefined,
        soilMoisture: weather.advancedData?.soilMoisture || undefined,
        pressure: weather.pressure,
        evapotranspiration: weather.advancedData?.evapotranspiration || undefined
      });
      setEnvResult(envResult.chains.length > 0 ? envResult : null);
    }
  }, [weather]);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KGQueryResult | null>(null);
  const [envResult, setEnvResult] = useState<KGQueryResult | null>(null);
  const [expandedChain, setExpandedChain] = useState<number | null>(null);

  const handleQuery = () => {
    if (!query.trim()) return;
    setResult(queryKnowledgeGraph(query.trim()));
    setEnvResult(null);
  };

  const handleEnvAnalysis = () => {
    if (!weather) return;
    const conditions = {
      temperature: weather.temp,
      humidity: weather.humidity,
      aqi: weather.rawAqi ?? weather.aqi,
      uvIndex: weather.uvIndex ?? undefined,
      precipitation: weather.precipitationSum,
      soilMoisture: weather.advancedData?.soilMoisture,
    };
    setEnvResult(analyzeEnvironmentalImpact(conditions));
    setResult(null);
  };

  const activeResult = result || envResult;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
        <h3 className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5" />
          Query Environmental Health Relationships
        </h3>
        <div className="flex gap-3 mb-3">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuery()}
            placeholder="e.g., humidity, pollution, rainfall, mosquito..."
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-violet-500" />
          <button onClick={handleQuery} disabled={!query.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <Search className="w-3 h-3" /> Query
          </button>
        </div>
        {weather && (
          <button onClick={handleEnvAnalysis}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-500 transition-all">
            <Eye className="w-3 h-3" /> Analyze Current Weather Conditions
          </button>
        )}
      </div>

      {activeResult && (
        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-3">Analysis Result</h3>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed mb-4">{activeResult.summary}</p>

          {activeResult.chains.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Causal Pathways ({activeResult.chains.length})</h4>
              {activeResult.chains.slice(0, 10).map((chain, i) => (
                <div key={i} className="border border-slate-100 dark:border-slate-600 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedChain(expandedChain === i ? null : i)}
                    className="w-full flex items-center gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    {expandedChain === i ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1">{chain.explanation}</span>
                    <span className="text-[9px] font-black text-violet-500 px-2 py-0.5 bg-violet-50 dark:bg-violet-900/30 rounded-full">
                      strength: {(chain.totalStrength * 100).toFixed(0)}%
                    </span>
                  </button>
                  {expandedChain === i && (
                    <div className="px-3 pb-3">
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {chain.nodes.map((node, j) => (
                          <React.Fragment key={node.id}>
                            <span className={`px-2 py-1 rounded-lg text-[9px] font-bold ${
                              node.type === 'health_condition' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300' :
                              node.type === 'environmental_factor' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' :
                              node.type === 'intervention' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300' :
                              node.type === 'symptom' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300' :
                              'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                            }`}>{node.label}</span>
                            {j < chain.nodes.length - 1 && <span className="text-slate-300 dark:text-slate-600 self-center">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                      {chain.edges.map(edge => (
                        <p key={edge.id} className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-1 pl-2 border-l-2 border-slate-200 dark:border-slate-600">
                          {edge.evidence}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <p className="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Quick Queries</p>
            {['humidity', 'pollution', 'rainfall', 'temperature', 'monsoon', 'mosquito'].map(q => (
              <button key={q} onClick={() => { setQuery(q); setResult(queryKnowledgeGraph(q)); setEnvResult(null); }}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[9px] font-bold hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-600 dark:hover:text-violet-300 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Privacy Panel ──────────────────────────────────────────────────────────

const PrivacyPanel: React.FC = () => {
  const [dashboard, setDashboard] = useState<PrivacyDashboard | null>(null);
  const [auditLog, setAuditLog] = useState<PrivacyAuditEntry[]>([]);
  const [testText, setTestText] = useState('');
  const [anonymizedResult, setAnonymizedResult] = useState<{ anonymized: string; redactedFields: string[] } | null>(null);

  const refreshData = useCallback(() => {
    setDashboard(getPrivacyDashboard());
    setAuditLog(getAuditLog(30));
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleTestAnonymize = () => {
    if (!testText.trim()) return;
    setAnonymizedResult(anonymizeText(testText.trim()));
  };

  const handleConsentUpdate = (key: keyof ConsentSettings, value: 'granted' | 'denied') => {
    updateConsentSettings({ [key]: value });
    refreshData();
  };

  return (
    <div className="space-y-6">
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'On-Device %', value: `${dashboard.onDevicePercentage}%`, icon: <Shield className="w-4 h-4" /> },
            { label: 'Total Ops', value: dashboard.totalOperations, icon: <Activity className="w-4 h-4" /> },
            { label: 'Fields Redacted', value: dashboard.fieldsRedacted, icon: <Lock className="w-4 h-4" /> },
            { label: 'Cloud Bytes', value: dashboard.bytesSentToCloud, icon: <Globe2 className="w-4 h-4" /> },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 text-center">
              <div className="flex justify-center text-blue-500 mb-2">{s.icon}</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">{s.value}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {dashboard && (
        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-4">Data Consent Settings</h3>
          <div className="space-y-3">
            {[
              { key: 'syndromeDataSync' as const, label: 'Syndrome Data Sync', desc: 'Allow anonymized syndromic signals to sync to dashboard' },
              { key: 'anonymizedAlerts' as const, label: 'Anonymized Alerts', desc: 'Allow outbreak alerts with anonymized data' },
              { key: 'aggregateAnalytics' as const, label: 'Aggregate Analytics', desc: 'Allow aggregated analytics for surveillance' },
              { key: 'cloudAIProcessing' as const, label: 'Cloud AI Processing', desc: 'Allow cloud-based AI model (MedGemma 27B) for reports' },
              { key: 'researchDataSharing' as const, label: 'Research Data Sharing', desc: 'Allow de-identified data sharing for research' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">{item.label}</p>
                  <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">{item.desc}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleConsentUpdate(item.key, 'granted')}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                      dashboard.consentSettings[item.key] === 'granted'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                    } transition-colors`}
                  >Allow</button>
                  <button
                    onClick={() => handleConsentUpdate(item.key, 'denied')}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                      dashboard.consentSettings[item.key] === 'denied'
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400 hover:bg-rose-100 dark:hover:bg-rose-900/30'
                    } transition-colors`}
                  >Deny</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
        <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-blue-500" />
          PII Anonymization Tester
        </h3>
        <textarea
          value={testText}
          onChange={e => setTestText(e.target.value)}
          rows={2}
          placeholder="Paste text with PII to test anonymization (e.g., names, phone numbers, Aadhaar)..."
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-blue-500 resize-none mb-3"
        />
        <button onClick={handleTestAnonymize} disabled={!testText.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all mb-3">
          <Lock className="w-3 h-3" /> Test Anonymize
        </button>
        {anonymizedResult && (
          <div className="space-y-2">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Anonymized Output</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{anonymizedResult.anonymized}</p>
            </div>
            {anonymizedResult.redactedFields.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[9px] font-bold text-slate-400">Redacted:</span>
                {anonymizedResult.redactedFields.map(f => (
                  <span key={f} className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 rounded text-[9px] font-bold">{f}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {auditLog.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">Privacy Audit Log</h3>
            <button onClick={() => { clearPrivacyData(); refreshData(); }}
              className="flex items-center gap-1 text-[9px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600 transition-colors">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {auditLog.map(entry => (
              <div key={entry.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-[10px]">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  entry.processedAt === 'on_device' ? 'bg-emerald-400' : 'bg-blue-400'
                }`} />
                <span className="font-bold text-slate-600 dark:text-slate-300 flex-1 truncate">{entry.operation}</span>
                <span className="font-bold text-slate-400 dark:text-slate-500">{entry.processedAt}</span>
                {entry.anonymized && <Lock className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
