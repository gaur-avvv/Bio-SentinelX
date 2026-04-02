/**
 * Indian Syndromic Surveillance Dashboard
 * Unified UI for Bio-SentinelX's Indian healthcare surveillance features:
 *   - Field conversation intake (Hinglish/regional language processing)
 *   - Syndromic extraction with ICD-10 mapping
 *   - Outbreak prediction with 4-week temporal baseline
 *   - Environmental health knowledge graph explorer
 *   - Privacy-first architecture dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Activity, Shield, GitBranch, Globe2, AlertTriangle,
  CheckCircle2, XCircle, Info, Clock, Play, Trash2, ChevronDown,
  ChevronRight, FileText, Thermometer, Droplets, Wind, Eye,
  Lock, Upload, Search, BarChart3, TrendingUp, MapPin, Loader2,
} from 'lucide-react';

import {
  INDIC_DATA_SOURCES, IDSP_SYNDROMES, INDIC_LANGUAGE_LABELS,
  extractSyndromes, processFieldConversation, getFieldConversations,
  getIndicDataStats, clearIndicData,
  type IndicLanguage, type FieldConversation, type IndicDataStats,
} from '../services/indicDataService';
import {
  recordSyndromicSignal, analyzeDistrict, getOutbreakAlerts,
  getOutbreakPredictionStats, clearOutbreakAlerts, clearSyndromicSignals,
  type OutbreakAlert, type DistrictSurveillance, type OutbreakPredictionStats,
} from '../services/outbreakPredictionService';
import {
  initializeKnowledgeGraph, queryKnowledgeGraph, analyzeEnvironmentalImpact,
  getKnowledgeGraphStats, clearKnowledgeGraph,
  type KGQueryResult, type KnowledgeGraphStats,
} from '../services/knowledgeGraphService';
import {
  getPrivacyDashboard, getAuditLog, getConsentSettings, updateConsentSettings,
  anonymizeText, clearPrivacyData,
  type PrivacyDashboard, type PrivacyAuditEntry, type ConsentSettings,
} from '../services/privacyService';

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
  weather?: { temp: number; humidity: number; aqi?: number; rawAqi?: number; uvIndex?: number | null } | null;
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
      {activeTab === 'intake' && <FieldIntakePanel />}
      {activeTab === 'outbreak' && <OutbreakWatchPanel />}
      {activeTab === 'knowledge' && <KnowledgeGraphPanel weather={weather} />}
      {activeTab === 'privacy' && <PrivacyPanel />}
    </div>
  );
};

// ─── Field Intake Panel ─────────────────────────────────────────────────────

const FieldIntakePanel: React.FC = () => {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<IndicLanguage>('hi');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [conversations, setConversations] = useState<FieldConversation[]>([]);
  const [stats, setStats] = useState<IndicDataStats | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<FieldConversation | null>(null);

  const refreshData = useCallback(() => {
    setConversations(getFieldConversations());
    setStats(getIndicDataStats());
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleProcess = () => {
    if (!text.trim() || !district.trim() || !state.trim()) return;
    setProcessing(true);
    try {
      const result = processFieldConversation(text.trim(), language, district.trim(), state.trim());
      setLastResult(result);
      setText('');
      refreshData();
    } finally {
      setProcessing(false);
    }
  };

  // Live preview extraction
  const preview = text.trim() ? extractSyndromes(text.trim()) : null;

  return (
    <div className="space-y-6">
      {/* Data Sources Info */}
      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border border-teal-100 dark:border-teal-800 rounded-2xl p-5">
        <h3 className="text-[10px] font-black text-teal-700 dark:text-teal-300 uppercase tracking-widest mb-3">Phase 1 — Indian Context Data Sources</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INDIC_DATA_SOURCES.map(src => (
            <div key={src.id} className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3 border border-teal-100/50 dark:border-teal-800/50">
              <div className="flex items-start justify-between mb-1">
                <span className="text-xs font-black text-slate-800 dark:text-white">{src.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                  src.category === 'language' ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300' :
                  src.category === 'field_conversation' ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300' :
                  src.category === 'outbreak' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300' :
                  'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300'
                }`}>{src.category.replace('_', ' ')}</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">{src.description}</p>
              {src.coverage && (
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-1">Coverage: {src.coverage}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Conversations', value: stats.totalConversations, icon: <FileText className="w-4 h-4" /> },
            { label: 'Syndromes Found', value: stats.totalSyndromes, icon: <Activity className="w-4 h-4" /> },
            { label: 'Districts', value: stats.districtsCovered, icon: <MapPin className="w-4 h-4" /> },
            { label: 'Languages', value: Object.keys(stats.languageCoverage).length, icon: <Globe2 className="w-4 h-4" /> },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 text-center">
              <div className="flex justify-center text-teal-500 mb-2">{s.icon}</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">{s.value}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Field Conversation Input */}
      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
        <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-teal-500" />
          Clinical Intake — Process Field Conversation
        </h3>

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

        {/* Live Preview */}
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

      {/* Last Result */}
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

      {/* Recent Conversations */}
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

      {/* IDSP Syndromes Reference */}
      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
        <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-3">11 IDSP Surveillance Syndromes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {IDSP_SYNDROMES.map(s => (
            <div key={s.id} className="flex items-start gap-2 p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${severityBadge(s.severity)} border`}>{s.severity}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-white">{s.name}</p>
                <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500">{s.icd10Codes.join(', ')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Outbreak Watch Panel ───────────────────────────────────────────────────

const OutbreakWatchPanel: React.FC = () => {
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [surveillance, setSurveillance] = useState<DistrictSurveillance | null>(null);
  const [alerts, setAlerts] = useState<OutbreakAlert[]>([]);
  const [predStats, setPredStats] = useState<OutbreakPredictionStats | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Manual signal entry
  const [signalSyndrome, setSignalSyndrome] = useState('afi');
  const [signalCases, setSignalCases] = useState('');
  const [signalDistrict, setSignalDistrict] = useState('');
  const [signalState, setSignalState] = useState('');

  const refreshData = useCallback(() => {
    setAlerts(getOutbreakAlerts());
    setPredStats(getOutbreakPredictionStats());
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleAnalyze = () => {
    if (!district.trim() || !state.trim()) return;
    setAnalyzing(true);
    try {
      const result = analyzeDistrict(district.trim(), state.trim());
      setSurveillance(result);
      refreshData();
    } finally {
      setAnalyzing(false);
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
      {/* Stats */}
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
        <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Upload className="w-3.5 h-3.5 text-teal-500" />
          Record Weekly Syndromic Signal
        </h3>
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
        <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-rose-500" />
          Analyze District — Outbreak Detection (N &gt; μ + 2σ)
        </h3>
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

        {/* Analysis Result */}
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

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Outbreak Alerts
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

const KnowledgeGraphPanel: React.FC<{ weather?: { temp: number; humidity: number; aqi?: number; rawAqi?: number; uvIndex?: number | null } | null }> = ({ weather }) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KGQueryResult | null>(null);
  const [kgStats, setKgStats] = useState<KnowledgeGraphStats | null>(null);
  const [envResult, setEnvResult] = useState<KGQueryResult | null>(null);
  const [expandedChain, setExpandedChain] = useState<number | null>(null);

  useEffect(() => { setKgStats(getKnowledgeGraphStats()); }, []);

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
    };
    setEnvResult(analyzeEnvironmentalImpact(conditions));
    setResult(null);
  };

  const activeResult = result || envResult;

  return (
    <div className="space-y-6">
      {/* Stats */}
      {kgStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Nodes', value: kgStats.totalNodes },
            { label: 'Edges', value: kgStats.totalEdges },
            { label: 'Node Types', value: Object.keys(kgStats.nodesByType).length },
            { label: 'Edge Types', value: Object.keys(kgStats.edgesByType).length },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 text-center">
              <div className="text-lg font-black text-slate-900 dark:text-white">{s.value}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Query */}
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

      {/* Results */}
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

          {/* Quick action buttons for common queries */}
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

      {/* How It Works */}
      <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border border-violet-100 dark:border-violet-800 rounded-2xl p-5">
        <h3 className="text-[10px] font-black text-violet-700 dark:text-violet-300 uppercase tracking-widest mb-3">How the Knowledge Graph Works</h3>
        <div className="space-y-2 text-[10px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
          <p><strong className="text-slate-800 dark:text-white">Nodes</strong> represent environmental factors, health conditions, pathogens, vectors, symptoms, and interventions.</p>
          <p><strong className="text-slate-800 dark:text-white">Edges</strong> encode causal relationships with evidence-backed strength scores (e.g., High Humidity → Mold Growth → Asthma).</p>
          <p><strong className="text-slate-800 dark:text-white">Queries</strong> traverse the graph using BFS to find all causal pathways from environmental factors to health outcomes.</p>
          <p><strong className="text-slate-800 dark:text-white">Impact</strong>: Answers the "Why" in health reports — explains how weather conditions lead to specific disease risks.</p>
        </div>
      </div>
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
      {/* Privacy Architecture Overview */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-800 rounded-2xl p-5">
        <h3 className="text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" /> Privacy-First Architecture
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3 border border-blue-100/50 dark:border-blue-800/50">
            <p className="text-xs font-black text-slate-800 dark:text-white mb-1">On-Device Processing</p>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">90% of extraction runs locally. Sensitive narratives never leave the device.</p>
          </div>
          <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3 border border-blue-100/50 dark:border-blue-800/50">
            <p className="text-xs font-black text-slate-800 dark:text-white mb-1">Structured-Only Sync</p>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Only anonymized ICD-10 codes and syndrome categories are uploaded to cloud.</p>
          </div>
          <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl p-3 border border-blue-100/50 dark:border-blue-800/50">
            <p className="text-xs font-black text-slate-800 dark:text-white mb-1">PII Redaction</p>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Names, Aadhaar, phone numbers, and addresses are automatically stripped.</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
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

      {/* Consent Settings */}
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

      {/* Anonymization Tester */}
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

      {/* Audit Log */}
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
