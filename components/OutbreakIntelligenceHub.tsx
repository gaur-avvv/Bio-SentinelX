import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, ShieldAlert, AlertTriangle, TrendingUp, MapPin, Users, Calendar, 
  Building2, User, Clock, Sparkles, Plus, Search, FileText, CheckCircle2, 
  Loader2, Send, Database, RefreshCcw, HeartPulse, Thermometer, Droplets, Wind, 
  Check, AlertOctagon, TrendingDown, RefreshCw, Info, Cloud
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, Cell, PieChart, Pie
} from 'recharts';

import type { HospitalCaseReport, OutbreakPrediction, OutbreakRiskLevel, WeatherData, LifestyleData, DatabaseSettings, AiProvider } from '../types';
import { 
  submitCaseReport, runOutbreakPrediction, getLocalCaseReports, getPredictionHistory, syncUnsyncedReports 
} from '../services/outbreakLLMService';
import { IDSP_SYNDROMES } from '../services/indicDataService';
import { fetchCaseReports } from '../services/supabaseService';

interface OutbreakIntelligenceHubProps {
  weather: WeatherData | null;
  aiProvider: AiProvider;
  aiModel: string;
  aiKey?: string;
  databaseSettings?: DatabaseSettings;
  lifestyleData?: LifestyleData;
}

