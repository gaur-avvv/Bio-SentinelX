import React, { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { SettingsPage } from './components/SettingsPage';
import { WeatherCard } from './components/WeatherCard';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { HistoricalAnalysis } from './components/HistoricalAnalysis';
import { FloodPrediction } from './components/FloodPrediction';
import { BioXAssistant } from './components/BioXAssistant';
import { ResearchLibrary } from './components/ResearchLibrary';
import { AlertNotificationPanel } from './components/AlertNotificationPanel';
import { WeatherData, LoadingState, AiProvider, AI_MODELS, HealthAlert, NotificationSettings, DEFAULT_NOTIFICATION_SETTINGS, ForecastUpdatePeriod, EmailAlertSettings, DEFAULT_EMAIL_ALERT_SETTINGS } from './types';
import { fetchWeatherData } from './services/weatherService';
import { setBioSentinelApiKey } from './services/mlService';
import {
  generateWeatherAlerts,
  generateSessionBriefing,
  requestNotificationPermission,
  sendBrowserNotification,
  shouldSendScheduledAlert,
  markScheduledAlertSent,
  getCurrentSession,
  recordUserDismiss,
  recordUserClearAll,
} from './services/alertService';
import { enrichAlertsWithAI } from './services/aiNotificationService';
import { buildAIUserContext, personalizeAlertsInPlace } from './services/personalizationService';
import { checkAndSendForecastEmails } from './services/forecastEmailService';
import { AlertTriangle, XCircle, MapPin, Crosshair, RefreshCw, Settings, Loader2 } from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { DataCacheProvider } from './contexts/DataCacheContext';

// ── Global Error Boundary ────────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string; }
export class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error?.message || String(error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BioSentinel] Uncaught render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="max-w-lg w-full bg-white border border-rose-100 rounded-3xl p-8 shadow-xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-rose-500 rounded-2xl"><AlertTriangle className="w-6 h-6 text-white" /></div>
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-wider">BioSentinel Crashed</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">React render error</p>
              </div>
            </div>
            <pre className="text-xs font-mono text-rose-700 bg-rose-50 rounded-xl p-4 whitespace-pre-wrap break-all">{this.state.message}</pre>
            <button
              onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload(); }}
              className="mt-6 w-full py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-teal-600 transition-all"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppInner: React.FC = () => {
  const { appMode, systemPreference, useCustomColors } = useTheme();
  const resolvedMode = appMode === 'auto' ? systemPreference : appMode;

  // Config persistence
  const [location, setLocation] = useState<string>(() => {
    return localStorage.getItem('biosentinel_location') || '';
  });
  
  // Weather data persistence
  const [weather, setWeather] = useState<WeatherData | null>(() => {
    const cached = localStorage.getItem('biosentinel_weather_data');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error("Failed to parse cached weather data", e);
        return null;
      }
    }
    return null;
  });

  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<string>('');

  const [geminiKey, setGeminiKey] = useState<string>(
    () => localStorage.getItem('biosentinel_gemini_key') || process.env.GEMINI_API_KEY || ''
  );
  const [groqKey, setGroqKey] = useState<string>(
    () => localStorage.getItem('biosentinel_groq_key') || process.env.GROQ_API_KEY || ''
  );
  const [pollinationsKey, setPollinationsKey] = useState<string>(
    () => localStorage.getItem('biosentinel_pollinations_key') || process.env.POLLINATIONS_KEY || ''
  );
  const [openrouterKey, setOpenrouterKey] = useState<string>(
    () => localStorage.getItem('biosentinel_openrouter_key') || process.env.OPENROUTER_API_KEY || ''
  );
  const [siliconflowKey, setSiliconflowKey] = useState<string>(
    () => localStorage.getItem('biosentinel_siliconflow_key') || process.env.SILICONFLOW_API_KEY || ''
  );
  const [cerebrasKey, setCerebrasKey] = useState<string>(
    () => localStorage.getItem('biosentinel_cerebras_key') || process.env.CEREBRAS_API_KEY || ''
  );
  const [aiProvider, setAiProvider] = useState<AiProvider>(() => {
    const p = localStorage.getItem('biosentinel_ai_provider') as AiProvider;
    return p && ['gemini', 'groq', 'pollinations', 'openrouter', 'siliconflow', 'cerebras'].includes(p) ? p : 'gemini';
  });
  const [aiModel, setAiModel] = useState<string>(() => {
    return localStorage.getItem('biosentinel_ai_model') || AI_MODELS.gemini[0].value;
  });
  const [useOpenWeather, setUseOpenWeather] = useState<boolean>(() => localStorage.getItem('biosentinel_use_openweather') === 'true');
  const [openWeatherKey, setOpenWeatherKey] = useState<string>(
    () => localStorage.getItem('biosentinel_openweather_key') || process.env.OPENWEATHER_KEY || ''
  );
  const [mlApiKey, setMlApiKey] = useState<string>(() => localStorage.getItem('biosentinel_ml_api_key') || '');
  const [llamaCloudKey, setLlamaCloudKey] = useState<string>(
    () => localStorage.getItem('biosentinel_llamacloud_key') || process.env.LLAMACLOUD_KEY || ''
  );
  const [mapplsToken, setMapplsToken] = useState<string>(
    () => localStorage.getItem('biosentinel_mappls_token') || import.meta.env.VITE_MAPPLS_TOKEN || ''
  );
  const [mapProvider, setMapProvider] = useState<'mappls' | 'maptiler' | 'mapbox'>(
    () => (localStorage.getItem('biosentinel_map_provider') as 'mappls' | 'maptiler' | 'mapbox') || 'mappls'
  );
  const [mapTilerKey, setMapTilerKey] = useState<string>(
    () => localStorage.getItem('biosentinel_maptiler_key') || ''
  );
  const [mapboxToken, setMapboxToken] = useState<string>(
    () => localStorage.getItem('biosentinel_mapbox_token') || ''
  );

  // ── Notification Settings ──────────────────────────────────────────────────
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    try {
      const stored = localStorage.getItem('biosentinel_notification_settings');
      if (stored) return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_NOTIFICATION_SETTINGS;
  });

  // ── Email Alert Settings ───────────────────────────────────────────────────
  const [emailAlertSettings, setEmailAlertSettingsState] = useState<EmailAlertSettings>(() => {
    try {
      const stored = localStorage.getItem('biosentinel_email_alert_settings');
      if (stored) return { ...DEFAULT_EMAIL_ALERT_SETTINGS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_EMAIL_ALERT_SETTINGS;
  });

  const setEmailAlertSettings = (patch: Partial<EmailAlertSettings>) => {
    setEmailAlertSettingsState(prev => ({ ...prev, ...patch }));
  };

  const [view, setView] = useState<'dashboard' | 'historical' | 'flood' | 'assistant' | 'research' | 'settings'>('dashboard');

  // ── Health Alert State ────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);

  const addAlerts = useCallback((newAlerts: HealthAlert[], ns?: NotificationSettings) => {
    if (newAlerts.length === 0) return;
    const cfg = ns ?? notificationSettings;
    const isSymptomAlert = (a: HealthAlert) => a.id.startsWith('symptom_') || a.factor?.toLowerCase?.().includes('symptom');
    // Filter based on notification settings
    const filtered = newAlerts.filter(alert => {
      // Symptom-driven alerts: treat as general health notifications (not "severe weather")
      if (isSymptomAlert(alert)) return cfg.alerts.diseaseOutbreak;
      // Session briefings (morning/afternoon/evening) = daily forecast
      if (alert.session !== 'realtime' && alert.id.startsWith('brief-')) return cfg.alerts.dailyWeatherForecast;
      // Tomorrow's forecast alerts
      if (alert.id.includes('tomorrow')) return cfg.alerts.tomorrowForecast;
      // Severe weather (critical severity)
      if (alert.severity === 'critical') return cfg.alerts.severeWeather;
      // Precipitation / rain
      if (alert.category === 'precipitation') return cfg.alerts.rainAlerts;
      // Air quality and pollen
      if (alert.category === 'airQuality' || alert.category === 'pollen') return cfg.alerts.airQualityAlerts;
      // Disease outbreak (general health risk alerts)
      if (alert.category === 'general') return cfg.alerts.diseaseOutbreak;
      return true;
    });
    if (filtered.length === 0) return;
    setAlerts(prev => {
      // De-duplicate by alert ID only — cooldown suppression is handled in alertService
      const existingIds = new Set(prev.map(a => a.id));
      const fresh = filtered.filter(a => !existingIds.has(a.id));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].slice(0, 50);
    });
    // Browser notification: only the single highest-severity alert, rate-capped inside sendBrowserNotification
    const top = filtered[0]; // already sorted critical-first by generateWeatherAlerts
    if (top && (top.severity === 'critical' || top.severity === 'warning')) {
      requestNotificationPermission().then(granted => { if (granted) sendBrowserNotification(top); });
    }
  }, [notificationSettings]);

  const handleMarkRead = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  }, []);
  const handleMarkAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);
  const handleDismiss = useCallback((id: string) => {
    // Record intentional dismiss → extends cooldown for this alert's category
    setAlerts(prev => {
      const alert = prev.find(a => a.id === id);
      if (alert) recordUserDismiss(alert.category);
      return prev.filter(a => a.id !== id);
    });
  }, []);
  const handleClearAll = useCallback(() => {
    // Snooze all new alerts for 30 min
    recordUserClearAll();
    setAlerts([]);
  }, []);


  useEffect(() => { if (geminiKey)      localStorage.setItem('biosentinel_gemini_key',      geminiKey);      else localStorage.removeItem('biosentinel_gemini_key');      }, [geminiKey]);
  useEffect(() => { if (groqKey)        localStorage.setItem('biosentinel_groq_key',         groqKey);        else localStorage.removeItem('biosentinel_groq_key');        }, [groqKey]);
  useEffect(() => { if (pollinationsKey) localStorage.setItem('biosentinel_pollinations_key', pollinationsKey); else localStorage.removeItem('biosentinel_pollinations_key'); }, [pollinationsKey]);
  useEffect(() => { if (openrouterKey)  localStorage.setItem('biosentinel_openrouter_key',  openrouterKey);  else localStorage.removeItem('biosentinel_openrouter_key');  }, [openrouterKey]);
  useEffect(() => { if (siliconflowKey) localStorage.setItem('biosentinel_siliconflow_key', siliconflowKey); else localStorage.removeItem('biosentinel_siliconflow_key'); }, [siliconflowKey]);
  useEffect(() => { if (cerebrasKey) localStorage.setItem('biosentinel_cerebras_key', cerebrasKey); else localStorage.removeItem('biosentinel_cerebras_key'); }, [cerebrasKey]);
  useEffect(() => { localStorage.setItem('biosentinel_ai_provider', aiProvider); }, [aiProvider]);
  useEffect(() => { localStorage.setItem('biosentinel_ai_model', aiModel); }, [aiModel]);
  useEffect(() => { localStorage.setItem('biosentinel_use_openweather', useOpenWeather.toString()); }, [useOpenWeather]);
  useEffect(() => { if (openWeatherKey) localStorage.setItem('biosentinel_openweather_key',  openWeatherKey); else localStorage.removeItem('biosentinel_openweather_key');  }, [openWeatherKey]);
  useEffect(() => { localStorage.setItem('biosentinel_ml_api_key', mlApiKey); setBioSentinelApiKey(mlApiKey); }, [mlApiKey]);
  useEffect(() => { if (llamaCloudKey)  localStorage.setItem('biosentinel_llamacloud_key',  llamaCloudKey);  else localStorage.removeItem('biosentinel_llamacloud_key');  }, [llamaCloudKey]);
  useEffect(() => { localStorage.setItem('biosentinel_location', location); }, [location]);
  useEffect(() => { if (weather) localStorage.setItem('biosentinel_weather_data', JSON.stringify(weather)); }, [weather]);
  useEffect(() => { localStorage.setItem('biosentinel_notification_settings', JSON.stringify(notificationSettings)); }, [notificationSettings]);
  useEffect(() => { localStorage.setItem('biosentinel_email_alert_settings', JSON.stringify(emailAlertSettings)); }, [emailAlertSettings]);
  useEffect(() => { localStorage.setItem('biosentinel_mappls_token', mapplsToken); }, [mapplsToken]);
  useEffect(() => { localStorage.setItem('biosentinel_map_provider', mapProvider); }, [mapProvider]);
  useEffect(() => { localStorage.setItem('biosentinel_maptiler_key', mapTilerKey); }, [mapTilerKey]);
  useEffect(() => { localStorage.setItem('biosentinel_mapbox_token', mapboxToken); }, [mapboxToken]);

  // Dynamically load Map SDK scripts when map provider or tokens change
  useEffect(() => {
    // Remove existing scripts to swap providers cleanly
    ['mappls-sdk-script', 'maptiler-sdk-script', 'maplibre-sdk-script', 'mapbox-sdk-script'].forEach(id => {
      document.getElementById(id)?.remove();
    });

    if (mapProvider === 'mappls' && mapplsToken) {
      const script = document.createElement('script');
      script.id = 'mappls-sdk-script';
      script.src = `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${mapplsToken}&libraries=geoanalytics`;
      script.defer = true;
      document.head.appendChild(script);

      // Load Mappls CSS
      let link = document.getElementById('map-provider-css') as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.id = 'map-provider-css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = 'https://sdk.mappls.com/map/sdk/web/styles/styles.css';
    } else if (mapProvider === 'maptiler' && mapTilerKey) {
      // Load MapLibre GL JS + MapTiler SDK
      const maplibreScript = document.createElement('script');
      maplibreScript.id = 'maplibre-sdk-script';
      maplibreScript.src = 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js';
      maplibreScript.defer = true;
      document.head.appendChild(maplibreScript);

      const maptilerScript = document.createElement('script');
      maptilerScript.id = 'maptiler-sdk-script';
      maptilerScript.src = `https://cdn.maptiler.com/maptiler-sdk-js/latest/maptiler-sdk.umd.js`;
      maptilerScript.defer = true;
      document.head.appendChild(maptilerScript);

      // Load CSS
      let link = document.getElementById('map-provider-css') as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.id = 'map-provider-css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css';
    } else if (mapProvider === 'mapbox' && mapboxToken) {
      // Load Mapbox SDK
      const mapboxScript = document.createElement('script');
      mapboxScript.id = 'mapbox-sdk-script';
      mapboxScript.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
      mapboxScript.defer = true;
      document.head.appendChild(mapboxScript);

      // Load CSS
      let link = document.getElementById('map-provider-css') as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.id = 'map-provider-css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
    }
  }, [mapProvider, mapplsToken, mapTilerKey, mapboxToken]);

  // Derive the active API key based on provider
  const aiKey = aiProvider === 'groq' ? groqKey
    : aiProvider === 'pollinations' ? pollinationsKey
    : aiProvider === 'openrouter' ? openrouterKey
    : aiProvider === 'siliconflow' ? siliconflowKey
    : aiProvider === 'cerebras' ? cerebrasKey
    : geminiKey;

  const AUTO_REFRESH_MS = notificationSettings.forecastUpdatePeriodMinutes * 60 * 1000;

  const handleFetchWeather = async (silent = false) => {
    if (!location) {
      if (!silent) setError("Please enter a location to fetch weather data.");
      return;
    }

    if (!silent) setLoadingState(LoadingState.LOADING_WEATHER);
    setError("");
    
    // We don't clear the weather immediately to avoid layout flicker if cache exists
    try {
      const data = await fetchWeatherData(location, openWeatherKey, useOpenWeather);
      setWeather(data);
      if (!silent) setLoadingState(LoadingState.IDLE);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to fetch weather data.");
        setLoadingState(LoadingState.ERROR);
      }
    }
  };

  // Auto-refresh weather: always fetch on page load, then every 3 hours
  useEffect(() => {
    if (!location) return;

    // Always fetch fresh data on mount (page load / browser refresh)
    handleFetchWeather(true);

    // Then repeat every 3 hours
    const interval = setInterval(() => handleFetchWeather(true), AUTO_REFRESH_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, openWeatherKey, useOpenWeather]);

  // ── Real-time alerts whenever weather data changes ────────────────────────
  useEffect(() => {
    if (!weather) return;
    const newAlerts = generateWeatherAlerts(weather, 'realtime');
    personalizeAlertsInPlace(newAlerts, weather);
    addAlerts(newAlerts);
    // Enrich alert headings with AI-generated text in the background (if AI mode enabled)
    if (newAlerts.length > 0 && notificationSettings.alertMode === 'ai' && notificationSettings.alerts.aiBasedAlerts) {
      const userContext = buildAIUserContext(weather);
      enrichAlertsWithAI(newAlerts, { city: weather.city, temp: weather.temp, humidity: weather.humidity }, { userContext })
        .then(() => {
          // Replace titles/messages in state with AI-enriched versions
          setAlerts(prev => prev.map(a => {
            const enriched = newAlerts.find(n => n.id === a.id);
            return enriched ? { ...a, title: enriched.title, message: enriched.message } : a;
          }));
        })
        .catch(() => { /* keep original fallback titles on any failure */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather, addAlerts]);

  // ── Proactive forecast email alerts ──────────────────────────────────────
  useEffect(() => {
    if (!weather) return;
    // Run in background — non-blocking, fire-and-forget
    checkAndSendForecastEmails(weather, emailAlertSettings, setEmailAlertSettings).catch(
      err => console.warn('[ForecastEmail] Background check error:', err)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather]);

  // ── Scheduled morning / afternoon / evening briefings ─────────────────────
  useEffect(() => {
    if (!weather) return;
    const offset = weather.utcOffsetSeconds ?? 0;

    const checkSchedule = () => {
      const session = getCurrentSession(offset);
      if (session === 'morning' || session === 'afternoon' || session === 'evening') {
        if (shouldSendScheduledAlert(session, offset)) {
          markScheduledAlertSent(session, offset);
          const briefing = generateSessionBriefing(weather, session);
          const sessionAlerts = generateWeatherAlerts(weather, session);
          personalizeAlertsInPlace(sessionAlerts, weather);
          const allNew = [briefing, ...sessionAlerts];
          addAlerts(allNew);
          // AI-enrich only the condition-based alerts (not the briefing summary)
          if (sessionAlerts.length > 0 && notificationSettings.alertMode === 'ai' && notificationSettings.alerts.aiBasedAlerts) {
            const userContext = buildAIUserContext(weather);
            enrichAlertsWithAI(sessionAlerts, { city: weather.city, temp: weather.temp, humidity: weather.humidity }, { userContext })
              .then(() => {
                setAlerts(prev => prev.map(a => {
                  const enriched = sessionAlerts.find(n => n.id === a.id);
                  return enriched ? { ...a, title: enriched.title, message: enriched.message } : a;
                }));
              })
              .catch(() => { /* keep fallback titles */ });
          }
        }
      }
    };

    // Check immediately on weather load
    checkSchedule();

    // Check every 5 minutes for session transitions
    const id = setInterval(checkSchedule, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [weather, addAlerts]);

  // ── Request notification permission on first load ─────────────────────────
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // ── VisualViewport bottom offset (prevents fixed toasts being covered by mobile browser UI) ──
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let rafId = 0;
    const update = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const bottomCoveredPx = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--vv-bottom', `${bottomCoveredPx}px`);
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
      document.documentElement.style.setProperty('--vv-bottom', '0px');
    };
  }, []);

  // Derived loading flag
  const isLoadingWeather = loadingState === LoadingState.LOADING_WEATHER;

  return (
    <div
      className="flex flex-col min-h-screen bg-white dark:bg-slate-950 dark:text-slate-100 font-sans text-slate-800 transition-colors duration-300"
      style={useCustomColors && resolvedMode === 'light'
        ? { backgroundColor: '#ffffff', color: 'var(--bsx-text)' }
        : undefined}
    >

      {/* ── Global top header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 sm:px-6 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-100 dark:border-slate-800 shadow-sm">
        {/* Logo — click gear to open Settings */}
        <div className="flex items-center gap-2.5 flex-shrink-0 order-1">
          <button
            onClick={() => setView(view === 'settings' ? 'dashboard' : 'settings')}
            title="Settings"
            className={`p-2 rounded-xl shadow transition-all active:scale-95 ${
              view === 'settings'
                ? 'bg-teal-500 ring-2 ring-teal-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900'
                : 'bg-slate-900 dark:bg-slate-800 hover:bg-teal-600'
            }`}
          >
            <Settings className="w-4 h-4 text-teal-400" />
          </button>
          <div className="hidden sm:block">
            <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">BioSentinel</h1>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Health Intelligence</p>
          </div>
        </div>

        {/* Location bar */}
        <div className="flex items-center gap-2 flex-1 min-w-0 order-3 w-full sm:order-none sm:w-auto">
          <div className="relative flex-1 min-w-0 group max-w-none sm:max-w-sm">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-teal-500 transition-colors" />
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetchWeather()}
              placeholder="City or coordinates…"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-teal-500 focus:bg-white dark:focus:bg-slate-700 transition-all"
            />
          </div>
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(({ coords }) =>
                setLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`)
              );
            }}
            title="Use GPS location"
            className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-900/40 hover:text-teal-600 transition-all flex-shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleFetchWeather()}
            disabled={!location || isLoadingWeather}
            title={weather ? 'Refresh weather' : 'Get weather'}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-teal-600 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex-shrink-0"
            style={useCustomColors && resolvedMode === 'light'
              ? { backgroundColor: 'var(--bsx-accent)' }
              : undefined}
          >
            {isLoadingWeather
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isLoadingWeather ? 'Loading…' : weather ? 'Refresh' : 'Get'}</span>
          </button>
        </div>

        {/* Alert bell */}
        <div className="flex-shrink-0 order-2 ml-auto">
          <AlertNotificationPanel
            alerts={alerts}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
            onDismiss={handleDismiss}
            onClearAll={handleClearAll}
          />
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className={`flex-1 flex flex-col ${
        view === 'assistant' ? 'overflow-hidden min-h-0' : 'overflow-y-auto'
      }`}>
        {/* Error banner */}
        {error && (
          <div className="p-4 sm:p-6 lg:p-8 xl:p-10 pb-0">
            <div className="max-w-6xl mx-auto">
              <div className="p-5 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-3xl shadow-sm flex items-start gap-4 animate-fade-in">
                <div className="p-2.5 bg-rose-500 rounded-xl shadow-lg shadow-rose-200 dark:shadow-rose-900/30 flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-rose-900 dark:text-rose-100 uppercase tracking-widest mb-1">Weather Fetch Failed</h4>
                  <p className="text-xs font-bold leading-relaxed">{error}</p>
                </div>
                <button onClick={() => setError('')} className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg text-rose-400 transition-all flex-shrink-0">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className={`${
          view === 'assistant'
            ? 'flex flex-col flex-1 min-h-0 px-3 sm:px-4 pt-3'
            : 'p-4 sm:p-6 lg:p-8 xl:p-10'
        }`}>
          <div className={`max-w-6xl mx-auto w-full ${view === 'assistant' ? 'flex flex-col flex-1 min-h-0' : ''}`}>

            {/* ── Nav tabs ── */}
            <div className={`flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide ${
              view === 'assistant' ? 'shrink-0 mb-2' : 'mb-6 sm:mb-8'
            }`}>
              <button onClick={() => setView('dashboard')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex-shrink-0 ${view === 'dashboard' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'}`}>
                Live Monitor
              </button>
              <button onClick={() => setView('historical')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex-shrink-0 ${view === 'historical' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'}`}>
                Historical
              </button>
              <button onClick={() => setView('flood')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex-shrink-0 ${view === 'flood' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'}`}>
                Flood
              </button>
              <button onClick={() => setView('assistant')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex-shrink-0 ${view === 'assistant' ? 'bg-teal-600 text-white shadow-lg shadow-teal-200 dark:shadow-teal-900' : 'bg-teal-500/10 text-teal-600 dark:text-teal-300 border border-teal-200 dark:border-teal-600 hover:bg-teal-600 hover:text-white hover:border-transparent'}`}>
                BioX Assistant
              </button>
              <button onClick={() => setView('research')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex-shrink-0 ${view === 'research' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-600 hover:bg-indigo-600 hover:text-white hover:border-transparent'}`}>
                Research
              </button>
              {/* Settings tab — pushed to the right */}
              <div className="flex-1" />
              <button onClick={() => setView('settings')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${view === 'settings' ? 'bg-slate-900 dark:bg-slate-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white'}`}>
                <Settings className="w-3 h-3" />
                Settings
              </button>
            </div>

            {/* ── Views ── */}
            {view === 'dashboard' ? (
              <>
                <WeatherCard data={weather} />
                <AnalysisDashboard
                  weather={weather}
                  loadingState={loadingState}
                  setLoadingState={setLoadingState}
                  aiProvider={aiProvider}
                  aiModel={aiModel}
                  aiKey={aiKey}
                  onOpenAssistant={() => setView('assistant')}
                />
              </>
            ) : view === 'historical' ? (
              <HistoricalAnalysis
                location={location}
                weather={weather}
                onBack={() => setView('dashboard')}
                geminiKey={geminiKey}
                aiProvider={aiProvider}
                aiModel={aiModel}
                aiKey={aiKey}
              />
            ) : view === 'flood' ? (
              <FloodPrediction
                weather={weather}
                onBack={() => setView('dashboard')}
                aiProvider={aiProvider}
                aiModel={aiModel}
                aiKey={aiKey}
                mapProvider={mapProvider}
                mapplsToken={mapplsToken}
                mapTilerKey={mapTilerKey}
              />
            ) : view === 'assistant' ? (
              <BioXAssistant
                weather={weather}
                aiKey={aiKey}
                aiProvider={aiProvider}
                aiModel={aiModel}
                onBack={() => setView('dashboard')}
                onAddAlerts={(a) => addAlerts(a)}
              />
            ) : view === 'research' ? (
              <ResearchLibrary
                geminiKey={geminiKey}
                llamaCloudKey={llamaCloudKey}
                setLlamaCloudKey={setLlamaCloudKey}
                onBack={() => setView('dashboard')}
              />
            ) : (
              <SettingsPage
                location={location}
                setLocation={setLocation}
                onFetchWeather={handleFetchWeather}
                loadingState={loadingState}
                hasWeatherData={!!weather}
                detectedCity={weather?.city}
                geminiKey={geminiKey}
                setGeminiKey={setGeminiKey}
                groqKey={groqKey}
                setGroqKey={setGroqKey}
                pollinationsKey={pollinationsKey}
                setPollinationsKey={setPollinationsKey}
                openrouterKey={openrouterKey}
                setOpenrouterKey={setOpenrouterKey}
                siliconflowKey={siliconflowKey}
                setSiliconflowKey={setSiliconflowKey}
                cerebrasKey={cerebrasKey}
                setCerebrasKey={setCerebrasKey}
                aiProvider={aiProvider}
                setAiProvider={setAiProvider}
                aiModel={aiModel}
                setAiModel={setAiModel}
                useOpenWeather={useOpenWeather}
                setUseOpenWeather={setUseOpenWeather}
                openWeatherKey={openWeatherKey}
                setOpenWeatherKey={setOpenWeatherKey}
                mlApiKey={mlApiKey}
                setMlApiKey={setMlApiKey}
                mapplsToken={mapplsToken}
                setMapplsToken={setMapplsToken}
                mapProvider={mapProvider}
                setMapProvider={setMapProvider}
                mapTilerKey={mapTilerKey}
                setMapTilerKey={setMapTilerKey}
                mapboxToken={mapboxToken}
                setMapboxToken={setMapboxToken}
                notificationSettings={notificationSettings}
                setNotificationSettings={setNotificationSettings}
                emailAlertSettings={emailAlertSettings}
                setEmailAlertSettings={setEmailAlertSettings}
                weather={weather}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <DataCacheProvider>
          <AppInner />
        </DataCacheProvider>
      </AppErrorBoundary>
    </ThemeProvider>
  );
}