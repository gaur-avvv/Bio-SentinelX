import React, { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Crosshair, Loader2, LogOut, MapPin, RefreshCw, Settings, XCircle } from 'lucide-react';
import { AlertNotificationPanel } from './components/AlertNotificationPanel';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { BioXAssistant } from './components/BioXAssistant';
import { FloodPrediction } from './components/FloodPrediction';
import { HistoricalAnalysis } from './components/HistoricalAnalysis';
import { SettingsPage } from './components/SettingsPage';
import { WeatherCard } from './components/WeatherCard';
import { AuthLanding } from './components/auth/AuthLanding';
import { ProfileOnboardingWizard } from './components/auth/ProfileOnboardingWizard';
import { DataCacheProvider } from './contexts/DataCacheContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { enrichAlertsWithAI } from './services/aiNotificationService';
import {
  generateSessionBriefing,
  generateWeatherAlerts,
  getCurrentSession,
  markScheduledAlertSent,
  recordUserClearAll,
  recordUserDismiss,
  requestNotificationPermission,
  sendBrowserNotification,
  shouldSendScheduledAlert
} from './services/alertService';
import { checkAndSendForecastEmails } from './services/forecastEmailService';
import { completeEmailLinkSignIn, onAuthUserChanged, signOutUser, type AuthUser } from './services/firebaseAuthService';
import { getHFToken, setHFToken } from './services/huggingFaceService';
import { setBioSentinelApiKey, setBioSentinelApiUrl } from './services/mlService';
import { buildAIUserContext, personalizeAlertsInPlace } from './services/personalizationService';
import { fetchWeatherData } from './services/weatherService';
import {
  AI_MODELS,
  DEFAULT_DATABASE_SETTINGS,
  DEFAULT_EMAIL_ALERT_SETTINGS,
  DEFAULT_MCP_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  type AiProvider,
  type DatabaseSettings,
  type EmailAlertSettings,
  type HealthAlert,
  LoadingState,
  type McpSettings,
  type NotificationSettings,
  type WeatherData
} from './types';

interface EBState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[BioSentinel] Uncaught render error:', error, info);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
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
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              window.location.reload();
            }}
            className="mt-6 w-full py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-teal-600 transition-all"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