export const OutbreakIntelligenceHub: React.FC<OutbreakIntelligenceHubProps> = ({
  weather,
  aiProvider,
  aiModel,
  aiKey = '',
  databaseSettings,
  lifestyleData,
}) => {
  // Navigation tabs within Hub
  const [activeTab, setActiveTab] = useState<'form' | 'dashboard' | 'analytics'>('form');

  // Case entry form state
  const [reporterName, setReporterName] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [city, setCity] = useState(weather?.city || '');
  const [district, setDistrict] = useState(weather?.city || '');
  const [state, setState] = useState('');
  const [selectedDisease, setSelectedDisease] = useState('');
  const [customDisease, setCustomDisease] = useState('');
  const [patientCount, setPatientCount] = useState<number>(1);
  const [ageRange, setAgeRange] = useState('Adult (15-59)');
  const [genderDistribution, setGenderDistribution] = useState('Equal');
  const [symptoms, setSymptoms] = useState('');
  const [dateRangeStart, setDateRangeStart] = useState(new Date().toISOString().split('T')[0]);
  const [dateRangeEnd, setDateRangeEnd] = useState(new Date().toISOString().split('T')[0]);
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Execution states
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data states
  const [caseReports, setCaseReports] = useState<HospitalCaseReport[]>([]);
  const [prediction, setPrediction] = useState<OutbreakPrediction | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<OutbreakPrediction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Load records on mount
  useEffect(() => {
    loadReportsAndHistory();
  }, []);

  const loadReportsAndHistory = async () => {
    // Local reports
    const local = getLocalCaseReports();
    // Cloud reports
    let cloud: HospitalCaseReport[] = [];
    try {
      cloud = await fetchCaseReports(100);
    } catch (err) {
      console.warn('[OutbreakHub] Failed to fetch cloud reports:', err);
    }

    // Merge & deduplicate
    const merged = new Map<string, HospitalCaseReport>();
    local.forEach(r => merged.set(r.id, r));
    cloud.forEach(r => merged.set(r.id, r));
    const sorted = Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);

    setCaseReports(sorted);

    // Predictions history
    const history = getPredictionHistory();
    setPredictionHistory(history);
    if (history.length > 0 && !prediction) {
      setPrediction(history[0]);
    }
  };

  // Sync handler
  const handleCloudSync = async () => {
    setIsSyncing(true);
    showNotification('success', 'Starting cloud vector synchronization...');
    try {
      const res = await syncUnsyncedReports();
      await loadReportsAndHistory();
      showNotification('success', `Synced ${res.successCount} reports to Supabase cloud. (${res.failedCount} failed)`);
    } catch (err) {
      showNotification('error', 'Cloud synchronization failed. Check your Supabase settings.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Form submission handler
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalDisease = selectedDisease === 'custom' ? customDisease.trim() : selectedDisease;

    if (!finalDisease) {
      showNotification('error', 'Please select or enter a disease/syndrome.');
      return;
    }
    if (!reporterName.trim() || !facilityName.trim() || !city.trim() || !district.trim() || !state.trim()) {
      showNotification('error', 'All facility, reporter, and location details are mandatory.');
      return;
    }

    setIsSubmittingReport(true);
    try {
      const selectedIdsp = IDSP_SYNDROMES.find(s => s.name === finalDisease);
      await submitCaseReport({
        reporterName: reporterName.trim(),
        facilityName: facilityName.trim(),
        city: city.trim(),
        district: district.trim(),
        state: state.trim(),
        disease: finalDisease,
        syndromeId: selectedIdsp?.id,
        patientCount,
        ageRange,
        genderDistribution,
        symptoms: symptoms.trim(),
        dateRangeStart,
        dateRangeEnd,
        additionalNotes: additionalNotes.trim(),
      }, aiKey);

      showNotification('success', 'Hospital case report successfully synced locally and saved to vector store.');
      // Clear inputs
      setSymptoms('');
      setAdditionalNotes('');
      setPatientCount(1);
      
      await loadReportsAndHistory();
    } catch (err) {
      showNotification('error', 'Failed to register report. Please check input parameters.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Prediction trigger
  const handleRunPrediction = async () => {
    if (!weather) {
      showNotification('error', 'Live meteorological metrics are required to trigger epidemiological predictions.');
      return;
    }
    setIsPredicting(true);
    setActiveTab('dashboard');
    try {
      const res = await runOutbreakPrediction(weather, lifestyleData, aiProvider, aiModel, aiKey);
      setPrediction(res);
      await loadReportsAndHistory();
      showNotification('success', 'Epidemiological prediction finalized using RAG cloud vectors & multi-source signals.');
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Vector prediction execution failed.');
    } finally {
      setIsPredicting(false);
    }
  };

  // Notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Filtered reports list
  const filteredReports = useMemo(() => {
    return caseReports.filter(r => {
      const term = searchTerm.toLowerCase();
      return (
        r.disease.toLowerCase().includes(term) ||
        r.city.toLowerCase().includes(term) ||
        r.facilityName.toLowerCase().includes(term) ||
        r.symptoms.toLowerCase().includes(term)
      );
    });
  }, [caseReports, searchTerm]);

  // Analytics computed states
  const chartData = useMemo(() => {
    const diseaseMap: Record<string, number> = {};
    caseReports.forEach(r => {
      diseaseMap[r.disease] = (diseaseMap[r.disease] || 0) + r.patientCount;
    });

    return Object.entries(diseaseMap).map(([name, value]) => ({ name, value })).slice(0, 8);
  }, [caseReports]);

  const locationData = useMemo(() => {
    const locMap: Record<string, number> = {};
    caseReports.forEach(r => {
      const key = `${r.city}, ${r.district}`;
      locMap[key] = (locMap[key] || 0) + r.patientCount;
    });

    return Object.entries(locMap).map(([name, value]) => ({ name, value })).slice(0, 8);
  }, [caseReports]);

  // Color scheme based on risk levels
  const getRiskColorClasses = (level: OutbreakRiskLevel) => {
    switch (level) {
      case 'LOW':
        return { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', color: 'text-emerald-400' };
      case 'MODERATE':
        return { bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400', color: 'text-amber-400' };
      case 'HIGH':
        return { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400', color: 'text-rose-400' };
      case 'CRITICAL':
        return { bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400', color: 'text-purple-400' };
      case 'EPIDEMIC':
        return { bg: 'bg-red-500/20 border-red-500/50 text-red-500 animate-pulse', color: 'text-red-500' };
      default:
        return { bg: 'bg-slate-500/10 border-slate-500/30 text-slate-400', color: 'text-slate-400' };
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Top Banner & Hub Title */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="p-3.5 bg-teal-500 rounded-2xl shadow-xl shadow-teal-500/20">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-teal-500/20 rounded-md text-[8px] font-black text-teal-300 uppercase tracking-widest">
                  Live Cloud Vector DB
                </span>
                <span className="px-2 py-0.5 bg-indigo-500/20 rounded-md text-[8px] font-black text-indigo-300 uppercase tracking-widest">
                  RAG Fine-Tuned LLM
                </span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase mt-2">
                Outbreak Prediction Intelligence Hub
              </h2>
              <p className="text-xs text-slate-400 font-medium max-w-xl mt-1 leading-relaxed">
                Aggregates live clinical syndromes reported by hospital staff with environmental, weather, and localized vector metrics to perform predictive modeling using fine-tuned AI engines.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleCloudSync}
              disabled={isSyncing}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800/80 hover:bg-slate-800 text-[10px] font-black text-slate-300 uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSyncing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin text-teal-400" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync Cloud Vectors
            </button>

            <button
              onClick={handleRunPrediction}
              disabled={isPredicting || caseReports.length === 0}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-[10px] font-black text-white uppercase tracking-widest transition-all shadow-xl shadow-teal-900/30 flex items-center gap-2 disabled:opacity-50"
            >
              {isPredicting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Sparkles className="w-3.5 h-3.5" />}
              Run Outbreak Predictor
            </button>
          </div>
        </div>

        {/* Local Sync Notification */}
        {notification && (
          <div className={`mt-6 p-4 rounded-xl border text-xs font-bold transition-all animate-fade-in flex items-center gap-3 ${
            notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />}
            {notification.message}
          </div>
        )}
      </div>

      {/* Main Tabbed Layout */}
      <div className="flex gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl w-full sm:w-max">
        <button
          onClick={() => setActiveTab('form')}
          className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'form' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Staff Entry Form
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'dashboard' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Outbreak Prediction
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'analytics' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview & Analytics
        </button>
      </div>

      {/* Tab Contents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
        {/* Left/Middle Column (dynamic by tab) */}
        <div className="lg:col-span-2 space-y-6 sm:space-y-8">
          
          {/* TAB 1: Hospital Case Entry Form */}
          {activeTab === 'form' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <Building2 className="w-5 h-5 text-teal-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-widest">
                  Hospital Case Registry Entry
                </h3>
              </div>

              <form onSubmit={handleSubmitReport} className="space-y-6">
                {/* Reporter / Facility Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <User className="w-3 h-3" /> Reporter Name
                    </label>
                    <input
                      type="text"
                      required
                      value={reporterName}
                      onChange={e => setReporterName(e.target.value)}
                      placeholder="e.g. Dr. Ramesh Kumar"
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" /> Healthcare Facility Name
                    </label>
                    <input
                      type="text"
                      required
                      value={facilityName}
                      onChange={e => setFacilityName(e.target.value)}
                      placeholder="e.g. City General Hospital"
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Location Section */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> City / Place
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder="e.g. Mumbai"
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">District</label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={e => setDistrict(e.target.value)}
                      placeholder="e.g. Thane"
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">State</label>
                    <input
                      type="text"
                      required
                      value={state}
                      onChange={e => setState(e.target.value)}
                      placeholder="e.g. Maharashtra"
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <hr className="border-slate-800" />

                {/* Syndrome / Patient distribution */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Active Disease / Syndrome
                    </label>
                    <select
                      value={selectedDisease}
                      onChange={e => setSelectedDisease(e.target.value)}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                    >
                      <option value="">-- Choose Disease Syndrome --</option>
                      {IDSP_SYNDROMES.map(s => (
                        <option key={s.id} value={s.name}>{s.name} ({s.id.toUpperCase()})</option>
                      ))}
                      <option value="custom">Other (Manually Specify)</option>
                    </select>

                    {selectedDisease === 'custom' && (
                      <input
                        type="text"
                        required
                        value={customDisease}
                        onChange={e => setCustomDisease(e.target.value)}
                        placeholder="Enter customized disease name..."
                        className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 mt-2 transition-all"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Patient Count
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={patientCount}
                      onChange={e => setPatientCount(parseInt(e.target.value) || 1)}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Age Range
                    </label>
                    <select
                      value={ageRange}
                      onChange={e => setAgeRange(e.target.value)}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                    >
                      <option value="Pediatric (0-14)">Pediatric (0-14)</option>
                      <option value="Adult (15-59)">Adult (15-59)</option>
                      <option value="Geriatric (60+)">Geriatric (60+)</option>
                      <option value="All Ages">All Ages (Uniform)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Gender Distribution
                    </label>
                    <select
                      value={genderDistribution}
                      onChange={e => setGenderDistribution(e.target.value)}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                    >
                      <option value="Equal">Equal / Balanced</option>
                      <option value="Male Dominated">Male Dominated</option>
                      <option value="Female Dominated">Female Dominated</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Observed Symptoms
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={symptoms}
                    onChange={e => setSymptoms(e.target.value)}
                    placeholder="Enter detailed symptoms described by patients (e.g. persistent high fever, bleeding gums, joint pain)..."
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" /> Start Date of Cases
                    </label>
                    <input
                      type="date"
                      required
                      value={dateRangeStart}
                      onChange={e => setDateRangeStart(e.target.value)}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" /> End Date of Cases
                    </label>
                    <input
                      type="date"
                      required
                      value={dateRangeEnd}
                      onChange={e => setDateRangeEnd(e.target.value)}
                      className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Epidemiological Notes
                  </label>
                  <textarea
                    rows={2}
                    value={additionalNotes}
                    onChange={e => setAdditionalNotes(e.target.value)}
                    placeholder="Enter additional facility remarks, drug-resistance indicators, vector abundance..."
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-[10px] font-black text-white uppercase tracking-widest transition-all shadow-xl shadow-teal-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingReport ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Plus className="w-4 h-4 text-white" />
                  )}
                  Register and Sync Case Report
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: Prediction Analysis Dashboard */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 sm:space-y-8">
              {!prediction ? (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-6 shadow-xl">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto text-teal-400">
                    <Activity className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black text-white uppercase">
                      No Outbreak Prediction Triggered Yet
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Click the "Run Outbreak Predictor" button at the top right to start modeling our live vectors against environment variables.
                    </p>
                  </div>
                  <button
                    onClick={handleRunPrediction}
                    disabled={isPredicting || caseReports.length === 0}
                    className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-[10px] font-black text-white uppercase tracking-widest transition-all shadow-xl shadow-teal-900/30 flex items-center gap-2 mx-auto disabled:opacity-50"
                  >
                    {isPredicting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Compute Live Outbreak Prediction
                  </button>
                </div>
              ) : (
                <div className="space-y-6 sm:space-y-8">
                  
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    
                    {/* RISK CARD */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Outbreak Risk Level
                        </span>
                        <h4 className="text-2xl font-black text-white uppercase mt-1 leading-none">
                          {prediction.overallRisk}
                        </h4>
                      </div>
                      <div className={`p-3.5 rounded-xl border ${getRiskColorClasses(prediction.overallRisk).bg}`}>
                        <ShieldAlert className="w-6 h-6 shrink-0" />
                      </div>
                    </div>

                    {/* CONFIDENCE CARD */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Prediction Confidence
                        </span>
                        <h4 className="text-2xl font-black text-teal-400 mt-1 leading-none">
                          {prediction.confidence}%
                        </h4>
                      </div>
                      <div className="p-3.5 rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-400">
                        <Users className="w-6 h-6 shrink-0" />
                      </div>
                    </div>

                    {/* MODEL CARD */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          AI Model Engine
                        </span>
                        <h4 className="text-xs font-black text-indigo-400 truncate max-w-[150px] mt-2">
                          {prediction.aiModel.toUpperCase()}
                        </h4>
                      </div>
                      <div className="p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                        <Database className="w-6 h-6 shrink-0" />
                      </div>
                    </div>

                  </div>

                  {/* Epidemiological Narrative */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-xl space-y-6">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-teal-400" />
                      <h3 className="text-lg font-black text-white uppercase tracking-widest">
                        Epidemiological Signal Analysis
                      </h3>
                    </div>
                    <div className="prose prose-invert prose-xs text-xs font-bold leading-relaxed text-slate-300 bg-slate-950 p-4 sm:p-6 rounded-2xl border border-slate-800">
                      <ReactMarkdown>{prediction.rawAnalysis}</ReactMarkdown>
                    </div>
                  </div>

                  {/* Environmental Factors & Seasonal Context */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                      <Thermometer className="w-5 h-5 text-teal-400" />
                      <h3 className="text-lg font-black text-white uppercase tracking-widest">
                        Atmospheric & Vector Multipliers
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                        <Thermometer className="w-5 h-5 text-rose-400 shrink-0" />
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Temperature</p>
                          <p className="text-sm font-black text-slate-200 mt-0.5">{prediction.environmentalFactors.temperature}°C</p>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                        <Droplets className="w-5 h-5 text-teal-400 shrink-0" />
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Humidity</p>
                          <p className="text-sm font-black text-slate-200 mt-0.5">{prediction.environmentalFactors.humidity}%</p>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                        <Wind className="w-5 h-5 text-indigo-400 shrink-0" />
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Air Quality (AQI)</p>
                          <p className="text-sm font-black text-slate-200 mt-0.5">{prediction.environmentalFactors.aqi}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 bg-teal-500/5 rounded-2xl border border-teal-500/20 text-xs font-bold text-slate-300 leading-relaxed">
                      <div className="flex items-center gap-2 mb-2 text-teal-400">
                        <Info className="w-4 h-4 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Seasonal Interpretation</span>
                      </div>
                      {prediction.environmentalFactors.seasonalContext}
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-xl space-y-4">
                    <div className="flex items-center gap-3">
                      <HeartPulse className="w-5 h-5 text-teal-400" />
                      <h3 className="text-lg font-black text-white uppercase tracking-widest">
                        Clinical & Preventive Protocol Recommendations
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                      {prediction.recommendations.map((rec, i) => (
                        <div key={i} className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-start gap-3">
                          <div className="p-1 bg-teal-500/20 text-teal-400 rounded-lg shrink-0 mt-0.5">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-bold text-slate-200 leading-relaxed">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB 3: Overview & Local Analytics */}
          {activeTab === 'analytics' && (
            <div className="space-y-6 sm:space-y-8">
              
              {/* Analytics Charts */}
              {caseReports.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center text-slate-400 text-xs font-black uppercase tracking-widest shadow-xl">
                  Insufficient clinical signals to compile regional charts
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  
                  {/* Disease breakdown */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                      Case Count by Disease Syndrome
                    </h4>
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: 10 }} />
                          <Bar dataKey="value" fill="#14b8a6" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#14b8a6' : '#6366f1'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Location breakdown */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                      Case Density by Location / Region
                    </h4>
                    <div className="h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={locationData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: 10 }} />
                          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]}>
                            {locationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#6366f1' : '#14b8a6'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                </div>
              )}

              {/* Case report table log */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-teal-400" />
                    <h3 className="text-lg font-black text-white uppercase tracking-widest">
                      Active Clinic Registry Logs
                    </h3>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Search registry logs..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full p-2.5 pl-9 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-teal-500 placeholder:text-slate-500"
                    />
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 min-w-[700px]">
                    <thead className="bg-slate-950 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      <tr>
                        <th className="p-4 rounded-l-xl">Registry Details</th>
                        <th className="p-4">Location</th>
                        <th className="p-4">Syndrome / Disease</th>
                        <th className="p-4 text-center">Cases</th>
                        <th className="p-4">Demographics</th>
                        <th className="p-4 text-center">Cloud Sync</th>
                        <th className="p-4 rounded-r-xl">Registered At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredReports.map((report) => (
                        <tr key={report.id} className="hover:bg-slate-800/30 transition-all font-bold">
                          <td className="p-4">
                            <p className="text-white text-xs">{report.facilityName}</p>
                            <p className="text-[9px] text-slate-500">Reported by: {report.reporterName}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-white text-xs">{report.city}</p>
                            <p className="text-[9px] text-slate-500">{report.district}, {report.state}</p>
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 bg-teal-500/10 text-teal-400 rounded-lg border border-teal-500/20 text-[10px] tracking-wide">
                              {report.disease}
                            </span>
                          </td>
                          <td className="p-4 text-center text-white font-black text-sm">
                            {report.patientCount}
                          </td>
                          <td className="p-4">
                            <p className="text-[10px] text-slate-300">{report.ageRange}</p>
                            <p className="text-[9px] text-slate-500">{report.genderDistribution}</p>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest ${
                              report.syncedToCloud ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {report.syncedToCloud ? <Check className="w-2.5 h-2.5" /> : <Cloud className="w-2.5 h-2.5" />}
                              {report.syncedToCloud ? 'Synced' : 'Local'}
                            </span>
                          </td>
                          <td className="p-4 text-[10px] text-slate-500">
                            {new Date(report.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {filteredReports.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-10 text-center text-slate-500 uppercase tracking-widest">
                            No matching case reports found in database
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Right Sidebar Column - Active Predictions & Climate Context */}
        <div className="space-y-6 sm:space-y-8">
          
          {/* Active Local Climate Context */}
          {weather && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full -mr-10 -mt-10 blur-xl pointer-events-none" />
              <div className="flex items-center gap-2 mb-4">
                <Thermometer className="w-4 h-4 text-teal-400" />
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Active Climate Context
                </h4>
              </div>
              <div className="space-y-4">
                <div className="flex items-end justify-between border-b border-slate-800 pb-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Station city</span>
                  <span className="text-sm font-black text-white">{weather.city}</span>
                </div>
                <div className="flex items-end justify-between border-b border-slate-800 pb-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Air Temperature</span>
                  <span className="text-sm font-black text-rose-400">{weather.temp}°C</span>
                </div>
                <div className="flex items-end justify-between border-b border-slate-800 pb-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Relative Moisture</span>
                  <span className="text-sm font-black text-teal-400">{weather.humidity}%</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Atmos. Quality</span>
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${
                    weather.aqi <= 50 ? 'bg-emerald-500/20 text-emerald-400' : weather.aqi <= 100 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {weather.aqi} AQI
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Past Predictions Sidebar List */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-400" />
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Historical Log
                </h4>
              </div>
              <span className="px-2 py-0.5 bg-slate-800 rounded-full text-[8px] font-black text-slate-400 uppercase">
                {predictionHistory.length} Runs
              </span>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto divide-y divide-slate-800/40">
              {predictionHistory.map((hist, idx) => {
                const colors = getRiskColorClasses(hist.overallRisk);
                return (
                  <button
                    key={hist.id}
                    onClick={() => {
                      setPrediction(hist);
                      setActiveTab('dashboard');
                    }}
                    className={`w-full text-left p-3 rounded-xl border border-transparent hover:border-slate-800 hover:bg-slate-800/20 transition-all font-bold space-y-1.5 flex flex-col pt-3.5 ${
                      prediction?.id === hist.id ? 'bg-slate-800/40 border-slate-700/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${colors.bg}`}>
                        {hist.overallRisk} RISK
                      </span>
                      <span className="text-[8px] font-black text-slate-500">
                        {new Date(hist.timestamp).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-white uppercase truncate w-full">
                      Epicenter: {hist.geographicSpread.epicenter}
                    </p>

                    <div className="flex items-center justify-between text-[9px] text-slate-400">
                      <span>Conf: {hist.confidence}%</span>
                      <span className="truncate max-w-[100px]">Engine: {hist.aiModel.toUpperCase()}</span>
                    </div>
                  </button>
                );
              })}

              {predictionHistory.length === 0 && (
                <div className="text-center py-6 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  No prediction runs in database logs
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
