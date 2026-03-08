import React, { useState, useEffect, Component, ReactNode } from 'react';
import { Settings, MapPin, Key, CheckCircle2, Crosshair, HelpCircle, Zap, ShieldCheck, Info, Loader2, Server, Wifi, WifiOff, AlertTriangle, ChevronDown, Brain, X, Sun, Sunset, Moon, Palette, Wand2 } from 'lucide-react';
import { LoadingState, AiProvider, AI_MODELS } from '../types';
import { geocodeLocation } from '../services/weatherService';
import { checkBioSentinelHealth } from '../services/mlService';
import { TokenBudgetPanel } from './TokenBudgetPanel';
import { useTheme } from '../contexts/ThemeContext';

/** Tiny error boundary that silently swallows TokenBudgetPanel crashes */
class TokenPanelBoundary extends Component<{ aiProvider: AiProvider; aiModel: string }, { failed: boolean }> {
  constructor(props: { aiProvider: AiProvider; aiModel: string }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    console.warn('[TokenBudgetPanel] Suppressed render error:', e?.message);
  }
  render() {
    if (this.state.failed) return null;
    return <TokenBudgetPanel aiProvider={this.props.aiProvider} aiModel={this.props.aiModel} />;
  }
}

interface ConfigSidebarProps {
  location: string;
  setLocation: (loc: string) => void;
  onFetchWeather: () => void;
  loadingState: LoadingState;
  hasWeatherData: boolean;
  detectedCity?: string;
  geminiKey: string;
  setGeminiKey: (key: string) => void;
  groqKey: string;
  setGroqKey: (key: string) => void;
  pollinationsKey: string;
  setPollinationsKey: (key: string) => void;
  openrouterKey: string;
  setOpenrouterKey: (key: string) => void;
  siliconflowKey: string;
  setSiliconflowKey: (key: string) => void;
  aiProvider: AiProvider;
  setAiProvider: (p: AiProvider) => void;
  aiModel: string;
  setAiModel: (m: string) => void;
  useOpenWeather: boolean;
  setUseOpenWeather: (use: boolean) => void;
  openWeatherKey: string;
  setOpenWeatherKey: (key: string) => void;
  mlApiKey: string;
  setMlApiKey: (key: string) => void;
  onClose?: () => void;
}

