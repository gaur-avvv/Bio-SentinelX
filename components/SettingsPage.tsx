import React, { useState, useEffect, Component, ReactNode } from 'react';
import {
  Settings, MapPin, Key, CheckCircle2, Crosshair, Zap, ShieldCheck, Loader2,
  Server, Wifi, WifiOff, ChevronDown, Brain, Sun, Sunset, Moon, Palette, Wand2,
  RefreshCw, Globe, Cpu, Lock, Info, Bell, BellRing, Clock, CloudRain, Wind,
  AlertTriangle, Bot, Activity, Biohazard, Mail, MailCheck, Send, Database,
} from 'lucide-react';
import { LoadingState, AiProvider, AI_MODELS, NotificationSettings, ForecastUpdatePeriod, DEFAULT_NOTIFICATION_SETTINGS, EmailAlertSettings, DatabaseSettings, McpSettings } from '../types';
import { geocodeLocation } from '../services/weatherService';
import { checkBioSentinelHealth } from '../services/mlService';
import { sendTestEmail } from '../services/forecastEmailService';
import { TokenBudgetPanel } from './TokenBudgetPanel';
import { useTheme } from '../contexts/ThemeContext';

/** Error boundary for TokenBudgetPanel */
class TokenPanelBoundary extends Component<{ aiProvider: AiProvider; aiModel: string }, { failed: boolean }> {
  constructor(props: { aiProvider: AiProvider; aiModel: string }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(e: Error) { console.warn('[TokenBudgetPanel] error:', e?.message); }
  render() {
    if (this.state.failed) return null;
    return <TokenBudgetPanel aiProvider={this.props.aiProvider} aiModel={this.props.aiModel} />;
  }
}

export interface SettingsPageProps {
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
  huggingFaceKey: string;
  setHuggingFaceKey: (key: string) => void;
  openrouterKey: string;
  setOpenrouterKey: (key: string) => void;
  siliconflowKey: string;
  setSiliconflowKey: (key: string) => void;
  cerebrasKey: string;
  setCerebrasKey: (key: string) => void;
  ollamaEndpoint: string;
  setOllamaEndpoint: (endpoint: string) => void;
  aiProvider: AiProvider;
  setAiProvider: (p: AiProvider) => void;
  aiModel: string;
  setAiModel: (m: string) => void;
  useOpenWeather: boolean;
  setUseOpenWeather: (use: boolean) => void;
  openWeatherKey: string;
  setOpenWeatherKey: (key: string) => void;
  bioSentinelApiUrl: string;
  setBioSentinelApiUrl: (url: string) => void;
  mlApiKey: string;
  setMlApiKey: (key: string) => void;
  surveillanceApiUrl: string;
  setSurveillanceApiUrl: (url: string) => void;
  surveillanceApiKey: string;
  setSurveillanceApiKey: (key: string) => void;
  databaseSettings: DatabaseSettings;
  setDatabaseSettings: (patch: Partial<DatabaseSettings>) => void;
  floodMlApiUrl: string;
  setFloodMlApiUrl: (url: string) => void;
  mcpSettings: McpSettings;
  setMcpSettings: (patch: Partial<McpSettings>) => void;
  mapplsToken: string;
  setMapplsToken: (key: string) => void;
  mapProvider: 'mappls' | 'maptiler' | 'mapbox' | 'osm' | 'arcgis';
  setMapProvider: (p: 'mappls' | 'maptiler' | 'mapbox' | 'osm' | 'arcgis') => void;
  mapTilerKey: string;
  setMapTilerKey: (key: string) => void;
  mapboxToken: string;
  setMapboxToken: (key: string) => void;
  arcGisKey: string;
  setArcGisKey: (key: string) => void;
  notificationSettings: NotificationSettings;
  setNotificationSettings: (s: NotificationSettings) => void;
  emailAlertSettings: EmailAlertSettings;
  setEmailAlertSettings: (patch: Partial<EmailAlertSettings>) => void;
  weather?: import('../types').WeatherData | null;
}

/* ─── Collapsible Section Card ─────────────────────────────────────────────── */
const Card: React.FC<{
  icon: React.ReactNode; title: string; subtitle?: string; badge?: string;
  children: ReactNode; accent?: string; defaultOpen?: boolean;
}> = ({ icon, title, subtitle, badge, children, accent = 'teal', defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-white dark:bg-slate-900 border rounded-3xl shadow-sm overflow-hidden transition-all duration-200 ${open ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800'
      }`}>
      {/* ── Clickable header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors group ${open ? 'bg-slate-50 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
      >
        <div className={`p-2.5 rounded-2xl flex-shrink-0 transition-colors ${open
          ? `bg-${accent}-100 dark:bg-${accent}-900/50 text-${accent}-600 dark:text-${accent}-400`
          : `bg-${accent}-50 dark:bg-${accent}-950/40 text-${accent}-500 dark:text-${accent}-500`
          }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{title}</h3>
          {subtitle && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest bg-${accent}-100 dark:bg-${accent}-900/50 text-${accent}-600 dark:text-${accent}-400 flex-shrink-0`}>
            {badge}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* ── Collapsible body ── */}
      <div className={`transition-all duration-200 ease-in-out overflow-hidden ${open ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}>
        <div className="px-5 pb-5 pt-4 space-y-5 border-t border-slate-100 dark:border-slate-800">
          {children}
        </div>
      </div>
    </div>
  );
};

/* ─── Key input row ────────────────────────────────────────────────────────── */
const KeyInput: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; getKeyUrl?: string; note?: string;
}> = ({ label, value, onChange, placeholder, getKeyUrl, note }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      {getKeyUrl && (
        <a href={getKeyUrl} target="_blank" rel="noopener noreferrer"
          className="text-[9px] font-black text-teal-600 hover:underline">Get Key</a>
      )}
    </div>
    <div className="relative group">
      <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
      <input
        type="password" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700 transition-all"
      />
    </div>
    {note && <p className="text-[9px] font-bold text-slate-400 leading-relaxed">{note}</p>}
  </div>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({
  location, setLocation, onFetchWeather, loadingState, hasWeatherData, detectedCity,
  geminiKey, setGeminiKey, groqKey, setGroqKey, pollinationsKey, setPollinationsKey,
  huggingFaceKey, setHuggingFaceKey,
  openrouterKey, setOpenrouterKey, siliconflowKey, setSiliconflowKey, cerebrasKey, setCerebrasKey,
  ollamaEndpoint, setOllamaEndpoint,
  aiProvider, setAiProvider, aiModel, setAiModel,
  useOpenWeather, setUseOpenWeather, openWeatherKey, setOpenWeatherKey,
  bioSentinelApiUrl, setBioSentinelApiUrl,
  mlApiKey, setMlApiKey, mapplsToken, setMapplsToken,
  surveillanceApiUrl, setSurveillanceApiUrl,
  surveillanceApiKey, setSurveillanceApiKey,
  floodMlApiUrl, setFloodMlApiUrl,
  databaseSettings, setDatabaseSettings,
  mcpSettings, setMcpSettings,
  mapProvider, setMapProvider, mapTilerKey, setMapTilerKey,
  mapboxToken, setMapboxToken,
  arcGisKey, setArcGisKey,
  notificationSettings, setNotificationSettings,
  emailAlertSettings, setEmailAlertSettings, weather,
}) => {
  const [emailTestStatus, setEmailTestStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [emailTestMsg, setEmailTestMsg] = useState('');
  const isLoading = loadingState === LoadingState.LOADING_WEATHER;
  const [isLocating, setIsLocating] = useState(false);
  const [resolvedPreview, setResolvedPreview] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [showCustomColors, setShowCustomColors] = useState(false);

  const {
    appMode, setAppMode, systemPreference,
    weatherCardMode, setWeatherCardMode, weatherThemeLocked, setWeatherThemeLocked,
    customColors, setCustomColors, useCustomColors, setUseCustomColors, autoWeatherTheme,
  } = useTheme();

  const normalizedMlApiBaseUrl = bioSentinelApiUrl.trim().replace(/\/+$/, '');
  const normalizedSurveillanceApiBaseUrl = surveillanceApiUrl.trim().replace(/\/+$/, '');
  const mlOpenApiUrl = normalizedMlApiBaseUrl ? `${normalizedMlApiBaseUrl}/openapi.json` : '';

  /* ── API health check ──────────────────────────────────────────────────── */
  useEffect(() => {
    const check = async () => {
      setApiStatus('checking');
      setApiStatus((await checkBioSentinelHealth()) ? 'online' : 'offline');
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, []);

  /* ── Debounced geocode preview ─────────────────────────────────────────── */
  useEffect(() => {
    if (!location || location.length < 2) { setResolvedPreview(null); return; }
    const t = setTimeout(async () => {
      setIsGeocoding(true);
      setResolvedPreview(await geocodeLocation(location));
      setIsGeocoding(false);
    }, 800);
    return () => clearTimeout(t);
  }, [location]);

  const handleGPS = () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
        setIsLocating(false);
      },
      () => { alert('Unable to retrieve location.'); setIsLocating(false); }
    );
  };

  const themeBtn = (active: boolean, activeClass: string, idleClass: string) =>
    `flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${active ? activeClass : idleClass}`;
  const idleTheme = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700';

  return (
    <div className="max-w-5xl mx-auto w-full py-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-slate-900 dark:bg-slate-800 rounded-2xl shadow-lg">
          <Settings className="w-6 h-6 text-teal-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Settings</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bio-SentinelX Configuration</p>
        </div>
      </div>

      {/* ── Accordion list ───────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto w-full space-y-3">

        {/* 1. Location ────────────────────────────────────────────── */}
        <Card icon={<MapPin className="w-5 h-5" />} title="Location" subtitle="Weather station"
          badge={location ? location.slice(0, 18) + (location.length > 18 ? '…' : '') : undefined}
          defaultOpen={true}>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 group">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
              <input
                type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="City or Coordinates"
                className="w-full pl-10 pr-3 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-sm font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700 transition-all"
              />
            </div>
            <button onClick={handleGPS} disabled={isLocating}
              className="px-3.5 py-3 bg-slate-900 dark:bg-slate-700 text-teal-400 rounded-2xl hover:bg-teal-600 hover:text-white transition-all disabled:opacity-50 active:scale-95">
              <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {(isGeocoding || resolvedPreview) && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
              <div className="flex items-center gap-2 mb-1">
                {isGeocoding ? <Loader2 className="w-3 h-3 text-teal-500 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-teal-500" />}
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resolution Check</span>
              </div>
              {isGeocoding ? (
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Locating…</p>
              ) : resolvedPreview ? (() => {
                const commaIdx = resolvedPreview.indexOf(',');
                const mainCity = commaIdx !== -1 ? resolvedPreview.slice(0, commaIdx).trim() : resolvedPreview;
                const rest = commaIdx !== -1 ? resolvedPreview.slice(commaIdx + 1).trim() : null;
                return (
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-white leading-tight">{mainCity}</p>
                    {rest && <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">{rest}</p>}
                  </div>
                );
              })() : null}
            </div>
          )}
          {hasWeatherData && detectedCity && !resolvedPreview && (
            <div className="flex items-center gap-2 p-2.5 bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-800 rounded-xl">
              <Info className="w-3 h-3 text-teal-500 flex-shrink-0" />
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                Syncing with <span className="text-teal-600 font-black">{detectedCity}</span>
              </p>
            </div>
          )}
          <button
            onClick={onFetchWeather} disabled={!location || isLoading}
            className={`w-full py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all ${!location || isLoading
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              : 'bg-slate-900 dark:bg-teal-600 text-white hover:bg-teal-600 dark:hover:bg-teal-500 shadow-lg active:scale-95'
              }`}>
            {isLoading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> {hasWeatherData ? 'Refresh Weather' : 'Get Weather'}</>}
          </button>
        </Card>

        {/* 2. App Theme ───────────────────────────────────────────────── */}
        <Card icon={<Palette className="w-5 h-5" />} title="Appearance" subtitle="Theme & colours"
          badge={appMode === 'auto' ? 'Auto' : appMode === 'dark' ? 'Dark' : 'Light'}
          accent="indigo">
          {/* App theme row */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">App Theme</p>
              {appMode === 'auto' && (
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 uppercase tracking-widest">
                  {systemPreference === 'dark' ? '🌙 System Dark' : '☀️ System Light'}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setAppMode('auto')}
                className={themeBtn(appMode === 'auto', 'bg-teal-500 text-white shadow-lg shadow-teal-400/30 scale-105', idleTheme)}>
                <Wand2 className="w-3 h-3" />Auto
              </button>
              <button onClick={() => setAppMode('light')}
                className={themeBtn(appMode === 'light', 'bg-amber-400 text-white shadow-lg shadow-amber-300/30 scale-105', idleTheme)}>
                <Sun className="w-3 h-3" />Light
              </button>
              <button onClick={() => setAppMode('dark')}
                className={themeBtn(appMode === 'dark', 'bg-slate-800 text-blue-300 shadow-lg shadow-slate-700/30 scale-105', idleTheme)}>
                <Moon className="w-3 h-3" />Dark
              </button>
            </div>
          </div>

          {/* Weather card row */}
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Weather Card</p>
            <div className="flex gap-1.5">
              <button onClick={() => { setWeatherThemeLocked(false); setWeatherCardMode(autoWeatherTheme(new Date().getHours())); }}
                className={themeBtn(!weatherThemeLocked, 'bg-teal-500 text-white shadow-md shadow-teal-300/30 scale-105', idleTheme)}>
                <Wand2 className="w-3 h-3" />Auto
              </button>
              <button onClick={() => { setWeatherCardMode('light'); setWeatherThemeLocked(true); }}
                className={themeBtn(weatherThemeLocked && weatherCardMode === 'light', 'bg-amber-400 text-white shadow-md scale-105', idleTheme)}>
                <Sun className="w-3 h-3" />Day
              </button>
              <button onClick={() => { setWeatherCardMode('partial-dark'); setWeatherThemeLocked(true); }}
                className={themeBtn(weatherThemeLocked && weatherCardMode === 'partial-dark', 'bg-indigo-500 text-white shadow-md scale-105', idleTheme)}>
                <Sunset className="w-3 h-3" />Dusk
              </button>
              <button onClick={() => { setWeatherCardMode('full-dark'); setWeatherThemeLocked(true); }}
                className={themeBtn(weatherThemeLocked && weatherCardMode === 'full-dark', 'bg-blue-800 text-blue-200 shadow-md scale-105', idleTheme)}>
                <Moon className="w-3 h-3" />Night
              </button>
            </div>
          </div>

          {/* Custom colours */}
          <button
            onClick={() => setShowCustomColors(v => !v)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${useCustomColors
              ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300'
              : 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
              }`}>
            <div className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" /> Custom Colours
            </div>
            <div className="flex items-center gap-1.5">
              {useCustomColors && <span className="w-2.5 h-2.5 rounded-full border border-purple-300" style={{ background: customColors.accent }} />}
              <ChevronDown className={`w-3 h-3 transition-transform ${showCustomColors ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {showCustomColors && (
            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div className={`w-8 h-4 rounded-full relative transition-colors ${useCustomColors ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${useCustomColors ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  <input type="checkbox" checked={useCustomColors} onChange={e => setUseCustomColors(e.target.checked)} className="sr-only" />
                </div>
                <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Enable custom colours</span>
              </label>

              <div className="grid grid-cols-3 gap-3">
                {(['accent', 'surface', 'text'] as const).map(key => (
                  <div key={key} className="flex flex-col items-center gap-1.5">
                    <div className="relative w-10 h-10">
                      <input type="color" value={customColors[key]}
                        onChange={e => setCustomColors({ ...customColors, [key]: e.target.value })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer rounded-xl" />
                      <div className="w-10 h-10 rounded-xl border-2 border-slate-200 dark:border-slate-600" style={{ background: customColors[key] }} />
                    </div>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{key}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Presets</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { name: 'Teal', accent: '#14b8a6', surface: '#f0fdfa', text: '#0f172a' },
                    { name: 'Violet', accent: '#7c3aed', surface: '#f5f3ff', text: '#1e1b4b' },
                    { name: 'Rose', accent: '#e11d48', surface: '#fff1f2', text: '#1c0a0e' },
                    { name: 'Amber', accent: '#d97706', surface: '#fffbeb', text: '#1c1100' },
                    { name: 'Ocean', accent: '#0284c7', surface: '#f0f9ff', text: '#082f49' },
                    { name: 'Emerald', accent: '#10b981', surface: '#ecfdf5', text: '#064e3b' },
                    { name: 'Lime', accent: '#84cc16', surface: '#f7fee7', text: '#1a2e05' },
                    { name: 'Slate', accent: '#334155', surface: '#f8fafc', text: '#0f172a' },
                    { name: 'Crimson', accent: '#dc2626', surface: '#fef2f2', text: '#450a0a' },
                    { name: 'Sky', accent: '#0ea5e9', surface: '#f0f9ff', text: '#082f49' },
                    { name: 'Cyan', accent: '#06b6d4', surface: '#ecfeff', text: '#083344' },
                    { name: 'Indigo', accent: '#4f46e5', surface: '#eef2ff', text: '#1e1b4b' },
                    { name: 'Fuchsia', accent: '#c026d3', surface: '#fdf4ff', text: '#4a044e' },
                    { name: 'Orange', accent: '#f97316', surface: '#fff7ed', text: '#431407' },
                    { name: 'Stone', accent: '#78716c', surface: '#fafaf9', text: '#1c1917' },
                    { name: 'Graphite', accent: '#0f172a', surface: '#ffffff', text: '#0f172a' },
                    { name: 'Midnight', accent: '#22c55e', surface: '#0b1220', text: '#e2e8f0' },
                    { name: 'Dark', accent: '#6366f1', surface: '#0f172a', text: '#e2e8f0' },
                  ].map(p => (
                    <button key={p.name}
                      onClick={() => { setCustomColors({ accent: p.accent, surface: p.surface, text: p.text }); setUseCustomColors(true); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wide bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.accent }} />{p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* 3. System Integration ───────────────────────────────────────── */}
        <Card icon={<Activity className="w-5 h-5" />} title="System Integration" subtitle="Backend engines & hub consensus"
          badge={apiStatus === 'online' ? 'All Systems Go' : 'Offline Mode'}
          accent="blue"
          defaultOpen={true}>

          <div className="space-y-4">
            {/* 1. Disease Risk Hub */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-blue-500" /> Disease Risk Hub
                </p>
                <div className="flex gap-1.5">
                  <button onClick={() => setBioSentinelApiUrl('https://web-production-f898c8.up.railway.app')}
                    className="text-[8px] font-black px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 uppercase tracking-widest hover:bg-violet-200 transition-colors">Railway</button>
                  <button onClick={() => setBioSentinelApiUrl('http://localhost:8000')}
                    className="text-[8px] font-black px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hover:bg-emerald-200 transition-colors">Local</button>
                </div>
              </div>
              <div className="relative group">
                <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="url" value={bioSentinelApiUrl} onChange={e => setBioSentinelApiUrl(e.target.value)}
                  placeholder="https://disease-api.railway.app"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-500 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* 2. Surveillance Hub */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Biohazard className="w-3.5 h-3.5 text-rose-500" /> Surveillance Hub
                </p>
                <div className="flex gap-1.5">
                  <button onClick={() => setSurveillanceApiUrl('https://web-production-37f41.up.railway.app')}
                    className="text-[8px] font-black px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 uppercase tracking-widest hover:bg-violet-200 transition-colors">Railway</button>
                  <button onClick={() => setSurveillanceApiUrl('http://localhost:8000')}
                    className="text-[8px] font-black px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hover:bg-emerald-200 transition-colors">Local</button>
                </div>
              </div>
              <div className="relative group">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="url" value={surveillanceApiUrl} onChange={e => setSurveillanceApiUrl(e.target.value)}
                  placeholder="https://surveillance-api.railway.app"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-500 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* 3. Flood Engine */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-sky-500" /> Flood Risk Engine
                </p>
                <div className="flex gap-1.5">
                  <button onClick={() => setFloodMlApiUrl('https://web-production-24253.up.railway.app')}
                    className="text-[8px] font-black px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 uppercase tracking-widest hover:bg-violet-200 transition-colors">Railway</button>
                  <button onClick={() => setFloodMlApiUrl('http://localhost:8000')}
                    className="text-[8px] font-black px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hover:bg-emerald-200 transition-colors">Local</button>
                </div>
              </div>
              <div className="relative group">
                <Zap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="url" value={floodMlApiUrl} onChange={e => setFloodMlApiUrl(e.target.value)}
                  placeholder="https://flood-api.railway.app"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-500 transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <KeyInput
              label="System-Wide API Key (optional)"
              value={mlApiKey}
              onChange={setMlApiKey}
              placeholder="sk-bs-..."
              note="Applies to Disease Prediction and Flood Hubs. Surveillance Key managed separately if required."
            />
          </div>
        </Card>

        {/* 4. Database Configuration ─────────────────────────────────── */}
        <Card icon={<Database className="w-5 h-5" />} title="Database Configuration" subtitle="Symptom surveillance storage"
          badge={databaseSettings.preferredDb.toUpperCase()}
          accent="cyan">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preferred Backend</span>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                {(['none', 'supabase', 'firebase'] as const).map(db => (
                  <button
                    key={db}
                    onClick={() => setDatabaseSettings({ preferredDb: db })}
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${databaseSettings.preferredDb === db
                      ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                  >
                    {db}
                  </button>
                ))}
              </div>
              <p className="text-[9px] font-bold text-slate-400">If the preferred provider fails, Bio-SentinelX automatically attempts the other configured provider.</p>
            </div>

            <div className="space-y-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Supabase</p>
              <input
                type="url"
                value={databaseSettings.supabaseUrl}
                onChange={e => setDatabaseSettings({ supabaseUrl: e.target.value })}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-700 dark:text-slate-200 placeholder-slate-300 focus:border-cyan-500"
              />
              <input
                type="password"
                value={databaseSettings.supabaseAnonKey}
                onChange={e => setDatabaseSettings({ supabaseAnonKey: e.target.value })}
                placeholder="Supabase anon key"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-700 dark:text-slate-200 placeholder-slate-300 focus:border-cyan-500"
              />
            </div>

            <div className="space-y-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Firebase</p>
              <textarea
                value={databaseSettings.firebaseConfigJson}
                onChange={e => setDatabaseSettings({ firebaseConfigJson: e.target.value })}
                placeholder='Paste Firebase config JSON or RTDB URL (databaseURL)'
                rows={3}
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-700 dark:text-slate-200 placeholder-slate-300 focus:border-cyan-500 resize-none"
              />
              <input
                type="password"
                value={databaseSettings.firebaseApiKey}
                onChange={e => setDatabaseSettings({ firebaseApiKey: e.target.value })}
                placeholder="Firebase Web API Key (optional)"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-700 dark:text-slate-200 placeholder-slate-300 focus:border-cyan-500"
              />
            </div>
          </div>
        </Card>

        {/* 5. Weather Data Source ────────────────────────────────────── */}
        <Card icon={<Globe className="w-5 h-5" />} title="Weather Source" subtitle="Data provider"
          badge={useOpenWeather ? 'OpenWeather' : 'Open-Meteo'}
          accent="sky">
          <div className="space-y-4">
            {/* Toggle */}
            <div className={`p-4 rounded-2xl border transition-all ${useOpenWeather
              ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/50'
              : 'bg-teal-50 dark:bg-teal-950/30 border-teal-100 dark:border-teal-800/50'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${useOpenWeather ? 'text-sky-600 dark:text-sky-400' : 'text-teal-600 dark:text-teal-400'}`} />
                  <span className={`text-xs font-black uppercase tracking-tight ${useOpenWeather ? 'text-sky-800 dark:text-sky-300' : 'text-teal-800 dark:text-teal-300'}`}>
                    {useOpenWeather ? 'OpenWeather API' : 'Open-Meteo (Free)'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={useOpenWeather} onChange={e => setUseOpenWeather(e.target.checked)} />
                  <div className={`w-9 h-5 rounded-full transition-colors ${useOpenWeather ? 'bg-sky-500' : 'bg-teal-400'} relative after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${useOpenWeather ? 'after:translate-x-4' : 'after:translate-x-0'}`} />
                </label>
              </div>
              <p className={`text-[10px] font-bold leading-relaxed ${useOpenWeather ? 'text-sky-700 dark:text-sky-400' : 'text-teal-700 dark:text-teal-400'}`}>
                {useOpenWeather
                  ? 'OpenWeather provides reliable worldwide data. Requires a free API key.'
                  : 'Open-Meteo is free with no key required. High-accuracy hourly forecasts.'}
              </p>
            </div>

            {/* OpenWeather key (conditional) */}
            {useOpenWeather && (
              <div className="animate-fade-in">
                <KeyInput
                  label="OpenWeather API Key"
                  value={openWeatherKey}
                  onChange={setOpenWeatherKey}
                  placeholder="Enter OpenWeather key…"
                  note="Required when OpenWeather is active. Stored locally in your browser."
                />
              </div>
            )}

            {/* Map Provider Selection */}
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Map Provider</span>
                <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl flex-wrap">
                  {(['arcgis', 'osm', 'mappls', 'maptiler', 'mapbox'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setMapProvider(p)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mapProvider === p
                        ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-300 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                      {p === 'arcgis' ? '🌏 ArcGIS' : p === 'osm' ? '🌍 Free' : p === 'mappls' ? 'Mappls' : p === 'maptiler' ? 'MapTiler' : 'Mapbox'}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Keys for maps */}
              <div className="space-y-3 animate-fade-in">
                {mapProvider === 'mappls' && (
                  <KeyInput label="Mappls Access Token" value={mapplsToken} onChange={setMapplsToken}
                    placeholder="Enter Mappls key/token…" getKeyUrl="https://www.mappls.com/api" />
                )}
                {mapProvider === 'maptiler' && (
                  <KeyInput label="MapTiler API Key" value={mapTilerKey} onChange={setMapTilerKey}
                    placeholder="Enter MapTiler key…" getKeyUrl="https://cloud.maptiler.com" />
                )}
                {mapProvider === 'mapbox' && (
                  <KeyInput label="Mapbox Public Token" value={mapboxToken} onChange={setMapboxToken}
                    placeholder="pk.ey..." getKeyUrl="https://account.mapbox.com" />
                )}
                {mapProvider === 'arcgis' && (
                  <KeyInput label="ArcGIS API Key" value={arcGisKey} onChange={setArcGisKey}
                    placeholder="AAPK..." getKeyUrl="https://developers.arcgis.com" />
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* 6. AI Model Configuration ─────────────────────────────────── */}
        <Card icon={<Cpu className="w-5 h-5" />} title="Brain Architecture" subtitle="LLM Engine settings"
          badge={AI_MODELS[aiProvider]?.find(m => m.value === aiModel)?.label || aiModel}
          accent="violet">
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              {(['gemini', 'groq', 'openrouter', 'siliconflow', 'huggingface', 'cerebras', 'ollama', 'pollinations'] as const).map(p => (
                <button key={p}
                  onClick={() => { setAiProvider(p); setAiModel(AI_MODELS[p][0].value); }}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${aiProvider === p
                    ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}>
                  {p}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Model Architecture</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {AI_MODELS[aiProvider]?.map(m => (
                  <button key={m.value}
                    onClick={() => setAiModel(m.value)}
                    className={`px-3 py-2.5 rounded-xl border text-left transition-all ${aiModel === m.value
                      ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700 ring-1 ring-violet-500/20'
                      : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}>
                    <div className="flex items-center justify-between gap-2 overflow-hidden">
                      <p className={`text-[10px] font-black uppercase truncate ${aiModel === m.value ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-300'}`}>{m.label}</p>
                      {aiModel === m.value && <CheckCircle2 className="w-3 h-3 text-violet-500 flex-shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <TokenPanelBoundary aiProvider={aiProvider} aiModel={aiModel} />

            {/* Provider specfic keys */}
            {aiProvider === 'gemini' && (
              <KeyInput label="Google Gemini API Key" value={geminiKey} onChange={setGeminiKey}
                placeholder="AIza..." getKeyUrl="https://ai.google.dev"
                note="Required for Gemini models. Supports Pro, Flash, and Experimental versions." />
            )}
            {aiProvider === 'groq' && (
              <KeyInput label="Groq API Key" value={groqKey} onChange={setGroqKey}
                placeholder="gsk_..." getKeyUrl="https://console.groq.com/keys"
                note="Ultra-low latency inference for Llama 3, Mixtral, and Gemma models." />
            )}
            {aiProvider === 'openrouter' && (
              <KeyInput label="OpenRouter API Key" value={openrouterKey} onChange={setOpenrouterKey}
                placeholder="sk-or-..." getKeyUrl="https://openrouter.ai/keys"
                note="Access hundreds of models through a single API. Ideal for GPT-4 and Claude 3." />
            )}
            {aiProvider === 'siliconflow' && (
              <KeyInput label="SiliconFlow API Key" value={siliconflowKey} onChange={setSiliconflowKey}
                placeholder="sk-..." getKeyUrl="https://cloud.siliconflow.com"
                note="Specialized for DeepSeek and high-throughput Chinese models." />
            )}
            {aiProvider === 'huggingface' && (
              <KeyInput label="Hugging Face Token" value={huggingFaceKey} onChange={setHuggingFaceKey}
                placeholder="hf_..." getKeyUrl="https://huggingface.co/settings/tokens"
                note="Access thousands of public and private models on the Hub." />
            )}
            {aiProvider === 'cerebras' && (
              <KeyInput label="Cerebras API Key" value={cerebrasKey} onChange={setCerebrasKey}
                placeholder="csk-..." getKeyUrl="https://cloud.cerebras.ai"
                note="Get a free API key at cloud.cerebras.ai. World's fastest inference — ~3000 tok/s with GPT OSS 120B." />
            )}
            {aiProvider === 'ollama' && (
              <KeyInput label="Ollama Endpoint" value={ollamaEndpoint} onChange={setOllamaEndpoint}
                placeholder="http://localhost:11434" getKeyUrl="https://ollama.com"
                note="Local inference — no API key needed. Install Ollama and pull models (e.g. ollama pull qwen2.5:1.5b) to get started." />
            )}

            {/* Always show all keys section (collapsed/separated) */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-200 list-none select-none">
                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                All Provider Keys
              </summary>
              <div className="pt-3 space-y-3">
                <KeyInput label="Hugging Face" value={huggingFaceKey} onChange={setHuggingFaceKey} placeholder="hf_..." getKeyUrl="https://huggingface.co/settings/tokens" />
                <KeyInput label="Gemini" value={geminiKey} onChange={setGeminiKey} placeholder="AIza…" getKeyUrl="https://ai.google.dev/gemini-api/docs/api-key" />
                <KeyInput label="Groq" value={groqKey} onChange={setGroqKey} placeholder="gsk_…" getKeyUrl="https://console.groq.com/keys" />
                <KeyInput label="Pollinations" value={pollinationsKey} onChange={setPollinationsKey} placeholder="sk_…" getKeyUrl="https://enter.pollinations.ai" />
                <KeyInput label="OpenRouter" value={openrouterKey} onChange={setOpenrouterKey} placeholder="sk-or-…" getKeyUrl="https://openrouter.ai/keys" />
                <KeyInput label="SiliconFlow" value={siliconflowKey} onChange={setSiliconflowKey} placeholder="sk-…" getKeyUrl="https://cloud.siliconflow.com/account/ak" />
                <KeyInput label="Cerebras" value={cerebrasKey} onChange={setCerebrasKey} placeholder="csk-…" getKeyUrl="https://cloud.cerebras.ai" />
                <KeyInput label="Ollama Endpoint" value={ollamaEndpoint} onChange={setOllamaEndpoint} placeholder="http://localhost:11434" getKeyUrl="https://ollama.com" />
              </div>
            </details>
          </div>
        </Card>

        {/* 9. Notifications & Alerts ───────────────────────────────── */}
        <Card icon={<Cpu className="w-5 h-5" />} title="MCP Orchestration" subtitle="Tool guardrails and budgets"
          badge={mcpSettings.enabled ? 'Enabled' : 'Disabled'}
          accent="indigo">
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 rounded-2xl border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-800/50">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Enable MCP Runtime</p>
                <p className="text-[8px] font-bold text-slate-400">When enabled, Deep Analysis can invoke MCP tools with guardrails.</p>
              </div>
              <input
                type="checkbox"
                checked={mcpSettings.enabled}
                onChange={(e) => setMcpSettings({ enabled: e.target.checked })}
                className="h-4 w-4"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Default Timeout (ms)</p>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={mcpSettings.defaultTimeoutMs}
                  onChange={(e) => setMcpSettings({ defaultTimeoutMs: Math.max(1000, Number(e.target.value) || 1000) })}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold"
                />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Default Retries</p>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={mcpSettings.defaultRetryCount}
                  onChange={(e) => setMcpSettings({ defaultRetryCount: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold"
                />
              </div>
            </div>

            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tool Allowlist (comma-separated)</p>
              <input
                type="text"
                value={mcpSettings.allowlistedTools.join(', ')}
                onChange={(e) => setMcpSettings({ allowlistedTools: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                placeholder="outbreak_sweep, kg_expand, protocol_draft"
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold"
              />
            </div>
          </div>
        </Card>

        {/* 8. Notifications & Alerts ───────────────────────────────── */}
        <Card icon={<BellRing className="w-5 h-5" />} title="Notifications" subtitle="Alerts & forecast schedule"
          badge={`${Object.values(notificationSettings.alerts).filter(Boolean).length}/7 on`}
          accent="amber">
          <div className="space-y-5">

            {/* ─── Forecast Update Period ────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Forecast Update Period</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { label: '15 min', value: 15 },
                  { label: '30 min', value: 30 },
                  { label: '1 hr', value: 60 },
                  { label: '3 hr', value: 180 },
                  { label: '6 hr', value: 360 },
                  { label: '12 hr', value: 720 },
                ] as { label: string; value: ForecastUpdatePeriod }[]).map(opt => (
                  <button key={opt.value}
                    onClick={() => setNotificationSettings({ ...notificationSettings, forecastUpdatePeriodMinutes: opt.value })}
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${notificationSettings.forecastUpdatePeriodMinutes === opt.value
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-300/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600'
                      }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ─── Alert Mode ────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-3.5 h-3.5 text-violet-500" />
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Alert Intelligence Mode</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setNotificationSettings({ ...notificationSettings, alertMode: 'ai' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${notificationSettings.alertMode === 'ai'
                    ? 'bg-violet-500 text-white shadow-lg shadow-violet-300/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-violet-50 dark:hover:bg-violet-900/30'
                    }`}>
                  <Bot className="w-3 h-3" />AI-Powered
                </button>
                <button
                  onClick={() => setNotificationSettings({ ...notificationSettings, alertMode: 'normal' })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${notificationSettings.alertMode === 'normal'
                    ? 'bg-slate-800 text-white shadow-lg'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}>
                  <Bell className="w-3 h-3" />Standard
                </button>
              </div>
              <p className="mt-1.5 text-[9px] font-bold text-slate-400 leading-relaxed">
                {notificationSettings.alertMode === 'ai'
                  ? 'AI enriches alert headings with dynamic, context-aware messaging.'
                  : 'Standard alerts use predefined template messages.'}
              </p>
            </div>

            {/* ─── Alert Toggles ─────────────────────────────────────── */}
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Alert Types</p>
              {([
                {
                  key: 'dailyWeatherForecast' as const,
                  icon: <Sun className="w-3.5 h-3.5" />,
                  label: 'Daily Weather Forecast',
                  desc: 'Morning, afternoon & evening briefings',
                  color: 'amber',
                },
                {
                  key: 'tomorrowForecast' as const,
                  icon: <Sunset className="w-3.5 h-3.5" />,
                  label: "Tomorrow's Forecast",
                  desc: 'Preview of next day conditions',
                  color: 'orange',
                },
                {
                  key: 'diseaseOutbreak' as const,
                  icon: <Biohazard className="w-3.5 h-3.5" />,
                  label: 'Disease Outbreak Forecast',
                  desc: 'AI risk prediction for disease spread',
                  color: 'rose',
                },
                {
                  key: 'severeWeather' as const,
                  icon: <AlertTriangle className="w-3.5 h-3.5" />,
                  label: 'Severe Weather Alerts',
                  desc: 'Storms, heatwaves & critical warnings',
                  color: 'red',
                },
                {
                  key: 'rainAlerts' as const,
                  icon: <CloudRain className="w-3.5 h-3.5" />,
                  label: 'Rain & Precipitation',
                  desc: 'Rainfall, snow & flood risk alerts',
                  color: 'blue',
                },
                {
                  key: 'airQualityAlerts' as const,
                  icon: <Wind className="w-3.5 h-3.5" />,
                  label: 'Air Quality & Pollen',
                  desc: 'AQI, dust, pollen & pollution alerts',
                  color: 'teal',
                },
                {
                  key: 'aiBasedAlerts' as const,
                  icon: <Bot className="w-3.5 h-3.5" />,
                  label: 'AI-Based Smart Alerts',
                  desc: 'AI-generated health risk predictions',
                  color: 'violet',
                },
              ]).map(item => {
                const isOn = notificationSettings.alerts[item.key];
                return (
                  <label key={item.key} className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${isOn
                    ? `bg-${item.color}-50 dark:bg-${item.color}-950/30 border-${item.color}-100 dark:border-${item.color}-800/50`
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700'
                    }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-xl transition-colors ${isOn ? `bg-${item.color}-100 dark:bg-${item.color}-900/50 text-${item.color}-600 dark:text-${item.color}-400` : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                        }`}>
                        {item.icon}
                      </div>
                      <div>
                        <p className={`text-[10px] font-black uppercase tracking-wide ${isOn ? `text-${item.color}-800 dark:text-${item.color}-200` : 'text-slate-500 dark:text-slate-400'
                          }`}>{item.label}</p>
                        <p className="text-[8px] font-bold text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                    <div className="relative flex-shrink-0">
                      <input type="checkbox" className="sr-only"
                        checked={isOn}
                        onChange={e => setNotificationSettings({
                          ...notificationSettings,
                          alerts: { ...notificationSettings.alerts, [item.key]: e.target.checked },
                        })} />
                      <div className={`w-9 h-5 rounded-full transition-colors ${isOn ? `bg-${item.color}-500` : 'bg-slate-300 dark:bg-slate-600'
                        } relative after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${isOn ? 'after:translate-x-4' : 'after:translate-x-0'
                        }`} />
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Reset to defaults */}
            <button
              onClick={() => setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)}
              className="w-full py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-600 hover:border-amber-300 dark:hover:border-amber-700 transition-all">
              Reset to Defaults
            </button>
          </div>
        </Card>

        {/* 9. Email Early-Warning ─────────────────────────────────── */}
        <Card icon={<Mail className="w-5 h-5" />} title="Email Early-Warning" subtitle="Proactive severe weather alerts"
          badge={emailAlertSettings.enabled ? 'Active' : 'Off'}
          accent="rose">
          <div className="space-y-5">

            {/* Master toggle */}
            <label className="flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all
              bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-800/50">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-rose-800 dark:text-rose-200">Enable Email Alerts</p>
                  <p className="text-[8px] font-bold text-slate-400">Send email before severe weather arrives</p>
                </div>
              </div>
              <div className="relative flex-shrink-0">
                <input type="checkbox" className="sr-only" checked={emailAlertSettings.enabled}
                  onChange={e => setEmailAlertSettings({ enabled: e.target.checked })} />
                <div className={`w-9 h-5 rounded-full transition-colors ${emailAlertSettings.enabled ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-600'}
                  relative after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all
                  ${emailAlertSettings.enabled ? 'after:translate-x-4' : 'after:translate-x-0'}`} />
              </div>
            </label>

            {/* Recipient email */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Alert Destination Email</span>
                <a href="https://app.smtp.dev" target="_blank" rel="noopener noreferrer"
                  className="text-[9px] font-black text-rose-600 hover:underline">Get smtp.dev inbox ↗</a>
              </div>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-rose-500 transition-colors" />
                <input
                  type="email"
                  value={emailAlertSettings.recipientEmail}
                  onChange={e => setEmailAlertSettings({ recipientEmail: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-rose-500 focus:bg-white dark:focus:bg-slate-700 transition-all"
                />
              </div>
              <p className="text-[9px] font-bold text-slate-400 leading-relaxed">
                📧 Only used for severe weather alerts. No spam. No data sharing. Stored locally only.
              </p>
            </div>

            {/* EmailJS Configuration (Primary - works with any email) */}
            <div className="space-y-3 p-3 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-800 rounded-2xl">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-[9px] font-black text-cyan-700 dark:text-cyan-300 uppercase tracking-widest">Resend</span>
              </div>
              <input
                type="password"
                value={emailAlertSettings.resendApiKey}
                onChange={e => setEmailAlertSettings({ resendApiKey: e.target.value })}
                placeholder="Resend API key (re_...)"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-cyan-100 dark:border-cyan-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 focus:border-cyan-500 transition-all"
              />
              <input
                type="email"
                value={emailAlertSettings.resendFromEmail}
                onChange={e => setEmailAlertSettings({ resendFromEmail: e.target.value })}
                placeholder="Resend verified sender email"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-cyan-100 dark:border-cyan-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 focus:border-cyan-500 transition-all"
              />
            </div>

            <div className="space-y-3 p-3 bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-800 rounded-2xl">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-sky-500" />
                <span className="text-[9px] font-black text-sky-700 dark:text-sky-300 uppercase tracking-widest">SendGrid</span>
              </div>
              <input
                type="password"
                value={emailAlertSettings.sendGridApiKey}
                onChange={e => setEmailAlertSettings({ sendGridApiKey: e.target.value })}
                placeholder="SendGrid API key (SG....)"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-sky-100 dark:border-sky-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 focus:border-sky-500 transition-all"
              />
              <input
                type="email"
                value={emailAlertSettings.sendGridFromEmail}
                onChange={e => setEmailAlertSettings({ sendGridFromEmail: e.target.value })}
                placeholder="SendGrid verified sender email"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-sky-100 dark:border-sky-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 focus:border-sky-500 transition-all"
              />
            </div>

            <div className="space-y-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[9px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">EmailJS (Recommended)</span>
                <a href="https://www.emailjs.com/" target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-[8px] font-black text-indigo-500 hover:underline">Setup Guide</a>
              </div>
              <p className="text-[8px] font-bold text-slate-400">Free plan: 200 emails/month. Works with any email address (Gmail, Outlook, etc).</p>
              <input
                type="text"
                value={emailAlertSettings.emailJsPublicKey}
                onChange={e => setEmailAlertSettings({ emailJsPublicKey: e.target.value })}
                placeholder="Public Key (e.g. user_xxxxxxx)"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 focus:border-indigo-500 transition-all"
              />
              <input
                type="text"
                value={emailAlertSettings.emailJsServiceId}
                onChange={e => setEmailAlertSettings({ emailJsServiceId: e.target.value })}
                placeholder="Service ID (e.g. service_xxxxxxx)"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 focus:border-indigo-500 transition-all"
              />
              <input
                type="text"
                value={emailAlertSettings.emailJsTemplateId}
                onChange={e => setEmailAlertSettings({ emailJsTemplateId: e.target.value })}
                placeholder="Template ID (e.g. template_xxxxxxx)"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* smtp.dev API Key (Fallback) */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">smtp.dev API Key (Fallback)</span>
              <div className="relative group">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-rose-500 transition-colors" />
                <input
                  type="password"
                  value={emailAlertSettings.smtpDevApiKey}
                  onChange={e => setEmailAlertSettings({ smtpDevApiKey: e.target.value })}
                  placeholder="smtplabs_…"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-rose-500 focus:bg-white dark:focus:bg-slate-700 transition-all"
                />
              </div>
            </div>

            {/* Lead time */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-rose-500" />
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Alert Lead Time</p>
                <span className="ml-auto text-[9px] font-black text-rose-600">{emailAlertSettings.leadTimeHours}h ahead</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[3, 6, 12, 24, 48, 72].map(h => (
                  <button key={h}
                    onClick={() => setEmailAlertSettings({ leadTimeHours: h })}
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all ${emailAlertSettings.leadTimeHours === h
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-300/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-600'
                      }`}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Min severity threshold */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Min Risk Score to Email</p>
                <span className={`text-[9px] font-black ${emailAlertSettings.minSeverityScore >= 75 ? 'text-rose-600' :
                  emailAlertSettings.minSeverityScore >= 55 ? 'text-amber-600' : 'text-teal-600'
                  }`}>{emailAlertSettings.minSeverityScore}/100</span>
              </div>
              <input
                type="range" min={30} max={90} step={5}
                value={emailAlertSettings.minSeverityScore}
                onChange={e => setEmailAlertSettings({ minSeverityScore: Number(e.target.value) })}
                className="w-full accent-rose-500"
              />
              <div className="flex justify-between text-[8px] font-bold text-slate-300 mt-0.5">
                <span>Moderate (30)</span><span>High (60)</span><span>Critical (90)</span>
              </div>
            </div>

            {/* Critical-only toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`w-8 h-4 rounded-full relative transition-colors ${emailAlertSettings.onlyCritical ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${emailAlertSettings.onlyCritical ? 'translate-x-4' : 'translate-x-0.5'}`} />
                <input type="checkbox" checked={emailAlertSettings.onlyCritical}
                  onChange={e => setEmailAlertSettings({ onlyCritical: e.target.checked })} className="sr-only" />
              </div>
              <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Critical Events Only (score ≥ 75)
              </span>
            </label>

            {/* Sender info (if provisioned) */}
            {emailAlertSettings.senderEmail && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800 rounded-xl">
                <MailCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                  Sender: <span className="text-emerald-600 font-black">{emailAlertSettings.senderEmail}</span>
                </p>
              </div>
            )}

            {/* Test email button */}
            <button
              disabled={!emailAlertSettings.recipientEmail || emailTestStatus === 'loading'}
              onClick={async () => {
                setEmailTestStatus('loading');
                setEmailTestMsg('');
                const result = await sendTestEmail(
                  weather ?? null,
                  emailAlertSettings,
                  (patch) => setEmailAlertSettings(patch)
                );
                setEmailTestStatus(result.ok ? 'ok' : 'err');
                setEmailTestMsg(result.message);
                setTimeout(() => setEmailTestStatus('idle'), 6000);
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${!emailAlertSettings.recipientEmail
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : emailTestStatus === 'loading'
                  ? 'bg-rose-400 text-white cursor-wait'
                  : emailTestStatus === 'ok'
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-300/30'
                    : emailTestStatus === 'err'
                      ? 'bg-red-500 text-white'
                      : 'bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-200/40 active:scale-95'
                }`}>
              {emailTestStatus === 'loading' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                : emailTestStatus === 'ok' ? <><MailCheck className="w-3.5 h-3.5" /> Sent!</>
                  : emailTestStatus === 'err' ? <><AlertTriangle className="w-3.5 h-3.5" /> Failed</>
                    : <><Send className="w-3.5 h-3.5" /> Send Test Email</>}
            </button>
            {emailTestMsg && (
              <p className={`text-[9px] font-bold text-center ${emailTestStatus === 'ok' ? 'text-emerald-600' : 'text-red-500'
                }`}>{emailTestMsg}</p>
            )}

            <p className="text-[9px] font-bold text-slate-400 leading-relaxed text-center">
              Provider order: Resend → SendGrid → EmailJS → smtp.dev fallback.
              Configure at least one provider with a valid sender identity. See
              {' '}<a href="https://www.emailjs.com/docs/" target="_blank" rel="noopener noreferrer"
                className="text-rose-500 hover:underline">EmailJS docs</a> for setup instructions.
            </p>

          </div>
        </Card>

      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <Cpu className="w-4 h-4 text-slate-300" />
        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">BioSentinel v2.5 · All settings stored locally in your browser</p>
      </div>
    </div>
  );
};