const AppInner: React.FC = () => {
  const { appMode, systemPreference, useCustomColors } = useTheme();
  const resolvedMode = appMode === 'auto' ? systemPreference : appMode;
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('biosentinel_user_name') || 'User');
  const [userAvatar, setUserAvatar] = useState<string>(() => localStorage.getItem('biosentinel_user_avatar') || '');

  const [location, setLocation] = useState<string>(() => localStorage.getItem('biosentinel_location') || '');
  const [weather, setWeather] = useState<WeatherData | null>(() => {
    try {
      const cached = localStorage.getItem('biosentinel_weather_data');
      return cached ? JSON.parse(cached) as WeatherData : null;
    } catch {
      return null;
    }
  });
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState('');
  const [view, setView] = useState<'dashboard' | 'historical' | 'flood' | 'assistant' | 'settings'>('dashboard');

  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem('biosentinel_gemini_key') || '');
  const [groqKey, setGroqKey] = useState<string>(() => localStorage.getItem('biosentinel_groq_key') || '');
  const [pollinationsKey, setPollinationsKey] = useState<string>(() => localStorage.getItem('biosentinel_pollinations_key') || '');
  const [huggingFaceKey, setHuggingFaceKey] = useState<string>(() => getHFToken() || '');
  const [openrouterKey, setOpenrouterKey] = useState<string>(() => localStorage.getItem('biosentinel_openrouter_key') || '');
  const [siliconflowKey, setSiliconflowKey] = useState<string>(() => localStorage.getItem('biosentinel_siliconflow_key') || '');
  const [cerebrasKey, setCerebrasKey] = useState<string>(() => localStorage.getItem('biosentinel_cerebras_key') || '');
  const [ollamaEndpoint, setOllamaEndpoint] = useState<string>(() => localStorage.getItem('biosentinel_ollama_endpoint') || 'http://localhost:11434');
  const [aiProvider, setAiProvider] = useState<AiProvider>(() => (localStorage.getItem('biosentinel_ai_provider') as AiProvider) || 'gemini');
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem('biosentinel_ai_model') || AI_MODELS.gemini[0].value);
  const [useOpenWeather, setUseOpenWeather] = useState<boolean>(() => localStorage.getItem('biosentinel_use_openweather') === 'true');
  const [openWeatherKey, setOpenWeatherKey] = useState<string>(() => localStorage.getItem('biosentinel_openweather_key') || '');
  const [mlApiKey, setMlApiKey] = useState<string>(() => localStorage.getItem('biosentinel_ml_api_key') || '');
  const [bioSentinelApiUrl, setBioSentinelApiUrlState] = useState<string>(
    () => localStorage.getItem('biosentinel_ml_api_base_url') || import.meta.env.VITE_BIOSENTINEL_API || 'https://web-production-37f41.up.railway.app'
  );
  const [surveillanceApiUrl, setSurveillanceApiUrl] = useState<string>(
    () => localStorage.getItem('biosentinel_surveillance_api_base_url') || 'https://web-production-37f41.up.railway.app'
  );
  const [surveillanceApiKey, setSurveillanceApiKey] = useState<string>(
    () => localStorage.getItem('biosentinel_surveillance_api_key') || ''
  );
  const [llamaCloudKey] = useState<string>(() => localStorage.getItem('biosentinel_llamacloud_key') || '');

  const [mapplsToken, setMapplsToken] = useState<string>(() => localStorage.getItem('biosentinel_mappls_token') || '');
  const [mapProvider, setMapProvider] = useState<'mappls' | 'maptiler' | 'mapbox' | 'osm' | 'arcgis'>(() => {
    const p = localStorage.getItem('biosentinel_map_provider');
    return p === 'mappls' || p === 'maptiler' || p === 'mapbox' || p === 'arcgis' ? p : 'osm';
  });
  const [mapTilerKey, setMapTilerKey] = useState<string>(() => localStorage.getItem('biosentinel_maptiler_key') || '');
  const [mapboxToken, setMapboxToken] = useState<string>(() => localStorage.getItem('biosentinel_mapbox_token') || '');
  const [arcGisKey, setArcGisKey] = useState<string>(() => localStorage.getItem('biosentinel_arcgis_key') || '');

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    try {
      const stored = localStorage.getItem('biosentinel_notification_settings');
      return stored ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(stored) } : DEFAULT_NOTIFICATION_SETTINGS;
    } catch {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }
  });
  const [emailAlertSettings, setEmailAlertSettingsState] = useState<EmailAlertSettings>(() => {
    try {
      const stored = localStorage.getItem('biosentinel_email_alert_settings');
      return stored ? { ...DEFAULT_EMAIL_ALERT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_EMAIL_ALERT_SETTINGS;
    } catch {
      return DEFAULT_EMAIL_ALERT_SETTINGS;
    }
  });
  const [databaseSettings, setDatabaseSettingsState] = useState<DatabaseSettings>(() => {
    try {
      const stored = localStorage.getItem('biosentinel_database_settings');
      return stored ? { ...DEFAULT_DATABASE_SETTINGS, ...JSON.parse(stored) } : DEFAULT_DATABASE_SETTINGS;
    } catch {
      return DEFAULT_DATABASE_SETTINGS;
    }
  });
  const [mcpSettings, setMcpSettingsState] = useState<McpSettings>(() => {
    try {
      const stored = localStorage.getItem('biosentinel_mcp_settings');
      return stored ? { ...DEFAULT_MCP_SETTINGS, ...JSON.parse(stored) } : DEFAULT_MCP_SETTINGS;
    } catch {
      return DEFAULT_MCP_SETTINGS;
    }
  });

  const setEmailAlertSettings = (patch: Partial<EmailAlertSettings>) => setEmailAlertSettingsState(prev => ({ ...prev, ...patch }));
  const setDatabaseSettings = (patch: Partial<DatabaseSettings>) => setDatabaseSettingsState(prev => ({ ...prev, ...patch }));
  const setMcpSettings = (patch: Partial<McpSettings>) => setMcpSettingsState(prev => ({ ...prev, ...patch }));
  const setBioSentinelApiUrl = (url: string) => setBioSentinelApiUrlState(url);

  const [alerts, setAlerts] = useState<HealthAlert[]>([]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    completeEmailLinkSignIn().catch(() => undefined);

    onAuthUserChanged((user) => {
      if (cancelled) return;
      setAuthUser(user);
      if (user) {
        const done = localStorage.getItem(`biosentinel_onboarding_complete_${user.uid}`) === 'true';
        setOnboardingComplete(done);
      } else {
        setOnboardingComplete(false);
      }
      setAuthLoading(false);
    }).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unsub = dispose;
    }).catch(() => {
      if (!cancelled) setAuthLoading(false);
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    if (!onboardingComplete) return;
    setUserName(localStorage.getItem('biosentinel_user_name') || 'User');
    setUserAvatar(localStorage.getItem('biosentinel_user_avatar') || '');
  }, [onboardingComplete]);

  const addAlerts = useCallback((newAlerts: HealthAlert[], ns?: NotificationSettings) => {
    if (newAlerts.length === 0) return;
    const cfg = ns ?? notificationSettings;
    const filtered = newAlerts.filter(alert => {
      if (alert.severity === 'critical') return cfg.alerts.severeWeather;
      if (alert.category === 'airQuality' || alert.category === 'pollen') return cfg.alerts.airQualityAlerts;
      if (alert.category === 'precipitation') return cfg.alerts.rainAlerts;
      return true;
    });
    if (filtered.length === 0) return;

    setAlerts(prev => {
      const ids = new Set(prev.map(a => a.id));
      const fresh = filtered.filter(a => !ids.has(a.id));
      return [...fresh, ...prev].slice(0, 50);
    });

    const top = filtered[0];
    if (top && (top.severity === 'critical' || top.severity === 'warning')) {
      requestNotificationPermission().then(granted => {
        if (granted) sendBrowserNotification(top);
      });
    }
  }, [notificationSettings]);

  const aiKey = aiProvider === 'huggingface' ? huggingFaceKey
    : aiProvider === 'groq' ? groqKey
      : aiProvider === 'pollinations' ? pollinationsKey
        : aiProvider === 'openrouter' ? openrouterKey
          : aiProvider === 'siliconflow' ? siliconflowKey
            : aiProvider === 'cerebras' ? cerebrasKey
              : aiProvider === 'ollama' ? ''
                : geminiKey;

  const handleFetchWeather = async (silent = false) => {
    if (!location) {
      if (!silent) setError('Please enter a location to fetch weather data.');
      return;
    }

    if (!silent) setLoadingState(LoadingState.LOADING_WEATHER);
    setError('');

    try {
      const data = await fetchWeatherData(location, openWeatherKey, useOpenWeather);
      setWeather(data);
      if (data.city && location !== data.city) setLocation(data.city);
      if (!silent) setLoadingState(LoadingState.IDLE);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch weather data.');
        setLoadingState(LoadingState.ERROR);
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('biosentinel_location', location);
  }, [location]);
  useEffect(() => {
    if (weather) localStorage.setItem('biosentinel_weather_data', JSON.stringify(weather));
  }, [weather]);
  useEffect(() => {
    localStorage.setItem('biosentinel_ml_api_key', mlApiKey);
    setBioSentinelApiKey(mlApiKey);
  }, [mlApiKey]);
  useEffect(() => {
    localStorage.setItem('biosentinel_ml_api_base_url', bioSentinelApiUrl);
    setBioSentinelApiUrl(bioSentinelApiUrl);
  }, [bioSentinelApiUrl]);
  useEffect(() => {
    localStorage.setItem('biosentinel_surveillance_api_base_url', surveillanceApiUrl);
  }, [surveillanceApiUrl]);
  useEffect(() => {
    if (surveillanceApiKey) {
      localStorage.setItem('biosentinel_surveillance_api_key', surveillanceApiKey);
    } else {
      localStorage.removeItem('biosentinel_surveillance_api_key');
    }
  }, [surveillanceApiKey]);

  useEffect(() => {
    if (huggingFaceKey) {
      localStorage.setItem('biosentinel_hf_token', huggingFaceKey);
      setHFToken(huggingFaceKey);
    } else {
      localStorage.removeItem('biosentinel_hf_token');
      setHFToken('');
    }
  }, [huggingFaceKey]);

  useEffect(() => {
    localStorage.setItem('biosentinel_notification_settings', JSON.stringify(notificationSettings));
    localStorage.setItem('biosentinel_email_alert_settings', JSON.stringify(emailAlertSettings));
    localStorage.setItem('biosentinel_database_settings', JSON.stringify(databaseSettings));
    localStorage.setItem('biosentinel_mcp_settings', JSON.stringify(mcpSettings));
  }, [notificationSettings, emailAlertSettings, databaseSettings, mcpSettings]);

  useEffect(() => {
    if (!location) return;
    handleFetchWeather(true);
    const interval = setInterval(() => handleFetchWeather(true), notificationSettings.forecastUpdatePeriodMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [location, openWeatherKey, useOpenWeather, notificationSettings.forecastUpdatePeriodMinutes]);

  useEffect(() => {
    if (!weather) return;
    const newAlerts = generateWeatherAlerts(weather, 'realtime');
    personalizeAlertsInPlace(newAlerts, weather);
    addAlerts(newAlerts);

    if (newAlerts.length > 0 && notificationSettings.alertMode === 'ai' && notificationSettings.alerts.aiBasedAlerts) {
      const userContext = buildAIUserContext(weather);
      enrichAlertsWithAI(newAlerts, { city: weather.city, temp: weather.temp, humidity: weather.humidity }, { userContext })
        .then(() => {
          setAlerts(prev => prev.map(a => {
            const enriched = newAlerts.find(n => n.id === a.id);
            return enriched ? { ...a, title: enriched.title, message: enriched.message } : a;
          }));
        })
        .catch(() => undefined);
    }
  }, [weather, addAlerts, notificationSettings]);

  useEffect(() => {
    if (!weather) return;
    checkAndSendForecastEmails(weather, emailAlertSettings, setEmailAlertSettings).catch(() => undefined);
  }, [weather, emailAlertSettings]);

  useEffect(() => {
    if (!weather) return;
    const offset = weather.utcOffsetSeconds ?? 0;
    const checkSchedule = () => {
      const session = getCurrentSession(offset);
      if ((session === 'morning' || session === 'afternoon' || session === 'evening') && shouldSendScheduledAlert(session, offset)) {
        markScheduledAlertSent(session, offset);
        const briefing = generateSessionBriefing(weather, session);
        const sessionAlerts = generateWeatherAlerts(weather, session);
        personalizeAlertsInPlace(sessionAlerts, weather);
        addAlerts([briefing, ...sessionAlerts]);
      }
    };
    checkSchedule();
    const id = setInterval(checkSchedule, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [weather, addAlerts]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3 text-sm font-black uppercase tracking-widest">
          <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
          Initializing secure access...
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <AuthLanding />;
  }

  if (!onboardingComplete) {
    return (
      <ProfileOnboardingWizard
        userId={authUser.uid}
        onComplete={() => {
          setOnboardingComplete(true);
          setView('dashboard');
        }}
      />
    );
  }

  return (
    <div
      className="flex flex-col min-h-screen bg-white dark:bg-slate-950 dark:text-slate-100 font-sans text-slate-800 transition-colors duration-300"
      style={useCustomColors && resolvedMode === 'light' ? { backgroundColor: '#ffffff', color: 'var(--bsx-text)' } : undefined}
    >
      <header className="sticky top-0 z-30 flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 sm:px-6 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5 flex-shrink-0 order-1">
          <button
            onClick={() => setView(view === 'settings' ? 'dashboard' : 'settings')}
            className={`p-2 rounded-xl shadow transition-all active:scale-95 ${view === 'settings' ? 'bg-teal-500' : 'bg-slate-900 dark:bg-slate-800 hover:bg-teal-600'}`}
          >
            <Settings className="w-4 h-4 text-teal-400" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0 order-3 w-full sm:order-none sm:w-auto">
          <div className="relative flex-1 min-w-0 group max-w-none sm:max-w-sm">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetchWeather()}
              placeholder="City or coordinates..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none text-xs font-bold"
            />
          </div>
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(({ coords }) => {
                setLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
              });
            }}
            className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleFetchWeather()}
            disabled={!location || loadingState === LoadingState.LOADING_WEATHER}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-teal-600 text-white text-[9px] font-black uppercase tracking-widest rounded-xl disabled:opacity-40"
          >
            {loadingState === LoadingState.LOADING_WEATHER ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{loadingState === LoadingState.LOADING_WEATHER ? 'Loading...' : weather ? 'Refresh' : 'Get'}</span>
          </button>
        </div>

        <div className="flex-shrink-0 order-2 ml-auto">
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {userAvatar ? (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(userAvatar)}`}
                  alt="User avatar"
                  className="w-6 h-6 rounded-lg"
                />
              ) : (
                <div className="w-6 h-6 rounded-lg bg-teal-600" />
              )}
              <span className="text-[10px] font-black text-slate-600 dark:text-slate-200 uppercase tracking-wider max-w-[110px] truncate">{userName}</span>
            </div>
            <AlertNotificationPanel
              alerts={alerts}
              onMarkRead={(id) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))}
              onMarkAllRead={() => setAlerts(prev => prev.map(a => ({ ...a, read: true })))}
              onDismiss={(id) => {
                setAlerts(prev => {
                  const alert = prev.find(a => a.id === id);
                  if (alert) recordUserDismiss(alert.category);
                  return prev.filter(a => a.id !== id);
                });
              }}
              onClearAll={() => {
                recordUserClearAll();
                setAlerts([]);
              }}
            />
            <button
              onClick={() => signOutUser().catch(() => undefined)}
              className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl hover:text-rose-500"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className={`flex-1 flex flex-col ${view === 'assistant' ? 'overflow-hidden min-h-0' : 'overflow-y-auto'}`}>
        {error ? (
          <div className="p-4 sm:p-6 lg:p-8 xl:p-10 pb-0">
            <div className="max-w-6xl mx-auto">
              <div className="p-5 bg-rose-50 border border-rose-100 text-rose-800 rounded-3xl shadow-sm flex items-start gap-4">
                <div className="p-2.5 bg-rose-500 rounded-xl"><AlertTriangle className="w-4 h-4 text-white" /></div>
                <div className="flex-1 min-w-0"><p className="text-xs font-bold leading-relaxed">{error}</p></div>
                <button onClick={() => setError('')} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-400"><XCircle className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ) : null}

        <div className={`${view === 'assistant' ? 'flex flex-col flex-1 min-h-0 px-3 sm:px-4 pt-3' : 'p-4 sm:p-6 lg:p-8 xl:p-10'}`}>
          <div className={`max-w-6xl mx-auto w-full ${view === 'assistant' ? 'flex flex-col flex-1 min-h-0' : ''}`}>
            <div className={`flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl overflow-x-auto ${view === 'assistant' ? 'shrink-0 mb-2' : 'mb-6 sm:mb-8'}`}>
              <button
                onClick={() => setView('dashboard')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] ${view === 'dashboard' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}
              >
                Live Monitor
              </button>
              <button
                onClick={() => setView('historical')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] ${view === 'historical' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}
              >
                Historical
              </button>
              <button
                onClick={() => setView('flood')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] ${view === 'flood' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}
              >
                Flood
              </button>
              <button
                onClick={() => setView('assistant')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] ${view === 'assistant' ? 'bg-teal-600 text-white shadow-lg' : 'bg-teal-500/10 text-teal-600 border border-teal-200'}`}
              >
                BioX Assistant
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setView('settings')}
                className={`px-4 sm:px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-1.5 ${view === 'settings' ? 'bg-slate-900 dark:bg-slate-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <Settings className="w-3 h-3" />Settings
              </button>
            </div>

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
                  databaseSettings={databaseSettings}
                  localIntelEnabled={onboardingComplete}
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
                mapboxToken={mapboxToken}
                arcGisKey={arcGisKey}
              />
            ) : view === 'assistant' ? (
              <BioXAssistant
                weather={weather}
                aiKey={aiKey}
                aiProvider={aiProvider}
                aiModel={aiModel}
                geminiKey={geminiKey}
                llamaCloudKey={llamaCloudKey}
                mcpSettings={mcpSettings}
                onBack={() => setView('dashboard')}
                onAddAlerts={(a) => addAlerts(a)}
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
                huggingFaceKey={huggingFaceKey}
                setHuggingFaceKey={setHuggingFaceKey}
                openrouterKey={openrouterKey}
                setOpenrouterKey={setOpenrouterKey}
                siliconflowKey={siliconflowKey}
                setSiliconflowKey={setSiliconflowKey}
                cerebrasKey={cerebrasKey}
                setCerebrasKey={setCerebrasKey}
                ollamaEndpoint={ollamaEndpoint}
                setOllamaEndpoint={setOllamaEndpoint}
                aiProvider={aiProvider}
                setAiProvider={setAiProvider}
                aiModel={aiModel}
                setAiModel={setAiModel}
                useOpenWeather={useOpenWeather}
                setUseOpenWeather={setUseOpenWeather}
                openWeatherKey={openWeatherKey}
                setOpenWeatherKey={setOpenWeatherKey}
                bioSentinelApiUrl={bioSentinelApiUrl}
                setBioSentinelApiUrl={setBioSentinelApiUrl}
                mlApiKey={mlApiKey}
                setMlApiKey={setMlApiKey}
                surveillanceApiUrl={surveillanceApiUrl}
                setSurveillanceApiUrl={setSurveillanceApiUrl}
                surveillanceApiKey={surveillanceApiKey}
                setSurveillanceApiKey={setSurveillanceApiKey}
                databaseSettings={databaseSettings}
                setDatabaseSettings={setDatabaseSettings}
                mcpSettings={mcpSettings}
                setMcpSettings={setMcpSettings}
                mapplsToken={mapplsToken}
                setMapplsToken={setMapplsToken}
                mapProvider={mapProvider}
                setMapProvider={setMapProvider}
                mapTilerKey={mapTilerKey}
                setMapTilerKey={setMapTilerKey}
                mapboxToken={mapboxToken}
                setMapboxToken={setMapboxToken}
                arcGisKey={arcGisKey}
                setArcGisKey={setArcGisKey}
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