export const ConfigSidebar: React.FC<ConfigSidebarProps> = ({
  location, setLocation, onFetchWeather, loadingState, hasWeatherData, detectedCity,
  geminiKey, setGeminiKey, groqKey, setGroqKey, pollinationsKey, setPollinationsKey,
  openrouterKey, setOpenrouterKey, siliconflowKey, setSiliconflowKey,
  aiProvider, setAiProvider, aiModel, setAiModel,
  useOpenWeather, setUseOpenWeather, openWeatherKey, setOpenWeatherKey,
  mlApiKey, setMlApiKey, onClose
}) => {
  const isLoading = loadingState === LoadingState.LOADING_WEATHER;
  const [isLocating, setIsLocating] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [resolvedPreview, setResolvedPreview] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [showCustomColors, setShowCustomColors] = useState(false);

  const {
    appMode, setAppMode,
    systemPreference,
    weatherCardMode, setWeatherCardMode,
    weatherThemeLocked, setWeatherThemeLocked,
    customColors, setCustomColors,
    useCustomColors, setUseCustomColors,
    autoWeatherTheme,
  } = useTheme();

  const resolvedAppMode = appMode === 'auto' ? systemPreference : appMode;

  // Check Bio-Sentinel API Health
  useEffect(() => {
    const checkHealth = async () => {
      setApiStatus('checking');
      const isHealthy = await checkBioSentinelHealth();
      setApiStatus(isHealthy ? 'online' : 'offline');
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Debounced precise geocoding preview
  useEffect(() => {
    if (!location || location.length < 2) {
      setResolvedPreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsGeocoding(true);
      const name = await geocodeLocation(location);
      setResolvedPreview(name);
      setIsGeocoding(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [location]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coordString = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setLocation(coordString);
        setIsLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Unable to retrieve your location.");
        setIsLocating(false);
      }
    );
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 p-6 lg:p-8 flex flex-col h-full lg:h-screen lg:sticky lg:top-0 overflow-y-auto z-20 shadow-sm transition-colors duration-300">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-slate-900 dark:bg-slate-800 rounded-[1rem] shadow-lg shadow-slate-200 dark:shadow-slate-900">
          <Settings className="w-6 h-6 text-teal-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Config</h2>
          <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Bio-Logic Core</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 transition-all"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ── Theme Control Panel ── */}
      <div className="mb-6 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">App Theme</p>
          {appMode === 'auto' && (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400">
              {systemPreference === 'dark' ? '🌙 System Dark' : '☀️ System Light'}
            </span>
          )}
        </div>

        {/* Global Default / Light / Dark */}
        <div className="flex items-center gap-1.5">
          <button
            title="Auto — follows your OS dark/light preference"
            onClick={() => setAppMode('auto')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
              appMode === 'auto'
                ? 'bg-teal-500 text-white shadow-lg shadow-teal-400/40 scale-105'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-teal-100 hover:text-teal-600'
            }`}>
            <Wand2 className="w-3 h-3" />Auto
          </button>
          <button
            title="Light mode"
            onClick={() => setAppMode('light')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
              appMode === 'light'
                ? 'bg-amber-400 text-white shadow-lg shadow-amber-300/40 scale-105'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-amber-100 hover:text-amber-600'
            }`}>
            <Sun className="w-3 h-3" />Light
          </button>
          <button
            title="Dark mode"
            onClick={() => setAppMode('dark')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
              appMode === 'dark'
                ? 'bg-slate-800 text-blue-300 shadow-lg shadow-slate-700/40 scale-105'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-800 hover:text-blue-300'
            }`}>
            <Moon className="w-3 h-3" />Dark
          </button>
        </div>

        {/* Weather Card Theme Buttons */}
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest pt-1">Weather Card</p>
        <div className="flex items-center gap-1.5">
          <button
            title="Auto — switches by local time of day"
            onClick={() => { setWeatherThemeLocked(false); setWeatherCardMode(autoWeatherTheme(new Date().getHours())); }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
              !weatherThemeLocked
                ? 'bg-teal-500 text-white shadow-md shadow-teal-300/40 scale-105'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-teal-100 hover:text-teal-600'
            }`}>
            <Wand2 className="w-3 h-3" />Auto
          </button>
          <button
            title="Light card"
            onClick={() => { setWeatherCardMode('light'); setWeatherThemeLocked(true); }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
              weatherThemeLocked && weatherCardMode === 'light'
                ? 'bg-amber-400 text-white shadow-md shadow-amber-300/40 scale-105'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-amber-100 hover:text-amber-600'
            }`}>
            <Sun className="w-3 h-3" />Day
          </button>
          <button
            title="Twilight card"
            onClick={() => { setWeatherCardMode('partial-dark'); setWeatherThemeLocked(true); }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
              weatherThemeLocked && weatherCardMode === 'partial-dark'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-400/40 scale-105'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-indigo-100 hover:text-indigo-600'
            }`}>
            <Sunset className="w-3 h-3" />Dusk
          </button>
          <button
            title="Full dark card"
            onClick={() => { setWeatherCardMode('full-dark'); setWeatherThemeLocked(true); }}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
              weatherThemeLocked && weatherCardMode === 'full-dark'
                ? 'bg-blue-800 text-blue-200 shadow-md shadow-blue-800/40 scale-105'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-blue-900 hover:text-blue-300'
            }`}>
            <Moon className="w-3 h-3" />Night
          </button>
        </div>

        {/* Custom Colours Toggle */}
        <button
          onClick={() => setShowCustomColors(v => !v)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
            useCustomColors
              ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300'
              : 'bg-slate-100 dark:bg-slate-700 border-transparent text-slate-500 dark:text-slate-300 hover:border-slate-200'
          }`}>
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" />
            Custom Colours
          </div>
          <div className="flex items-center gap-1">
            {useCustomColors && (
              <span className="w-2.5 h-2.5 rounded-full border border-purple-300" style={{ background: customColors.accent }} />
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showCustomColors ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {showCustomColors && (
          <div className="space-y-3 pt-1 animate-fade-in">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className={`w-8 h-4 rounded-full transition-colors relative ${ useCustomColors ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-600' }`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${ useCustomColors ? 'translate-x-4' : 'translate-x-0.5' }`} />
                  <input type="checkbox" checked={useCustomColors} onChange={e => setUseCustomColors(e.target.checked)} className="sr-only" />
                </div>
                <span className="text-[9px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">Enable custom colours</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                { label: 'Accent', key: 'accent' as const },
                { label: 'Surface', key: 'surface' as const },
                { label: 'Text', key: 'text' as const },
              ]).map(({ label, key }) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    <input
                      type="color"
                      value={customColors[key]}
                      onChange={e => setCustomColors({ ...customColors, [key]: e.target.value })}
                      className="w-10 h-10 rounded-xl border-2 border-slate-200 dark:border-slate-600 cursor-pointer p-0.5 bg-white dark:bg-slate-700"
                      style={{ accentColor: customColors[key] }}
                    />
                    <div
                      className="absolute inset-1 rounded-lg pointer-events-none"
                      style={{ background: customColors[key] }}
                    />
                  </div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                </div>
              ))}
            </div>

            {/* Preset palettes */}
            <div className="space-y-1.5">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Presets</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { name: 'Teal', accent: '#14b8a6', surface: '#f0fdfa', text: '#0f172a' },
                  { name: 'Violet', accent: '#7c3aed', surface: '#f5f3ff', text: '#1e1b4b' },
                  { name: 'Rose', accent: '#e11d48', surface: '#fff1f2', text: '#1c0a0e' },
                  { name: 'Amber', accent: '#d97706', surface: '#fffbeb', text: '#1c1100' },
                  { name: 'Ocean', accent: '#0284c7', surface: '#f0f9ff', text: '#082f49' },
                  { name: 'Dark', accent: '#6366f1', surface: '#0f172a', text: '#e2e8f0' },
                ].map(p => (
                  <button
                    key={p.name}
                    onClick={() => { setCustomColors({ accent: p.accent, surface: p.surface, text: p.text }); setUseCustomColors(true); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wide bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-all"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.accent }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8">
        {/* API Status Indicator */}
        <div className={`p-4 rounded-2xl border ${
          apiStatus === 'online' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-800/50' : 
          apiStatus === 'offline' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-800/50' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                apiStatus === 'online' ? 'bg-emerald-500 text-white' : 
                apiStatus === 'offline' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-400'
              }`}>
                <Server className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bio-Sentinel API</p>
                <p className={`text-xs font-black uppercase tracking-tight ${
                  apiStatus === 'online' ? 'text-emerald-700 dark:text-emerald-400' : 
                  apiStatus === 'offline' ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {apiStatus === 'checking' ? 'Connecting...' : apiStatus}
                </p>
              </div>
            </div>
            <div className="relative">
               {apiStatus === 'online' && <Wifi className="w-4 h-4 text-emerald-500" />}
               {apiStatus === 'offline' && <WifiOff className="w-4 h-4 text-rose-500" />}
               {apiStatus === 'checking' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
               {apiStatus === 'online' && <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />}
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ML API Key <span className="normal-case font-bold text-slate-300">(optional)</span></p>
            <div className="relative group">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
              <input
                type="password"
                value={mlApiKey}
                onChange={e => setMlApiKey(e.target.value)}
                placeholder="sk-bs-..."
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500"
              />
            </div>
            <p className="text-[9px] font-bold text-slate-400">Leave blank for public access. Required for private deployments.</p>
          </div>
        </div>

        <div className="p-5 bg-teal-50 dark:bg-teal-950/30 rounded-2xl border border-teal-100 dark:border-teal-800/50 space-y-3">
          <div className="flex items-center justify-between text-teal-800 dark:text-teal-300">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-black uppercase tracking-tight">Weather Data Source</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={useOpenWeather}
                onChange={(e) => setUseOpenWeather(e.target.checked)}
              />
              <div className="w-9 h-5 bg-teal-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
          </div>
          <p className="text-[10px] text-teal-700 dark:text-teal-400 font-bold leading-relaxed">
            {useOpenWeather ? "OpenWeather API is active. Provides reliable worldwide weather data." : "Open-Meteo is active. Free, high-accuracy weather with detailed hourly forecasts."}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Location
            </label>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City or Coordinates"
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700"
              />
            </div>
            <button 
              onClick={handleGetCurrentLocation}
              disabled={isLocating}
              className="px-4 bg-slate-900 text-teal-400 rounded-2xl hover:bg-teal-600 hover:text-white transition-all shadow-md active:scale-90 disabled:opacity-50"
            >
              <Crosshair className={`w-5 h-5 ${isLocating ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Resolved Location Preview - Hyper-Local Geocoding Feedback */}
          {(isGeocoding || resolvedPreview) && (
            <div className="mt-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl animate-fade-in transition-all">
              <div className="flex items-center gap-2 mb-1">
                {isGeocoding ? (
                  <Loader2 className="w-3 h-3 text-teal-500 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-teal-500" />
                )}
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Resolution Check</span>
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight">
                {isGeocoding ? 'Locating station...' : resolvedPreview}
              </p>
            </div>
          )}

          {hasWeatherData && detectedCity && !resolvedPreview && (
            <div className="mt-2 flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl">
              <Info className="w-3 h-3 text-slate-400" />
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400">Syncing with <span className="text-teal-600 font-black">{detectedCity}</span>.</p>
            </div>
          )}
        </div>

        {/* AI Neural Engine — Provider, Model, Key */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-slate-400" />
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Neural Engine</label>
          </div>

          {/* Provider Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl">
            {(['gemini', 'groq', 'pollinations', 'openrouter', 'siliconflow'] as AiProvider[]).map(p => (
              <button
                key={p}
                onClick={() => {
                  setAiProvider(p);
                  setAiModel(AI_MODELS[p][0].value);
                }}
                className={`py-2 px-1.5 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${
                  aiProvider === p
                    ? 'bg-white text-teal-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {p === 'pollinations' ? 'Free AI' : p === 'openrouter' ? 'OpenRouter' : p === 'siliconflow' ? 'SiliconFlow' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Model Selector */}
          <div className="relative">
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              className="w-full pl-4 pr-8 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700 appearance-none cursor-pointer"
            >
              {AI_MODELS[aiProvider].map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Token Budget & Context Manager */}
          <TokenPanelBoundary aiProvider={aiProvider} aiModel={aiModel} />
          {aiProvider === 'pollinations' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pollinations Auth Key</span>
                <a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-teal-600 hover:underline">Get Key</a>
              </div>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                <input type="password" value={pollinationsKey} onChange={e => setPollinationsKey(e.target.value)} placeholder="sk_..." className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <p className="text-[9px] font-bold text-slate-400">Optional — works without a key. Get one at <a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">enter.pollinations.ai</a> for higher limits.</p>
            </div>
          ) : aiProvider === 'openrouter' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">OpenRouter API Key</span>
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-teal-600 hover:underline">Get Free Key</a>
              </div>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                <input type="password" value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)} placeholder="sk-or-..." className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <p className="text-[9px] font-bold text-slate-400">Get a free account at <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">openrouter.ai</a>. Add credits to access paid models.</p>
            </div>
          ) : aiProvider === 'gemini' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gemini API Key</span>
                <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-teal-600 hover:underline">Get Key</a>
              </div>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..." className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700" />
              </div>
            </div>
          ) : aiProvider === 'siliconflow' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SiliconFlow API Key</span>
                <a href="https://cloud.siliconflow.com/account/ak" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-teal-600 hover:underline">Get Key</a>
              </div>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                <input
                  type="password"
                  value={siliconflowKey}
                  onChange={e => setSiliconflowKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700"
                />
              </div>
              <p className="text-[9px] font-bold text-slate-400 leading-tight">
                Get a key at <a href="https://cloud.siliconflow.com/account/ak" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">cloud.siliconflow.com</a>. Affordable pay-per-use access to top open-source models including DeepSeek, Qwen3, Kimi and MiniMax.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Groq API Key</span>
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-teal-600 hover:underline">Get Key</a>
              </div>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
                <input type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder="gsk_..." className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <p className="text-[9px] font-bold text-slate-400">Free tier available at console.groq.com</p>
            </div>
          )}
        </div>

        {useOpenWeather && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                OpenWeather API Key
              </label>
              <a 
                href="https://home.openweathermap.org/api_keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[9px] font-black text-teal-600 uppercase hover:underline"
              >
                Get Key
              </a>
            </div>
            <div className="relative group">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
              <input
                type="password"
                value={openWeatherKey}
                onChange={(e) => setOpenWeatherKey(e.target.value)}
                placeholder="Enter OpenWeather Key"
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700"
              />
            </div>
            <p className="text-[9px] font-bold text-slate-400 leading-tight">
              Required when OpenWeather API is active. Stored locally.
            </p>
          </div>
        )}

        <button
          onClick={() => { onFetchWeather(); onClose?.(); }}
          disabled={!location || isLoading}
          className={`w-full py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all flex justify-center items-center gap-3
            ${!location || isLoading 
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
              : 'bg-slate-900 dark:bg-teal-600 text-white hover:bg-teal-600 dark:hover:bg-teal-500 shadow-xl shadow-slate-200 dark:shadow-teal-900/30 active:scale-95'}
          `}
        >
          {isLoading ? (
             <>
               <Loader2 className="w-4 h-4 animate-spin"/>
               Connecting...
             </>
          ) : (hasWeatherData ? 'Refresh Weather' : 'Get Weather')}
        </button>
      </div>

      <div className="mt-auto pt-10 border-t border-slate-100 dark:border-slate-700/50">
        <div className="flex items-center gap-3 justify-center text-slate-300">
           <Zap className="w-4 h-4" />
           <p className="text-[10px] font-black tracking-widest uppercase">BioSentinel v2.5</p>
        </div>
      </div>
    </div>
  );
};