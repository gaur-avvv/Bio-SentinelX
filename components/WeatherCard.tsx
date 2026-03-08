import React, { useState, useEffect } from 'react';
import { Wind, TrendingUp, Calendar, Droplets, ShieldCheck, Sun, Info, AlertCircle, Activity, Eye, Navigation, Thermometer, Gauge, AlertTriangle, Siren, CloudRain, ThermometerSnowflake, BellRing, ChevronDown, ChevronUp, Waves, Flame, Snowflake, Zap, Cpu, Sunrise, Sunset, Moon, Cloud, CloudSun, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { WeatherData } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface WeatherCardProps {
  data: WeatherData | null;
}

export const WeatherCard: React.FC<WeatherCardProps> = ({ data }) => {
  const [expandedAlerts, setExpandedAlerts] = useState<Record<number, boolean>>({});
  const [timeRange, setTimeRange] = useState<number>(48);
  const [localTime, setLocalTime] = useState('');
  const [localDate, setLocalDate] = useState('');

  // Global theme from context
  const { weatherCardMode: themeMode, setWeatherCardMode, weatherThemeLocked, setWeatherThemeLocked, autoWeatherTheme, useCustomColors, customColors } = useTheme();

  useEffect(() => {
    const tick = () => {
      const offset = data?.utcOffsetSeconds ?? 0;
      const d = new Date(Date.now() + offset * 1000);
      const h = d.getUTCHours();
      const m = d.getUTCMinutes();
      const s = d.getUTCSeconds();
      if (!weatherThemeLocked) setWeatherCardMode(autoWeatherTheme(h));
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      setLocalTime(`${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      setLocalDate(`${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data?.utcOffsetSeconds, weatherThemeLocked, setWeatherCardMode, autoWeatherTheme]);

  if (!data) return null;

  const toggleAlert = (idx: number) => {
    setExpandedAlerts(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getAlertVisuals = (event: string) => {
    const e = event.toLowerCase();
    if (e.includes('flood') || e.includes('rain')) return { icon: Waves, color: 'bg-blue-600', border: 'border-blue-400/50' };
    if (e.includes('heat') || e.includes('fire')) return { icon: Flame, color: 'bg-orange-600', border: 'border-orange-400/50' };
    if (e.includes('snow') || e.includes('ice') || e.includes('freeze')) return { icon: Snowflake, color: 'bg-cyan-600', border: 'border-cyan-400/50' };
    if (e.includes('wind') || e.includes('storm')) return { icon: Wind, color: 'bg-slate-700', border: 'border-slate-500/50' };
    if (e.includes('thunder') || e.includes('lightning')) return { icon: Zap, color: 'bg-yellow-600', border: 'border-yellow-400/50' };
    return { icon: Siren, color: 'bg-rose-600', border: 'border-rose-500/50' };
  };

  const getAQIInfo = (aqi: number) => {
    let level = aqi;
    if (aqi > 5) {
      // Map US AQI (0-500) to 1-5 scale
      if (aqi <= 50) level = 1;
      else if (aqi <= 100) level = 2;
      else if (aqi <= 150) level = 3;
      else if (aqi <= 200) level = 4;
      else level = 5;
    }

    if (level === 1) return { 
      label: "Good", 
      color: "bg-emerald-500", 
      text: "text-emerald-700", 
      border: "border-emerald-100", 
      bg: "bg-emerald-50", 
      desc: "Ideal air quality.",
      healthImpact: "Air quality is considered satisfactory, and air pollution poses little or no risk.",
      precautions: "No precautions needed. Perfect for outdoor exercise and activities."
    };
    if (level === 2) return { 
      label: "Fair", 
      color: "bg-yellow-500", 
      text: "text-yellow-700", 
      border: "border-yellow-100", 
      bg: "bg-yellow-50", 
      desc: "Acceptable quality.",
      healthImpact: "Air quality is acceptable; however, for some pollutants there may be a moderate health concern for a very small number of people who are unusually sensitive to air pollution.",
      precautions: "Active children and adults, and people with respiratory disease, such as asthma, should limit prolonged outdoor exertion."
    };
    if (level === 3) return { 
      label: "Moderate", 
      color: "bg-orange-500", 
      text: "text-orange-700", 
      border: "border-orange-100", 
      bg: "bg-orange-50", 
      desc: "Members of sensitive groups may experience health effects.",
      healthImpact: "Members of sensitive groups may experience health effects. The general public is not likely to be affected.",
      precautions: "Active children and adults, and people with respiratory disease, such as asthma, should limit prolonged outdoor exertion."
    };
    if (level === 4) return { 
      label: "Poor", 
      color: "bg-rose-500", 
      text: "text-rose-700", 
      border: "border-rose-100", 
      bg: "bg-rose-50", 
      desc: "Everyone may begin to experience health effects.",
      healthImpact: "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.",
      precautions: "Active children and adults, and people with respiratory disease, such as asthma, should avoid prolonged outdoor exertion; everyone else, especially children, should limit prolonged outdoor exertion."
    };
    if (level === 5) return { 
      label: "Very Poor", 
      color: "bg-purple-500", 
      text: "text-purple-700", 
      border: "border-purple-100", 
      bg: "bg-purple-50", 
      desc: "Health warnings of emergency conditions.",
      healthImpact: "Health alert: everyone may experience more serious health effects.",
      precautions: "Active children and adults, and people with respiratory disease, such as asthma, should avoid all outdoor exertion; everyone else, especially children, should limit outdoor exertion."
    };
    return { 
      label: "Unknown", 
      color: "bg-slate-500", 
      text: "text-slate-700", 
      border: "border-slate-100", 
      bg: "bg-slate-50", 
      desc: "Data unavailable.",
      healthImpact: "N/A",
      precautions: "N/A"
    };
  };

  const getUVInfo = (uv: number | null) => {
    if (uv === null) return { label: "N/A", color: "bg-slate-200", text: "text-slate-400", bg: "bg-slate-50", level: 0 };
    if (uv <= 2) return { label: "Low", color: "bg-emerald-500", text: "text-emerald-500", bg: "bg-emerald-50", level: 1 };
    if (uv <= 5) return { label: "Moderate", color: "bg-amber-500", text: "text-amber-500", bg: "bg-amber-50", level: 2 };
    if (uv <= 7) return { label: "High", color: "bg-orange-500", text: "text-orange-500", bg: "bg-orange-50", level: 3 };
    if (uv <= 10) return { label: "Very High", color: "bg-rose-500", text: "text-rose-500", bg: "bg-rose-50", level: 4 };
    return { label: "Extreme", color: "bg-purple-600", text: "text-purple-600", bg: "bg-purple-50", level: 5 };
  };

  const getWindDir = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  const getSolarInfo = (wm2: number | undefined) => {
    if (wm2 == null) return { label: 'N/A', color: 'bg-slate-400', textColor: 'text-slate-400', health: 'Data unavailable.', pct: 0 };
    if (wm2 < 20)  return { label: 'None', color: 'bg-slate-400', textColor: 'text-slate-500', health: 'Night / heavy overcast. No UV or vitamin D synthesis possible.', pct: Math.min(wm2 / 800 * 100, 100) };
    if (wm2 < 150) return { label: 'Low', color: 'bg-sky-400', textColor: 'text-sky-600', health: 'Dawn/dusk or thick cloud. Very limited vitamin D. May trigger seasonal mood dips.', pct: Math.min(wm2 / 800 * 100, 100) };
    if (wm2 < 350) return { label: 'Moderate', color: 'bg-amber-400', textColor: 'text-amber-600', health: 'Partly cloudy. Vitamin D synthesis occurs. Supports mood and circadian rhythm.', pct: Math.min(wm2 / 800 * 100, 100) };
    if (wm2 < 600) return { label: 'High', color: 'bg-orange-400', textColor: 'text-orange-600', health: 'Mostly clear. Strong vitamin D production. Use SPF 30+ outdoors for >15 min.', pct: Math.min(wm2 / 800 * 100, 100) };
    return { label: 'Very High', color: 'bg-rose-500', textColor: 'text-rose-600', health: 'Clear midday sky. Max vitamin D but burn risk in <10 min. SPF 50+ essential.', pct: Math.min(wm2 / 800 * 100, 100) };
  };

  const getEtInfo = (et: number | undefined) => {
    if (et == null) return { level: 'N/A', color: 'text-slate-400', barColor: 'bg-slate-300', advice: '', pct: 0 };
    if (et < 0.1) return { level: 'Negligible', color: 'text-emerald-500', barColor: 'bg-emerald-400', advice: 'Minimal heat stress. Standard hydration is sufficient.', pct: Math.min(et / 1 * 100, 100) };
    if (et < 0.3) return { level: 'Low', color: 'text-amber-500', barColor: 'bg-amber-400', advice: 'Mild warmth. An extra 500 ml of water per day is recommended outdoors.', pct: Math.min(et / 1 * 100, 100) };
    if (et < 0.6) return { level: 'Moderate', color: 'text-orange-500', barColor: 'bg-orange-400', advice: 'Active heat stress. Drink 250 ml/hr outdoors. Rest in shade during peak hours.', pct: Math.min(et / 1 * 100, 100) };
    return { level: 'High Stress', color: 'text-rose-500', barColor: 'bg-rose-500', advice: 'Severe dehydration risk. Limit outdoor exposure. Drink 500 ml+ per hour.', pct: 100 };
  };

  const parseHHMM = (iso: string): number => {
    const t = iso.split('T')[1];
    if (!t) return 0;
    const parts = t.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  };

  const sunArc = (() => {
    if (!data.sunrise || !data.sunset) return null;
    const srMin = parseHHMM(data.sunrise);
    const ssMin = parseHHMM(data.sunset);
    const d = new Date(Date.now() + (data.utcOffsetSeconds ?? 0) * 1000);
    const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (nowMin < srMin) return { pct: 0, status: 'before' as const };
    if (nowMin > ssMin) return { pct: 100, status: 'after' as const };
    return { pct: Math.round((nowMin - srMin) / (ssMin - srMin) * 100), status: 'during' as const };
  })();

  const aqiInfo = getAQIInfo(data.aqi);

  // Day/night theming — driven by themeMode (auto or user-locked)
  const isDay = data.isDay !== false;
  const nightCard = themeMode === 'full-dark';
  const partialDark = themeMode === 'partial-dark';

  // Derived theme helpers
  const cardBg = themeMode === 'full-dark'
    ? 'bg-slate-950 border-slate-800 ring-slate-800'
    : themeMode === 'partial-dark'
    ? 'bg-slate-800 border-slate-600 ring-slate-600'
    : 'bg-white border-slate-100 ring-slate-100';

  const cardTextPrimary = themeMode === 'light' ? 'text-slate-900' : 'text-white';
  const cardTextSecondary = themeMode === 'light' ? 'text-slate-400' : themeMode === 'partial-dark' ? 'text-slate-300' : 'text-slate-400';
  const cardBgAccent = themeMode === 'full-dark' ? 'bg-slate-800' : themeMode === 'partial-dark' ? 'bg-slate-700' : 'bg-slate-900';
  const cardMetaBadge = themeMode === 'full-dark'
    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
    : themeMode === 'partial-dark'
    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
    : 'bg-teal-500 text-white shadow-lg shadow-teal-500/20';
  const cardMetaIcon = themeMode === 'full-dark' ? <Moon className="w-3 h-3" /> : themeMode === 'partial-dark' ? <Sunset className="w-3 h-3" /> : <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />;
  const cardMetaLabel = themeMode === 'full-dark' ? 'Night' : themeMode === 'partial-dark' ? 'Twilight' : 'Live';
  const cardCornerGlow = themeMode === 'full-dark' ? 'bg-blue-950' : themeMode === 'partial-dark' ? 'bg-indigo-800' : 'bg-teal-50';
  const cardStatBox = themeMode === 'light' ? 'bg-slate-100 text-slate-500 border-slate-200' : themeMode === 'partial-dark' ? 'bg-slate-600 text-slate-300 border-slate-500' : 'bg-slate-800 text-slate-400 border-slate-700';

  // Custom colour overrides (inline style) when user enables custom theme
  const customCardStyle: React.CSSProperties = useCustomColors ? {
    background: customColors.surface,
    color: customColors.text,
    borderColor: customColors.accent + '55',
  } : {};
  const customTextPrimary: React.CSSProperties = useCustomColors ? { color: customColors.text } : {};
  const customTextSecondary: React.CSSProperties = useCustomColors ? { color: customColors.text + 'aa' } : {};
  const customAccentStyle: React.CSSProperties = useCustomColors ? { background: customColors.accent } : {};

  // data.uvIndex is now real-time hourly — the API returns 0 at night naturally
  const uvInfo = getUVInfo(data.uvIndex);
  const peakUV = data.uvIndexDailyMax;  // today's forecast daily max for reference

  // Cloud-adjusted UV (only meaningful when UV > 0)
  const cloudFraction = (data.clouds ?? 0) / 100;
  const effectiveUV = (data.uvIndex !== null && (data.uvIndex ?? 0) > 0)
    ? Math.round((data.uvIndex ?? 0) * (1 - cloudFraction * 0.7) * 10) / 10
    : null;

  // Format sunrise/sunset to local time
  const fmtTime = (iso?: string) => {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const daylightHrs = data.daylightDuration ? (data.daylightDuration / 3600).toFixed(1) : null;
  const sunshineHrs = data.sunshineDuration ? (data.sunshineDuration / 3600).toFixed(1) : null;

  const generateChartData = () => {
    if (timeRange === 168 && data.dailyForecast && data.dailyForecast.length > 0) {
      return data.dailyForecast.map(day => ({
        time: day.date,
        temp: Math.round((day.minTemp + day.maxTemp) / 2),
        timestamp: day.dt * 1000,
        minTemp: day.minTemp,
        maxTemp: day.maxTemp
      }));
    }
    
    return data.forecast.slice(0, timeRange).map(item => ({
      time: item.time,
      temp: item.temp,
      timestamp: item.dt * 1000
    }));
  };

  const chartData = generateChartData();

  const hasAlerts = data.alerts && data.alerts.length > 0;

  // Format sunrise/sunset for chart
  const getTimestamp = (isoString?: string) => {
    if (!isoString) return null;
    return new Date(isoString).getTime();
  };

  const sunriseTimes = (data.sunrises || []).map(getTimestamp).filter(Boolean) as number[];
  const sunsetTimes = (data.sunsets || []).map(getTimestamp).filter(Boolean) as number[];

  const minTime = chartData[0]?.timestamp || 0;
  const maxTime = chartData[chartData.length - 1]?.timestamp || 0;

  return (
    <div className="mb-12 space-y-8 animate-fade-in-up">
      {/* National Weather Alerts Section */}
      {hasAlerts && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-4 mb-2">
            <BellRing className="w-5 h-5 text-rose-600 animate-bounce" />
            <h3 className="text-sm font-black text-rose-600 uppercase tracking-[0.2em]">Active Weather Advisories ({data.alerts?.length})</h3>
          </div>
          {data.alerts?.map((alert, idx) => {
            const visuals = getAlertVisuals(alert.event);
            const Icon = visuals.icon;
            const isExpanded = expandedAlerts[idx];

            return (
              <div key={idx} className={`${visuals.color} p-6 rounded-[2rem] shadow-2xl flex flex-col gap-4 border-4 ${visuals.border} overflow-hidden relative group transition-all hover:scale-[1.01]`}>
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
                  <Icon className="w-32 h-32 text-white" />
                </div>
                
                <div className="flex items-start gap-6 relative z-10">
                  <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md shrink-0">
                    <Icon className="w-8 h-8 text-white animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter leading-none">{alert.event}</h3>
                        <span className="px-3 py-1 bg-white text-slate-900 text-[9px] font-black rounded-full uppercase tracking-widest shadow-lg">Active Alert</span>
                      </div>
                      <button 
                        onClick={() => toggleAlert(idx)}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                    
                    <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-12 opacity-80'}`}>
                      <p className="text-white/90 font-bold text-sm leading-relaxed mb-4 max-w-3xl">
                        {alert.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-black text-white/80 uppercase tracking-[0.1em] mt-4 pt-4 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        <span>Issued by: {alert.sender_name}</span>
                      </div>
                      <span>Valid until: {new Date(alert.end * 1000).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Primary Bio-State Telemetry — Day/Night themed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={`lg:col-span-2 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 shadow-xl border relative overflow-hidden ring-1 flex flex-col justify-between transition-all duration-700 ${cardBg}`}
          style={customCardStyle}>
          <div className={`absolute top-0 right-0 w-64 h-64 rounded-bl-[100%] opacity-20 -mr-20 -mt-20 pointer-events-none ${cardCornerGlow}`} />
          
          <div className="relative z-10 space-y-8 sm:space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center shadow-2xl flex-shrink-0 relative overflow-hidden ${cardBgAccent}`}
                  style={{
                    boxShadow: themeMode === 'full-dark'
                      ? '0 0 24px 4px rgba(59,130,246,0.3), 0 4px 16px rgba(0,0,0,0.5)'
                      : themeMode === 'partial-dark'
                      ? '0 0 20px 3px rgba(99,102,241,0.3), 0 4px 14px rgba(0,0,0,0.4)'
                      : '0 4px 24px rgba(0,0,0,0.15)'
                  }}>
                  {/* Enhanced animated weather icon background glow */}
                  <div className={`absolute inset-0 rounded-3xl animate-pulse opacity-40 ${
                    themeMode === 'full-dark' ? 'bg-blue-900' : themeMode === 'partial-dark' ? 'bg-indigo-800' : 'bg-teal-700'
                  }`} />
                  <img src={`https://openweathermap.org/img/wn/${data.icon}@2x.png`} alt={data.description} className="w-12 h-12 sm:w-14 sm:h-14 relative z-10 drop-shadow-lg" style={{ filter: themeMode !== 'light' ? 'drop-shadow(0 0 8px rgba(147,197,253,0.7)) brightness(1.15)' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div>
                      <h2 className={`text-lg sm:text-3xl font-black tracking-tighter uppercase leading-none truncate max-w-[180px] sm:max-w-none ${cardTextPrimary}`}>
                        {data.city.includes(',') ? data.city.slice(0, data.city.indexOf(',')).trim() : data.city}
                      </h2>
                      {data.city.includes(',') && (
                        <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest mt-0.5 opacity-70 ${cardTextSecondary}`}>
                          {data.city.slice(data.city.indexOf(',') + 1).trim()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-3">
                    <p className={`font-black text-xs sm:text-base uppercase tracking-tight ${cardTextSecondary}`}>
                      {data.description} &bull; {data.lat.toFixed(2)}, {data.lon.toFixed(2)}
                    </p>
                    <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-[0.2em] flex items-center gap-1.5 ${cardMetaBadge}`}>
                      {cardMetaIcon}
                      {cardMetaLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex sm:flex-col sm:items-end items-center justify-between sm:justify-start gap-3 sm:gap-0 mt-10 sm:mt-0">
                {localTime && (
                  <div className="flex flex-col sm:items-end sm:mb-3">
                    <div className={`flex items-center gap-1.5 ${cardTextSecondary}`}>
                      <Clock className="w-3.5 h-3.5" />
                      <span className={`text-xs sm:text-sm font-black tracking-widest tabular-nums ${cardTextPrimary}`}>{localTime}</span>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] mt-0.5 ${cardTextSecondary}`}>{localDate}</span>
                  </div>
                )}
                <div>
                  <div
                    className={`text-6xl sm:text-[90px] font-black tracking-tighter leading-none ${cardTextPrimary}`}
                    style={{
                      textShadow: themeMode === 'full-dark'
                        ? '0 0 40px rgba(96,165,250,0.5)'
                        : themeMode === 'partial-dark'
                        ? '0 0 30px rgba(129,140,248,0.4)'
                        : 'none'
                    }}>
                    {Math.round(data.temp)}&deg;
                  </div>
                  <div className={`text-xs font-black uppercase tracking-[0.3em] mt-1 sm:mt-2 ${cardTextSecondary}`}>Temperature</div>
                  <div className={`mt-2 sm:mt-4 flex items-center gap-2 ${cardTextSecondary}`}>
                    <Thermometer className="w-4 h-4" />
                    <span className="text-xs sm:text-sm font-black uppercase tracking-tight">Feels like {Math.round(data.feelsLike)}&deg;</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-10 gap-x-6">
              {[
                { icon: Droplets, label: 'Humidity', value: `${data.humidity}`, unit: '%' },
                { icon: CloudRain, label: 'Rain Chance', value: `${data.pop}`, unit: '%' },
                { icon: Wind, label: 'Wind Speed', value: `${data.windSpeed}`, unit: 'km/h', extra: getWindDir(data.windDeg) },
                { icon: Gauge, label: 'Pressure', value: `${data.pressure}`, unit: 'hPa' },
                { icon: Eye, label: 'Visibility', value: `${(data.visibility / 1000).toFixed(1)}`, unit: 'km' },
                { icon: ThermometerSnowflake, label: 'Dew Point', value: data.dewPoint !== null ? `${Math.round(data.dewPoint!)}` : 'N/A', unit: '°' },
                { icon: Zap, label: 'Wind Gusts', value: data.windGusts != null ? `${Math.round(data.windGusts)}` : 'N/A', unit: 'km/h' },
                { icon: CloudSun, label: 'Precip Today', value: data.precipitationSum != null ? `${data.precipitationSum.toFixed(1)}` : '0.0', unit: 'mm' },
              ].map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className={`flex items-center gap-2 ${cardTextSecondary}`}>
                    <item.icon className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">{item.label}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-3xl font-black tracking-tighter ${cardTextPrimary}`}>
                    {item.value}<span className="text-base ml-1">{item.unit}</span>
                    {item.extra && (
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-black border ${cardStatBox}`}>
                        <Navigation className="w-3 h-3" style={{ transform: `rotate(${data.windDeg}deg)` }} />
                        {item.extra}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Seasonal Ambience Scene ── */}
            {(() => {
              const _sceneDate = new Date(Date.now() + (data.utcOffsetSeconds ?? 0) * 1000);
              const month = _sceneDate.getUTCMonth();
              const localHour = _sceneDate.getUTCHours();
              // ── Time of day ──
              const autoTime = localHour >= 5 && localHour < 8 ? 'dawn'
                : localHour >= 8 && localHour < 17 ? 'day'
                : localHour >= 17 && localHour < 20 ? 'dusk'
                : 'night';
              const timeOfDay = autoTime as 'dawn'|'day'|'dusk'|'night';
              const isNight = timeOfDay === 'night';
              const isDawn = timeOfDay === 'dawn';
              const isDusk = timeOfDay === 'dusk';
              // ── Season ──
              const isNorthern = data.lat >= 0;
              let autoSeason: 'spring' | 'summer' | 'monsoon' | 'autumn' | 'pre-winter' | 'winter';
              if (month >= 2 && month <= 3) autoSeason = isNorthern ? 'spring' : 'autumn';
              else if (month >= 4 && month <= 5) autoSeason = isNorthern ? 'summer' : 'winter';
              else if (month >= 6 && month <= 7) autoSeason = isNorthern ? 'monsoon' : 'winter';
              else if (month >= 8 && month <= 9) autoSeason = isNorthern ? 'autumn' : 'summer';
              else if (month === 10) autoSeason = isNorthern ? 'pre-winter' : 'spring';
              else autoSeason = isNorthern ? 'winter' : 'monsoon';
              const season = autoSeason as 'spring' | 'summer' | 'monsoon' | 'autumn' | 'pre-winter' | 'winter';
              // ── Weather condition ──
              const desc = (data.description || '').toLowerCase();
              const clouds = data.clouds ?? 0;
              const precip = data.precipitation ?? 0;
              const autoWeather = (() => {
                if (desc.includes('thunderstorm')) return 'thunderstorm';
                if ((desc.includes('heavy') || desc.includes('violent')) && (desc.includes('rain') || desc.includes('shower'))) return 'heavy-rain';
                if (desc.includes('rain') || desc.includes('shower') || desc.includes('drizzle')) return desc.includes('light') || desc.includes('slight') || desc.includes('drizzle') ? 'drizzle' : 'rain';
                if (desc.includes('snow') || desc.includes('sleet') || desc.includes('blizzard') || desc.includes('flurr')) return 'snow';
                if (desc.includes('fog') || desc.includes('rime')) return 'fog';
                if (desc.includes('mist')) return 'mist';
                if (desc.includes('haze') || desc.includes('smoke') || desc.includes('dust') || desc.includes('sand')) return 'haze';
                if (clouds > 80) return 'cloudy';
                if (clouds > 35) return 'partly-cloudy';
                return 'clear';
              })();
              const weatherCondition = autoWeather;

              const petalData = [
                { l:'4%', delay:'0s', dur:'6s', s:10, c:'#fda4af', r:20 },
                { l:'12%', delay:'1.2s', dur:'7.5s', s:8, c:'#fbcfe8', r:-45 },
                { l:'22%', delay:'2.4s', dur:'5.8s', s:12, c:'#fecdd3', r:60 },
                { l:'33%', delay:'0.6s', dur:'8s', s:7, c:'#fda4af', r:-20 },
                { l:'44%', delay:'3s', dur:'6.5s', s:9, c:'#f9a8d4', r:30 },
                { l:'55%', delay:'1.8s', dur:'7s', s:11, c:'#fbcfe8', r:-55 },
                { l:'65%', delay:'0.3s', dur:'6.2s', s:8, c:'#fda4af', r:15 },
                { l:'75%', delay:'2.1s', dur:'8.5s', s:10, c:'#fecdd3', r:-35 },
                { l:'85%', delay:'1s', dur:'7.2s', s:7, c:'#f9a8d4', r:50 },
                { l:'93%', delay:'3.5s', dur:'5.5s', s:9, c:'#fda4af', r:-65 },
              ];
              const leafData = [
                { l:'3%', delay:'0s', dur:'4.5s', s:22, c:'#d97706', r:45 },
                { l:'11%', delay:'0.7s', dur:'6s', s:17, c:'#b45309', r:-30 },
                { l:'20%', delay:'1.5s', dur:'5s', s:24, c:'#dc2626', r:70 },
                { l:'28%', delay:'2.2s', dur:'7s', s:15, c:'#ea580c', r:-60 },
                { l:'37%', delay:'0.4s', dur:'5.5s', s:20, c:'#a16207', r:35 },
                { l:'46%', delay:'1s', dur:'4.8s', s:19, c:'#d97706', r:-45 },
                { l:'54%', delay:'3s', dur:'6.5s', s:16, c:'#9a3412', r:80 },
                { l:'63%', delay:'1.8s', dur:'5.2s', s:23, c:'#b45309', r:-20 },
                { l:'72%', delay:'0.9s', dur:'7.5s', s:14, c:'#ea580c', r:55 },
                { l:'80%', delay:'2.5s', dur:'4.2s', s:21, c:'#d97706', r:-75 },
                { l:'88%', delay:'1.3s', dur:'6s', s:18, c:'#dc2626', r:30 },
                { l:'93%', delay:'2.8s', dur:'5.8s', s:16, c:'#a16207', r:-50 },
              ];
              const snowData = [
                { l:'5%', delay:'0s', dur:'5s', s:6, o:0.8 },
                { l:'12%', delay:'1s', dur:'7s', s:4, o:0.6 },
                { l:'20%', delay:'2s', dur:'5.5s', s:8, o:0.9 },
                { l:'28%', delay:'0.5s', dur:'6.5s', s:5, o:0.7 },
                { l:'36%', delay:'1.5s', dur:'4.8s', s:7, o:0.85 },
                { l:'44%', delay:'3s', dur:'6s', s:4, o:0.6 },
                { l:'52%', delay:'0.8s', dur:'7.5s', s:9, o:0.95 },
                { l:'60%', delay:'2.2s', dur:'5.2s', s:5, o:0.75 },
                { l:'68%', delay:'1.2s', dur:'6.8s', s:6, o:0.8 },
                { l:'76%', delay:'3.5s', dur:'4.5s', s:7, o:0.7 },
                { l:'84%', delay:'0.3s', dur:'6s', s:4, o:0.6 },
                { l:'92%', delay:'1.8s', dur:'5.8s', s:8, o:0.9 },
              ];
              const butterflyData = [
                { l:'8%', t:'35%', delay:'0s', dur:'3s', s:18 },
                { l:'25%', t:'20%', delay:'1.2s', dur:'4s', s:14 },
                { l:'45%', t:'45%', delay:'0.6s', dur:'3.5s', s:20 },
                { l:'62%', t:'25%', delay:'2s', dur:'4.5s', s:16 },
                { l:'78%', t:'40%', delay:'0.9s', dur:'3.2s', s:18 },
                { l:'90%', t:'30%', delay:'1.8s', dur:'5s', s:12 },
              ];
              const rainData = [
                {l:'2%',delay:'0s',dur:'1.1s',w:1.5,o:0.55},{l:'6%',delay:'0.18s',dur:'1.3s',w:1.2,o:0.5},{l:'10%',delay:'0.42s',dur:'1.0s',w:1.8,o:0.65},{l:'14%',delay:'0.06s',dur:'1.15s',w:1.3,o:0.5},{l:'18%',delay:'0.28s',dur:'1.25s',w:1.6,o:0.6},{l:'22%',delay:'0.55s',dur:'0.95s',w:1.2,o:0.55},{l:'26%',delay:'0.12s',dur:'1.2s',w:1.5,o:0.6},{l:'30%',delay:'0.38s',dur:'1.0s',w:1.8,o:0.65},{l:'34%',delay:'0.7s',dur:'1.3s',w:1.2,o:0.5},{l:'38%',delay:'0.22s',dur:'1.1s',w:1.5,o:0.58},{l:'42%',delay:'0.48s',dur:'0.98s',w:1.3,o:0.55},{l:'46%',delay:'0.08s',dur:'1.18s',w:1.8,o:0.62},{l:'50%',delay:'0.35s',dur:'1.05s',w:1.6,o:0.6},{l:'54%',delay:'0.62s',dur:'1.25s',w:1.2,o:0.5},{l:'58%',delay:'0.15s',dur:'1.1s',w:1.5,o:0.58},{l:'62%',delay:'0.42s',dur:'0.95s',w:1.8,o:0.65},{l:'66%',delay:'0.25s',dur:'1.2s',w:1.3,o:0.55},{l:'70%',delay:'0.52s',dur:'1.15s',w:1.5,o:0.6},{l:'74%',delay:'0.05s',dur:'1.3s',w:1.2,o:0.5},{l:'78%',delay:'0.32s',dur:'1.0s',w:1.8,o:0.62},{l:'82%',delay:'0.6s',dur:'1.18s',w:1.4,o:0.58},{l:'86%',delay:'0.18s',dur:'1.08s',w:1.6,o:0.6},{l:'90%',delay:'0.45s',dur:'1.22s',w:1.2,o:0.52},{l:'94%',delay:'0.75s',dur:'0.95s',w:1.5,o:0.55},{l:'97%',delay:'0.28s',dur:'1.15s',w:1.3,o:0.5},
              ] as Array<{l:string,delay:string,dur:string,w:number,o:number}>;
              const nightStarData = [
                {x:30,y:14,s:1.8,d:2.1},{x:68,y:8,s:2.2,d:3.0},{x:112,y:22,s:1.5,d:2.6},{x:148,y:10,s:2.0,d:3.4},{x:192,y:28,s:1.6,d:2.2},{x:235,y:12,s:2.4,d:2.8},{x:278,y:20,s:1.8,d:3.1},{x:315,y:8,s:1.5,d:2.5},{x:358,y:18,s:2.1,d:2.9},{x:402,y:10,s:1.7,d:3.2},{x:445,y:25,s:2.0,d:2.4},{x:488,y:14,s:1.5,d:2.7},{x:532,y:8,s:2.3,d:3.0},{x:575,y:20,s:1.8,d:2.6},{x:618,y:12,s:1.5,d:3.3},{x:662,y:22,s:2.1,d:2.2},{x:705,y:8,s:1.6,d:2.8},{x:748,y:18,s:2.4,d:3.1},{x:792,y:12,s:1.7,d:2.5},{x:835,y:24,s:2.0,d:2.9},{x:872,y:10,s:1.5,d:3.4},{x:55,y:38,s:1.4,d:2.3},{x:105,y:44,s:1.6,d:2.7},{x:175,y:40,s:1.3,d:3.0},{x:258,y:46,s:1.5,d:2.4},{x:332,y:38,s:1.4,d:2.8},{x:415,y:42,s:1.6,d:3.2},{x:495,y:36,s:1.3,d:2.6},{x:568,y:44,s:1.5,d:2.9},{x:645,y:40,s:1.4,d:2.3},{x:718,y:46,s:1.6,d:3.1},{x:792,y:38,s:1.3,d:2.7},{x:858,y:42,s:1.5,d:2.5},
              ] as Array<{x:number,y:number,s:number,d:number}>;
              const sceneBg = isNight
                ? (season==='spring'?'#060c1c':season==='summer'?'#040810':season==='monsoon'?'#080e10':season==='autumn'?'#0b0600':season==='pre-winter'?'#060a18':'#050810')
                : isDawn
                ? (season==='spring'?'#3d1a4a':season==='summer'?'#3a1230':season==='monsoon'?'#1a1e2e':season==='autumn'?'#3d1a00':season==='pre-winter'?'#2a1a30':'#1a1e2e')
                : isDusk
                ? (season==='spring'?'#3d0a2a':season==='summer'?'#2e0a00':season==='monsoon'?'#1a1218':season==='autumn'?'#3d1800':season==='pre-winter'?'#252030':'#1a1525')
                : (season==='spring'?'#87ceeb':season==='summer'?'#0277bd':season==='monsoon'?'#263238':season==='autumn'?'#b24100':season==='pre-winter'?'#607d8b':'#0a1628');

              return (
                <>
                  <style>{`
                    @keyframes bxFallPetal{0%{transform:translateY(-20px) rotate(0deg) translateX(0px);opacity:0}10%{opacity:.9}85%{opacity:.7}100%{transform:translateY(230px) rotate(200deg) translateX(-30px);opacity:0}}
                    @keyframes bxFallLeaf{0%{transform:translateY(-20px) rotate(0deg) translateX(0px) scale(1);opacity:0}8%{opacity:1}88%{opacity:.8}100%{transform:translateY(230px) rotate(400deg) translateX(50px) scale(.9);opacity:0}}
                    @keyframes bxSnowfall{0%{transform:translateY(-10px) translateX(0px);opacity:0}10%{opacity:1}90%{opacity:.8}100%{transform:translateY(220px) translateX(15px);opacity:0}}
                    @keyframes bxButterfly{0%,100%{transform:translateY(0px) rotate(-5deg)}50%{transform:translateY(-12px) rotate(5deg)}}
                    @keyframes bxWingL{0%,100%{transform:scaleX(1) rotate(-10deg)}50%{transform:scaleX(.2) rotate(5deg)}}
                    @keyframes bxWingR{0%,100%{transform:scaleX(-1) rotate(10deg)}50%{transform:scaleX(-.2) rotate(-5deg)}}
                    @keyframes bxPulseSun{0%,100%{transform:scale(1);opacity:.15}50%{transform:scale(1.12);opacity:.28}}
                    @keyframes bxShimmer{0%{transform:translateX(-150%)}100%{transform:translateX(350%)}}
                    @keyframes bxRiver{0%,100%{transform:translateX(0)}50%{transform:translateX(-8px)}}
                    @keyframes bxBloom{0%{transform:scale(0) rotate(-30deg);opacity:0}70%{opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1}}
                    @keyframes bxFloat{0%,100%{transform:translateY(0px)}50%{transform:translateY(-5px)}}
                    @keyframes bxGlow{0%,100%{opacity:.4}50%{opacity:.85}}
                    @keyframes bxStarTwinkle{0%{opacity:.1}18%{opacity:1}36%{opacity:.22}54%{opacity:.88}72%{opacity:.12}88%{opacity:.95}100%{opacity:.1}}
                    @keyframes bxAurora{0%,100%{opacity:.12;transform:scaleX(1)}50%{opacity:.26;transform:scaleX(1.08)}}
                    @keyframes bxRain{0%{transform:translateY(-8px) translateX(0);opacity:0}8%{opacity:.72}92%{opacity:.6}100%{transform:translateY(285px) translateX(-22px);opacity:0}}
                    @keyframes bxLightning{0%,78%,100%{opacity:0}80%{opacity:.55}81%{opacity:.08}83%{opacity:.95}85%{opacity:.12}87%{opacity:.7}89%{opacity:0}}
                    @keyframes bxTwinkle{0%{opacity:.08}12%{opacity:.9}28%{opacity:.18}45%{opacity:1}62%{opacity:.14}78%{opacity:.85}92%{opacity:.08}100%{opacity:.08}}
                    @keyframes bxMoonGlow{0%,100%{opacity:.75}33%{opacity:1}66%{opacity:.82}}
                    @keyframes bxMoonHalo{0%,100%{opacity:.18}50%{opacity:.42}}
                    @keyframes bxFirefly{0%,100%{opacity:0;transform:translate(0,0)}25%{opacity:.95;transform:translate(10px,-14px)}50%{opacity:.35;transform:translate(18px,2px)}75%{opacity:.9;transform:translate(6px,12px)}}
                    @keyframes bxFrost{0%,100%{opacity:.35}50%{opacity:.6}}
                    @keyframes bxFrogJump{0%,100%{transform:translateY(0px) scaleY(1)}30%{transform:translateY(0px) scaleY(0.7)}50%{transform:translateY(-18px) scaleY(1.1)}70%{transform:translateY(-4px) scaleY(1)}85%{transform:translateY(0px) scaleY(0.85)}}
                    @keyframes bxDawnSweep{0%{opacity:0}30%{opacity:1}70%{opacity:1}100%{opacity:0}}
                    @keyframes bxDuskFade{0%,100%{opacity:.82}50%{opacity:.95}}
                    @keyframes bxFogDrift{0%{transform:translateX(-5%)}100%{transform:translateX(5%)}}
                    @keyframes bxHaze{0%,100%{opacity:.55}50%{opacity:.72}}
                    @keyframes bxCloudDrift{0%{transform:translateX(0)}100%{transform:translateX(30px)}}
                    @keyframes bxShootingStar{0%{transform:translateX(0) translateY(0);opacity:0}5%{opacity:1}25%{transform:translateX(200px) translateY(120px);opacity:0}100%{opacity:0}}
                  `}</style>

                  <div style={{ position:'relative', borderRadius:'1.25rem', overflow:'hidden', height:'360px', background: sceneBg }}>
                    {/* shimmer sweep */}
                    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
                      <div style={{ position:'absolute', top:0, left:0, width:'35%', height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)', animation:'bxShimmer 7s ease-in-out infinite 3s' }} />
                    </div>
                    {/* bottom vignette */}
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'80px', background:'linear-gradient(to top, rgba(0,0,0,0.22), transparent)', pointerEvents:'none', zIndex:10 }} />

                    {/* ── SPRING DAY ── full illustrated landscape ── */}
                    {season === 'spring' && !isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="spSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#29b6d4"/>
                              <stop offset="45%" stopColor="#81d4fa"/>
                              <stop offset="80%" stopColor="#d1eefc"/>
                              <stop offset="100%" stopColor="#f9f4ee"/>
                            </linearGradient>
                            <radialGradient id="spSun" cx="75%" cy="18%" r="18%">
                              <stop offset="0%" stopColor="#fffde7" stopOpacity="1"/>
                              <stop offset="50%" stopColor="#fff9c4" stopOpacity="0.55"/>
                              <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="spTrunkL" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#3b1f0a"/>
                              <stop offset="35%" stopColor="#6b3e1a"/>
                              <stop offset="100%" stopColor="#4a2c0e"/>
                            </linearGradient>
                            <linearGradient id="spRiver" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#90d5f0"/>
                              <stop offset="60%" stopColor="#60b8e0"/>
                              <stop offset="100%" stopColor="#4aa8d8"/>
                            </linearGradient>
                            <linearGradient id="spGrass" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7bc67f"/>
                              <stop offset="100%" stopColor="#3a8b40"/>
                            </linearGradient>
                          </defs>

                          {/* SKY */}
                          <rect width="900" height="300" fill="url(#spSky)"/>
                          {/* SUN */}
                          <ellipse cx="680" cy="50" rx="110" ry="85" fill="url(#spSun)"/>
                          <circle cx="680" cy="32" r="20" fill="#fff9c4" opacity="0.75"/>
                          <circle cx="680" cy="32" r="13" fill="#ffee82" opacity="0.55"/>

                          {/* CLOUDS */}
                          <g opacity="0.92">
                            <ellipse cx="155" cy="42" rx="58" ry="22" fill="white"/>
                            <ellipse cx="122" cy="52" rx="38" ry="17" fill="white"/>
                            <ellipse cx="192" cy="52" rx="42" ry="16" fill="white"/>
                            <ellipse cx="155" cy="58" rx="65" ry="13" fill="white" opacity="0.8"/>
                          </g>
                          <g opacity="0.78">
                            <ellipse cx="490" cy="30" rx="48" ry="18" fill="white"/>
                            <ellipse cx="462" cy="39" rx="32" ry="14" fill="white"/>
                            <ellipse cx="522" cy="39" rx="36" ry="14" fill="white"/>
                            <ellipse cx="490" cy="46" rx="52" ry="12" fill="white" opacity="0.75"/>
                          </g>
                          <g opacity="0.6">
                            <ellipse cx="320" cy="55" rx="34" ry="13" fill="white"/>
                            <ellipse cx="300" cy="62" rx="22" ry="10" fill="white"/>
                            <ellipse cx="342" cy="62" rx="26" ry="10" fill="white"/>
                          </g>

                          {/* FAR MOUNTAINS */}
                          <path d="M0,168 L70,108 L145,145 L230,88 L310,125 L395,78 L470,112 L550,72 L625,105 L710,62 L790,95 L860,68 L900,82 L900,205 L0,205 Z" fill="#c4b0d5" opacity="0.38"/>
                          <path d="M0,182 L90,128 L185,162 L290,112 L385,148 L480,105 L560,138 L650,98 L738,130 L820,100 L900,118 L900,210 L0,210 Z" fill="#d6c8e5" opacity="0.32"/>

                          {/* BACK HILL */}
                          <path d="M0,200 Q120,172 240,192 Q370,212 490,185 Q610,160 730,185 Q820,202 900,185 L900,230 L0,230 Z" fill="#a0d4a5" opacity="0.68"/>

                          {/* TREELINE (small background trees) */}
                          {([170,205,240,270,305,338,372] as number[]).map((x,i)=>{
                            const h=24+(i%3)*9; const cs=['#f48fb1','#ce93d8','#80cbc4','#a5d6a7','#f48fb1','#b39ddb','#80deea'];
                            return (<g key={i}><rect x={x+5} y={200-h} width={6} height={h} fill="#5d4037"/><ellipse cx={x+8} cy={200-h} rx={14+(i%2)*5} ry={h*0.55} fill={cs[i%7]} opacity={0.82}/></g>);
                          })}
                          {([540,572,604,636,665,695,724] as number[]).map((x,i)=>{
                            const h=22+(i%3)*8; const cs=['#a5d6a7','#80deea','#f48fb1','#ce93d8','#80cbc4','#b39ddb','#a5d6a7'];
                            return (<g key={i}><rect x={x+4} y={200-h} width={5} height={h} fill="#5d4037"/><ellipse cx={x+7} cy={200-h} rx={12+(i%2)*4} ry={h*0.52} fill={cs[i%7]} opacity={0.78}/></g>);
                          })}

                          {/* GRASS BACK */}
                          <path d="M0,215 Q120,198 250,212 Q390,228 520,208 Q650,190 800,210 Q860,218 900,208 L900,300 L0,300 Z" fill="#6abf70"/>

                          {/* RIVER winding down center */}
                          <path d="M415,200 Q425,218 408,238 Q392,255 405,272 Q415,283 420,300 L380,300 Q372,284 358,270 Q342,252 358,232 Q372,214 378,200 Z" fill="url(#spRiver)" opacity="0.88" style={{animation:'bxRiver 3.5s ease-in-out infinite'}}/>
                          <path d="M397,215 Q406,228 396,248" stroke="white" strokeWidth="3" fill="none" opacity="0.3" strokeLinecap="round"/>
                          <path d="M383,258 Q393,268 386,282" stroke="white" strokeWidth="2.5" fill="none" opacity="0.25" strokeLinecap="round"/>

                          {/* GRASS MID - left bank */}
                          <path d="M0,228 Q90,214 185,228 Q270,240 345,224 L345,300 L0,300 Z" fill="#55b05a"/>
                          {/* GRASS MID - right bank */}
                          <path d="M465,228 Q545,215 635,228 Q720,240 810,222 L900,228 L900,300 L465,300 Z" fill="#55b05a"/>
                          {/* GRASS FRONT */}
                          <path d="M0,248 Q180,235 360,248 L360,300 L0,300 Z" fill="#459948"/>
                          <path d="M448,248 Q620,236 810,248 Q865,252 900,246 L900,300 L448,300 Z" fill="#459948"/>
                          <path d="M0,268 Q200,256 400,268 L400,300 L0,300 Z" fill="#3a8b40" opacity="0.75"/>
                          <path d="M436,268 Q630,257 870,268 L900,266 L900,300 L436,300 Z" fill="#3a8b40" opacity="0.75"/>

                          {/* GRASS BLADES */}
                          {([18,42,68,95,122,150,178,205,232,260,288,315] as number[]).map((x,i)=>(
                            <g key={i} opacity="0.72">
                              <path d={`M${x},300 Q${x-5},${278-(i%3)*5} ${x-8},${268-(i%2)*7}`} stroke={i%2===0?'#2e7d32':'#388e3c'} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                              <path d={`M${x+4},300 Q${x+9},${274-(i%2)*4} ${x+12},${264-(i%3)*6}`} stroke={i%3===0?'#388e3c':'#2e7d32'} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                            </g>
                          ))}
                          {([468,495,522,550,578,608,636,664,692,720,748,776,805,835,862,888] as number[]).map((x,i)=>(
                            <g key={i} opacity="0.7">
                              <path d={`M${x},300 Q${x-5},${280-(i%3)*4} ${x-7},${270-(i%2)*6}`} stroke={i%2===0?'#2e7d32':'#388e3c'} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
                              <path d={`M${x+4},300 Q${x+8},${276-(i%2)*4} ${x+11},${266-(i%3)*5}`} stroke={i%3===0?'#388e3c':'#2e7d32'} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
                            </g>
                          ))}

                          {/* ── LEFT CHERRY TREE ── */}
                          <g>
                            <ellipse cx="118" cy="296" rx="62" ry="9" fill="rgba(0,0,0,0.13)"/>
                            {/* trunk */}
                            <path d="M102,300 Q108,255 105,210 Q102,178 110,145 Q116,120 108,88" stroke="url(#spTrunkL)" strokeWidth="22" fill="none" strokeLinecap="round"/>
                            <path d="M122,300 Q126,260 122,222" stroke="#6b3e1a" strokeWidth="15" fill="none" strokeLinecap="round"/>
                            {/* bark detail */}
                            <path d="M109,200 Q107,185 110,170" stroke="#3b1f0a" strokeWidth="3" fill="none" opacity="0.4" strokeLinecap="round"/>
                            {/* main branches */}
                            <path d="M110,148 Q72,118 32,92" stroke="#4a2a10" strokeWidth="11" fill="none" strokeLinecap="round"/>
                            <path d="M110,148 Q95,108 82,76" stroke="#4a2a10" strokeWidth="9" fill="none" strokeLinecap="round"/>
                            <path d="M110,160 Q148,128 182,105" stroke="#4a2a10" strokeWidth="10" fill="none" strokeLinecap="round"/>
                            <path d="M110,162 Q152,148 188,152" stroke="#4a2a10" strokeWidth="7" fill="none" strokeLinecap="round"/>
                            <path d="M110,175 Q78,165 46,162" stroke="#4a2a10" strokeWidth="6" fill="none" strokeLinecap="round"/>
                            {/* sub branches */}
                            <path d="M32,92 Q10,74 0,62" stroke="#4a2a10" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M32,92 Q26,68 20,52" stroke="#4a2a10" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M82,76 Q72,52 65,34" stroke="#4a2a10" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M82,76 Q95,55 98,35" stroke="#4a2a10" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M182,105 Q205,85 222,68" stroke="#4a2a10" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M182,105 Q195,80 202,58" stroke="#4a2a10" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M46,162 Q28,155 12,152" stroke="#4a2a10" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            {/* BLOSSOM CANOPY - layered ellipses */}
                            {/* deep pink base layer */}
                            <ellipse cx="62" cy="82" rx="54" ry="40" fill="#f06292" opacity="0.55"/>
                            <ellipse cx="32" cy="78" rx="38" ry="30" fill="#ec407a" opacity="0.48"/>
                            <ellipse cx="96" cy="75" rx="44" ry="34" fill="#f06292" opacity="0.45"/>
                            <ellipse cx="148" cy="108" rx="46" ry="34" fill="#f06292" opacity="0.5"/>
                            {/* main pink mid layer */}
                            <ellipse cx="58" cy="70" rx="52" ry="38" fill="#f48fb1" opacity="0.8"/>
                            <ellipse cx="28" cy="66" rx="36" ry="28" fill="#f48fb1" opacity="0.75"/>
                            <ellipse cx="94" cy="62" rx="46" ry="34" fill="#f48fb1" opacity="0.72"/>
                            <ellipse cx="22" cy="82" rx="30" ry="24" fill="#f8bbd9" opacity="0.85"/>
                            <ellipse cx="112" cy="78" rx="38" ry="28" fill="#f48fb1" opacity="0.78"/>
                            <ellipse cx="145" cy="95" rx="44" ry="32" fill="#f48fb1" opacity="0.82"/>
                            <ellipse cx="170" cy="78" rx="36" ry="26" fill="#f8bbd9" opacity="0.75"/>
                            {/* light pink top layer */}
                            <ellipse cx="55" cy="55" rx="44" ry="32" fill="#fce4ec" opacity="0.88"/>
                            <ellipse cx="20" cy="62" rx="28" ry="22" fill="#fce4ec" opacity="0.82"/>
                            <ellipse cx="90" cy="48" rx="40" ry="28" fill="#fce4ec" opacity="0.8"/>
                            <ellipse cx="48" cy="42" rx="32" ry="22" fill="#fce4ec" opacity="0.78"/>
                            <ellipse cx="152" cy="80" rx="40" ry="28" fill="#fce4ec" opacity="0.82"/>
                            <ellipse cx="172" cy="62" rx="32" ry="22" fill="#fce4ec" opacity="0.75"/>
                            <ellipse cx="62" cy="112" rx="36" ry="22" fill="#fce4ec" opacity="0.65"/>
                            <ellipse cx="42" cy="125" rx="28" ry="18" fill="#fce4ec" opacity="0.55"/>
                            {/* white bloom highlights */}
                            <ellipse cx="38" cy="48" rx="20" ry="14" fill="white" opacity="0.32"/>
                            <ellipse cx="72" cy="38" rx="18" ry="12" fill="white" opacity="0.28"/>
                            <ellipse cx="105" cy="44" rx="16" ry="11" fill="white" opacity="0.25"/>
                            <ellipse cx="158" cy="68" rx="15" ry="10" fill="white" opacity="0.22"/>
                          </g>

                          {/* ── RIGHT CHERRY TREE ── */}
                          <g>
                            <ellipse cx="790" cy="296" rx="58" ry="8" fill="rgba(0,0,0,0.11)"/>
                            {/* trunk */}
                            <path d="M800,300 Q795,255 798,208 Q800,175 793,148 Q787,122 794,90" stroke="url(#spTrunkL)" strokeWidth="20" fill="none" strokeLinecap="round"/>
                            <path d="M782,300 Q780,258 783,220" stroke="#6b3e1a" strokeWidth="13" fill="none" strokeLinecap="round"/>
                            <path d="M793,195 Q795,180 792,165" stroke="#3b1f0a" strokeWidth="3" fill="none" opacity="0.4" strokeLinecap="round"/>
                            {/* main branches */}
                            <path d="M793,150 Q838,118 876,90" stroke="#4a2a10" strokeWidth="10" fill="none" strokeLinecap="round"/>
                            <path d="M793,150 Q815,112 828,78" stroke="#4a2a10" strokeWidth="8.5" fill="none" strokeLinecap="round"/>
                            <path d="M793,164 Q755,132 718,108" stroke="#4a2a10" strokeWidth="9.5" fill="none" strokeLinecap="round"/>
                            <path d="M793,166 Q756,152 720,156" stroke="#4a2a10" strokeWidth="6.5" fill="none" strokeLinecap="round"/>
                            <path d="M793,180 Q828,168 860,165" stroke="#4a2a10" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                            {/* sub branches */}
                            <path d="M876,90 Q898,72 910,58" stroke="#4a2a10" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M876,90 Q882,68 885,52" stroke="#4a2a10" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M828,78 Q835,56 836,36" stroke="#4a2a10" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M828,78 Q815,55 810,35" stroke="#4a2a10" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M718,108 Q698,88 682,70" stroke="#4a2a10" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M718,108 Q710,84 706,62" stroke="#4a2a10" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M860,165 Q878,158 896,155" stroke="#4a2a10" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            {/* BLOSSOM CANOPY */}
                            {/* deep base */}
                            <ellipse cx="842" cy="82" rx="54" ry="40" fill="#f06292" opacity="0.55"/>
                            <ellipse cx="875" cy="76" rx="40" ry="30" fill="#ec407a" opacity="0.48"/>
                            <ellipse cx="806" cy="78" rx="44" ry="34" fill="#f06292" opacity="0.45"/>
                            <ellipse cx="752" cy="110" rx="46" ry="33" fill="#f06292" opacity="0.5"/>
                            {/* mid pink */}
                            <ellipse cx="846" cy="68" rx="54" ry="38" fill="#f48fb1" opacity="0.82"/>
                            <ellipse cx="878" cy="62" rx="38" ry="28" fill="#f48fb1" opacity="0.76"/>
                            <ellipse cx="808" cy="64" rx="46" ry="34" fill="#f48fb1" opacity="0.73"/>
                            <ellipse cx="882" cy="80" rx="32" ry="25" fill="#f8bbd9" opacity="0.85"/>
                            <ellipse cx="790" cy="80" rx="36" ry="28" fill="#f48fb1" opacity="0.78"/>
                            <ellipse cx="754" cy="96" rx="44" ry="32" fill="#f48fb1" opacity="0.82"/>
                            <ellipse cx="728" cy="80" rx="36" ry="26" fill="#f8bbd9" opacity="0.75"/>
                            {/* light pink top */}
                            <ellipse cx="848" cy="52" rx="46" ry="32" fill="#fce4ec" opacity="0.88"/>
                            <ellipse cx="882" cy="45" rx="30" ry="22" fill="#fce4ec" opacity="0.82"/>
                            <ellipse cx="812" cy="48" rx="40" ry="28" fill="#fce4ec" opacity="0.8"/>
                            <ellipse cx="855" cy="36" rx="28" ry="20" fill="#fce4ec" opacity="0.78"/>
                            <ellipse cx="748" cy="82" rx="40" ry="28" fill="#fce4ec" opacity="0.82"/>
                            <ellipse cx="725" cy="64" rx="30" ry="21" fill="#fce4ec" opacity="0.75"/>
                            <ellipse cx="838" cy="115" rx="35" ry="21" fill="#fce4ec" opacity="0.65"/>
                            <ellipse cx="860" cy="128" rx="26" ry="17" fill="#fce4ec" opacity="0.55"/>
                            {/* highlights */}
                            <ellipse cx="862" cy="42" rx="18" ry="12" fill="white" opacity="0.32"/>
                            <ellipse cx="828" cy="34" rx="16" ry="11" fill="white" opacity="0.28"/>
                            <ellipse cx="796" cy="45" rx="15" ry="10" fill="white" opacity="0.25"/>
                            <ellipse cx="740" cy="70" rx="14" ry="9" fill="white" opacity="0.22"/>
                          </g>

                          {/* FLOWERS - left meadow */}
                          {([{x:22,y:270,p:'#f48fb1',c:'#ffd54f'},{x:48,y:278,p:'white',c:'#ffd54f'},{x:76,y:272,p:'#fff176',c:'#ff8f00'},{x:102,y:280,p:'#f06292',c:'#ffd54f'},{x:130,y:274,p:'white',c:'#ffd54f'},{x:158,y:282,p:'#ce93d8',c:'#ffd54f'},{x:184,y:275,p:'#f48fb1',c:'#ffd54f'},{x:212,y:283,p:'white',c:'#ffd54f'},{x:238,y:276,p:'#fff176',c:'#e65100'},{x:265,y:284,p:'#f48fb1',c:'#ffd54f'},{x:292,y:278,p:'white',c:'#ffd54f'},{x:318,y:285,p:'#ce93d8',c:'#ffd54f'}] as Array<{x:number,y:number,p:string,c:string}>).map((fl,i)=>(
                            <g key={i}>
                              <ellipse cx={fl.x} cy={fl.y-5} rx="4.5" ry="2.8" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x} cy={fl.y+5} rx="4.5" ry="2.8" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x-5} cy={fl.y} rx="2.8" ry="4.5" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x+5} cy={fl.y} rx="2.8" ry="4.5" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x-3.5} cy={fl.y-3.5} rx="3" ry="3" fill={fl.p} opacity="0.85"/>
                              <ellipse cx={fl.x+3.5} cy={fl.y-3.5} rx="3" ry="3" fill={fl.p} opacity="0.85"/>
                              <ellipse cx={fl.x-3.5} cy={fl.y+3.5} rx="3" ry="3" fill={fl.p} opacity="0.85"/>
                              <ellipse cx={fl.x+3.5} cy={fl.y+3.5} rx="3" ry="3" fill={fl.p} opacity="0.85"/>
                              <circle cx={fl.x} cy={fl.y} r="3" fill={fl.c}/>
                              <line x1={fl.x} y1={fl.y+7} x2={fl.x} y2={fl.y+14} stroke="#2e7d32" strokeWidth="1.5"/>
                            </g>
                          ))}

                          {/* FLOWERS - right meadow */}
                          {([{x:466,y:272,p:'#f48fb1'},{x:492,y:280,p:'white'},{x:520,y:274,p:'#fff176'},{x:548,y:282,p:'#f06292'},{x:575,y:276,p:'white'},{x:602,y:284,p:'#ce93d8'},{x:628,y:277,p:'#f48fb1'},{x:656,y:285,p:'white'},{x:682,y:278,p:'#fff176'},{x:708,y:286,p:'#f06292'},{x:735,y:279,p:'white'},{x:762,y:287,p:'#ce93d8'},{x:788,y:280,p:'#f48fb1'},{x:815,y:274,p:'white'},{x:842,y:282,p:'#fff176'},{x:870,y:276,p:'#f06292'}] as Array<{x:number,y:number,p:string}>).map((fl,i)=>(
                            <g key={i}>
                              <ellipse cx={fl.x} cy={fl.y-5} rx="4.5" ry="2.8" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x} cy={fl.y+5} rx="4.5" ry="2.8" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x-5} cy={fl.y} rx="2.8" ry="4.5" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x+5} cy={fl.y} rx="2.8" ry="4.5" fill={fl.p} opacity="0.9"/>
                              <ellipse cx={fl.x-3.5} cy={fl.y-3.5} rx="3" ry="3" fill={fl.p} opacity="0.85"/>
                              <ellipse cx={fl.x+3.5} cy={fl.y+3.5} rx="3" ry="3" fill={fl.p} opacity="0.85"/>
                              <circle cx={fl.x} cy={fl.y} r="3" fill="#ffd54f"/>
                              <line x1={fl.x} y1={fl.y+7} x2={fl.x} y2={fl.y+14} stroke="#2e7d32" strokeWidth="1.5"/>
                            </g>
                          ))}

                          {/* RIVER BANK FLOWERS */}
                          {([{x:340,y:258,p:'#f06292'},{x:356,y:266,p:'white'},{x:370,y:255,p:'#f48fb1'},{x:432,y:257,p:'#fff176'},{x:447,y:265,p:'white'},{x:462,y:254,p:'#ce93d8'}] as Array<{x:number,y:number,p:string}>).map((fl,i)=>(
                            <g key={i}>
                              <ellipse cx={fl.x} cy={fl.y-4} rx="3.8" ry="2.4" fill={fl.p} opacity="0.88"/>
                              <ellipse cx={fl.x} cy={fl.y+4} rx="3.8" ry="2.4" fill={fl.p} opacity="0.88"/>
                              <ellipse cx={fl.x-4} cy={fl.y} rx="2.4" ry="3.8" fill={fl.p} opacity="0.88"/>
                              <ellipse cx={fl.x+4} cy={fl.y} rx="2.4" ry="3.8" fill={fl.p} opacity="0.88"/>
                              <circle cx={fl.x} cy={fl.y} r="2.5" fill="#ffd54f"/>
                            </g>
                          ))}
                        </svg>

                        {/* FALLING PETALS */}
                        {petalData.map((p,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-15px', left:p.l, width:`${p.s}px`, height:`${p.s*.65}px`, borderRadius:'50% 0 50% 0', background:p.c, opacity:.82, animation:`bxFallPetal ${p.dur} ease-in-out infinite`, animationDelay:p.delay, transform:`rotate(${p.r}deg)` }}/>
                        ))}
                        {([{l:'62%',delay:'0.4s',dur:'7s',s:10,c:'#fce4ec',r:40},{l:'70%',delay:'1.7s',dur:'5.8s',s:8,c:'#f8bbd9',r:-28},{l:'78%',delay:'3s',dur:'6.8s',s:11,c:'#fda4af',r:55},{l:'86%',delay:'0.8s',dur:'7.8s',s:9,c:'#fce4ec',r:-50},{l:'94%',delay:'2.3s',dur:'6.2s',s:7,c:'#f48fb1',r:38}]).map((p,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-15px', left:p.l, width:`${p.s}px`, height:`${p.s*.65}px`, borderRadius:'50% 0 50% 0', background:p.c, opacity:.8, animation:`bxFallPetal ${p.dur} ease-in-out infinite`, animationDelay:p.delay, transform:`rotate(${p.r}deg)` }}/>
                        ))}
                      </div>
                    )}

                    {/* ── SUMMER DAY ── full illustrated landscape ── */}
                    {season === 'summer' && !isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 260" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="smSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0277bd"/>
                              <stop offset="40%" stopColor="#0288d1"/>
                              <stop offset="75%" stopColor="#29b6f6"/>
                              <stop offset="100%" stopColor="#fff9e6"/>
                            </linearGradient>
                            <radialGradient id="smSun" cx="72%" cy="14%" r="22%">
                              <stop offset="0%" stopColor="#fff9c4"/>
                              <stop offset="30%" stopColor="#ffe082" stopOpacity="0.9"/>
                              <stop offset="70%" stopColor="#ffb300" stopOpacity="0.3"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="smOcean" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0288d1"/>
                              <stop offset="50%" stopColor="#0277bd"/>
                              <stop offset="100%" stopColor="#01579b"/>
                            </linearGradient>
                            <linearGradient id="smSand" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ffe082"/>
                              <stop offset="100%" stopColor="#ffca28"/>
                            </linearGradient>
                            <linearGradient id="smGrass" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#66bb6a"/>
                              <stop offset="100%" stopColor="#2e7d32"/>
                            </linearGradient>
                          </defs>

                          {/* SKY */}
                          <rect width="900" height="260" fill="url(#smSky)"/>
                          {/* SUN glow */}
                          <ellipse cx="648" cy="38" rx="140" ry="100" fill="url(#smSun)"/>
                          <circle cx="648" cy="24" r="26" fill="#fff9c4" opacity="0.9"/>
                          <circle cx="648" cy="24" r="18" fill="#ffee58" opacity="0.75"/>
                          {/* sun rays */}
                          {[0,30,60,90,120,150,180,210,240,270,300,330].map((a,i)=>(
                            <line key={i} x1={648+Math.cos(a*Math.PI/180)*28} y1={24+Math.sin(a*Math.PI/180)*28} x2={648+Math.cos(a*Math.PI/180)*55} y2={24+Math.sin(a*Math.PI/180)*55} stroke="#ffe082" strokeWidth="2.5" opacity="0.45" strokeLinecap="round"/>
                          ))}

                          {/* CLOUDS */}
                          <g opacity="0.88">
                            <ellipse cx="180" cy="38" rx="65" ry="24" fill="white"/>
                            <ellipse cx="148" cy="50" rx="42" ry="19" fill="white"/>
                            <ellipse cx="215" cy="50" rx="48" ry="18" fill="white"/>
                            <ellipse cx="180" cy="58" rx="70" ry="14" fill="white" opacity="0.7"/>
                          </g>
                          <g opacity="0.72">
                            <ellipse cx="440" cy="26" rx="50" ry="19" fill="white"/>
                            <ellipse cx="412" cy="36" rx="34" ry="15" fill="white"/>
                            <ellipse cx="470" cy="36" rx="38" ry="15" fill="white"/>
                          </g>
                          <g opacity="0.55">
                            <ellipse cx="310" cy="50" rx="36" ry="14" fill="white"/>
                            <ellipse cx="288" cy="58" rx="24" ry="11" fill="white"/>
                            <ellipse cx="334" cy="58" rx="28" ry="11" fill="white"/>
                          </g>

                          {/* OCEAN */}
                          <path d="M0,155 Q225,140 450,152 Q675,164 900,148 L900,260 L0,260 Z" fill="url(#smOcean)"/>
                          {/* ocean shimmer lines */}
                          {[165,175,185,195].map((y,i)=>(
                            <path key={i} d={`M${i*80},${y} Q${110+i*80},${y-6} ${200+i*80},${y} Q${290+i*80},${y+6} ${370+i*80},${y}`} stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                          ))}
                          {/* wave crests */}
                          <path d="M0,158 Q60,148 120,158 Q180,168 240,156 Q300,145 360,158 Q420,170 480,156 Q540,143 600,158 Q660,172 720,156 Q780,143 840,158 Q875,164 900,156" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none"/>

                          {/* SANDY BEACH */}
                          <path d="M0,175 Q120,162 250,170 Q390,178 520,164 Q660,152 800,166 Q860,172 900,163 L900,220 L0,220 Z" fill="url(#smSand)"/>
                          <path d="M0,195 Q150,183 300,192 Q450,200 600,185 Q750,172 900,182 L900,220 L0,220 Z" fill="#ffd54f" opacity="0.65"/>
                          {/* sand texture dots */}
                          {([{x:55,y:200},{x:130,y:205},{x:210,y:198},{x:295,y:207},{x:375,y:202},{x:455,y:196},{x:535,y:204},{x:618,y:199},{x:695,y:207},{x:778,y:198},{x:852,y:205}] as Array<{x:number,y:number}>).map((d,i)=>(
                            <ellipse key={i} cx={d.x} cy={d.y} rx={3+(i%3)} ry={1.5} fill="#ffb300" opacity="0.25"/>
                          ))}

                          {/* GRASS LEFT CLIFF */}
                          <path d="M0,148 Q45,128 90,142 Q115,150 140,138 L140,220 L0,220 Z" fill="#43a047"/>
                          <path d="M0,140 Q35,122 72,136 Q95,144 115,132" stroke="#2e7d32" strokeWidth="3" fill="none"/>
                          {/* grass blades left */}
                          {[8,22,35,48,62,76,92,108,124].map((x,i)=>(
                            <g key={i}>
                              <path d={`M${x},148 Q${x-4},${132-(i%2)*6} ${x-6},${122-(i%3)*5}`} stroke={i%2===0?'#2e7d32':'#388e3c'} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                              <path d={`M${x+5},148 Q${x+9},${128-(i%3)*4} ${x+12},${118-(i%2)*6}`} stroke="#1b5e20" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
                            </g>
                          ))}

                          {/* GRASS RIGHT CLIFF */}
                          <path d="M760,138 Q800,122 840,135 Q870,144 900,130 L900,220 L760,220 Z" fill="#43a047"/>
                          {[765,778,792,808,822,836,850,865,880,895].map((x,i)=>(
                            <g key={i}>
                              <path d={`M${x},140 Q${x-3},${124-(i%2)*5} ${x-5},${114-(i%3)*4}`} stroke={i%2===0?'#2e7d32':'#388e3c'} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
                              <path d={`M${x+4},140 Q${x+7},${120-(i%3)*4} ${x+10},${110-(i%2)*5}`} stroke="#1b5e20" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
                            </g>
                          ))}

                          {/* PALM TREE LEFT */}
                          <g>
                            <path d="M72,220 Q68,185 65,155 Q62,130 70,105" stroke="#5d4037" strokeWidth="10" fill="none" strokeLinecap="round"/>
                            <path d="M70,107 Q38,88 10,75" stroke="#33691e" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M70,107 Q60,78 55,55" stroke="#33691e" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M70,107 Q88,82 100,62" stroke="#33691e" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M70,107 Q100,96 128,90" stroke="#33691e" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M70,107 Q42,102 18,102" stroke="#33691e" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            {/* fronds */}
                            <path d="M10,75 Q0,62 -5,48" stroke="#558b2f" strokeWidth="6" fill="none" strokeLinecap="round"/>
                            <path d="M10,75 Q18,60 22,44" stroke="#558b2f" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M55,55 Q52,40 55,25" stroke="#558b2f" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M55,55 Q62,40 68,24" stroke="#558b2f" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M100,62 Q110,50 118,36" stroke="#558b2f" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M100,62 Q105,48 102,32" stroke="#558b2f" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M128,90 Q142,84 152,76" stroke="#558b2f" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M18,102 Q4,100 -8,98" stroke="#558b2f" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            {/* coconuts */}
                            <circle cx="68" cy="110" r="5" fill="#4e342e"/>
                            <circle cx="75" cy="115" r="4.5" fill="#5d4037"/>
                          </g>

                          {/* PALM TREE RIGHT */}
                          <g>
                            <path d="M838,220 Q843,184 846,152 Q849,126 840,100" stroke="#5d4037" strokeWidth="9" fill="none" strokeLinecap="round"/>
                            <path d="M840,102 Q872,82 898,68" stroke="#33691e" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M840,102 Q850,74 854,50" stroke="#33691e" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M840,102 Q822,76 812,54" stroke="#33691e" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M840,102 Q812,92 784,88" stroke="#33691e" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M840,102 Q866,100 890,100" stroke="#33691e" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M898,68 Q908,54 914,40" stroke="#558b2f" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                            <path d="M898,68 Q902,52 898,36" stroke="#558b2f" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M854,50 Q857,34 854,18" stroke="#558b2f" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M812,54 Q802,40 796,25" stroke="#558b2f" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M784,88 Q770,82 758,74" stroke="#558b2f" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <circle cx="842" cy="105" r="5" fill="#4e342e"/>
                            <circle cx="835" cy="110" r="4.5" fill="#5d4037"/>
                          </g>

                          {/* BEACH UMBRELLA */}
                          <g>
                            <line x1="420" y1="188" x2="420" y2="220" stroke="#8d6e63" strokeWidth="3"/>
                            <path d="M370,188 Q420,165 470,188 Z" fill="#e53935" opacity="0.92"/>
                            <path d="M370,188 Q395,178 420,188" fill="#ffb300" opacity="0.9"/>
                            <path d="M420,188 Q445,178 470,188" fill="#e53935" opacity="0.85"/>
                            <ellipse cx="420" cy="188" rx="50" ry="4" fill="#b71c1c" opacity="0.4"/>
                          </g>

                          {/* SUNBATHER (simple) */}
                          <ellipse cx="390" cy="214" rx="22" ry="5" fill="#ffb74d" opacity="0.85"/>
                          <circle cx="368" cy="212" r="6" fill="#ffcc80" opacity="0.9"/>

                          {/* SEAGULLS */}
                          {([{x:220,y:65},{x:235,y:58},{x:310,y:45},{x:322,y:42},{x:560,y:72},{x:572,y:68}] as Array<{x:number,y:number}>).map((b,i)=>(
                            <g key={i}>
                              <path d={`M${b.x-8},${b.y} Q${b.x},${b.y-7} ${b.x+8},${b.y}`} stroke="#546e7a" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                            </g>
                          ))}

                          {/* SUNFLOWERS RIGHT CLIFF */}
                          {([{x:775,y:132},{x:795,y:128},{x:815,y:134},{x:835,y:129},{x:855,y:134},{x:875,y:129},{x:893,y:133}] as Array<{x:number,y:number}>).map((f,i)=>(
                            <g key={i}>
                              <line x1={f.x} y1={f.y+2} x2={f.x} y2={f.y+18} stroke="#388e3c" strokeWidth="2"/>
                              {[0,45,90,135,180,225,270,315].map((a,j)=>(
                                <ellipse key={j} cx={f.x+Math.cos(a*Math.PI/180)*5.5} cy={f.y+Math.sin(a*Math.PI/180)*5.5} rx="2.8" ry="1.5" fill="#ffb300" opacity="0.9" transform={`rotate(${a},${f.x+Math.cos(a*Math.PI/180)*5.5},${f.y+Math.sin(a*Math.PI/180)*5.5})`}/>
                              ))}
                              <circle cx={f.x} cy={f.y} r="3.5" fill="#5d4037"/>
                            </g>
                          ))}

                          {/* SAILBOAT on ocean */}
                          <g style={{animation:'bxBobBoat 4s ease-in-out infinite'}}>
                            <path d="M310,162 L310,148 L285,158 Z" fill="white" opacity="0.92"/>
                            <path d="M312,162 L312,150 L340,160 Z" fill="#e53935" opacity="0.88"/>
                            <line x1="311" y1="162" x2="311" y2="148" stroke="#5d4037" strokeWidth="1.5"/>
                            <path d="M295,163 Q311,161 328,163 Q318,168 295,168 Z" fill="#6d4c41" opacity="0.85"/>
                          </g>

                          {/* HEAT HAZE shimmer over sand */}
                          <ellipse cx="450" cy="175" rx="380" ry="10" fill="rgba(255,240,180,0.15)" style={{animation:'bxHeatHaze 3s ease-in-out infinite'}}/>
                          <ellipse cx="300" cy="185" rx="200" ry="7" fill="rgba(255,235,150,0.12)" style={{animation:'bxHeatHaze 4s ease-in-out infinite',animationDelay:'1s'}}/>

                          {/* MORE SEAGULLS (higher up) */}
                          {([{x:480,y:32},{x:496,y:26},{x:512,y:30},{x:50,y:30},{x:64,y:24}] as Array<{x:number,y:number}>).map((b,i)=>(
                            <path key={i} d={`M${b.x-7},${b.y} Q${b.x},${b.y-6} ${b.x+7},${b.y}`} stroke="#90a4ae" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
                          ))}

                          {/* sun reflection path on ocean */}
                          <path d="M540,155 Q580,160 620,158 Q640,156 660,160" stroke="rgba(255,236,100,0.35)" strokeWidth="3" fill="none" strokeLinecap="round"/>
                          <ellipse cx="600" cy="160" rx="65" ry="6" fill="rgba(255,228,80,0.18)"/>
                        </svg>

                        {/* BUTTERFLIES */}
                        {butterflyData.map((b,i)=>(
                          <div key={i} style={{ position:'absolute', left:b.l, top:b.t, animation:`bxButterfly ${b.dur} ease-in-out infinite`, animationDelay:b.delay }}>
                            <svg viewBox="0 0 40 30" width={b.s} height={b.s*.75}>
                              <ellipse cx="10" cy="12" rx="9" ry="6" fill={(['#fb7185','#a78bfa','#60a5fa','#34d399','#fbbf24','#f472b6'] as const)[i%6]} opacity={.88} style={{animation:'bxWingL 0.45s ease-in-out infinite',transformOrigin:'19px 15px'}}/>
                              <ellipse cx="30" cy="12" rx="9" ry="6" fill={(['#fb7185','#a78bfa','#60a5fa','#34d399','#fbbf24','#f472b6'] as const)[i%6]} opacity={.88} style={{animation:'bxWingR 0.45s ease-in-out infinite',transformOrigin:'21px 15px'}}/>
                              <ellipse cx="20" cy="12" rx="2.5" ry="6.5" fill="#1e293b" opacity={.75}/>
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── AUTUMN DAY ── full illustrated landscape ── */}
                    {season === 'autumn' && !isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 260" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="auSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#b24100"/>
                              <stop offset="30%" stopColor="#e65100"/>
                              <stop offset="65%" stopColor="#ff8f00"/>
                              <stop offset="100%" stopColor="#ffcc02"/>
                            </linearGradient>
                            <radialGradient id="auSun" cx="62%" cy="22%" r="20%">
                              <stop offset="0%" stopColor="#fff9c4" stopOpacity="0.95"/>
                              <stop offset="40%" stopColor="#ffcc02" stopOpacity="0.5"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="auRiver" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#e65100" stopOpacity="0.7"/>
                              <stop offset="50%" stopColor="#bf360c" stopOpacity="0.8"/>
                              <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.85"/>
                            </linearGradient>
                            <linearGradient id="auGround" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7c2d12"/>
                              <stop offset="100%" stopColor="#431407"/>
                            </linearGradient>
                          </defs>

                          {/* SKY */}
                          <rect width="900" height="260" fill="url(#auSky)"/>
                          {/* setting sun glow */}
                          <ellipse cx="558" cy="58" rx="120" ry="90" fill="url(#auSun)"/>
                          <circle cx="558" cy="46" r="22" fill="#fff9c4" opacity="0.82"/>
                          <circle cx="558" cy="46" r="14" fill="#ffee58" opacity="0.65"/>

                          {/* CLOUDS - amber tinted */}
                          <g opacity="0.72">
                            <ellipse cx="160" cy="45" rx="65" ry="22" fill="#ff8f00" opacity="0.5"/>
                            <ellipse cx="130" cy="56" rx="42" ry="17" fill="#ffb300" opacity="0.45"/>
                            <ellipse cx="192" cy="56" rx="46" ry="16" fill="#ff8f00" opacity="0.42"/>
                            <ellipse cx="160" cy="63" rx="70" ry="13" fill="#ffca28" opacity="0.35"/>
                          </g>
                          <g opacity="0.55">
                            <ellipse cx="430" cy="35" rx="48" ry="17" fill="#ff8f00" opacity="0.4"/>
                            <ellipse cx="404" cy="44" rx="32" ry="14" fill="#ffb300" opacity="0.38"/>
                            <ellipse cx="458" cy="44" rx="36" ry="14" fill="#ff8f00" opacity="0.36"/>
                          </g>

                          {/* FAR HILLS */}
                          <path d="M0,155 L80,112 L165,140 L255,98 L340,128 L430,85 L515,115 L602,78 L685,108 L770,72 L852,100 L900,85 L900,200 L0,200 Z" fill="#5d2906" opacity="0.55"/>
                          <path d="M0,170 Q100,148 210,164 Q330,180 450,158 Q570,138 690,158 Q800,174 900,158 L900,205 L0,205 Z" fill="#7c2d12" opacity="0.72"/>

                          {/* RIVER reflecting sunset */}
                          <path d="M390,175 Q400,190 386,210 Q372,225 382,242 Q390,253 394,260 L358,260 Q352,252 342,238 Q330,222 344,206 Q356,190 348,175 Z" fill="url(#auRiver)" style={{animation:'bxRiver 4s ease-in-out infinite'}}/>
                          {/* river glints */}
                          <path d="M375,190 Q382,200 372,215" stroke="rgba(255,200,100,0.4)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                          <path d="M362,228 Q370,238 364,250" stroke="rgba(255,200,100,0.3)" strokeWidth="2" fill="none" strokeLinecap="round"/>

                          {/* GROUND */}
                          <path d="M0,195 Q120,178 260,192 Q390,206 510,188 Q640,172 780,188 Q855,196 900,182 L900,260 L0,260 Z" fill="url(#auGround)"/>
                          <path d="M0,212 Q150,198 310,210 Q460,222 610,205 Q760,190 900,204 L900,260 L0,260 Z" fill="#431407" opacity="0.8"/>
                          {/* leaf litter on ground */}
                          {([{x:35,y:228,c:'#d97706',r:25},{x:88,y:235,c:'#dc2626',r:-18},{x:142,y:228,c:'#b45309',r:45},{x:198,y:238,c:'#ea580c',r:-30},{x:252,y:230,c:'#d97706',r:60},{x:305,y:240,c:'#9a3412',r:-45},{x:358,y:233,c:'#dc2626',r:20},{x:436,y:234,c:'#d97706',r:-55},{x:490,y:228,c:'#b45309',r:35},{x:545,y:238,c:'#ea580c',r:-20},{x:600,y:231,c:'#d97706',r:50},{x:655,y:240,c:'#dc2626',r:-40},{x:710,y:233,c:'#9a3412',r:15},{x:765,y:241,c:'#ea580c',r:-60},{x:818,y:234,c:'#d97706',r:42},{x:870,y:242,c:'#b45309',r:-28}] as Array<{x:number,y:number,c:string,r:number}>).map((lf,i)=>(
                            <ellipse key={i} cx={lf.x} cy={lf.y} rx={8+(i%3)*3} ry={4+(i%2)*2} fill={lf.c} opacity={0.72} transform={`rotate(${lf.r},${lf.x},${lf.y})`}/>
                          ))}

                          {/* ── LEFT BIG AUTUMN TREE ── */}
                          <g>
                            <ellipse cx="110" cy="255" rx="55" ry="7" fill="rgba(0,0,0,0.2)"/>
                            <path d="M100,260 Q105,218 102,178 Q99,148 106,118 Q112,95 105,65" stroke="#1c0a00" strokeWidth="20" fill="none" strokeLinecap="round"/>
                            <path d="M118,260 Q122,222 118,185" stroke="#2d1200" strokeWidth="13" fill="none" strokeLinecap="round"/>
                            {/* branches */}
                            <path d="M106,120 Q68,95 32,72" stroke="#1c0a00" strokeWidth="10" fill="none" strokeLinecap="round"/>
                            <path d="M106,120 Q90,85 77,58" stroke="#1c0a00" strokeWidth="8.5" fill="none" strokeLinecap="round"/>
                            <path d="M106,134 Q148,106 182,86" stroke="#1c0a00" strokeWidth="9" fill="none" strokeLinecap="round"/>
                            <path d="M106,138 Q148,124 185,130" stroke="#1c0a00" strokeWidth="6" fill="none" strokeLinecap="round"/>
                            <path d="M106,155 Q72,145 40,142" stroke="#1c0a00" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                            {/* sub */}
                            <path d="M32,72 Q10,55 0,42" stroke="#1c0a00" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M32,72 Q26,50 20,34" stroke="#1c0a00" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M77,58 Q68,36 62,18" stroke="#1c0a00" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M77,58 Q88,36 92,18" stroke="#1c0a00" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M182,86 Q202,68 218,52" stroke="#1c0a00" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M40,142 Q22,136 8,133" stroke="#1c0a00" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            {/* CANOPY - amber/orange/red layers */}
                            <ellipse cx="58" cy="60" rx="56" ry="40" fill="#b45309" opacity="0.6"/>
                            <ellipse cx="32" cy="55" rx="40" ry="30" fill="#c2410c" opacity="0.55"/>
                            <ellipse cx="90" cy="55" rx="46" ry="34" fill="#dc2626" opacity="0.5"/>
                            <ellipse cx="148" cy="88" rx="46" ry="32" fill="#b45309" opacity="0.55"/>
                            <ellipse cx="54" cy="46" rx="54" ry="38" fill="#d97706" opacity="0.85"/>
                            <ellipse cx="24" cy="43" rx="36" ry="27" fill="#ea580c" opacity="0.78"/>
                            <ellipse cx="88" cy="40" rx="48" ry="34" fill="#dc2626" opacity="0.75"/>
                            <ellipse cx="20" cy="58" rx="30" ry="22" fill="#d97706" opacity="0.88"/>
                            <ellipse cx="112" cy="56" rx="38" ry="28" fill="#ea580c" opacity="0.8"/>
                            <ellipse cx="146" cy="74" rx="44" ry="30" fill="#d97706" opacity="0.85"/>
                            <ellipse cx="170" cy="58" rx="34" ry="24" fill="#ea580c" opacity="0.78"/>
                            {/* top highlights */}
                            <ellipse cx="50" cy="32" rx="42" ry="28" fill="#fbbf24" opacity="0.7"/>
                            <ellipse cx="18" cy="40" rx="26" ry="18" fill="#fde68a" opacity="0.65"/>
                            <ellipse cx="84" cy="26" rx="38" ry="24" fill="#fbbf24" opacity="0.62"/>
                            <ellipse cx="44" cy="18" rx="28" ry="18" fill="#fde68a" opacity="0.6"/>
                            <ellipse cx="148" cy="60" rx="38" ry="24" fill="#fbbf24" opacity="0.65"/>
                            <ellipse cx="172" cy="44" rx="28" ry="18" fill="#fde68a" opacity="0.58"/>
                            {/* sunlit tips */}
                            <ellipse cx="34" cy="22" rx="18" ry="12" fill="#fff9c4" opacity="0.35"/>
                            <ellipse cx="70" cy="14" rx="16" ry="10" fill="#fff9c4" opacity="0.3"/>
                          </g>

                          {/* ── RIGHT BIG AUTUMN TREE ── */}
                          <g>
                            <ellipse cx="800" cy="255" rx="52" ry="7" fill="rgba(0,0,0,0.18)"/>
                            <path d="M808,260 Q804,218 806,177 Q808,146 800,118 Q795,93 802,63" stroke="#1c0a00" strokeWidth="18" fill="none" strokeLinecap="round"/>
                            <path d="M792,260 Q790,220 793,183" stroke="#2d1200" strokeWidth="12" fill="none" strokeLinecap="round"/>
                            <path d="M800,120 Q842,95 878,74" stroke="#1c0a00" strokeWidth="9.5" fill="none" strokeLinecap="round"/>
                            <path d="M800,120 Q820,86 832,60" stroke="#1c0a00" strokeWidth="8" fill="none" strokeLinecap="round"/>
                            <path d="M800,135 Q760,108 726,88" stroke="#1c0a00" strokeWidth="9" fill="none" strokeLinecap="round"/>
                            <path d="M800,140 Q758,126 722,132" stroke="#1c0a00" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                            <path d="M800,158 Q836,146 868,144" stroke="#1c0a00" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M878,74 Q900,56 912,42" stroke="#1c0a00" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M878,74 Q884,52 886,34" stroke="#1c0a00" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M832,60 Q838,38 838,18" stroke="#1c0a00" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M726,88 Q706,70 690,52" stroke="#1c0a00" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M868,144 Q886,138 902,135" stroke="#1c0a00" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            {/* CANOPY */}
                            <ellipse cx="846" cy="62" rx="56" ry="40" fill="#b45309" opacity="0.6"/>
                            <ellipse cx="878" cy="55" rx="40" ry="30" fill="#dc2626" opacity="0.55"/>
                            <ellipse cx="810" cy="58" rx="46" ry="34" fill="#c2410c" opacity="0.5"/>
                            <ellipse cx="750" cy="90" rx="46" ry="32" fill="#b45309" opacity="0.55"/>
                            <ellipse cx="850" cy="46" rx="56" ry="38" fill="#d97706" opacity="0.85"/>
                            <ellipse cx="882" cy="42" rx="36" ry="27" fill="#ea580c" opacity="0.8"/>
                            <ellipse cx="812" cy="42" rx="48" ry="34" fill="#dc2626" opacity="0.75"/>
                            <ellipse cx="886" cy="58" rx="30" ry="22" fill="#d97706" opacity="0.88"/>
                            <ellipse cx="788" cy="58" rx="38" ry="28" fill="#ea580c" opacity="0.8"/>
                            <ellipse cx="752" cy="76" rx="44" ry="30" fill="#d97706" opacity="0.85"/>
                            <ellipse cx="728" cy="60" rx="34" ry="24" fill="#ea580c" opacity="0.78"/>
                            {/* highlights */}
                            <ellipse cx="854" cy="30" rx="44" ry="28" fill="#fbbf24" opacity="0.72"/>
                            <ellipse cx="886" cy="38" rx="28" ry="18" fill="#fde68a" opacity="0.65"/>
                            <ellipse cx="816" cy="26" rx="38" ry="24" fill="#fbbf24" opacity="0.62"/>
                            <ellipse cx="858" cy="16" rx="26" ry="16" fill="#fde68a" opacity="0.6"/>
                            <ellipse cx="750" cy="62" rx="38" ry="24" fill="#fbbf24" opacity="0.65"/>
                            <ellipse cx="726" cy="46" rx="26" ry="17" fill="#fde68a" opacity="0.58"/>
                            <ellipse cx="870" cy="20" rx="16" ry="10" fill="#fff9c4" opacity="0.32"/>
                            <ellipse cx="830" cy="12" rx="14" ry="9" fill="#fff9c4" opacity="0.28"/>
                          </g>

                          {/* MIDDLE DISTANCE TREES */}
                          {([{x:240,h:70,c1:'#d97706',c2:'#ea580c'},{x:290,h:55,c1:'#dc2626',c2:'#fbbf24'},{x:335,h:62,c1:'#b45309',c2:'#d97706'},{x:565,h:60,c1:'#ea580c',c2:'#dc2626'},{x:610,h:52,c1:'#d97706',c2:'#b45309'},{x:655,h:68,c1:'#dc2626',c2:'#ea580c'}] as Array<{x:number,h:number,c1:string,c2:string}>).map((t,i)=>(
                            <g key={i}>
                              <rect x={t.x+5} y={190-t.h} width={8} height={t.h} fill="#1c0a00" rx="3"/>
                              <ellipse cx={t.x+9} cy={190-t.h} rx={18+(i%2)*6} ry={t.h*0.52} fill={t.c1} opacity={0.82}/>
                              <ellipse cx={t.x+9} cy={190-t.h-8} rx={14+(i%2)*5} ry={t.h*0.42} fill={t.c2} opacity={0.75}/>
                            </g>
                          ))}
                        </svg>

                        {/* FALLING LEAVES */}
                        {leafData.map((l,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-20px', left:l.l, animation:`bxFallLeaf ${l.dur} ease-in-out infinite`, animationDelay:l.delay }}>
                            <svg viewBox="0 0 30 30" width={l.s} height={l.s} style={{ transform:`rotate(${l.r}deg)` }}>
                              <path d="M15,2 C15,2 27,8 25,18 C23,24 18,26 15,28 C12,26 7,24 5,18 C3,8 15,2 15,2 Z" fill={l.c} opacity={0.92}/>
                              <line x1="15" y1="4" x2="15" y2="26" stroke="rgba(0,0,0,0.18)" strokeWidth="0.9"/>
                              <line x1="15" y1="11" x2="8" y2="17" stroke="rgba(0,0,0,0.12)" strokeWidth="0.7"/>
                              <line x1="15" y1="11" x2="22" y2="17" stroke="rgba(0,0,0,0.12)" strokeWidth="0.7"/>
                              <line x1="15" y1="18" x2="9" y2="23" stroke="rgba(0,0,0,0.1)" strokeWidth="0.6"/>
                              <line x1="15" y1="18" x2="21" y2="23" stroke="rgba(0,0,0,0.1)" strokeWidth="0.6"/>
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── WINTER NIGHT ── */}
                    {season === 'winter' && isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 260" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="wiSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0a1628"/>
                              <stop offset="35%" stopColor="#0d2045"/>
                              <stop offset="65%" stopColor="#1a3a6b"/>
                              <stop offset="100%" stopColor="#1e4d8c"/>
                            </linearGradient>
                            <radialGradient id="wiMoon" cx="28%" cy="18%" r="14%">
                              <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.95"/>
                              <stop offset="45%" stopColor="#e0f2fe" stopOpacity="0.4"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="wiSnow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#c5e4f5"/>
                              <stop offset="100%" stopColor="#9ecfe8"/>
                            </linearGradient>
                            <linearGradient id="wiAurGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="rgba(52,211,153,0)" />
                              <stop offset="30%" stopColor="rgba(52,211,153,1)" />
                              <stop offset="55%" stopColor="rgba(96,165,250,1)" />
                              <stop offset="80%" stopColor="rgba(167,139,250,1)" />
                              <stop offset="100%" stopColor="rgba(167,139,250,0)" />
                            </linearGradient>
                            <linearGradient id="wiRiver" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.9"/>
                              <stop offset="100%" stopColor="#0c2340" stopOpacity="0.95"/>
                            </linearGradient>
                          </defs>

                          {/* SKY */}
                          <rect width="900" height="260" fill="url(#wiSky)"/>

                          {/* AURORA BOREALIS — boosted visibility */}
                          {/* outer wide glow */}
                          <ellipse cx="450" cy="50" rx="420" ry="55" fill="none" stroke="rgba(52,211,153,0.10)" strokeWidth="40" style={{filter:'blur(12px)',animation:'bxAurora 7s ease-in-out infinite'}}/>
                          {/* main bands */}
                          <ellipse cx="450" cy="55" rx="380" ry="38" fill="none" stroke="rgba(52,211,153,0.42)" strokeWidth="24" style={{filter:'blur(5px)',animation:'bxAurora 7s ease-in-out infinite'}}/>
                          <ellipse cx="380" cy="72" rx="300" ry="28" fill="none" stroke="rgba(96,165,250,0.35)" strokeWidth="20" style={{filter:'blur(4px)',animation:'bxAurora 9s ease-in-out infinite reverse'}}/>
                          <ellipse cx="520" cy="46" rx="270" ry="22" fill="none" stroke="rgba(167,139,250,0.30)" strokeWidth="16" style={{filter:'blur(3px)',animation:'bxAurora 11s ease-in-out infinite 2s'}}/>
                          {/* bright thin inner ribbon */}
                          <ellipse cx="450" cy="55" rx="380" ry="32" fill="none" stroke="rgba(134,239,172,0.55)" strokeWidth="6" style={{filter:'blur(2px)',animation:'bxAurora 7s ease-in-out infinite'}}/>
                          <ellipse cx="380" cy="70" rx="295" ry="22" fill="none" stroke="rgba(147,197,253,0.45)" strokeWidth="5" style={{filter:'blur(2px)',animation:'bxAurora 9s ease-in-out infinite reverse'}}/>
                          <ellipse cx="520" cy="46" rx="265" ry="16" fill="none" stroke="rgba(196,181,253,0.38)" strokeWidth="4" style={{filter:'blur(1.5px)',animation:'bxAurora 11s ease-in-out infinite 2s'}}/>
                          {/* curtain shimmer overlay */}
                          <rect x="60" y="20" width="780" height="85" fill="url(#wiAurGrad)" opacity="0.18" style={{filter:'blur(8px)',animation:'bxAurora 8s ease-in-out infinite 1s'}}/>

                          {/* MOON */}
                          <ellipse cx="252" cy="48" rx="100" ry="75" fill="url(#wiMoon)"/>
                          <circle cx="252" cy="40" r="22" fill="#f8fafc" opacity="0.88"/>
                          <circle cx="252" cy="40" r="16" fill="#e0f2fe" opacity="0.72"/>
                          {/* moon craters */}
                          <circle cx="244" cy="35" r="3.5" fill="#bae6fd" opacity="0.35"/>
                          <circle cx="258" cy="44" r="2.5" fill="#bae6fd" opacity="0.25"/>
                          <circle cx="248" cy="46" r="2" fill="#bae6fd" opacity="0.2"/>

                          {/* STARS */}
                          {([{x:50,y:20,s:2.2},{x:120,y:12,s:1.6},{x:185,y:28,s:2},{x:340,y:15,s:1.8},{x:410,y:8,s:2.4},{x:480,y:22,s:1.5},{x:545,y:10,s:2},{x:615,y:18,s:1.7},{x:680,y:8,s:2.2},{x:745,y:20,s:1.8},{x:810,y:12,s:2.5},{x:868,y:24,s:1.6},{x:90,y:40,s:1.4},{x:165,y:50,s:1.6},{x:445,y:38,s:1.3},{x:570,y:40,s:1.5},{x:720,y:36,s:1.4},{x:840,y:42,s:1.6}] as Array<{x:number,y:number,s:number}>).map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="white" opacity={0.7+(i%3)*0.1} style={{animation:`bxStarTwinkle ${2+i*.35}s ease-in-out infinite`,animationDelay:`${i*.22}s`}}/>
                          ))}

                          {/* FAR SNOWY MOUNTAINS */}
                          <path d="M0,148 L70,92 L145,130 L228,72 L308,108 L392,60 L472,95 L555,52 L635,88 L718,45 L798,80 L862,52 L900,65 L900,195 L0,195 Z" fill="#1a3358" opacity="0.8"/>
                          {/* snow caps on mountains */}
                          <path d="M70,92 L55,118 L88,118 Z" fill="#e0f2fe" opacity="0.7"/>
                          <path d="M228,72 L210,104 L248,104 Z" fill="#e0f2fe" opacity="0.72"/>
                          <path d="M392,60 L370,96 L416,96 Z" fill="#e0f2fe" opacity="0.75"/>
                          <path d="M555,52 L532,90 L578,90 Z" fill="#e0f2fe" opacity="0.72"/>
                          <path d="M718,45 L694,84 L742,84 Z" fill="#e0f2fe" opacity="0.75"/>
                          <path d="M862,52 L842,82 L882,82 Z" fill="#e0f2fe" opacity="0.68"/>

                          {/* FROZEN RIVER */}
                          <path d="M400,185 Q412,200 396,218 Q380,234 392,248 Q400,258 404,260 L368,260 Q360,256 348,244 Q334,226 350,208 Q364,192 356,178 Z" fill="url(#wiRiver)" opacity="0.88" style={{animation:'bxRiver 5s ease-in-out infinite'}}/>
                          {/* ice surface glints */}
                          <path d="M386,196 Q393,205 382,218" stroke="rgba(186,230,253,0.5)" strokeWidth="2" fill="none" strokeLinecap="round"/>
                          <path d="M372,230 Q380,240 373,252" stroke="rgba(186,230,253,0.4)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

                          {/* SNOW GROUND — aurora-tinted bluish */}
                          <path d="M0,188 Q90,170 200,182 Q330,196 460,178 Q590,162 720,178 Q830,192 900,176 L900,260 L0,260 Z" fill="url(#wiSnow)"/>
                          <path d="M0,202 Q130,188 270,200 Q410,212 550,196 Q690,180 840,196 L900,198 L900,260 L0,260 Z" fill="#8cc8e0" opacity="0.6"/>
                          <path d="M0,218 Q180,206 360,216 L360,260 L0,260 Z" fill="#b0ddf0" opacity="0.55"/>
                          <path d="M440,218 Q620,206 820,218 Q865,222 900,216 L900,260 L440,260 Z" fill="#b0ddf0" opacity="0.55"/>
                          {/* aurora colour wash on snow */}
                          <path d="M0,185 Q450,165 900,185" stroke="rgba(52,211,153,0.12)" strokeWidth="18" fill="none" style={{filter:'blur(8px)'}}/>
                          {/* snow drifts — faint blue tint */}
                          {([{x:80,y:205,rx:45,ry:8},{x:195,y:210,rx:52,ry:7},{x:310,y:203,rx:40,ry:9},{x:475,y:206,rx:48,ry:8},{x:590,y:211,rx:55,ry:7},{x:705,y:204,rx:42,ry:9},{x:820,y:208,rx:50,ry:8}] as Array<{x:number,y:number,rx:number,ry:number}>).map((d,i)=>(
                            <ellipse key={i} cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} fill="#cce8f8" opacity={0.38+(i%3)*0.08}/>
                          ))}

                          {/* ── LEFT BARE SNOW TREE ── */}
                          <g>
                            <path d="M95,260 Q100,218 97,175 Q94,145 100,115 Q105,90 98,62" stroke="#0d2045" strokeWidth="18" fill="none" strokeLinecap="round"/>
                            <path d="M112,260 Q116,222 112,185" stroke="#152a50" strokeWidth="12" fill="none" strokeLinecap="round"/>
                            <path d="M100,118 Q62,94 28,72" stroke="#0d2045" strokeWidth="9" fill="none" strokeLinecap="round"/>
                            <path d="M100,118 Q84,85 72,58" stroke="#0d2045" strokeWidth="7.5" fill="none" strokeLinecap="round"/>
                            <path d="M100,130 Q140,105 172,86" stroke="#0d2045" strokeWidth="8.5" fill="none" strokeLinecap="round"/>
                            <path d="M100,145 Q66,135 36,132" stroke="#0d2045" strokeWidth="5" fill="none" strokeLinecap="round"/>
                            <path d="M28,72 Q8,56 0,42" stroke="#0d2045" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M72,58 Q64,36 60,18" stroke="#0d2045" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M172,86 Q192,68 205,52" stroke="#0d2045" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            {/* snow on branches */}
                            <ellipse cx="18" cy="68" rx="14" ry="4" fill="#e0f2fe" opacity="0.88"/>
                            <ellipse cx="68" cy="54" rx="12" ry="3.5" fill="#e0f2fe" opacity="0.82"/>
                            <ellipse cx="178" cy="82" rx="15" ry="4" fill="#e0f2fe" opacity="0.85"/>
                            <ellipse cx="32" cy="130" rx="18" ry="4.5" fill="#e0f2fe" opacity="0.8"/>
                            <ellipse cx="100" cy="175" rx="10" ry="3" fill="#e0f2fe" opacity="0.65"/>
                          </g>

                          {/* ── RIGHT BARE SNOW TREE ── */}
                          <g>
                            <path d="M812,260 Q808,218 810,175 Q812,144 806,115 Q800,90 807,60" stroke="#0d2045" strokeWidth="16" fill="none" strokeLinecap="round"/>
                            <path d="M796,260 Q794,220 797,183" stroke="#152a50" strokeWidth="11" fill="none" strokeLinecap="round"/>
                            <path d="M806,118 Q845,94 880,72" stroke="#0d2045" strokeWidth="8.5" fill="none" strokeLinecap="round"/>
                            <path d="M806,118 Q824,84 834,58" stroke="#0d2045" strokeWidth="7" fill="none" strokeLinecap="round"/>
                            <path d="M806,132 Q766,108 732,88" stroke="#0d2045" strokeWidth="8" fill="none" strokeLinecap="round"/>
                            <path d="M806,148 Q840,138 868,135" stroke="#0d2045" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                            <path d="M880,72 Q900,54 912,40" stroke="#0d2045" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <path d="M834,58 Q840,36 840,16" stroke="#0d2045" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                            <path d="M732,88 Q714,70 702,52" stroke="#0d2045" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            {/* snow on branches */}
                            <ellipse cx="885" cy="68" rx="13" ry="4" fill="#e0f2fe" opacity="0.88"/>
                            <ellipse cx="835" cy="54" rx="11" ry="3.5" fill="#e0f2fe" opacity="0.82"/>
                            <ellipse cx="726" cy="84" rx="14" ry="3.8" fill="#e0f2fe" opacity="0.85"/>
                            <ellipse cx="872" cy="133" rx="16" ry="4" fill="#e0f2fe" opacity="0.8"/>
                            <ellipse cx="808" cy="175" rx="9" ry="3" fill="#e0f2fe" opacity="0.65"/>
                          </g>

                          {/* PINE/FIR TREES (mid) */}
                          {([{x:188,b:185},{x:225,b:188},{x:660,b:183},{x:695,b:186}] as Array<{x:number,b:number}>).map((t,i)=>(
                            <g key={i}>
                              <rect x={t.x+6} y={t.b-55} width={7} height={55} fill="#0d1f3c" rx="2"/>
                              <polygon points={`${t.x+9},${t.b-80} ${t.x-8},${t.b-45} ${t.x+26},${t.b-45}`} fill="#0d3320" opacity="0.9"/>
                              <polygon points={`${t.x+9},${t.b-65} ${t.x-12},${t.b-30} ${t.x+30},${t.b-30}`} fill="#0f3d28" opacity="0.88"/>
                              <polygon points={`${t.x+9},${t.b-50} ${t.x-15},${t.b-12} ${t.x+33},${t.b-12}`} fill="#145c38" opacity="0.85"/>
                              {/* snow on fir */}
                              <ellipse cx={t.x+9} cy={t.b-80} rx={4} ry={2.5} fill="white" opacity={0.85}/>
                              <path d={`M${t.x-8},${t.b-45} Q${t.x+9},${t.b-50} ${t.x+26},${t.b-45}`} stroke="white" strokeWidth="3.5" fill="none" opacity={0.75} strokeLinecap="round"/>
                              <path d={`M${t.x-12},${t.b-30} Q${t.x+9},${t.b-36} ${t.x+30},${t.b-30}`} stroke="white" strokeWidth="3.5" fill="none" opacity={0.7} strokeLinecap="round"/>
                            </g>
                          ))}
                        </svg>

                        {/* SNOWFLAKES */}
                        {snowData.map((sn,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-12px', left:sn.l, animation:`bxSnowfall ${sn.dur} linear infinite`, animationDelay:`${i*.45}s` }}>
                            <svg viewBox="0 0 20 20" width={sn.s*3} height={sn.s*3} style={{opacity:sn.o}}>
                              {[0,30,60,90,120,150].map((a,j)=>(
                                <line key={j} x1={10+Math.cos(a*Math.PI/180)*1.5} y1={10+Math.sin(a*Math.PI/180)*1.5} x2={10+Math.cos(a*Math.PI/180)*8.5} y2={10+Math.sin(a*Math.PI/180)*8.5} stroke="white" strokeWidth="1.1"/>
                              ))}
                              {[0,30,60,90,120,150].map((a,j)=>(
                                <line key={j+6} x1={10+Math.cos((a+180)*Math.PI/180)*1.5} y1={10+Math.sin((a+180)*Math.PI/180)*1.5} x2={10+Math.cos((a+180)*Math.PI/180)*8.5} y2={10+Math.sin((a+180)*Math.PI/180)*8.5} stroke="white" strokeWidth="1.1"/>
                              ))}
                              {[0,30,60,90,120,150].map((a,j)=>(
                                <g key={j+12}>
                                  <line x1={10+Math.cos(a*Math.PI/180)*5} y1={10+Math.sin(a*Math.PI/180)*5} x2={10+Math.cos(a*Math.PI/180)*5+Math.cos((a+55)*Math.PI/180)*2.5} y2={10+Math.sin(a*Math.PI/180)*5+Math.sin((a+55)*Math.PI/180)*2.5} stroke="white" strokeWidth="0.9"/>
                                  <line x1={10+Math.cos(a*Math.PI/180)*5} y1={10+Math.sin(a*Math.PI/180)*5} x2={10+Math.cos(a*Math.PI/180)*5+Math.cos((a-55)*Math.PI/180)*2.5} y2={10+Math.sin(a*Math.PI/180)*5+Math.sin((a-55)*Math.PI/180)*2.5} stroke="white" strokeWidth="0.9"/>
                                </g>
                              ))}
                              <circle cx="10" cy="10" r="1.8" fill="white"/>
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── WINTER DAY ── snowy landscape ── */}
                    {season === 'winter' && !isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="wdSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#b0bec5"/>
                              <stop offset="40%" stopColor="#cfd8dc"/>
                              <stop offset="80%" stopColor="#eceff1"/>
                              <stop offset="100%" stopColor="#f5f7f8"/>
                            </linearGradient>
                            <radialGradient id="wdSun" cx="70%" cy="22%" r="18%">
                              <stop offset="0%" stopColor="#fff9e6" stopOpacity="0.9"/>
                              <stop offset="60%" stopColor="#ffd9a0" stopOpacity="0.3"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="wdSnow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#c8e6f5"/>
                              <stop offset="100%" stopColor="#a8d4ec"/>
                            </linearGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#wdSky)"/>
                          {/* pale blue tint over entire scene */}
                          <rect width="900" height="330" fill="rgba(160,210,240,0.08)"/>
                          {/* pale wintery sun */}
                          <ellipse cx="630" cy="72" rx="100" ry="70" fill="url(#wdSun)"/>
                          <circle cx="630" cy="62" r="18" fill="#fffde7" opacity="0.7"/>
                          {/* overcast clouds */}
                          <ellipse cx="160" cy="55" rx="120" ry="32" fill="white" opacity="0.85"/>
                          <ellipse cx="105" cy="70" rx="80" ry="24" fill="#eceff1" opacity="0.8"/>
                          <ellipse cx="220" cy="70" rx="90" ry="22" fill="white" opacity="0.75"/>
                          <ellipse cx="450" cy="42" rx="130" ry="28" fill="white" opacity="0.78"/>
                          <ellipse cx="380" cy="58" rx="90" ry="22" fill="#eceff1" opacity="0.72"/>
                          <ellipse cx="730" cy="38" rx="110" ry="26" fill="white" opacity="0.72"/>
                          <ellipse cx="820" cy="55" rx="80" ry="20" fill="#eceff1" opacity="0.68"/>
                          {/* far snowy hills */}
                          <path d="M0,185 L70,148 L150,170 L235,130 L315,160 L400,120 L480,152 L558,115 L635,148 L715,110 L795,140 L860,118 L900,130 L900,230 L0,230 Z" fill="#dde8ef" opacity="0.9"/>
                          {/* snow ground layers — bluish tinted */}
                          <path d="M0,222 Q90,205 210,218 Q340,232 470,212 Q600,195 730,212 Q830,225 900,210 L900,330 L0,330 Z" fill="url(#wdSnow)"/>
                          <path d="M0,238 Q150,224 310,236 Q470,248 630,230 Q780,215 900,228 L900,330 L0,330 Z" fill="#a8d4ec" opacity="0.75"/>
                          <path d="M0,258 Q200,248 400,256 L400,330 L0,330 Z" fill="#c0dff0" opacity="0.65"/>
                          <path d="M450,258 Q670,248 900,256 L900,330 L450,330 Z" fill="#c0dff0" opacity="0.65"/>
                          {/* blue shadow in snow hollows */}
                          <path d="M0,235 Q200,228 400,235 Q600,242 800,232 Q870,228 900,232" stroke="rgba(100,170,220,0.18)" strokeWidth="4" fill="none"/>
                          {/* snow drifts — bluish */}
                          {([{x:80,y:232,rx:55,ry:10},{x:220,y:238,rx:65,ry:9},{x:360,y:230,rx:48,ry:11},{x:490,y:234,rx:60,ry:10},{x:630,y:240,rx:70,ry:9},{x:770,y:232,rx:52,ry:11},{x:880,y:238,rx:42,ry:9}] as Array<{x:number,y:number,rx:number,ry:number}>).map((d,i)=>(
                            <ellipse key={i} cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} fill="#b8dcf0" opacity={0.48+(i%3)*0.07}/>
                          ))}
                          {/* left pine trees */}
                          {([{x:72,b:222},{x:115,b:225},{x:158,b:220}] as Array<{x:number,b:number}>).map((t,i)=>(
                            <g key={i}>
                              <rect x={t.x+5} y={t.b-70} width={8} height={70} fill="#37474f" rx="2"/>
                              <polygon points={`${t.x+9},${t.b-100} ${t.x-14},${t.b-58} ${t.x+32},${t.b-58}`} fill="#2e4a2a" opacity="0.92"/>
                              <polygon points={`${t.x+9},${t.b-80} ${t.x-18},${t.b-38} ${t.x+36},${t.b-38}`} fill="#3a5c35" opacity="0.88"/>
                              <polygon points={`${t.x+9},${t.b-58} ${t.x-22},${t.b-14} ${t.x+40},${t.b-14}`} fill="#4a7040" opacity="0.85"/>
                              <path d={`M${t.x-14},${t.b-58} Q${t.x+9},${t.b-64} ${t.x+32},${t.b-58}`} stroke="white" strokeWidth="4" fill="none" opacity={0.8} strokeLinecap="round"/>
                              <path d={`M${t.x-18},${t.b-38} Q${t.x+9},${t.b-44} ${t.x+36},${t.b-38}`} stroke="white" strokeWidth="4" fill="none" opacity={0.75} strokeLinecap="round"/>
                              <ellipse cx={t.x+9} cy={t.b-100} rx={5} ry={3} fill="white" opacity={0.88}/>
                            </g>
                          ))}
                          {/* right pine trees */}
                          {([{x:720,b:220},{x:770,b:224},{x:820,b:218},{x:868,b:222}] as Array<{x:number,b:number}>).map((t,i)=>(
                            <g key={i}>
                              <rect x={t.x+5} y={t.b-65} width={7} height={65} fill="#37474f" rx="2"/>
                              <polygon points={`${t.x+9},${t.b-92} ${t.x-12},${t.b-54} ${t.x+30},${t.b-54}`} fill="#2e4a2a" opacity="0.92"/>
                              <polygon points={`${t.x+9},${t.b-72} ${t.x-16},${t.b-34} ${t.x+34},${t.b-34}`} fill="#3a5c35" opacity="0.88"/>
                              <polygon points={`${t.x+9},${t.b-52} ${t.x-20},${t.b-12} ${t.x+38},${t.b-12}`} fill="#4a7040" opacity="0.85"/>
                              <path d={`M${t.x-12},${t.b-54} Q${t.x+9},${t.b-60} ${t.x+30},${t.b-54}`} stroke="white" strokeWidth="3.5" fill="none" opacity={0.78} strokeLinecap="round"/>
                              <path d={`M${t.x-16},${t.b-34} Q${t.x+9},${t.b-40} ${t.x+34},${t.b-34}`} stroke="white" strokeWidth="3.5" fill="none" opacity={0.72} strokeLinecap="round"/>
                              <ellipse cx={t.x+9} cy={t.b-92} rx={4} ry={2.5} fill="white" opacity={0.85}/>
                            </g>
                          ))}
                          {/* bare mid trees */}
                          {([{x:300,h:90},{x:350,h:75},{x:540,h:85},{x:590,h:72}] as Array<{x:number,h:number}>).map((t,i)=>(
                            <g key={i}>
                              <path d={`M${t.x},230 Q${t.x+2},${230-t.h*.5} ${t.x},${230-t.h}`} stroke="#455a64" strokeWidth="9" fill="none" strokeLinecap="round"/>
                              <path d={`M${t.x},${230-t.h*.6} Q${t.x-25},${230-t.h*.75} ${t.x-42},${230-t.h*.88}`} stroke="#455a64" strokeWidth="5" fill="none" strokeLinecap="round"/>
                              <path d={`M${t.x},${230-t.h*.6} Q${t.x+22},${230-t.h*.72} ${t.x+38},${230-t.h*.85}`} stroke="#455a64" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                              <path d={`M${t.x},${230-t.h*.38} Q${t.x-18},${230-t.h*.5} ${t.x-30},${230-t.h*.62}`} stroke="#455a64" strokeWidth="4" fill="none" strokeLinecap="round"/>
                              <ellipse cx={t.x-42} cy={230-t.h*.88} rx={12} ry={3} fill="white" opacity={0.7}/>
                              <ellipse cx={t.x+38} cy={230-t.h*.85} rx={11} ry={3} fill="white" opacity={0.65}/>
                            </g>
                          ))}
                          {/* frozen pond */}
                          <ellipse cx="450" cy="265" rx="85" ry="18" fill="#b2d8e8" opacity="0.55"/>
                          <ellipse cx="450" cy="265" rx="70" ry="12" fill="#c8e8f4" opacity="0.45"/>
                        </svg>
                        {/* light snowfall */}
                        {snowData.slice(0,8).map((sn,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-12px', left:sn.l, animation:`bxSnowfall ${sn.dur} linear infinite`, animationDelay:`${i*.6}s` }}>
                            <svg viewBox="0 0 20 20" width={sn.s*2.5} height={sn.s*2.5} style={{opacity:sn.o*.8}}>
                              {[0,60,120].map((a,j)=>(
                                <g key={j}>
                                  <line x1={10+Math.cos(a*Math.PI/180)*1.2} y1={10+Math.sin(a*Math.PI/180)*1.2} x2={10+Math.cos(a*Math.PI/180)*8} y2={10+Math.sin(a*Math.PI/180)*8} stroke="white" strokeWidth="1"/>
                                  <line x1={10+Math.cos((a+180)*Math.PI/180)*1.2} y1={10+Math.sin((a+180)*Math.PI/180)*1.2} x2={10+Math.cos((a+180)*Math.PI/180)*8} y2={10+Math.sin((a+180)*Math.PI/180)*8} stroke="white" strokeWidth="1"/>
                                </g>
                              ))}
                              <circle cx="10" cy="10" r="1.5" fill="white"/>
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── SPRING NIGHT ── starry sky with cherry blossom silhouettes ── */}
                    {season === 'spring' && isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="spnSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#060c1c"/>
                              <stop offset="45%" stopColor="#0d1f45"/>
                              <stop offset="80%" stopColor="#1a2a50"/>
                              <stop offset="100%" stopColor="#1e3060"/>
                            </linearGradient>
                            <radialGradient id="spnMoon" cx="75%" cy="15%" r="12%">
                              <stop offset="0%" stopColor="#fffde7" stopOpacity="0.95"/>
                              <stop offset="40%" stopColor="#fff9c4" stopOpacity="0.4"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="spnGround" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0a1f0e"/>
                              <stop offset="100%" stopColor="#051008"/>
                            </linearGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#spnSky)"/>
                          {/* stars */}
                          {nightStarData.map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="white" opacity={0.55+(i%4)*.12} style={{animation:`bxTwinkle ${st.d}s ease-in-out infinite`,animationDelay:`${i*.18}s`}}/>
                          ))}
                          {/* extra faint stars */}
                          {([{x:20,y:55},{x:72,y:62},{x:135,y:58},{x:198,y:48},{x:260,y:65},{x:335,y:52},{x:398,y:62},{x:462,y:45},{x:528,y:60},{x:595,y:50},{x:660,y:65},{x:725,y:48},{x:790,y:62},{x:850,y:52}] as Array<{x:number,y:number}>).map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={1.0} fill="white" opacity={0.35+(i%3)*.1} style={{animation:`bxTwinkle ${2.2+i*.3}s ease-in-out infinite`,animationDelay:`${i*.25}s`}}/>
                          ))}
                          {/* moon glow */}
                          <ellipse cx="675" cy="48" rx="90" ry="65" fill="url(#spnMoon)"/>
                          {/* moon outer halo */}
                          <circle cx="675" cy="40" r="34" fill="#fffde7" opacity="0.08" style={{animation:'bxMoonHalo 4s ease-in-out infinite'}}/>
                          <circle cx="675" cy="40" r="27" fill="#fffde7" opacity="0.13" style={{animation:'bxMoonHalo 4s ease-in-out infinite',animationDelay:'0.5s'}}/>
                          {/* crescent moon */}
                          <circle cx="675" cy="40" r="20" fill="#fffde7" opacity="0.96" style={{animation:'bxMoonGlow 4s ease-in-out infinite'}}/>
                          <circle cx="686" cy="36" r="16" fill="#1a2a50" opacity="0.90"/>
                          {/* moon craters */}
                          <circle cx="668" cy="42" r="2.5" fill="#fff9c4" opacity="0.25"/>
                          <circle cx="660" cy="36" r="1.8" fill="#fff9c4" opacity="0.2"/>
                          {/* hill silhouettes */}
                          <path d="M0,220 Q200,190 400,210 Q600,228 800,205 Q860,196 900,200 L900,330 L0,330 Z" fill="#0a1f0e"/>
                          <path d="M0,240 Q180,226 360,238 Q540,250 720,234 Q830,224 900,228 L900,330 L0,330 Z" fill="#051008"/>
                          {/* left cherry tree silhouette */}
                          <path d="M100,330 Q105,275 102,230 Q99,200 106,172 Q112,148 105,118" stroke="#050d08" strokeWidth="18" fill="none" strokeLinecap="round"/>
                          <path d="M106,172 Q68,148 32,125" stroke="#050d08" strokeWidth="9" fill="none" strokeLinecap="round"/>
                          <path d="M106,172 Q148,148 180,130" stroke="#050d08" strokeWidth="8" fill="none" strokeLinecap="round"/>
                          <path d="M106,120 Q80,98 55,80" stroke="#050d08" strokeWidth="7" fill="none" strokeLinecap="round"/>
                          <path d="M106,120 Q132,98 155,80" stroke="#050d08" strokeWidth="6.5" fill="none" strokeLinecap="round"/>
                          <ellipse cx="62" cy="105" rx="52" ry="40" fill="#1a0a14" opacity="0.9"/>
                          <ellipse cx="105" cy="85" rx="58" ry="44" fill="#220e1a" opacity="0.88"/>
                          <ellipse cx="148" cy="108" rx="52" ry="38" fill="#1a0a14" opacity="0.88"/>
                          {/* right cherry tree silhouette */}
                          <path d="M795,330 Q792,275 794,228 Q796,198 790,170 Q784,145 790,115" stroke="#050d08" strokeWidth="17" fill="none" strokeLinecap="round"/>
                          <path d="M790,168 Q752,145 720,128" stroke="#050d08" strokeWidth="8.5" fill="none" strokeLinecap="round"/>
                          <path d="M790,168 Q828,145 858,128" stroke="#050d08" strokeWidth="8" fill="none" strokeLinecap="round"/>
                          <path d="M790,118 Q762,96 740,78" stroke="#050d08" strokeWidth="6.5" fill="none" strokeLinecap="round"/>
                          <path d="M790,118 Q818,96 840,78" stroke="#050d08" strokeWidth="6" fill="none" strokeLinecap="round"/>
                          <ellipse cx="838" cy="105" rx="52" ry="40" fill="#1a0a14" opacity="0.9"/>
                          <ellipse cx="795" cy="82" rx="58" ry="44" fill="#220e1a" opacity="0.88"/>
                          <ellipse cx="750" cy="106" rx="50" ry="38" fill="#1a0a14" opacity="0.88"/>
                          {/* river shimmer */}
                          <path d="M410,268 Q422,278 412,295 Q402,308 410,320 L385,320 Q375,308 368,294 Q358,278 372,268 Z" fill="#0d2545" opacity="0.7"/>
                          <path d="M402,272 Q408,282 400,295" stroke="rgba(180,210,255,0.3)" strokeWidth="2" fill="none" strokeLinecap="round"/>
                          {/* fireflies */}
                          {([{x:'15%',y:'62%',d:'3.2s',del:'0s'},{x:'28%',y:'55%',d:'4.5s',del:'1s'},{x:'42%',y:'68%',d:'3.8s',del:'0.5s'},{x:'58%',y:'58%',d:'4s',del:'1.5s'},{x:'72%',y:'65%',d:'3.5s',del:'0.8s'},{x:'85%',y:'60%',d:'4.2s',del:'2s'}] as Array<{x:string,y:string,d:string,del:string}>).map((f,i)=>(
                            <circle key={i} cx={`${parseFloat(f.x)*9}`} cy={`${parseFloat(f.y)*3.3}`} r={2.2} fill="#b8f5a0" opacity={0.85} style={{animation:`bxFirefly ${f.d} ease-in-out infinite`,animationDelay:f.del}}/>
                          ))}
                        </svg>
                      </div>
                    )}

                    {/* ── SUMMER NIGHT ── tropical night with ocean & fireflies ── */}
                    {season === 'summer' && isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="smnSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#040810"/>
                              <stop offset="40%" stopColor="#070f22"/>
                              <stop offset="75%" stopColor="#0a1630"/>
                              <stop offset="100%" stopColor="#0c1c3a"/>
                            </linearGradient>
                            <radialGradient id="smnMoon" cx="22%" cy="18%" r="14%">
                              <stop offset="0%" stopColor="#fffde7" stopOpacity="0.95"/>
                              <stop offset="45%" stopColor="#fff3cd" stopOpacity="0.35"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="smnOcean" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#061428"/>
                              <stop offset="55%" stopColor="#040e1e"/>
                              <stop offset="100%" stopColor="#030b17"/>
                            </linearGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#smnSky)"/>
                          {/* stars */}
                          {nightStarData.map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="white" opacity={0.6+(i%4)*.1} style={{animation:`bxTwinkle ${st.d}s ease-in-out infinite`,animationDelay:`${i*.16}s`}}/>
                          ))}
                          {([{x:38,y:55},{x:98,y:60},{x:168,y:50},{x:232,y:63},{x:302,y:55},{x:372,y:62},{x:435,y:48},{x:502,y:58},{x:572,y:65},{x:638,y:52},{x:705,y:60},{x:772,y:48},{x:838,y:58},{x:892,y:55}] as Array<{x:number,y:number}>).map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={1.1} fill="white" opacity={0.32+(i%4)*.09} style={{animation:`bxTwinkle ${2+i*.28}s ease-in-out infinite`,animationDelay:`${i*.22}s`}}/>
                          ))}
                          {/* moon glow */}
                          <ellipse cx="198" cy="55" rx="100" ry="72" fill="url(#smnMoon)"/>
                          {/* moon halo rings */}
                          <circle cx="198" cy="46" r="36" fill="#fffde7" opacity="0.07" style={{animation:'bxMoonHalo 4s ease-in-out infinite'}}/>
                          <circle cx="198" cy="46" r="28" fill="#fffde7" opacity="0.12" style={{animation:'bxMoonHalo 4s ease-in-out infinite',animationDelay:'0.6s'}}/>
                          <circle cx="198" cy="46" r="22" fill="#fffde7" opacity="0.94" style={{animation:'bxMoonGlow 4s ease-in-out infinite'}}/>
                          <circle cx="210" cy="42" r="18" fill="#040810" opacity="0.88"/>
                          <circle cx="188" cy="50" r="2.8" fill="#fff9c4" opacity="0.28"/>
                          <circle cx="195" cy="42" r="1.8" fill="#fff9c4" opacity="0.2"/>
                          {/* milky way / star band */}
                          <ellipse cx="550" cy="55" rx="300" ry="15" fill="rgba(200,220,255,0.04)" style={{filter:'blur(8px)'}}/>
                          {/* ocean */}
                          <path d="M0,188 Q225,172 450,185 Q675,198 900,180 L900,330 L0,330 Z" fill="url(#smnOcean)"/>
                          {/* moon reflection on ocean */}
                          <ellipse cx="198" cy="215" rx="30" ry="60" fill="rgba(255,253,231,0.08)" style={{filter:'blur(4px)'}}/>
                          {/* wave crests moonlit */}
                          <path d="M0,192 Q50,185 100,192 Q150,200 200,190 Q250,180 305,192 Q360,205 415,192 Q470,180 530,192 Q590,205 650,192 Q710,180 770,192 Q830,205 900,192" stroke="rgba(180,220,255,0.2)" strokeWidth="1.5" fill="none"/>
                          <path d="M0,205 Q60,198 120,205 Q180,213 240,202 Q300,192 360,205 Q420,218 480,204 Q540,192 600,205 Q660,218 720,204 Q780,192 850,204 Q880,208 900,204" stroke="rgba(180,220,255,0.14)" strokeWidth="1" fill="none"/>
                          {/* beach dark */}
                          <path d="M0,210 Q120,198 255,208 Q390,218 530,202 Q660,188 800,204 Q860,210 900,202 L900,260 L0,260 Z" fill="#0a0f08"/>
                          {/* left palm silhouette */}
                          <path d="M72,260 Q68,222 65,192 Q62,168 70,140" stroke="#020504" strokeWidth="10" fill="none" strokeLinecap="round"/>
                          <path d="M70,142 Q38,122 8,108" stroke="#02060a" strokeWidth="5" fill="none" strokeLinecap="round"/>
                          <path d="M70,142 Q60,112 54,88" stroke="#02060a" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                          <path d="M70,142 Q90,116 102,96" stroke="#02060a" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                          <path d="M70,142 Q102,132 130,126" stroke="#02060a" strokeWidth="4" fill="none" strokeLinecap="round"/>
                          <path d="M8,108 Q-4,96 -10,82" stroke="#030a0d" strokeWidth="6" fill="none" strokeLinecap="round"/>
                          <path d="M54,88 Q50,72 52,56" stroke="#030a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
                          <path d="M102,96 Q113,82 118,68" stroke="#030a0d" strokeWidth="5" fill="none" strokeLinecap="round"/>
                          {/* right palm silhouette */}
                          <path d="M838,260 Q843,222 846,190 Q849,164 840,136" stroke="#020504" strokeWidth="9" fill="none" strokeLinecap="round"/>
                          <path d="M840,138 Q872,118 900,104" stroke="#02060a" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                          <path d="M840,138 Q852,110 855,84" stroke="#02060a" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                          <path d="M840,138 Q820,112 809,90" stroke="#02060a" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                          <path d="M840,138 Q810,128 782,122" stroke="#02060a" strokeWidth="4" fill="none" strokeLinecap="round"/>
                          <path d="M900,104 Q912,90 916,76" stroke="#030a0d" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                          <path d="M855,84 Q858,68 854,52" stroke="#030a0d" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                          <path d="M809,90 Q800,76 795,60" stroke="#030a0d" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
                          {/* fireflies over beach */}
                          {([{x:155,y:228,d:'3.4s',del:'0s'},{x:240,y:218,d:'4.2s',del:'0.7s'},{x:330,y:235,d:'3.8s',del:'1.2s'},{x:420,y:222,d:'4.5s',del:'0.4s'},{x:510,y:230,d:'3.6s',del:'1.8s'},{x:600,y:220,d:'4s',del:'0.9s'},{x:690,y:232,d:'3.5s',del:'1.5s'},{x:755,y:218,d:'4.3s',del:'0.3s'}] as Array<{x:number,y:number,d:string,del:string}>).map((f,i)=>(
                            <circle key={i} cx={f.x} cy={f.y} r={2.5} fill="#c8ff80" opacity={0.82} style={{animation:`bxFirefly ${f.d} ease-in-out infinite`,animationDelay:f.del}}/>
                          ))}
                          {/* milky way arm (wider, more visible) */}
                          <ellipse cx="560" cy="50" rx="320" ry="18" fill="rgba(200,215,255,0.07)" style={{filter:'blur(10px)'}}/>
                          <ellipse cx="500" cy="40" rx="220" ry="10" fill="rgba(210,225,255,0.05)" style={{filter:'blur(6px)'}}/>
                          {/* shooting star */}
                          <line x1="720" y1="15" x2="840" y2="75" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="120" opacity="0.9" style={{animation:'bxShootStar 9s ease-in-out infinite',animationDelay:'3s'}}/>
                          {/* stronger moon reflection path on ocean */}
                          <ellipse cx="198" cy="220" rx="18" ry="55" fill="rgba(255,253,231,0.18)" style={{filter:'blur(3px)'}}/>
                          <path d="M168,192 Q198,188 228,192" stroke="rgba(255,253,231,0.35)" strokeWidth="2" fill="none" strokeLinecap="round"/>
                          <path d="M178,202 Q198,198 218,202" stroke="rgba(255,253,231,0.25)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                        </svg>
                      </div>
                    )}

                    {/* ── AUTUMN NIGHT ── moonlit night with coloured tree silhouettes ── */}
                    {season === 'autumn' && isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="aunSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0b0600"/>
                              <stop offset="38%" stopColor="#180d02"/>
                              <stop offset="72%" stopColor="#261405"/>
                              <stop offset="100%" stopColor="#2e1a08"/>
                            </linearGradient>
                            <radialGradient id="aunMoon" cx="60%" cy="16%" r="13%">
                              <stop offset="0%" stopColor="#fffde7" stopOpacity="0.92"/>
                              <stop offset="42%" stopColor="#ffecb3" stopOpacity="0.35"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#aunSky)"/>
                          {/* stars — slightly amber-tinted */}
                          {nightStarData.map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={st.s} fill={i%5===0?'#ffe0b2':'white'} opacity={0.5+(i%4)*.12} style={{animation:`bxTwinkle ${st.d}s ease-in-out infinite`,animationDelay:`${i*.19}s`}}/>
                          ))}
                          {([{x:42,y:50},{x:108,y:58},{x:172,y:46},{x:238,y:62},{x:305,y:52},{x:374,y:60},{x:440,y:45},{x:508,y:56},{x:578,y:63},{x:648,y:50},{x:718,y:62},{x:785,y:46},{x:848,y:58}] as Array<{x:number,y:number}>).map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={1.0} fill="white" opacity={0.28+(i%4)*.1} style={{animation:`bxTwinkle ${2.1+i*.3}s ease-in-out infinite`,animationDelay:`${i*.23}s`}}/>
                          ))}
                          {/* full moon (harvest moon — amber) */}
                          <ellipse cx="540" cy="50" rx="95" ry="68" fill="url(#aunMoon)"/>
                          {/* moon halo rings */}
                          <circle cx="540" cy="42" r="35" fill="#ffecb3" opacity="0.07" style={{animation:'bxMoonHalo 5s ease-in-out infinite'}}/>
                          <circle cx="540" cy="42" r="27" fill="#ffecb3" opacity="0.13" style={{animation:'bxMoonHalo 5s ease-in-out infinite',animationDelay:'0.7s'}}/>
                          <circle cx="540" cy="42" r="21" fill="#fff9e6" opacity="0.95" style={{animation:'bxMoonGlow 5s ease-in-out infinite'}}/>
                          <circle cx="540" cy="42" r="15" fill="#ffe0b2" opacity="0.65"/>
                          <circle cx="534" cy="37" r="3" fill="#ffcc80" opacity="0.35"/>
                          <circle cx="546" cy="46" r="2.2" fill="#ffcc80" opacity="0.28"/>
                          {/* dark hills */}
                          <path d="M0,210 L80,165 L165,192 L260,148 L340,178 L430,138 L515,168 L605,130 L688,162 L775,128 L858,158 L900,142 L900,265 L0,265 Z" fill="#0d0500" opacity="0.9"/>
                          <path d="M0,230 Q110,214 240,228 Q370,242 500,222 Q630,204 760,222 Q850,234 900,220 L900,330 L0,330 Z" fill="#0a0400"/>
                          {/* ground dark amber */}
                          <path d="M0,248 Q180,234 360,246 Q540,258 720,242 Q840,232 900,238 L900,330 L0,330 Z" fill="#120800"/>
                          {/* left autumn tree silhouette */}
                          <path d="M108,330 Q112,278 110,232 Q108,200 114,168 Q119,142 112,112" stroke="#0a0300" strokeWidth="18" fill="none" strokeLinecap="round"/>
                          <path d="M113,168 Q74,144 38,120" stroke="#0a0300" strokeWidth="9" fill="none" strokeLinecap="round"/>
                          <path d="M113,168 Q154,144 188,122" stroke="#0a0300" strokeWidth="8.5" fill="none" strokeLinecap="round"/>
                          <path d="M113,115 Q86,93 62,74" stroke="#0a0300" strokeWidth="7" fill="none" strokeLinecap="round"/>
                          <path d="M113,115 Q140,93 164,74" stroke="#0a0300" strokeWidth="6.5" fill="none" strokeLinecap="round"/>
                          {/* canopy — dark amber hues visible in moonlight */}
                          <ellipse cx="60" cy="90" rx="55" ry="42" fill="#3d1a00" opacity="0.92"/>
                          <ellipse cx="105" cy="75" rx="60" ry="46" fill="#4a2000" opacity="0.9"/>
                          <ellipse cx="152" cy="90" rx="54" ry="40" fill="#3d1a00" opacity="0.9"/>
                          <ellipse cx="58" cy="75" rx="44" ry="32" fill="#5c2a00" opacity="0.75"/>
                          <ellipse cx="108" cy="60" rx="50" ry="36" fill="#6b3300" opacity="0.72"/>
                          <ellipse cx="154" cy="72" rx="44" ry="32" fill="#5c2a00" opacity="0.74"/>
                          {/* right autumn tree silhouette */}
                          <path d="M798,330 Q795,278 797,230 Q799,198 793,166 Q787,140 794,110" stroke="#0a0300" strokeWidth="16" fill="none" strokeLinecap="round"/>
                          <path d="M793,168 Q752,144 718,122" stroke="#0a0300" strokeWidth="8.5" fill="none" strokeLinecap="round"/>
                          <path d="M793,168 Q835,144 868,122" stroke="#0a0300" strokeWidth="8" fill="none" strokeLinecap="round"/>
                          <path d="M793,112 Q765,90 742,72" stroke="#0a0300" strokeWidth="6.5" fill="none" strokeLinecap="round"/>
                          <path d="M793,112 Q820,90 844,72" stroke="#0a0300" strokeWidth="6" fill="none" strokeLinecap="round"/>
                          <ellipse cx="842" cy="88" rx="54" ry="42" fill="#3d1a00" opacity="0.92"/>
                          <ellipse cx="795" cy="72" rx="60" ry="46" fill="#4a2000" opacity="0.9"/>
                          <ellipse cx="748" cy="88" rx="52" ry="40" fill="#3d1a00" opacity="0.9"/>
                          <ellipse cx="845" cy="72" rx="42" ry="30" fill="#5c2a00" opacity="0.75"/>
                          <ellipse cx="795" cy="58" rx="50" ry="34" fill="#6b3300" opacity="0.72"/>
                          <ellipse cx="746" cy="72" rx="42" ry="30" fill="#5c2a00" opacity="0.74"/>
                          {/* leaf litter on ground */}
                          {([{x:50,y:260,c:'#5c2a00',r:30},{x:120,y:268,c:'#6b3300',r:-20},{x:195,y:262,c:'#4a2000',r:45},{x:270,y:270,c:'#5c2a00',r:-38},{x:345,y:264,c:'#6b3300',r:22},{x:460,y:265,c:'#5c2a00',r:-28},{x:535,y:272,c:'#4a2000',r:42},{x:610,y:264,c:'#6b3300',r:-15},{x:685,y:270,c:'#5c2a00',r:35},{x:758,y:263,c:'#4a2000',r:-52},{x:832,y:268,c:'#6b3300',r:18}] as Array<{x:number,y:number,c:string,r:number}>).map((lf,i)=>(
                            <ellipse key={i} cx={lf.x} cy={lf.y} rx={8+(i%3)*3} ry={4+(i%2)*2} fill={lf.c} opacity={0.68} transform={`rotate(${lf.r},${lf.x},${lf.y})`}/>
                          ))}
                          {/* ground fog wisps */}
                          <ellipse cx="220" cy="282" rx="175" ry="18" fill="rgba(80,40,10,0.28)" style={{animation:'bxFogDrift 8s ease-in-out infinite',filter:'blur(8px)'}}/>
                          <ellipse cx="600" cy="276" rx="200" ry="16" fill="rgba(80,40,10,0.22)" style={{animation:'bxFogDrift2 10s ease-in-out infinite',filter:'blur(7px)'}}/>
                          <ellipse cx="450" cy="295" rx="280" ry="14" fill="rgba(60,30,5,0.18)" style={{animation:'bxFogDrift 12s ease-in-out infinite',animationDelay:'2s',filter:'blur(9px)'}}/>
                          {/* shooting star */}
                          <line x1="600" y1="10" x2="720" y2="58" stroke="rgba(255,240,200,0.9)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="110" style={{animation:'bxShootStar 12s ease-in-out infinite',animationDelay:'5s'}}/>
                          {/* milky way faint band */}
                          <ellipse cx="450" cy="45" rx="350" ry="20" fill="rgba(255,230,180,0.05)" style={{filter:'blur(10px)'}}/>
                        </svg>
                        {/* dark leaves falling in moonlight */}
                        {leafData.slice(0,8).map((l,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-20px', left:l.l, animation:`bxFallLeaf ${l.dur} ease-in-out infinite`, animationDelay:l.delay }}>
                            <svg viewBox="0 0 30 30" width={l.s} height={l.s} style={{ transform:`rotate(${l.r}deg)` }}>
                              <path d="M15,2 C15,2 27,8 25,18 C23,24 18,26 15,28 C12,26 7,24 5,18 C3,8 15,2 15,2 Z" fill="#5c2a00" opacity={0.7}/>
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── MONSOON DAY ── heavy rain tropical storm ── */}
                    {season === 'monsoon' && !isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="mnSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1a2328"/>
                              <stop offset="35%" stopColor="#263238"/>
                              <stop offset="68%" stopColor="#2e3c42"/>
                              <stop offset="100%" stopColor="#37474f"/>
                            </linearGradient>
                            <linearGradient id="mnGround" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1b3a1f"/>
                              <stop offset="100%" stopColor="#0d1f10"/>
                            </linearGradient>
                            <linearGradient id="mnFlood" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2e4a54" stopOpacity="0.85"/>
                              <stop offset="100%" stopColor="#1a2f38" stopOpacity="0.95"/>
                            </linearGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#mnSky)"/>
                          {/* heavy storm clouds */}
                          <ellipse cx="160" cy="48" rx="155" ry="50" fill="#1c2a30" opacity="0.95"/>
                          <ellipse cx="105" cy="62" rx="110" ry="38" fill="#232f35" opacity="0.92"/>
                          <ellipse cx="218" cy="62" rx="120" ry="36" fill="#1e2c32" opacity="0.9"/>
                          <ellipse cx="160" cy="75" rx="160" ry="28" fill="#263238" opacity="0.88"/>
                          <ellipse cx="450" cy="38" rx="170" ry="52" fill="#1c2a30" opacity="0.95"/>
                          <ellipse cx="368" cy="55" rx="120" ry="38" fill="#20282e" opacity="0.9"/>
                          <ellipse cx="535" cy="55" rx="130" ry="36" fill="#1e2c32" opacity="0.88"/>
                          <ellipse cx="750" cy="44" rx="165" ry="50" fill="#1c2a30" opacity="0.95"/>
                          <ellipse cx="820" cy="60" rx="110" ry="36" fill="#232f35" opacity="0.92"/>
                          <ellipse cx="680" cy="60" rx="115" ry="34" fill="#20282e" opacity="0.9"/>
                          {/* lightning flash */}
                          <path d="M340,0 L318,65 L332,65 L308,130" stroke="rgba(255,248,180,0.85)" strokeWidth="3" fill="none" strokeLinecap="round" style={{animation:'bxLightning 5s ease-in-out infinite',animationDelay:'1.5s'}}/>
                          <path d="M620,0 L598,58 L612,58 L590,115" stroke="rgba(255,248,180,0.75)" strokeWidth="2.5" fill="none" strokeLinecap="round" style={{animation:'bxLightning 7s ease-in-out infinite',animationDelay:'3.2s'}}/>
                          {/* background hills */}
                          <path d="M0,195 Q120,172 250,188 Q380,204 510,180 Q640,158 770,178 Q850,190 900,175 L900,250 L0,250 Z" fill="#1b3a1f" opacity="0.8"/>
                          {/* flooded ground */}
                          <path d="M0,235 Q150,220 310,232 Q470,244 630,226 Q780,210 900,224 L900,330 L0,330 Z" fill="url(#mnFlood)"/>
                          <path d="M0,252 Q180,240 360,250 Q540,260 720,244 Q840,234 900,240 L900,330 L0,330 Z" fill="#1e3540" opacity="0.9"/>
                          {/* rain puddle ripples */}
                          {([{x:120,y:268},{x:250,y:272},{x:390,y:265},{x:520,y:274},{x:660,y:268},{x:790,y:272}] as Array<{x:number,y:number}>).map((r,i)=>(
                            <g key={i}>
                              <ellipse cx={r.x} cy={r.y} rx={18} ry={5} fill="none" stroke="rgba(100,180,220,0.3)" strokeWidth="1.2" style={{animation:`bxFloat ${1.5+i*.3}s ease-in-out infinite`,animationDelay:`${i*.4}s`}}/>
                              <ellipse cx={r.x} cy={r.y} rx={10} ry={3} fill="none" stroke="rgba(100,180,220,0.25)" strokeWidth="1"/>
                            </g>
                          ))}
                          {/* lotus leaves & flowers in floodwater */}
                          {/* large lily pads */}
                          <ellipse cx="200" cy="260" rx="30" ry="13" fill="#1a6326" opacity="0.92" transform="rotate(-8,200,260)"/>
                          <ellipse cx="198" cy="260" rx="30" ry="13" fill="#22793a" opacity="0.78" transform="rotate(-8,198,260)"/>
                          <line x1="200" y1="247" x2="200" y2="273" stroke="#145220" strokeWidth="1.2" opacity="0.5"/>
                          <line x1="186" y1="254" x2="214" y2="266" stroke="#145220" strokeWidth="1" opacity="0.4"/>
                          {/* notch in pad */}
                          <path d="M200,247 L194,260 L200,273" fill="#1a6326" stroke="#1a6326" strokeWidth="1"/>

                          <ellipse cx="440" cy="256" rx="26" ry="11" fill="#1a6326" opacity="0.9" transform="rotate(5,440,256)"/>
                          <ellipse cx="438" cy="256" rx="26" ry="11" fill="#22793a" opacity="0.75" transform="rotate(5,438,256)"/>
                          <line x1="440" y1="245" x2="440" y2="267" stroke="#145220" strokeWidth="1.1" opacity="0.45"/>
                          <path d="M440,245 L446,256 L440,267" fill="#1a6326" stroke="#1a6326" strokeWidth="1"/>

                          <ellipse cx="680" cy="262" rx="28" ry="12" fill="#1a6326" opacity="0.92" transform="rotate(-5,680,262)"/>
                          <ellipse cx="678" cy="262" rx="28" ry="12" fill="#22793a" opacity="0.78" transform="rotate(-5,678,262)"/>
                          <line x1="680" y1="250" x2="680" y2="274" stroke="#145220" strokeWidth="1.2" opacity="0.45"/>
                          <path d="M680,250 L674,262 L680,274" fill="#1a6326" stroke="#1a6326" strokeWidth="1"/>

                          {/* small lily pads */}
                          <ellipse cx="310" cy="268" rx="18" ry="8" fill="#22793a" opacity="0.85" transform="rotate(12,310,268)"/>
                          <ellipse cx="560" cy="264" rx="20" ry="8" fill="#1f7034" opacity="0.88" transform="rotate(-10,560,264)"/>

                          {/* lotus flowers */}
                          {/* flower 1 on pad at 200 */}
                          <g>
                            <ellipse cx="200" cy="249" rx="5.5" ry="9" fill="#f48fb1" opacity="0.9" transform="rotate(-20,200,249)"/>
                            <ellipse cx="200" cy="249" rx="5.5" ry="9" fill="#f48fb1" opacity="0.88" transform="rotate(20,200,249)"/>
                            <ellipse cx="200" cy="249" rx="5" ry="8" fill="#f8bbd9" opacity="0.92" transform="rotate(0,200,249)"/>
                            <ellipse cx="200" cy="249" rx="4.5" ry="7.5" fill="#f8bbd9" opacity="0.85" transform="rotate(-40,200,249)"/>
                            <ellipse cx="200" cy="249" rx="4.5" ry="7.5" fill="#f8bbd9" opacity="0.85" transform="rotate(40,200,249)"/>
                            <circle cx="200" cy="248" r="4" fill="#ffd54f" opacity="0.9"/>
                            <circle cx="200" cy="248" r="2.5" fill="#ffb300" opacity="0.8"/>
                          </g>
                          {/* flower 2 on pad at 680 (bud form) */}
                          <g>
                            <ellipse cx="680" cy="252" rx="4" ry="7" fill="#ec407a" opacity="0.88" transform="rotate(-15,680,252)"/>
                            <ellipse cx="680" cy="252" rx="4" ry="7" fill="#ec407a" opacity="0.85" transform="rotate(15,680,252)"/>
                            <ellipse cx="680" cy="252" rx="3.5" ry="6.5" fill="#f48fb1" opacity="0.9" transform="rotate(0,680,252)"/>
                            <circle cx="680" cy="251" r="3" fill="#ffd54f" opacity="0.88"/>
                          </g>
                          {/* half-open bud at 440 */}
                          <g>
                            <ellipse cx="440" cy="248" rx="3.5" ry="6" fill="#f06292" opacity="0.9" transform="rotate(-10,440,248)"/>
                            <ellipse cx="440" cy="248" rx="3.5" ry="6" fill="#f06292" opacity="0.85" transform="rotate(10,440,248)"/>
                            <ellipse cx="440" cy="248" rx="3" ry="5.5" fill="#f8bbd9" opacity="0.9"/>
                            <circle cx="440" cy="247" r="2.5" fill="#ffe082" opacity="0.85"/>
                          </g>

                          {/* stem lines from pads */}
                          <line x1="200" y1="257" x2="200" y2="273" stroke="#145220" strokeWidth="1.5" opacity="0.6"/>
                          <line x1="440" y1="254" x2="440" y2="265" stroke="#145220" strokeWidth="1.5" opacity="0.55"/>
                          <line x1="680" y1="259" x2="680" y2="272" stroke="#145220" strokeWidth="1.5" opacity="0.6"/>

                          {/* tropical foliage silhouettes */}
                          <path d="M0,235 Q28,215 55,230 Q75,240 95,225 L95,330 L0,330 Z" fill="#163018"/>
                          <path d="M808,228 Q835,212 865,225 Q885,235 900,220 L900,330 L808,330 Z" fill="#163018"/>
                          {/* left dense tropical tree */}
                          <path d="M60,330 Q58,280 60,240 Q62,215 55,188" stroke="#0d2010" strokeWidth="12" fill="none" strokeLinecap="round"/>
                          <ellipse cx="48" cy="172" rx="48" ry="38" fill="#1a3d1e" opacity="0.95"/>
                          <ellipse cx="72" cy="162" rx="52" ry="40" fill="#1f4a24" opacity="0.92"/>
                          <ellipse cx="55" cy="150" rx="44" ry="35" fill="#245628" opacity="0.9"/>
                          <ellipse cx="40" cy="142" rx="36" ry="28" fill="#163018" opacity="0.88"/>
                          {/* right tropical tree */}
                          <path d="M848,330 Q850,280 848,240 Q846,215 854,188" stroke="#0d2010" strokeWidth="11" fill="none" strokeLinecap="round"/>
                          <ellipse cx="860" cy="172" rx="48" ry="38" fill="#1a3d1e" opacity="0.95"/>
                          <ellipse cx="836" cy="162" rx="52" ry="40" fill="#1f4a24" opacity="0.92"/>
                          <ellipse cx="852" cy="150" rx="44" ry="35" fill="#245628" opacity="0.9"/>
                          <ellipse cx="872" cy="142" rx="36" ry="28" fill="#163018" opacity="0.88"/>
                        </svg>
                        {/* heavy rain */}
                        {rainData.map((r,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-10px', left:r.l, width:`${r.w}px`, height:'22px', background:`rgba(140,200,225,${r.o})`, borderRadius:'1px', animation:`bxRain ${r.dur} linear infinite`, animationDelay:r.delay, transform:'rotate(10deg)' }}/>
                        ))}
                      </div>
                    )}

                    {/* ── MONSOON NIGHT ── dark cloudy night with heavy rain & lightning ── */}
                    {season === 'monsoon' && isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="mnnSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#060b0e"/>
                              <stop offset="40%" stopColor="#080e10"/>
                              <stop offset="80%" stopColor="#0c1318"/>
                              <stop offset="100%" stopColor="#0e1620"/>
                            </linearGradient>
                            <linearGradient id="mnnFlood" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#091622" stopOpacity="0.9"/>
                              <stop offset="100%" stopColor="#050e16" stopOpacity="0.98"/>
                            </linearGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#mnnSky)"/>
                          {/* very thick dark clouds — NO stars visible */}
                          <ellipse cx="150" cy="50" rx="175" ry="58" fill="#0c1218" opacity="0.98"/>
                          <ellipse cx="90" cy="68" rx="120" ry="44" fill="#0a1016" opacity="0.98"/>
                          <ellipse cx="225" cy="68" rx="135" ry="42" fill="#0d1319" opacity="0.98"/>
                          <ellipse cx="150" cy="85" rx="180" ry="32" fill="#111820" opacity="0.98"/>
                          <ellipse cx="460" cy="40" rx="188" ry="58" fill="#0b1116" opacity="0.98"/>
                          <ellipse cx="375" cy="60" rx="130" ry="44" fill="#0d1420" opacity="0.96"/>
                          <ellipse cx="548" cy="60" rx="142" ry="42" fill="#0c1218" opacity="0.96"/>
                          <ellipse cx="758" cy="46" rx="175" ry="56" fill="#0b1116" opacity="0.98"/>
                          <ellipse cx="830" cy="65" rx="120" ry="40" fill="#0d1218" opacity="0.96"/>
                          <ellipse cx="688" cy="65" rx="125" ry="40" fill="#0c1116" opacity="0.96"/>
                          {/* lightning flashes — multiple */}
                          <path d="M285,0 L263,72 L278,72 L254,140" stroke="rgba(255,252,150,0.9)" strokeWidth="3.5" fill="none" strokeLinecap="round" style={{animation:'bxLightning 4.5s ease-in-out infinite',animationDelay:'0.8s'}}/>
                          <path d="M580,0 L558,60 L573,60 L550,118" stroke="rgba(255,252,150,0.8)" strokeWidth="3" fill="none" strokeLinecap="round" style={{animation:'bxLightning 6s ease-in-out infinite',animationDelay:'2.5s'}}/>
                          <path d="M820,0 L800,65 L815,65 L794,122" stroke="rgba(255,252,150,0.75)" strokeWidth="2.5" fill="none" strokeLinecap="round" style={{animation:'bxLightning 8s ease-in-out infinite',animationDelay:'4s'}}/>
                          {/* dark landscape */}
                          <path d="M0,210 Q120,195 255,208 Q390,222 520,202 Q650,185 780,202 Q855,212 900,200 L900,260 L0,260 Z" fill="#060d08" opacity="0.95"/>
                          {/* flooded ground — near black with tiny reflections */}
                          <path d="M0,248 Q150,235 310,246 Q470,258 630,240 Q780,224 900,238 L900,330 L0,330 Z" fill="url(#mnnFlood)"/>
                          <path d="M0,265 Q200,254 400,263 Q600,272 800,258 L900,260 L900,330 L0,330 Z" fill="#080f15" opacity="0.9"/>
                          {/* lightning reflections in flood water */}
                          <path d="M268,280 L252,310 L260,310 L244,330" stroke="rgba(255,252,150,0.15)" strokeWidth="2" fill="none" strokeLinecap="round" style={{animation:'bxLightning 4.5s ease-in-out infinite',animationDelay:'0.8s'}}/>
                          {/* puddle ripples from rain */}
                          {([{x:80,y:272},{x:195,y:278},{x:318,y:270},{x:445,y:276},{x:572,y:270},{x:698,y:278},{x:818,y:272}] as Array<{x:number,y:number}>).map((r,i)=>(
                            <g key={i}>
                              <ellipse cx={r.x} cy={r.y} rx={14} ry={4} fill="none" stroke="rgba(60,120,160,0.35)" strokeWidth="1" style={{animation:`bxFloat ${1.2+i*.25}s ease-in-out infinite`,animationDelay:`${i*.35}s`}}/>
                              <ellipse cx={r.x} cy={r.y} rx={7} ry={2} fill="none" stroke="rgba(60,120,160,0.28)" strokeWidth="0.8"/>
                            </g>
                          ))}
                          {/* lotus leaves with frogs in night floodwater */}
                          {/* dark lily pads */}
                          <ellipse cx="195" cy="272" rx="26" ry="11" fill="#0f3d18" opacity="0.95" transform="rotate(-8,195,272)"/>
                          <ellipse cx="460" cy="268" rx="22" ry="9" fill="#0d3515" opacity="0.92" transform="rotate(6,460,268)"/>
                          <ellipse cx="700" cy="274" rx="24" ry="10" fill="#0f3d18" opacity="0.95" transform="rotate(-4,700,274)"/>

                          {/* lotus buds (closed at night) */}
                          <ellipse cx="195" cy="264" rx="3" ry="6" fill="#4a1028" opacity="0.85"/>
                          <ellipse cx="700" cy="266" rx="2.5" ry="5" fill="#4a1028" opacity="0.78"/>

                          {/* LOTUS FLOWER 1 — pad at 195, open, moonlit dark pink */}
                          <g>
                            <line x1="195" y1="261" x2="195" y2="272" stroke="#1a5e24" strokeWidth="2" opacity="0.8"/>
                            <ellipse cx="195" cy="256" rx="6" ry="11" fill="#6d2040" opacity="0.82" transform="rotate(-35,195,256)"/>
                            <ellipse cx="195" cy="256" rx="6" ry="11" fill="#6d2040" opacity="0.82" transform="rotate(35,195,256)"/>
                            <ellipse cx="195" cy="256" rx="6" ry="10" fill="#6d2040" opacity="0.78" transform="rotate(-70,195,256)"/>
                            <ellipse cx="195" cy="256" rx="6" ry="10" fill="#6d2040" opacity="0.78" transform="rotate(70,195,256)"/>
                            <ellipse cx="195" cy="255" rx="5" ry="9.5" fill="#8b2252" opacity="0.88" transform="rotate(-18,195,255)"/>
                            <ellipse cx="195" cy="255" rx="5" ry="9.5" fill="#8b2252" opacity="0.88" transform="rotate(18,195,255)"/>
                            <ellipse cx="195" cy="255" rx="5" ry="9" fill="#8b2252" opacity="0.84" transform="rotate(-52,195,255)"/>
                            <ellipse cx="195" cy="255" rx="5" ry="9" fill="#8b2252" opacity="0.84" transform="rotate(52,195,255)"/>
                            <ellipse cx="195" cy="254" rx="4" ry="8" fill="#ad2d68" opacity="0.92" transform="rotate(0,195,254)"/>
                            <ellipse cx="195" cy="254" rx="3.5" ry="7" fill="#c0337a" opacity="0.9" transform="rotate(-28,195,254)"/>
                            <ellipse cx="195" cy="254" rx="3.5" ry="7" fill="#c0337a" opacity="0.9" transform="rotate(28,195,254)"/>
                            <circle cx="195" cy="252" r="4.5" fill="#b8860b" opacity="0.9"/>
                            <circle cx="195" cy="252" r="2.8" fill="#daa520" opacity="0.85"/>
                          </g>

                          {/* LOTUS FLOWER 2 — pad at 700, open, fully bloomed */}
                          <g>
                            <line x1="700" y1="263" x2="700" y2="274" stroke="#1a5e24" strokeWidth="2" opacity="0.8"/>
                            <ellipse cx="700" cy="258" rx="6.5" ry="12" fill="#5a1a34" opacity="0.80" transform="rotate(-40,700,258)"/>
                            <ellipse cx="700" cy="258" rx="6.5" ry="12" fill="#5a1a34" opacity="0.80" transform="rotate(40,700,258)"/>
                            <ellipse cx="700" cy="258" rx="6" ry="11" fill="#5a1a34" opacity="0.76" transform="rotate(-75,700,258)"/>
                            <ellipse cx="700" cy="258" rx="6" ry="11" fill="#5a1a34" opacity="0.76" transform="rotate(75,700,258)"/>
                            <ellipse cx="700" cy="257" rx="5.5" ry="10" fill="#7a2448" opacity="0.88" transform="rotate(-20,700,257)"/>
                            <ellipse cx="700" cy="257" rx="5.5" ry="10" fill="#7a2448" opacity="0.88" transform="rotate(20,700,257)"/>
                            <ellipse cx="700" cy="257" rx="5" ry="9.5" fill="#7a2448" opacity="0.84" transform="rotate(-55,700,257)"/>
                            <ellipse cx="700" cy="257" rx="5" ry="9.5" fill="#7a2448" opacity="0.84" transform="rotate(55,700,257)"/>
                            <ellipse cx="700" cy="255" rx="4.5" ry="8.5" fill="#a02860" opacity="0.92" transform="rotate(0,700,255)"/>
                            <ellipse cx="700" cy="255" rx="4" ry="7.5" fill="#b52e70" opacity="0.9" transform="rotate(-30,700,255)"/>
                            <ellipse cx="700" cy="255" rx="4" ry="7.5" fill="#b52e70" opacity="0.9" transform="rotate(30,700,255)"/>
                            <circle cx="700" cy="253" r="5" fill="#b8860b" opacity="0.88"/>
                            <circle cx="700" cy="253" r="3" fill="#daa520" opacity="0.82"/>
                          </g>

                          {/* FROG 1 — jumping, pad at 195 (right side) */}
                          <g style={{animation:'bxFrogJump 3.2s ease-in-out infinite',animationDelay:'0s',transformOrigin:'204px 271px'}}>
                            <ellipse cx="204" cy="271" rx="8" ry="6" fill="#2d6a2f" opacity="0.95"/>
                            <ellipse cx="204" cy="269" rx="5.5" ry="4.5" fill="#43a047" opacity="0.92"/>
                            <circle cx="201" cy="266" r="2.8" fill="#1b5e20"/>
                            <circle cx="207" cy="266" r="2.8" fill="#1b5e20"/>
                            <circle cx="201" cy="266" r="1.5" fill="#76ff03" opacity="0.95"/>
                            <circle cx="207" cy="266" r="1.5" fill="#76ff03" opacity="0.95"/>
                            <circle cx="201.4" cy="265.6" r="0.6" fill="#000"/>
                            <circle cx="207.4" cy="265.6" r="0.6" fill="#000"/>
                            <path d="M200,276 Q196,281 192,283" stroke="#2d6a2f" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            <path d="M208,276 Q212,281 216,283" stroke="#2d6a2f" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            <path d="M201,272 Q198,276 196,278" stroke="#388e3c" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            <path d="M207,272 Q210,276 212,278" stroke="#388e3c" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            <ellipse cx="204" cy="271" rx="3" ry="2" fill="#a5d6a7" opacity="0.4"/>
                          </g>

                          {/* FROG 2 — jumping, pad at 460 */}
                          <g style={{animation:'bxFrogJump 4s ease-in-out infinite',animationDelay:'1.2s',transformOrigin:'468px 268px'}}>
                            <ellipse cx="468" cy="268" rx="7.5" ry="5.5" fill="#2d6a2f" opacity="0.95"/>
                            <ellipse cx="468" cy="266" rx="5" ry="4" fill="#43a047" opacity="0.92"/>
                            <circle cx="465" cy="263" r="2.5" fill="#1b5e20"/>
                            <circle cx="471" cy="263" r="2.5" fill="#1b5e20"/>
                            <circle cx="465" cy="263" r="1.3" fill="#76ff03" opacity="0.95"/>
                            <circle cx="471" cy="263" r="1.3" fill="#76ff03" opacity="0.95"/>
                            <circle cx="465.4" cy="262.6" r="0.55" fill="#000"/>
                            <circle cx="471.4" cy="262.6" r="0.55" fill="#000"/>
                            <path d="M464,273 Q460,278 456,280" stroke="#2d6a2f" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            <path d="M472,273 Q476,278 480,280" stroke="#2d6a2f" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            <path d="M465,269 Q462,273 460,275" stroke="#388e3c" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            <path d="M471,269 Q474,273 476,275" stroke="#388e3c" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            <ellipse cx="468" cy="268" rx="2.8" ry="1.8" fill="#a5d6a7" opacity="0.4"/>
                          </g>

                          {/* FROG 3 — jumping, pad at 700 (left of flower) */}
                          <g style={{animation:'bxFrogJump 3.6s ease-in-out infinite',animationDelay:'0.6s',transformOrigin:'690px 273px'}}>
                            <ellipse cx="690" cy="273" rx="8" ry="6" fill="#2d6a2f" opacity="0.95"/>
                            <ellipse cx="690" cy="271" rx="5.5" ry="4.5" fill="#43a047" opacity="0.92"/>
                            <circle cx="687" cy="268" r="2.8" fill="#1b5e20"/>
                            <circle cx="693" cy="268" r="2.8" fill="#1b5e20"/>
                            <circle cx="687" cy="268" r="1.5" fill="#76ff03" opacity="0.95"/>
                            <circle cx="693" cy="268" r="1.5" fill="#76ff03" opacity="0.95"/>
                            <circle cx="687.4" cy="267.6" r="0.6" fill="#000"/>
                            <circle cx="693.4" cy="267.6" r="0.6" fill="#000"/>
                            <path d="M686,278 Q682,283 678,285" stroke="#2d6a2f" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            <path d="M694,278 Q698,283 702,285" stroke="#2d6a2f" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            <path d="M687,274 Q684,278 682,280" stroke="#388e3c" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            <path d="M693,274 Q696,278 698,280" stroke="#388e3c" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                            <ellipse cx="690" cy="273" rx="3" ry="2" fill="#a5d6a7" opacity="0.4"/>
                          </g>

                          {/* eye glow reflections in floodwater */}
                          <ellipse cx="201" cy="278" rx="5" ry="2" fill="#76ff03" opacity="0.07"/>
                          <ellipse cx="207" cy="278" rx="5" ry="2" fill="#76ff03" opacity="0.07"/>
                          <ellipse cx="465" cy="275" rx="4" ry="1.5" fill="#76ff03" opacity="0.07"/>
                          <ellipse cx="471" cy="275" rx="4" ry="1.5" fill="#76ff03" opacity="0.07"/>
                          <ellipse cx="687" cy="280" rx="5" ry="2" fill="#76ff03" opacity="0.07"/>
                          <ellipse cx="693" cy="280" rx="5" ry="2" fill="#76ff03" opacity="0.07"/>

                          {/* tree silhouettes */}
                          <path d="M55,330 Q53,280 55,245 Q57,220 50,196" stroke="#040a06" strokeWidth="10" fill="none" strokeLinecap="round"/>
                          <ellipse cx="42" cy="178" rx="45" ry="36" fill="#080e0a" opacity="0.98"/>
                          <ellipse cx="62" cy="168" rx="48" ry="38" fill="#0a100c" opacity="0.98"/>
                          <ellipse cx="50" cy="155" rx="40" ry="32" fill="#060c08" opacity="0.98"/>
                          <path d="M852,330 Q854,280 852,245 Q850,220 858,196" stroke="#040a06" strokeWidth="10" fill="none" strokeLinecap="round"/>
                          <ellipse cx="868" cy="178" rx="45" ry="36" fill="#080e0a" opacity="0.98"/>
                          <ellipse cx="848" cy="168" rx="48" ry="38" fill="#0a100c" opacity="0.98"/>
                          <ellipse cx="860" cy="155" rx="40" ry="32" fill="#060c08" opacity="0.98"/>
                        </svg>
                        {/* very heavy rain */}
                        {rainData.map((r,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-10px', left:r.l, width:`${r.w*1.3}px`, height:'26px', background:`rgba(100,160,200,${r.o*.9})`, borderRadius:'1px', animation:`bxRain ${parseFloat(r.dur)*0.8}s linear infinite`, animationDelay:r.delay, transform:'rotate(12deg)' }}/>
                        ))}
                      </div>
                    )}

                    {/* ── PRE-WINTER DAY ── cold pale landscape, bare trees, frost ── */}
                    {season === 'pre-winter' && !isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="pwSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#546e7a"/>
                              <stop offset="35%" stopColor="#607d8b"/>
                              <stop offset="68%" stopColor="#78909c"/>
                              <stop offset="100%" stopColor="#90a4ae"/>
                            </linearGradient>
                            <radialGradient id="pwSun" cx="62%" cy="24%" r="16%">
                              <stop offset="0%" stopColor="#ffe082" stopOpacity="0.7"/>
                              <stop offset="55%" stopColor="#ffd54f" stopOpacity="0.2"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="pwGround" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8d9e7a"/>
                              <stop offset="100%" stopColor="#6a7a5a"/>
                            </linearGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#pwSky)"/>
                          {/* low cold sun, pale */}
                          <ellipse cx="558" cy="78" rx="80" ry="55" fill="url(#pwSun)"/>
                          <circle cx="558" cy="70" r="14" fill="#fff9e6" opacity="0.65"/>
                          {/* thin overcast clouds */}
                          <ellipse cx="155" cy="52" rx="110" ry="28" fill="rgba(255,255,255,0.55)"/>
                          <ellipse cx="105" cy="64" rx="75" ry="20" fill="rgba(255,255,255,0.48)"/>
                          <ellipse cx="210" cy="64" rx="82" ry="18" fill="rgba(255,255,255,0.45)"/>
                          <ellipse cx="450" cy="40" rx="120" ry="26" fill="rgba(255,255,255,0.5)"/>
                          <ellipse cx="375" cy="54" rx="85" ry="20" fill="rgba(255,255,255,0.44)"/>
                          <ellipse cx="748" cy="46" rx="105" ry="25" fill="rgba(255,255,255,0.48)"/>
                          <ellipse cx="820" cy="60" rx="75" ry="18" fill="rgba(255,255,255,0.42)"/>
                          {/* far hills — grey-brown */}
                          <path d="M0,188 L75,152 L158,175 L242,136 L325,162 L412,125 L496,155 L578,118 L658,148 L740,114 L822,142 L880,118 L900,128 L900,235 L0,235 Z" fill="#78909c" opacity="0.65"/>
                          <path d="M0,205 Q115,188 240,202 Q370,216 500,196 Q632,178 762,196 Q850,208 900,194 L900,260 L0,260 Z" fill="#5d6e5a" opacity="0.75"/>
                          {/* ground — pale dry grass */}
                          <path d="M0,235 Q115,220 248,232 Q382,244 516,225 Q650,208 782,225 Q858,234 900,222 L900,330 L0,330 Z" fill="url(#pwGround)"/>
                          <path d="M0,252 Q165,240 335,250 Q505,260 675,244 Q808,232 900,242 L900,330 L0,330 Z" fill="#7a8c6a" opacity="0.85"/>
                          {/* frost patches on ground */}
                          {([{x:65,y:258,rx:45,ry:8},{x:188,y:264,rx:58,ry:7},{x:312,y:256,rx:42,ry:9},{x:438,y:262,rx:52,ry:8},{x:565,y:256,rx:48,ry:9},{x:690,y:264,rx:62,ry:7},{x:815,y:258,rx:44,ry:9}] as Array<{x:number,y:number,rx:number,ry:number}>).map((d,i)=>(
                            <ellipse key={i} cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} fill="rgba(224,240,245,0.55)" style={{animation:`bxFrost ${2.5+i*.4}s ease-in-out infinite`,animationDelay:`${i*.3}s`}}/>
                          ))}
                          {/* left bare tree */}
                          <path d="M98,330 Q102,278 100,232 Q97,202 103,172 Q108,148 102,118" stroke="#374149" strokeWidth="16" fill="none" strokeLinecap="round"/>
                          <path d="M102,172 Q65,148 30,126" stroke="#374149" strokeWidth="8" fill="none" strokeLinecap="round"/>
                          <path d="M102,172 Q142,148 175,128" stroke="#374149" strokeWidth="7.5" fill="none" strokeLinecap="round"/>
                          <path d="M102,120 Q76,98 52,80" stroke="#374149" strokeWidth="6" fill="none" strokeLinecap="round"/>
                          <path d="M102,120 Q128,98 150,80" stroke="#374149" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                          <path d="M30,126 Q10,112 -2,100" stroke="#374149" strokeWidth="4" fill="none" strokeLinecap="round"/>
                          <path d="M175,128 Q195,112 210,100" stroke="#374149" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                          <path d="M52,80 Q44,62 40,46" stroke="#374149" strokeWidth="3" fill="none" strokeLinecap="round"/>
                          <path d="M150,80 Q158,62 158,46" stroke="#374149" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
                          {/* frost on branches left */}
                          <ellipse cx="24" cy="124" rx="16" ry="3.5" fill="rgba(220,235,242,0.8)" style={{animation:'bxFrost 3s ease-in-out infinite'}}/>
                          <ellipse cx="178" cy="126" rx="15" ry="3" fill="rgba(220,235,242,0.75)"/>
                          <ellipse cx="48" cy="78" rx="12" ry="2.8" fill="rgba(220,235,242,0.7)"/>
                          <ellipse cx="152" cy="78" rx="12" ry="2.8" fill="rgba(220,235,242,0.7)"/>
                          {/* right bare tree */}
                          <path d="M805,330 Q801,278 803,230 Q805,200 799,170 Q793,146 800,116" stroke="#374149" strokeWidth="15" fill="none" strokeLinecap="round"/>
                          <path d="M799,172 Q758,148 724,128" stroke="#374149" strokeWidth="7.5" fill="none" strokeLinecap="round"/>
                          <path d="M799,172 Q840,148 872,128" stroke="#374149" strokeWidth="7" fill="none" strokeLinecap="round"/>
                          <path d="M799,118 Q772,96 748,78" stroke="#374149" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                          <path d="M799,118 Q826,96 848,78" stroke="#374149" strokeWidth="5" fill="none" strokeLinecap="round"/>
                          <path d="M724,128 Q704,114 690,102" stroke="#374149" strokeWidth="3.8" fill="none" strokeLinecap="round"/>
                          <path d="M872,128 Q890,114 904,102" stroke="#374149" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                          <path d="M748,78 Q738,60 736,44" stroke="#374149" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
                          <path d="M848,78 Q860,60 862,44" stroke="#374149" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
                          {/* frost on branches right */}
                          <ellipse cx="720" cy="126" rx="15" ry="3.5" fill="rgba(220,235,242,0.78)"/>
                          <ellipse cx="876" cy="126" rx="14" ry="3" fill="rgba(220,235,242,0.72)"/>
                          <ellipse cx="745" cy="76" rx="12" ry="2.8" fill="rgba(220,235,242,0.7)"/>
                          <ellipse cx="850" cy="76" rx="11" ry="2.8" fill="rgba(220,235,242,0.68)"/>
                          {/* mid-ground bare shrubs */}
                          {([{x:260,h:45},{x:310,h:38},{x:575,h:42},{x:622,h:36}] as Array<{x:number,h:number}>).map((t,i)=>(
                            <g key={i}>
                              <path d={`M${t.x},248 Q${t.x+2},${248-t.h*.5} ${t.x},${248-t.h}`} stroke="#455a64" strokeWidth="6" fill="none" strokeLinecap="round"/>
                              <path d={`M${t.x},${248-t.h*.55} Q${t.x-16},${248-t.h*.72} ${t.x-26},${248-t.h*.85}`} stroke="#455a64" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                              <path d={`M${t.x},${248-t.h*.55} Q${t.x+14},${248-t.h*.7} ${t.x+24},${248-t.h*.82}`} stroke="#455a64" strokeWidth="3" fill="none" strokeLinecap="round"/>
                            </g>
                          ))}
                        </svg>
                      </div>
                    )}

                    {/* ── PRE-WINTER NIGHT ── clear cold night, stars, frost, bare trees ── */}
                    {season === 'pre-winter' && isNight && (
                      <div style={{ position:'absolute', inset:0 }}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
                          <defs>
                            <linearGradient id="pwnSky" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#060a18"/>
                              <stop offset="40%" stopColor="#0a1228"/>
                              <stop offset="75%" stopColor="#0e1835"/>
                              <stop offset="100%" stopColor="#121e40"/>
                            </linearGradient>
                            <radialGradient id="pwnMoon" cx="30%" cy="20%" r="13%">
                              <stop offset="0%" stopColor="#e8f4fd" stopOpacity="0.95"/>
                              <stop offset="42%" stopColor="#cce8f8" stopOpacity="0.35"/>
                              <stop offset="100%" stopColor="white" stopOpacity="0"/>
                            </radialGradient>
                            <linearGradient id="pwnGround" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1a2218"/>
                              <stop offset="100%" stopColor="#0d1410"/>
                            </linearGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#pwnSky)"/>
                          {/* stars — extra bright on clear cold night */}
                          {nightStarData.map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={st.s*1.1} fill="white" opacity={0.65+(i%4)*.12} style={{animation:`bxTwinkle ${st.d}s ease-in-out infinite`,animationDelay:`${i*.17}s`}}/>
                          ))}
                          {([{x:25,y:52},{x:85,y:58},{x:148,y:46},{x:215,y:62},{x:282,y:50},{x:350,y:60},{x:418,y:44},{x:488,y:56},{x:558,y:64},{x:628,y:48},{x:698,y:62},{x:765,y:46},{x:832,y:58},{x:888,y:52}] as Array<{x:number,y:number}>).map((st,i)=>(
                            <circle key={i} cx={st.x} cy={st.y} r={1.2} fill="white" opacity={0.38+(i%4)*.1} style={{animation:`bxTwinkle ${2+i*.28}s ease-in-out infinite`,animationDelay:`${i*.2}s`}}/>
                          ))}
                          {/* moon glow */}
                          <ellipse cx="270" cy="62" rx="95" ry="68" fill="url(#pwnMoon)"/>
                          {/* moon halo rings */}
                          <circle cx="270" cy="53" r="36" fill="#cce8f8" opacity="0.07" style={{animation:'bxMoonHalo 5s ease-in-out infinite'}}/>
                          <circle cx="270" cy="53" r="28" fill="#cce8f8" opacity="0.13" style={{animation:'bxMoonHalo 5s ease-in-out infinite',animationDelay:'0.8s'}}/>
                          {/* nearly full moon */}
                          <circle cx="270" cy="53" r="22" fill="#e8f4fd" opacity="0.96" style={{animation:'bxMoonGlow 5s ease-in-out infinite'}}/>
                          <circle cx="270" cy="53" r="16" fill="#d0eaf8" opacity="0.72"/>
                          <circle cx="265" cy="48" r="3" fill="#b8ddf0" opacity="0.3"/>
                          <circle cx="276" cy="57" r="2" fill="#b8ddf0" opacity="0.22"/>
                          {/* moonlit frost shimmer on landscape */}
                          <path d="M0,205 Q120,188 255,202 Q390,216 522,196 Q655,178 788,196 Q858,206 900,192 L900,260 L0,260 Z" fill="#14201a" opacity="0.9"/>
                          {/* ground */}
                          <path d="M0,240 Q145,226 298,238 Q452,250 608,232 Q762,216 900,230 L900,330 L0,330 Z" fill="url(#pwnGround)"/>
                          <path d="M0,258 Q190,246 380,256 Q570,266 760,250 Q858,240 900,248 L900,330 L0,330 Z" fill="#111c14" opacity="0.85"/>
                          {/* frost shimmer on ground */}
                          {([{x:70,y:260,rx:52,ry:9},{x:200,y:267,rx:65,ry:8},{x:330,y:258,rx:48,ry:10},{x:460,y:265,rx:58,ry:9},{x:590,y:260,rx:55,ry:10},{x:718,y:267,rx:68,ry:8},{x:845,y:260,rx:48,ry:10}] as Array<{x:number,y:number,rx:number,ry:number}>).map((d,i)=>(
                            <ellipse key={i} cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} fill="rgba(200,230,245,0.22)" style={{animation:`bxFrost ${2.8+i*.35}s ease-in-out infinite`,animationDelay:`${i*.28}s`}}/>
                          ))}
                          {/* left bare tree silhouette */}
                          <path d="M105,330 Q109,278 107,232 Q104,202 110,172 Q115,148 108,118" stroke="#0c1812" strokeWidth="16" fill="none" strokeLinecap="round"/>
                          <path d="M109,174 Q72,150 36,128" stroke="#0c1812" strokeWidth="8" fill="none" strokeLinecap="round"/>
                          <path d="M109,174 Q150,150 182,130" stroke="#0c1812" strokeWidth="7.5" fill="none" strokeLinecap="round"/>
                          <path d="M109,120 Q82,98 58,80" stroke="#0c1812" strokeWidth="5.8" fill="none" strokeLinecap="round"/>
                          <path d="M109,120 Q136,98 158,80" stroke="#0c1812" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                          <path d="M36,128 Q14,114 0,102" stroke="#0c1812" strokeWidth="4" fill="none" strokeLinecap="round"/>
                          <path d="M182,130 Q202,116 215,104" stroke="#0c1812" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                          <path d="M58,80 Q48,62 45,46" stroke="#0c1812" strokeWidth="3" fill="none" strokeLinecap="round"/>
                          <path d="M158,80 Q168,62 168,46" stroke="#0c1812" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
                          {/* frost on branches — moonlit */}
                          <ellipse cx="30" cy="126" rx="17" ry="3.5" fill="rgba(180,220,240,0.55)" style={{animation:'bxFrost 3.2s ease-in-out infinite'}}/>
                          <ellipse cx="186" cy="128" rx="16" ry="3" fill="rgba(180,220,240,0.5)"/>
                          <ellipse cx="55" cy="78" rx="13" ry="3" fill="rgba(180,220,240,0.48)"/>
                          <ellipse cx="160" cy="78" rx="12" ry="3" fill="rgba(180,220,240,0.48)"/>
                          {/* right bare tree silhouette */}
                          <path d="M800,330 Q796,278 798,230 Q800,200 794,170 Q788,146 795,116" stroke="#0c1812" strokeWidth="15" fill="none" strokeLinecap="round"/>
                          <path d="M794,172 Q754,148 720,128" stroke="#0c1812" strokeWidth="7.5" fill="none" strokeLinecap="round"/>
                          <path d="M794,172 Q836,148 868,128" stroke="#0c1812" strokeWidth="7" fill="none" strokeLinecap="round"/>
                          <path d="M794,118 Q768,96 745,78" stroke="#0c1812" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                          <path d="M794,118 Q822,96 844,78" stroke="#0c1812" strokeWidth="5" fill="none" strokeLinecap="round"/>
                          <path d="M720,128 Q700,114 686,102" stroke="#0c1812" strokeWidth="3.8" fill="none" strokeLinecap="round"/>
                          <path d="M868,128 Q888,114 902,102" stroke="#0c1812" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                          <path d="M745,78 Q735,60 732,44" stroke="#0c1812" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
                          <path d="M844,78 Q856,60 858,44" stroke="#0c1812" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
                          {/* frost on branches right */}
                          <ellipse cx="716" cy="126" rx="16" ry="3.5" fill="rgba(180,220,240,0.55)"/>
                          <ellipse cx="872" cy="126" rx="15" ry="3" fill="rgba(180,220,240,0.5)"/>
                          <ellipse cx="742" cy="76" rx="13" ry="3" fill="rgba(180,220,240,0.48)"/>
                          <ellipse cx="848" cy="76" rx="12" ry="3" fill="rgba(180,220,240,0.48)"/>
                          {/* mid bare shrubs */}
                          {([{x:265,h:40},{x:318,h:34},{x:572,h:38},{x:624,h:32}] as Array<{x:number,h:number}>).map((t,i)=>(
                            <g key={i}>
                              <path d={`M${t.x},248 Q${t.x+2},${248-t.h*.5} ${t.x},${248-t.h}`} stroke="#16201a" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
                              <path d={`M${t.x},${248-t.h*.55} Q${t.x-14},${248-t.h*.72} ${t.x-23},${248-t.h*.85}`} stroke="#16201a" strokeWidth="3" fill="none" strokeLinecap="round"/>
                              <path d={`M${t.x},${248-t.h*.55} Q${t.x+12},${248-t.h*.7} ${t.x+21},${248-t.h*.82}`} stroke="#16201a" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
                            </g>
                          ))}
                          {/* light mist near ground */}
                          <ellipse cx="450" cy="270" rx="400" ry="22" fill="rgba(180,210,225,0.08)" style={{filter:'blur(6px)'}}/>
                        </svg>
                        {/* very light frost-sparkle particles */}
                        {snowData.slice(0,5).map((sn,i)=>(
                          <div key={i} style={{ position:'absolute', top:'-8px', left:sn.l, animation:`bxSnowfall ${parseFloat(sn.dur)+3}s linear infinite`, animationDelay:`${i*.8}s` }}>
                            <svg viewBox="0 0 12 12" width={sn.s*1.8} height={sn.s*1.8} style={{opacity:sn.o*.5}}>
                              <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(200,230,245,0.9)" strokeWidth="0.8"/>
                              <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(200,230,245,0.9)" strokeWidth="0.8"/>
                              <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="rgba(200,230,245,0.9)" strokeWidth="0.8"/>
                              <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="rgba(200,230,245,0.9)" strokeWidth="0.8"/>
                              <circle cx="6" cy="6" r="1" fill="rgba(200,230,245,0.9)"/>
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ══════════════════════════════════════════════ */}
                    {/* ── TIME-OF-DAY OVERLAYS (over every scene) ── */}
                    {/* ══════════════════════════════════════════════ */}

                    {/* DAWN — rose-gold gradient sweeping up */}
                    {isDawn && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:6}}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{position:'absolute',inset:0}}>
                          <defs>
                            <linearGradient id="dawnSky" x1="0" y1="1" x2="0" y2="0">
                              <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.0"/>
                              <stop offset="18%" stopColor="#ff6b35" stopOpacity="0.22"/>
                              <stop offset="40%" stopColor="#ff9a3c" stopOpacity="0.28"/>
                              <stop offset="65%" stopColor="#ffb347" stopOpacity="0.18"/>
                              <stop offset="85%" stopColor="#c471ed" stopOpacity="0.20"/>
                              <stop offset="100%" stopColor="#3a1c71" stopOpacity="0.45"/>
                            </linearGradient>
                            <radialGradient id="dawnSun" cx="50%" cy="100%" r="60%">
                              <stop offset="0%" stopColor="#ffe29f" stopOpacity="0.75"/>
                              <stop offset="35%" stopColor="#ffa751" stopOpacity="0.45"/>
                              <stop offset="70%" stopColor="#ff6b35" stopOpacity="0.20"/>
                              <stop offset="100%" stopColor="#ff6b35" stopOpacity="0"/>
                            </radialGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#dawnSky)" style={{animation:'bxDuskFade 5s ease-in-out infinite'}}/>
                          <ellipse cx="450" cy="330" rx="360" ry="200" fill="url(#dawnSun)"/>
                          {/* horizon glow line */}
                          <path d="M0,310 Q450,295 900,310" stroke="#ffb347" strokeWidth="2.5" fill="none" opacity="0.55"/>
                          {/* horizon mist */}
                          <rect x="0" y="295" width="900" height="35" fill="rgba(255,200,120,0.12)" style={{filter:'blur(6px)'}}/>
                          {/* rays */}
                          {[0,25,50,75,100,125,155,185,215,245].map((a,i)=>(
                            <line key={i} x1={450} y1={330} x2={450+Math.cos((a-90)*Math.PI/180)*650} y2={330+Math.sin((a-90)*Math.PI/180)*650} stroke="rgba(255,200,100,0.06)" strokeWidth={i%3===0?3:1.5} style={{animation:`bxDuskFade ${4+i*.3}s ease-in-out infinite`,animationDelay:`${i*.18}s`}}/>
                          ))}
                          {/* a few lingering dim stars */}
                          {[{x:120,y:25},{x:280,y:18},{x:450,y:12},{x:620,y:22},{x:780,y:16}].map((s,i)=>(
                            <circle key={i} cx={s.x} cy={s.y} r={1.4} fill="white" opacity={0.35} style={{animation:`bxTwinkle ${3+i*.4}s ease-in-out infinite`}}/>
                          ))}
                        </svg>
                      </div>
                    )}

                    {/* DUSK — deep amber-violet gradient */}
                    {isDusk && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:6}}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{position:'absolute',inset:0}}>
                          <defs>
                            <linearGradient id="duskSky" x1="0" y1="1" x2="0" y2="0">
                              <stop offset="0%" stopColor="#1a0533" stopOpacity="0.0"/>
                              <stop offset="20%" stopColor="#e8400a" stopOpacity="0.35"/>
                              <stop offset="45%" stopColor="#f4720a" stopOpacity="0.42"/>
                              <stop offset="68%" stopColor="#c4356b" stopOpacity="0.30"/>
                              <stop offset="88%" stopColor="#6a11cb" stopOpacity="0.42"/>
                              <stop offset="100%" stopColor="#1a0533" stopOpacity="0.60"/>
                            </linearGradient>
                            <radialGradient id="duskSun" cx="75%" cy="100%" r="55%">
                              <stop offset="0%" stopColor="#ffe29f" stopOpacity="0.65"/>
                              <stop offset="28%" stopColor="#f4720a" stopOpacity="0.40"/>
                              <stop offset="65%" stopColor="#e8400a" stopOpacity="0.18"/>
                              <stop offset="100%" stopColor="#1a0533" stopOpacity="0"/>
                            </radialGradient>
                          </defs>
                          <rect width="900" height="330" fill="url(#duskSky)" style={{animation:'bxDuskFade 6s ease-in-out infinite'}}/>
                          <ellipse cx="675" cy="330" rx="340" ry="185" fill="url(#duskSun)"/>
                          {/* silhouette power-lines / birds */}
                          <path d="M0,280 Q225,268 450,278 Q675,288 900,275" stroke="rgba(0,0,0,0.55)" strokeWidth="1.5" fill="none"/>
                          {/* horizon glow */}
                          <path d="M0,318 Q450,305 900,318" stroke="#f4720a" strokeWidth="2" fill="none" opacity="0.6"/>
                          <rect x="0" y="305" width="900" height="25" fill="rgba(244,114,10,0.10)" style={{filter:'blur(5px)'}}/>
                          {/* first stars appearing */}
                          {[{x:80,y:30},{x:200,y:18},{x:330,y:28},{x:480,y:15},{x:600,y:24},{x:720,y:20},{x:840,y:35}].map((s,i)=>(
                            <circle key={i} cx={s.x} cy={s.y} r={1.6} fill="white" opacity={0.55+(i%3)*0.12} style={{animation:`bxTwinkle ${2.5+i*.35}s ease-in-out infinite`,animationDelay:`${i*.2}s`}}/>
                          ))}
                        </svg>
                      </div>
                    )}

                    {/* ══════════════════════════════════════════════ */}
                    {/* ── WEATHER CONDITION OVERLAYS ── */}
                    {/* ══════════════════════════════════════════════ */}

                    {/* FOG */}
                    {(weatherCondition === 'fog' || weatherCondition === 'mist') && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:8}}>
                        {[
                          {top:'15%',height:'60px',delay:'0s',dur:'18s',opacity:0.72},
                          {top:'35%',height:'50px',delay:'4s',dur:'22s',opacity:0.65},
                          {top:'52%',height:'55px',delay:'8s',dur:'16s',opacity:0.78},
                          {top:'68%',height:'45px',delay:'2s',dur:'20s',opacity:0.70},
                          {top:'80%',height:'60px',delay:'6s',dur:'14s',opacity:0.82},
                        ].map((f,i)=>(
                          <div key={i} style={{position:'absolute',left:'-10%',right:'-10%',top:f.top,height:f.height,background:'rgba(200,215,225,'+f.opacity+')',filter:'blur(18px)',animation:`bxFogDrift ${f.dur} ease-in-out infinite alternate`,animationDelay:f.delay}}/>
                        ))}
                        <div style={{position:'absolute',inset:0,background:'rgba(180,200,215,0.22)'}}/>
                      </div>
                    )}

                    {/* HAZE */}
                    {weatherCondition === 'haze' && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:8}}>
                        <div style={{position:'absolute',inset:0,background:'rgba(210,185,120,0.32)',animation:'bxHaze 6s ease-in-out infinite'}}/>
                        <div style={{position:'absolute',inset:0,background:'linear-gradient(0deg,rgba(220,180,80,0.28) 0%,rgba(200,160,60,0.08) 60%,transparent 100%)'}}/>
                        {[0,1,2,3].map(i=>(
                          <div key={i} style={{position:'absolute',left:'-10%',right:'-10%',top:`${20+i*20}%`,height:'40px',background:'rgba(215,185,100,0.18)',filter:'blur(14px)',animation:`bxFogDrift ${14+i*4}s ease-in-out infinite alternate`,animationDelay:`${i*3}s`}}/>
                        ))}
                      </div>
                    )}

                    {/* PARTLY CLOUDY */}
                    {weatherCondition === 'partly-cloudy' && !isNight && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:7}}>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{position:'absolute',inset:0}}>
                          <g opacity="0.72" style={{animation:'bxCloudDrift 20s ease-in-out infinite alternate'}}>
                            <ellipse cx="200" cy="55" rx="80" ry="28" fill="white"/>
                            <ellipse cx="160" cy="68" rx="52" ry="22" fill="white"/>
                            <ellipse cx="245" cy="68" rx="60" ry="20" fill="white"/>
                            <ellipse cx="200" cy="78" rx="88" ry="16" fill="white" opacity="0.75"/>
                          </g>
                          <g opacity="0.60" style={{animation:'bxCloudDrift 28s ease-in-out infinite alternate-reverse'}}>
                            <ellipse cx="680" cy="42" rx="68" ry="24" fill="white"/>
                            <ellipse cx="648" cy="54" rx="44" ry="19" fill="white"/>
                            <ellipse cx="715" cy="54" rx="50" ry="18" fill="white"/>
                          </g>
                        </svg>
                      </div>
                    )}

                    {/* CLOUDY */}
                    {weatherCondition === 'cloudy' && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:8}}>
                        <div style={{position:'absolute',inset:0,background:'rgba(80,90,100,0.38)'}}/>
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{position:'absolute',inset:0}}>
                          {[
                            {cx:120,cy:52,rx:130,ry:44},{cx:90,cy:70,rx:90,ry:34},{cx:160,cy:70,rx:105,ry:32},
                            {cx:400,cy:38,rx:150,ry:48},{cx:340,cy:58,rx:100,ry:36},{cx:465,cy:58,rx:116,ry:34},
                            {cx:700,cy:48,rx:140,ry:44},{cx:660,cy:65,rx:95,ry:34},{cx:745,cy:65,rx:108,ry:32},
                          ].map((c,i)=>(
                            <ellipse key={i} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={i%3===0?'#8a9aaa':'#9aabb8'} opacity={0.88}/>
                          ))}
                        </svg>
                      </div>
                    )}

                    {/* DRIZZLE */}
                    {weatherCondition === 'drizzle' && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:9}}>
                        <div style={{position:'absolute',inset:0,background:'rgba(60,80,105,0.22)'}}/>
                        {rainData.slice(0,14).map((r,i)=>(
                          <div key={i} style={{position:'absolute',top:'-8px',left:r.l,width:`${r.w*0.7}px`,height:'14px',background:`rgba(160,200,230,${r.o*0.6})`,borderRadius:'1px',animation:`bxRain ${parseFloat(r.dur)*1.6}s linear infinite`,animationDelay:r.delay,transform:'rotate(5deg)'}}/>
                        ))}
                      </div>
                    )}

                    {/* RAIN */}
                    {weatherCondition === 'rain' && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:9}}>
                        <div style={{position:'absolute',inset:0,background:'rgba(40,60,90,0.32)'}}/>
                        {rainData.map((r,i)=>(
                          <div key={i} style={{position:'absolute',top:'-10px',left:r.l,width:`${r.w}px`,height:'20px',background:`rgba(140,190,225,${r.o})`,borderRadius:'1px',animation:`bxRain ${r.dur} linear infinite`,animationDelay:r.delay,transform:'rotate(8deg)'}}/>
                        ))}
                      </div>
                    )}

                    {/* HEAVY RAIN */}
                    {weatherCondition === 'heavy-rain' && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:9}}>
                        <div style={{position:'absolute',inset:0,background:'rgba(20,35,60,0.48)'}}/>
                        {rainData.map((r,i)=>(
                          <div key={i} style={{position:'absolute',top:'-10px',left:r.l,width:`${r.w*1.4}px`,height:'26px',background:`rgba(120,175,215,${r.o*1.1})`,borderRadius:'1px',animation:`bxRain ${parseFloat(r.dur)*0.75}s linear infinite`,animationDelay:r.delay,transform:'rotate(12deg)'}}/>
                        ))}
                        {/* splash puddles at bottom */}
                        {[10,18,28,38,48,58,68,78,88,96].map((pct,i)=>(
                          <div key={i} style={{position:'absolute',bottom:'4px',left:`${pct}%`,width:'24px',height:'8px',borderRadius:'50%',border:'1.5px solid rgba(140,200,240,0.35)',animation:`bxFloat ${0.8+i*.12}s ease-in-out infinite`,animationDelay:`${i*.15}s`}}/>
                        ))}
                      </div>
                    )}

                    {/* THUNDERSTORM */}
                    {weatherCondition === 'thunderstorm' && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:9}}>
                        <div style={{position:'absolute',inset:0,background:'rgba(10,15,30,0.58)'}}/>
                        {/* heavy rain */}
                        {rainData.map((r,i)=>(
                          <div key={i} style={{position:'absolute',top:'-10px',left:r.l,width:`${r.w*1.5}px`,height:'28px',background:`rgba(110,165,210,${r.o})`,borderRadius:'1px',animation:`bxRain ${parseFloat(r.dur)*0.7}s linear infinite`,animationDelay:r.delay,transform:'rotate(14deg)'}}/>
                        ))}
                        {/* lightning bolts */}
                        <svg viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{position:'absolute',inset:0}}>
                          <path d="M310,0 L288,80 L302,80 L278,160" stroke="rgba(255,248,180,0.95)" strokeWidth="3.5" fill="none" strokeLinecap="round" style={{animation:'bxLightning 4s ease-in-out infinite',animationDelay:'0.5s'}}/>
                          <path d="M590,0 L568,68 L582,68 L558,130" stroke="rgba(255,248,180,0.85)" strokeWidth="3" fill="none" strokeLinecap="round" style={{animation:'bxLightning 6.5s ease-in-out infinite',animationDelay:'2.2s'}}/>
                          <path d="M800,0 L782,72 L796,72 L774,138" stroke="rgba(255,248,180,0.80)" strokeWidth="2.5" fill="none" strokeLinecap="round" style={{animation:'bxLightning 8s ease-in-out infinite',animationDelay:'3.8s'}}/>
                          {/* flash illumination */}
                          <rect width="900" height="330" fill="rgba(255,248,200,0.04)" style={{animation:'bxLightning 4s ease-in-out infinite',animationDelay:'0.5s'}}/>
                        </svg>
                      </div>
                    )}

                    {/* SNOW OVERLAY */}
                    {weatherCondition === 'snow' && (
                      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:9}}>
                        <div style={{position:'absolute',inset:0,background:'rgba(220,235,245,0.22)'}}/>
                        {snowData.map((sn,i)=>(
                          <div key={i} style={{position:'absolute',top:'-12px',left:sn.l,animation:`bxSnowfall ${sn.dur} linear infinite`,animationDelay:`${i*.4}s`}}>
                            <svg viewBox="0 0 20 20" width={sn.s*3} height={sn.s*3} style={{opacity:sn.o}}>
                              {[0,30,60,90,120,150].map((a,j)=>(
                                <line key={j} x1={10+Math.cos(a*Math.PI/180)*1.5} y1={10+Math.sin(a*Math.PI/180)*1.5} x2={10+Math.cos(a*Math.PI/180)*8.5} y2={10+Math.sin(a*Math.PI/180)*8.5} stroke="white" strokeWidth="1.1"/>
                              ))}
                              {[0,30,60,90,120,150].map((a,j)=>(
                                <line key={j+6} x1={10+Math.cos((a+180)*Math.PI/180)*1.5} y1={10+Math.sin((a+180)*Math.PI/180)*1.5} x2={10+Math.cos((a+180)*Math.PI/180)*8.5} y2={10+Math.sin((a+180)*Math.PI/180)*8.5} stroke="white" strokeWidth="1.1"/>
                              ))}
                              <circle cx="10" cy="10" r="1.8" fill="white"/>
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* CLEAR NIGHT — shooting star */}
                    {isNight && weatherCondition === 'clear' && (
                      <div style={{position:'absolute',top:'8%',left:'20%',width:'3px',height:'3px',background:'white',borderRadius:'50%',boxShadow:'0 0 6px 2px rgba(255,255,255,0.6)',pointerEvents:'none',zIndex:7,animation:'bxShootingStar 12s ease-in-out infinite',animationDelay:'4s'}}/>
                    )}

                  </div>
                </>
              );
            })()}

            <div className={`pt-6 border-t flex items-center gap-4 ${ nightCard ? 'border-slate-800' : 'border-slate-50' }`}>
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map(i => <div key={i} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[8px] font-bold ${ nightCard ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-white text-slate-400' }`}>OM</div>)}
              </div>
              <p className={`text-[9px] font-bold uppercase tracking-widest ${ nightCard ? 'text-slate-600' : 'text-slate-400' }`}>
                Streams Ingested: Open-Meteo Forecast &bull; Air Quality &bull; UV Index &bull; Atmospheric Modeling
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* AQI Indicator - Enhanced with health explanations */}
          <div className={`p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border ${aqiInfo.border} ${aqiInfo.bg} shadow-lg shadow-slate-100 flex flex-col gap-5 sm:gap-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl bg-white shadow-sm ${aqiInfo.text}`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Air Quality (AQI)</h3>
              </div>
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase text-white ${aqiInfo.color} shadow-lg shadow-current/20`}>
                {aqiInfo.label}
              </div>
            </div>
            <div>
              <div className="flex items-end justify-between mb-2">
                <span className="text-3xl sm:text-4xl font-black text-slate-900">{data.rawAqi ?? data.aqi}<span className="text-sm text-slate-400 ml-1">US AQI</span></span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
                <div 
                  className={`h-full ${aqiInfo.color} transition-all duration-1000 rounded-full shadow-lg shadow-current/20`} 
                  style={{ width: `${Math.min(((data.rawAqi ?? data.aqi * 50) / 500) * 100, 100)}%` }} 
                />
              </div>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Health Impact</div>
                <p className="text-sm font-black text-slate-700 leading-relaxed">{aqiInfo.healthImpact}</p>
              </div>
              <div className="space-y-2 p-4 bg-white/40 rounded-2xl border border-white/20">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Precaution Protocol</div>
                <p className={`text-sm font-black leading-relaxed ${aqiInfo.text}`}>{aqiInfo.precautions}</p>
              </div>
            </div>
          </div>

          {/* UV Monitor */}
          <div className={`p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border shadow-lg flex flex-col justify-between ${
            nightCard ? 'bg-slate-800 border-slate-700 shadow-slate-900' : 'bg-white border-slate-100 shadow-slate-100'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl shadow-sm ${ nightCard ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-50 text-amber-500' }`}>
                  {nightCard ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </div>
                <h3 className={`text-xs font-black uppercase tracking-widest ${ nightCard ? 'text-slate-300' : 'text-slate-900' }`}>UV Monitor</h3>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${!isDay ? 'bg-slate-600' : uvInfo.color} shadow-lg shadow-current/20`}>
                {!isDay ? 'Night' : uvInfo.label}
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6 mb-4">
              <div className={`text-6xl sm:text-8xl font-black tracking-tighter ${ nightCard ? 'text-white' : 'text-slate-900' }`}>
                {data.uvIndex ?? 0}
              </div>
              <div className="flex-1 space-y-3">
                <div className={`text-[11px] font-black uppercase tracking-[0.3em] ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>
                  {!isDay ? 'Current UV (Night)' : 'UV Index (Now)'}
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
                  <div className={`h-full ${!isDay ? 'bg-slate-500' : uvInfo.color} transition-all duration-1000 rounded-full`} style={{ width: !isDay ? '0%' : `${Math.min((data.uvIndex || 0) / 11 * 100, 100)}%` }} />
                </div>
                {!isDay && peakUV !== null && peakUV !== undefined && (
                  <div className="text-[10px] font-black text-slate-500">
                    Today's peak: <span className="text-amber-400">{peakUV}</span>
                    <span className="ml-1 text-slate-600">({getUVInfo(peakUV).label})</span>
                  </div>
                )}
                {isDay && peakUV !== null && peakUV !== undefined && peakUV > (data.uvIndex ?? 0) && (
                  <div className="text-[10px] font-black text-slate-500">
                    Daily peak: <span className="text-amber-400">{peakUV}</span>
                    {data.advancedData?.uvIndexClearSky !== undefined && (
                      <span className="ml-2">Clear sky max: <span className="text-teal-400">{data.advancedData.uvIndexClearSky}</span></span>
                    )}
                  </div>
                )}
                {effectiveUV !== null && (
                  <div className="text-[10px] font-black text-slate-500">
                    Cloud-adj effective: <span className="text-teal-500">{effectiveUV}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Sun Arc & Sunrise/Sunset — always shown, even on cloudy days */}
            <div className={`p-4 rounded-2xl border mb-3 ${
              nightCard ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-100'
            }`}>
              {data.clouds > 60 && (
                <div className={`flex items-center gap-1.5 mb-2 text-[9px] font-black uppercase tracking-widest ${
                  nightCard ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  <Cloud className="w-3 h-3" />
                  <span>Overcast — solar arc timing still valid</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex flex-col items-center gap-0.5">
                  <Sunrise className="w-4 h-4 text-amber-500" />
                  <span className={`text-[8px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>Sunrise</span>
                  <span className={`text-xs font-black ${ nightCard ? 'text-amber-400' : 'text-amber-600' }`}>{fmtTime(data.sunrise)}</span>
                </div>
                <div className="flex-1 mx-3">
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        sunArc?.status === 'during' ? 'bg-gradient-to-r from-amber-400 to-orange-400'
                        : sunArc?.status === 'after' ? 'bg-gradient-to-r from-violet-400 to-purple-400'
                        : 'bg-slate-300'
                      }`}
                      style={{ width: `${sunArc?.pct ?? 0}%` }}
                    />
                  </div>
                  <div className="text-center mt-1">
                    {sunArc?.status === 'during' && (
                      <span className={`text-[8px] font-black uppercase tracking-widest ${ nightCard ? 'text-amber-500' : 'text-amber-600' }`}>
                        {sunArc.pct}% through daylight
                      </span>
                    )}
                    {sunArc?.status === 'before' && (
                      <span className={`text-[8px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-600' : 'text-slate-400' }`}>Pre-sunrise</span>
                    )}
                    {sunArc?.status === 'after' && (
                      <span className={`text-[8px] font-black uppercase tracking-widest ${ nightCard ? 'text-violet-500' : 'text-violet-500' }`}>Post-sunset</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Sunset className="w-4 h-4 text-violet-500" />
                  <span className={`text-[8px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>Sunset</span>
                  <span className={`text-xs font-black ${ nightCard ? 'text-violet-400' : 'text-violet-600' }`}>{fmtTime(data.sunset)}</span>
                </div>
              </div>
            </div>
            {/* Daylight / Sunshine */}
            {(daylightHrs || sunshineHrs) && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                {daylightHrs && (
                  <div className={`p-3 rounded-xl border text-center ${ nightCard ? 'bg-slate-900/60 border-slate-700' : 'bg-amber-50 border-amber-100' }`}>
                    <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-amber-600' }`}>Daylight</div>
                    <div className={`text-lg font-black ${ nightCard ? 'text-white' : 'text-slate-900' }`}>{daylightHrs}h</div>
                  </div>
                )}
                {sunshineHrs && (
                  <div className={`p-3 rounded-xl border text-center ${ nightCard ? 'bg-slate-900/60 border-slate-700' : 'bg-yellow-50 border-yellow-100' }`}>
                    <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-yellow-600' }`}>Sunshine</div>
                    <div className={`text-lg font-black ${ nightCard ? 'text-white' : 'text-slate-900' }`}>{sunshineHrs}h</div>
                  </div>
                )}
              </div>
            )}
            {/* Cloud cover health note */}
            <div className={`flex items-center gap-2 p-3 rounded-2xl border ${ nightCard ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-100' }`}>
              <Cloud className="w-4 h-4 text-slate-400 shrink-0" />
              <p className="text-[10px] font-bold text-slate-500">
                {!isDay ? (
                  <>
                    <span className="font-black text-slate-300">No UV radiation at night.</span>
                    {' '}UV resumes at sunrise. Cloud cover: <span className="font-black text-slate-300">{data.clouds}%</span>
                  </>
                ) : (
                  <>
                    Cloud cover: <span className="font-black text-slate-700">{data.clouds}%</span>
                    {data.clouds > 60
                      ? ' — Heavy cloud reduces UV but raises humidity & mold risk.'
                      : data.clouds > 20
                      ? ' — Partial cloud: UV still penetrates, use SPF protection.'
                      : ' — Clear sky: maximum UV exposure. Apply SPF 30+ outdoors.'}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* New Hourly Health Panels: Wet Bulb Temp, Water Vapour, Atmospheric Stability */}
      {data.advancedData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">

          {/* Wet Bulb Temperature */}
          {data.advancedData.wetBulbTemperature !== undefined && (
            <div className={`p-5 sm:p-7 rounded-[2rem] border shadow-lg flex flex-col gap-4 ${
              nightCard ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${ nightCard ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-600' }`}>
                    <Thermometer className="w-5 h-5" />
                  </div>
                  <h3 className={`text-xs font-black uppercase tracking-widest ${ nightCard ? 'text-slate-300' : 'text-slate-900' }`}>Wet Bulb Temp</h3>
                </div>
                {(() => {
                  const wb = data.advancedData.wetBulbTemperature!;
                  const label = wb >= 35 ? 'FATAL' : wb >= 32 ? 'Critical' : wb >= 28 ? 'Dangerous' : wb >= 24 ? 'High Stress' : wb >= 18 ? 'Caution' : 'Safe';
                  const cls = wb >= 35 ? 'bg-purple-600' : wb >= 32 ? 'bg-rose-600' : wb >= 28 ? 'bg-orange-500' : wb >= 24 ? 'bg-amber-500' : wb >= 18 ? 'bg-yellow-400' : 'bg-emerald-500';
                  return <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase text-white ${cls}`}>{label}</span>;
                })()}
              </div>
              <div className="flex items-end gap-3">
                <span className={`text-5xl font-black tracking-tighter ${ nightCard ? 'text-white' : 'text-slate-900' }`}>{data.advancedData.wetBulbTemperature?.toFixed(1)}</span>
                <span className={`text-sm font-black mb-1 ${ nightCard ? 'text-slate-400' : 'text-slate-400' }`}>°C</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500"
                  style={{ width: `${Math.min(((data.advancedData.wetBulbTemperature ?? 0) / 35) * 100, 100)}%` }} />
              </div>
              <p className={`text-[10px] font-bold leading-relaxed ${ nightCard ? 'text-slate-400' : 'text-slate-500' }`}>
                {(data.advancedData.wetBulbTemperature ?? 0) >= 35
                  ? 'Unsurvivable without cooling. Fatal within hours for any physiology.'
                  : (data.advancedData.wetBulbTemperature ?? 0) >= 32
                  ? 'Critical heat stress. High mortality risk — stay in air conditioning.'
                  : (data.advancedData.wetBulbTemperature ?? 0) >= 28
                  ? 'Dangerous. Limit all outdoor activity. Hydrate aggressively.'
                  : (data.advancedData.wetBulbTemperature ?? 0) >= 24
                  ? 'High heat stress. Vulnerable groups (elderly, infants) at serious risk.'
                  : (data.advancedData.wetBulbTemperature ?? 0) >= 18
                  ? 'Moderate stress. Increase fluid intake during outdoor activity.'
                  : 'Comfortable heat-humidity balance. No significant stress.'}
              </p>
              <p className={`text-[9px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-600' : 'text-slate-300' }`}>WBT combines temp + humidity — best heat-stress indicator</p>
            </div>
          )}

          {/* Total Column Water Vapour */}
          {data.advancedData.totalColumnWaterVapour !== undefined && (
            <div className={`p-5 sm:p-7 rounded-[2rem] border shadow-lg flex flex-col gap-4 ${
              nightCard ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${ nightCard ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600' }`}>
                    <Droplets className="w-5 h-5" />
                  </div>
                  <h3 className={`text-xs font-black uppercase tracking-widest ${ nightCard ? 'text-slate-300' : 'text-slate-900' }`}>Atmospheric Moisture</h3>
                </div>
                {(() => {
                  const wv = data.advancedData.totalColumnWaterVapour!;
                  const label = wv > 55 ? 'Very High' : wv > 40 ? 'High' : wv > 25 ? 'Moderate' : wv > 10 ? 'Low' : 'Arid';
                  const cls = wv > 55 ? 'bg-blue-600' : wv > 40 ? 'bg-sky-500' : wv > 25 ? 'bg-teal-500' : 'bg-slate-500';
                  return <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase text-white ${cls}`}>{label}</span>;
                })()}
              </div>
              <div className="flex items-end gap-3">
                <span className={`text-5xl font-black tracking-tighter ${ nightCard ? 'text-white' : 'text-slate-900' }`}>{data.advancedData.totalColumnWaterVapour?.toFixed(0)}</span>
                <span className={`text-sm font-black mb-1 ${ nightCard ? 'text-slate-400' : 'text-slate-400' }`}>kg/m²</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-sky-300 to-blue-600"
                  style={{ width: `${Math.min(((data.advancedData.totalColumnWaterVapour ?? 0) / 70) * 100, 100)}%` }} />
              </div>
              <p className={`text-[10px] font-bold leading-relaxed ${ nightCard ? 'text-slate-400' : 'text-slate-500' }`}>
                {(data.advancedData.totalColumnWaterVapour ?? 0) > 55
                  ? 'Very moist atmosphere. Elevated mold, allergen, and pathogen dispersal risk.'
                  : (data.advancedData.totalColumnWaterVapour ?? 0) > 40
                  ? 'High atmospheric moisture. Pollen and spore transport enhanced.'
                  : (data.advancedData.totalColumnWaterVapour ?? 0) > 25
                  ? 'Moderate moisture. Standard respiratory precautions apply.'
                  : (data.advancedData.totalColumnWaterVapour ?? 0) > 10
                  ? 'Low atmospheric moisture. Dry air may irritate mucous membranes.'
                  : 'Very arid. High risk of dehydration, nosebleeds, and dry-eye symptoms.'}
              </p>
              <p className={`text-[9px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-600' : 'text-slate-300' }`}>Water vapour column — pathogen &amp; allergen transport proxy</p>
            </div>
          )}

          {/* Atmospheric Stability: Lifted Index + CAPE + CIN */}
          {(data.advancedData.liftedIndex !== undefined || data.advancedData.cape !== undefined) && (
            <div className={`p-5 sm:p-7 rounded-[2rem] border shadow-lg flex flex-col gap-4 ${
              nightCard ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${ nightCard ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-50 text-amber-600' }`}>
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className={`text-xs font-black uppercase tracking-widest ${ nightCard ? 'text-slate-300' : 'text-slate-900' }`}>Storm &amp; Health Stability</h3>
              </div>
              <div className={`grid grid-cols-3 gap-3 p-3 rounded-2xl ${ nightCard ? 'bg-slate-900/60' : 'bg-slate-50' }`}>
                <div className="text-center">
                  <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>Lifted Idx</p>
                  <p className={`text-xl font-black ${
                    (data.advancedData.liftedIndex ?? 0) < -6 ? 'text-rose-500' :
                    (data.advancedData.liftedIndex ?? 0) < -3 ? 'text-orange-500' :
                    (data.advancedData.liftedIndex ?? 0) < 0 ? 'text-amber-500' : 'text-emerald-500'
                  } ${ nightCard ? '' : '' }`}>{data.advancedData.liftedIndex?.toFixed(1) ?? 'N/A'}</p>
                  <p className={`text-[8px] font-bold ${ nightCard ? 'text-slate-600' : 'text-slate-400' }`}>
                    {(data.advancedData.liftedIndex ?? 0) < -6 ? 'Extreme' : (data.advancedData.liftedIndex ?? 0) < -3 ? 'Severe' : (data.advancedData.liftedIndex ?? 0) < 0 ? 'Unstable' : 'Stable'}
                  </p>
                </div>
                <div className="text-center">
                  <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>CAPE</p>
                  <p className={`text-xl font-black ${
                    (data.advancedData.cape ?? 0) > 2500 ? 'text-rose-500' :
                    (data.advancedData.cape ?? 0) > 1000 ? 'text-orange-500' :
                    (data.advancedData.cape ?? 0) > 300 ? 'text-amber-500' : 'text-emerald-500'
                  }`}>{((data.advancedData.cape ?? 0) > 999 ? ((data.advancedData.cape ?? 0)/1000).toFixed(1)+'k' : (data.advancedData.cape ?? 0).toFixed(0))}</p>
                  <p className={`text-[8px] font-bold ${ nightCard ? 'text-slate-600' : 'text-slate-400' }`}>J/kg</p>
                </div>
                <div className="text-center">
                  <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>CIN</p>
                  <p className={`text-xl font-black ${ nightCard ? 'text-slate-200' : 'text-slate-700' }`}>{data.advancedData.convectiveInhibition?.toFixed(0) ?? 'N/A'}</p>
                  <p className={`text-[8px] font-bold ${ nightCard ? 'text-slate-600' : 'text-slate-400' }`}>J/kg</p>
                </div>
              </div>
              <p className={`text-[10px] font-bold leading-relaxed ${ nightCard ? 'text-slate-400' : 'text-slate-500' }`}>
                {(data.advancedData.liftedIndex ?? 0) < -6
                  ? 'Extreme atmospheric instability. Severe thunderstorm, lightning, and trauma risk.'
                  : (data.advancedData.liftedIndex ?? 0) < -3
                  ? 'Severe instability. High thunderstorm risk. Outdoor activities dangerous.'
                  : (data.advancedData.liftedIndex ?? 0) < 0
                  ? 'Unstable air mass. Thunderstorm development possible. Monitor alerts.'
                  : 'Stable atmosphere. Low storm risk. Conducive to maintained air quality.'}
              </p>
              <p className={`text-[9px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-600' : 'text-slate-300' }`}>LI &lt; –6 = extreme storm / trauma / PTSD-trigger risk</p>
            </div>
          )}
        </div>
      )}

      {/* Charts & Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {data.advancedData && (
          <div className="lg:col-span-3 bg-slate-900 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
              <Cpu className="w-48 h-48 text-teal-400" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-teal-500/10 rounded-2xl border border-teal-500/20">
                  <Cpu className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tighter uppercase">Precision Atmospheric Modeling</h3>
                  <p className="text-[9px] font-black text-teal-500/60 uppercase tracking-[0.3em]">Real-Time Weather Data (Open-Meteo)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-6">
                {[
                  { label: 'Boundary Layer', value: data.advancedData.boundaryLayerHeight != null ? `${data.advancedData.boundaryLayerHeight}m` : 'N/A', sub: 'PBL Height' },
                  { label: 'CAPE Index', value: data.advancedData.cape != null ? `${data.advancedData.cape} J/kg` : 'N/A', sub: 'Convective Energy' },
                  { label: 'VPD', value: data.advancedData.vapourPressureDeficit != null ? `${data.advancedData.vapourPressureDeficit} kPa` : 'N/A', sub: 'Vapour Deficit' },
                  { label: 'Lifted Index', value: data.advancedData.liftedIndex != null ? data.advancedData.liftedIndex.toFixed(1) : 'N/A', sub: 'Atmospheric Stability' },
                  { label: 'CIN', value: data.advancedData.convectiveInhibition != null ? `${data.advancedData.convectiveInhibition.toFixed(0)} J/kg` : 'N/A', sub: 'Conv. Inhibition' },
                  { label: 'Wet Bulb', value: data.advancedData.wetBulbTemperature != null ? `${data.advancedData.wetBulbTemperature.toFixed(1)}°C` : 'N/A', sub: 'Heat Stress Index' },
                  { label: 'Water Vapour', value: data.advancedData.totalColumnWaterVapour != null ? `${data.advancedData.totalColumnWaterVapour.toFixed(0)} kg/m²` : 'N/A', sub: 'Column Integrated' },
                  { label: 'UV Clear Sky', value: data.advancedData.uvIndexClearSky != null ? data.advancedData.uvIndexClearSky.toFixed(1) : 'N/A', sub: 'Max Possible UV' },
                  { label: 'Wind Gusts', value: data.advancedData.windGusts != null ? `${data.advancedData.windGusts} km/h` : 'N/A', sub: 'Peak Shear' },
                  { label: 'Soil Temp', value: data.advancedData.soilTemperature != null ? `${data.advancedData.soilTemperature}°C` : 'N/A', sub: '0cm Surface' },
                  { label: 'Soil Moisture', value: data.advancedData.soilMoisture != null ? `${(data.advancedData.soilMoisture).toFixed(2)} m³/m³` : 'N/A', sub: 'Volumetric' },
                  { label: 'Freezing Level', value: data.advancedData.freezingLevelHeight != null ? `${data.advancedData.freezingLevelHeight}m` : 'N/A', sub: '0°C Altitude' },
                  { label: 'Surface Pressure', value: data.advancedData.surfacePressure != null ? `${data.advancedData.surfacePressure} hPa` : 'N/A', sub: 'Ground Level' }
                ].map((item, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                    <p className="text-xl font-black text-white tracking-tight">{item.value ?? 'N/A'}</p>
                    <p className="text-[8px] font-bold text-teal-400 uppercase">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {data.advancedData && (
          <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 sm:p-10 shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden group hover:shadow-lg transition-all">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/40 rounded-2xl border border-emerald-100 dark:border-emerald-800/50">
                <Waves className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Bio-Aerosol Intelligence</h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Real-Time Air Quality</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8">
              {[
                { label: 'PM2.5', value: `${data.advancedData.pm2_5} µg/m³`, color: 'text-rose-600' },
                { label: 'PM10', value: `${data.advancedData.pm10} µg/m³`, color: 'text-rose-600' },
                { label: 'CO', value: `${data.advancedData.co} µg/m³`, color: 'text-amber-600' },
                { label: 'NO2', value: `${data.advancedData.no2} µg/m³`, color: 'text-amber-600' },
                { label: 'O3', value: `${data.advancedData.o3} µg/m³`, color: 'text-amber-600' },
                { label: 'CO2', value: `${data.advancedData.co2} ppm`, color: 'text-rose-700' },
                { label: 'AOD', value: data.advancedData.aod, color: 'text-indigo-600' },
                { label: 'Dust', value: `${data.advancedData.dust} µg/m³`, color: 'text-slate-600' }
              ].map((item, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                  <p className={`text-lg font-black tracking-tight ${item.color}`}>{item.value ?? '0'}</p>
                  <p className="text-[7px] font-bold text-slate-300 uppercase">
                    {item.label === 'CO2' ? 'parts per million' : item.label === 'AOD' ? 'optical depth' : 'µg/m³'}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <Info className="w-3 h-3" />
              <span>Air quality data is sourced from local sensors and satellite measurements.</span>
            </div>
          </div>
        )}

        {/* Solar & Atmospheric Health Matrix */}
        {data.advancedData && (
          <div className={`lg:col-span-3 rounded-[2.5rem] border shadow-lg overflow-hidden ${
            nightCard ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100'
          }`}>
            <div className="p-8 sm:p-10">
              <div className="flex items-center gap-4 mb-8">
                <div className={`p-3 rounded-2xl border ${
                  nightCard ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-100'
                }`}>
                  <Sun className={`w-6 h-6 ${ nightCard ? 'text-amber-400' : 'text-amber-500' }`} />
                </div>
                <div>
                  <h3 className={`text-xl font-black tracking-tighter uppercase ${ nightCard ? 'text-white' : 'text-slate-900' }`}>Solar & Atmospheric Health</h3>
                  <p className={`text-[9px] font-black uppercase tracking-[0.3em] ${ nightCard ? 'text-amber-500/50' : 'text-amber-400' }`}>Light Exposure · Heat Stress · Cloud Layer Impact · Wind Safety</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

                {/* 1. Shortwave Radiation */}
                {(() => {
                  const sol = getSolarInfo(data.advancedData?.shortwaveRadiation);
                  return (
                    <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${
                      nightCard ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CloudSun className={`w-5 h-5 ${ nightCard ? 'text-amber-400' : 'text-amber-500' }`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-400' : 'text-slate-500' }`}>Solar Irradiance</span>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black text-white ${sol.color}`}>{sol.label}</span>
                      </div>
                      <div className={`text-4xl font-black tracking-tighter ${ nightCard ? 'text-white' : 'text-slate-900' }`}>
                        {data.advancedData?.shortwaveRadiation != null ? Math.round(data.advancedData.shortwaveRadiation) : 'N/A'}
                        <span className={`text-base ml-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>W/m²</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full ${sol.color} transition-all duration-1000 rounded-full`} style={{ width: `${sol.pct}%` }} />
                      </div>
                      <p className={`text-[11px] font-bold leading-relaxed ${ nightCard ? 'text-slate-400' : 'text-slate-600' }`}>{sol.health}</p>
                      {data.advancedData?.shortwaveRadiationSum != null && (
                        <div className={`text-[9px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-600' : 'text-slate-400' }`}>
                          Daily Total: <span className={`${ nightCard ? 'text-amber-400' : 'text-amber-600' }`}>{data.advancedData.shortwaveRadiationSum.toFixed(1)} MJ/m²</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Cloud Layer Breakdown */}
                <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${
                  nightCard ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'
                }`}>
                  <div className="flex items-center gap-2">
                    <Cloud className={`w-5 h-5 ${ nightCard ? 'text-sky-400' : 'text-sky-500' }`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-400' : 'text-slate-500' }`}>Cloud Layer Analysis</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Low (0–3 km)', sub: 'Fog / Stratus — humidity & gloom', value: data.advancedData?.cloudCoverLow, col: 'bg-slate-400' },
                      { label: 'Mid (3–8 km)', sub: 'Altostratus — moderate UV block', value: data.advancedData?.cloudCoverMid, col: 'bg-sky-400' },
                      { label: 'High (>8 km)', sub: 'Cirrus — minimal UV effect', value: data.advancedData?.cloudCoverHigh, col: 'bg-indigo-400' },
                    ].map((layer, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className={`text-[10px] font-black uppercase tracking-wide ${ nightCard ? 'text-slate-300' : 'text-slate-700' }`}>{layer.label}</p>
                            <p className={`text-[8px] font-bold ${ nightCard ? 'text-slate-600' : 'text-slate-400' }`}>{layer.sub}</p>
                          </div>
                          <span className={`font-black text-sm ${ nightCard ? 'text-white' : 'text-slate-900' }`}>{layer.value != null ? `${Math.round(layer.value)}%` : 'N/A'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full ${layer.col} rounded-full transition-all duration-700`} style={{ width: `${layer.value ?? 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className={`text-[10px] font-bold leading-relaxed ${ nightCard ? 'text-slate-500' : 'text-slate-500' }`}>
                    {(data.advancedData?.cloudCoverLow ?? 0) > 50
                      ? 'Heavy low cloud: high humidity, fog & gloom risk. Limited sunlight despite daytime hours.'
                      : (data.advancedData?.cloudCoverMid ?? 0) > 50
                      ? 'Mid-level cloud dominant: UV moderately reduced. Ground conditions remain fair.'
                      : 'High cloud only: UV penetration mostly intact. Minimal health impact from clouds.'}
                  </p>
                </div>

                {/* 3. Heat & Dehydration Stress */}
                {(() => {
                  const et = getEtInfo(data.advancedData?.evapotranspiration);
                  const vpd = data.advancedData?.vapourPressureDeficit;
                  return (
                    <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${
                      nightCard ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Droplets className={`w-5 h-5 ${ nightCard ? 'text-cyan-400' : 'text-cyan-500' }`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-400' : 'text-slate-500' }`}>Heat & Dehydration</span>
                      </div>
                      <div>
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>Evapotranspiration</p>
                        <div className={`text-2xl font-black tracking-tighter mb-0.5 ${et.color}`}>{et.level}</div>
                        <p className={`text-sm font-black ${ nightCard ? 'text-slate-400' : 'text-slate-600' }`}>
                          {data.advancedData?.evapotranspiration != null ? `${data.advancedData.evapotranspiration.toFixed(2)} mm/hr` : 'N/A'}
                        </p>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full ${et.barColor} transition-all duration-700 rounded-full`} style={{ width: `${et.pct}%` }} />
                      </div>
                      {vpd != null && (
                        <div className={`p-3 rounded-2xl border ${ nightCard ? 'bg-slate-900/50 border-slate-700' : 'bg-white border-slate-100' }`}>
                          <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>Vapour Pressure Deficit</p>
                          <p className={`font-black text-sm ${ vpd > 1.6 ? 'text-rose-500' : vpd < 0.4 ? 'text-sky-500' : 'text-emerald-500' }`}>
                            {vpd.toFixed(2)} kPa — {vpd > 1.6 ? 'High transpiration demand' : vpd < 0.4 ? 'Low transpiration (mold risk)' : 'Comfortable range'}
                          </p>
                        </div>
                      )}
                      <p className={`text-[11px] font-bold leading-relaxed ${ nightCard ? 'text-slate-400' : 'text-slate-600' }`}>{et.advice}</p>
                    </div>
                  );
                })()}

                {/* 4. Wind Safety */}
                {(() => {
                  const gusts = data.windGusts;
                  const gustLevel = gusts == null ? 'N/A' : gusts < 30 ? 'Safe' : gusts < 55 ? 'Breezy' : gusts < 75 ? 'Strong' : 'Dangerous';
                  const gustColor = gusts == null ? 'text-slate-400' : gusts < 30 ? 'text-emerald-500' : gusts < 55 ? 'text-amber-500' : gusts < 75 ? 'text-orange-500' : 'text-rose-500';
                  const gustBarColor = gusts == null ? 'bg-slate-300' : gusts < 30 ? 'bg-emerald-400' : gusts < 55 ? 'bg-amber-400' : gusts < 75 ? 'bg-orange-400' : 'bg-rose-500';
                  const gustAdvice = gusts == null ? '' : gusts < 30 ? 'Calm conditions. Safe for all outdoor activities including cycling.' : gusts < 55 ? 'Moderate gusts. Cyclists and pedestrians should exercise caution.' : gusts < 75 ? 'Strong gusts. Avoid open high ground. Secure loose outdoor objects.' : 'Dangerous gusts. Shelter indoors. Avoid travel in exposed areas.';
                  return (
                    <div className={`p-6 rounded-3xl border flex flex-col gap-4 ${
                      nightCard ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Wind className={`w-5 h-5 ${ nightCard ? 'text-teal-400' : 'text-teal-500' }`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${ nightCard ? 'text-slate-400' : 'text-slate-500' }`}>Wind Safety</span>
                      </div>
                      <div>
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>Peak Gusts</p>
                        <div className={`text-4xl font-black tracking-tighter ${gustColor}`}>
                          {gusts != null ? Math.round(gusts) : 'N/A'}
                          <span className={`text-base ml-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>km/h</span>
                        </div>
                        <div className={`text-lg font-black mt-0.5 ${gustColor}`}>{gustLevel}</div>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full ${gustBarColor} transition-all duration-700 rounded-full`} style={{ width: `${Math.min((gusts ?? 0) / 100 * 100, 100)}%` }} />
                      </div>
                      <div className={`p-3 rounded-2xl border ${ nightCard ? 'bg-slate-900/50 border-slate-700' : 'bg-white border-slate-100' }`}>
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>Sustained Wind</p>
                        <p className={`font-black text-sm ${ nightCard ? 'text-white' : 'text-slate-900' }`}>
                          {data.windSpeed} km/h
                          <span className={`ml-1 ${ nightCard ? 'text-slate-500' : 'text-slate-400' }`}>({getWindDir(data.windDeg)})</span>
                        </p>
                      </div>
                      <p className={`text-[11px] font-bold leading-relaxed ${ nightCard ? 'text-slate-400' : 'text-slate-600' }`}>{gustAdvice}</p>
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        )}

        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col hover:shadow-lg transition-all group">
          <div className="px-5 sm:px-10 py-5 sm:py-8 border-b border-slate-50 dark:border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
             <div className="flex items-center gap-4">
               <div className="p-3 bg-teal-50 dark:bg-teal-900/40 rounded-2xl group-hover:scale-110 transition-transform">
                 <TrendingUp className="w-6 h-6 text-teal-600" />
               </div>
               <div>
                 <h3 className="font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">Atmospheric Drift</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{timeRange === 168 ? '7-Day' : `${timeRange}-Hour`} Temperature Curve</p>
               </div>
             </div>
             <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl overflow-x-auto">
               {[24, 48, 72, 168].map(range => (
                 <button
                   key={range}
                   onClick={() => setTimeRange(range)}
                   className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all whitespace-nowrap ${
                     timeRange === range 
                       ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-300 shadow-sm' 
                       : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'
                   }`}
                 >
                   {range === 168 ? '7D' : `${range}H`}
                 </button>
               ))}
             </div>
          </div>
          <div className="h-72 w-full p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="timestamp" 
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(tick) => {
                    const d = new Date(tick);
                    if (timeRange === 168) {
                      return d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
                    }
                    return `${d.toLocaleDateString('en-US', {weekday: 'short'})} ${d.toLocaleTimeString('en-US', {hour: 'numeric', hour12: true})}`;
                  }}
                  tick={{fontSize: 10, fill: '#64748b', fontWeight: 800}} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10} 
                  minTickGap={40}
                />
                <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip 
                  contentStyle={{borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '12px'}}
                  cursor={{stroke: '#14b8a6', strokeWidth: 1, strokeDasharray: '4 4'}}
                  labelStyle={{color: '#64748b', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em'}}
                  labelFormatter={(label) => {
                    const d = new Date(label);
                    return `${d.toLocaleDateString('en-US', {weekday: 'short'})} ${d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true})}`;
                  }}
                  formatter={(value: number) => [`${value}°C`, 'Temperature']}
                />
                
                {sunriseTimes.map((time, i) => {
                  if (time < minTime || time > maxTime) return null;
                  return (
                    <ReferenceLine 
                      key={`sunrise-${i}`}
                      x={time} 
                      stroke="#f59e0b" 
                      strokeDasharray="3 3" 
                      label={({ viewBox }: any) => {
                        const { x, y } = viewBox;
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <circle cx={0} cy={-16} r={14} fill="#fef3c7" />
                            <svg x={-10} y={-26} width={20} height={20}>
                              <Sunrise color="#f59e0b" size={20} />
                            </svg>
                            <text x={0} y={8} fill="#f59e0b" fontSize={10} fontWeight={800} textAnchor="middle">Sunrise</text>
                          </g>
                        );
                      }}
                    />
                  );
                })}
                {sunsetTimes.map((time, i) => {
                  if (time < minTime || time > maxTime) return null;
                  return (
                    <ReferenceLine 
                      key={`sunset-${i}`}
                      x={time} 
                      stroke="#8b5cf6" 
                      strokeDasharray="3 3" 
                      label={({ viewBox }: any) => {
                        const { x, y } = viewBox;
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <circle cx={0} cy={-16} r={14} fill="#ede9fe" />
                            <svg x={-10} y={-26} width={20} height={20}>
                              <Sunset color="#8b5cf6" size={20} />
                            </svg>
                            <text x={0} y={8} fill="#8b5cf6" fontSize={10} fontWeight={800} textAnchor="middle">Sunset</text>
                          </g>
                        );
                      }}
                    />
                  );
                })}

                <Area type="monotone" dataKey="temp" stroke="#14b8a6" strokeWidth={4} fill="url(#colorTemp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col hover:shadow-lg transition-all group">
           <div className="px-5 sm:px-10 py-5 sm:py-8 border-b border-slate-50 dark:border-slate-700/50 flex items-center gap-4">
             <div className="p-3 bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl group-hover:scale-110 transition-transform">
               <Calendar className="w-6 h-6 text-indigo-600" />
             </div>
             <div>
               <h3 className="font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">7-Day Forecast</h3>
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Daily Synthesis</p>
             </div>
           </div>
           <div className="p-6 space-y-2 overflow-y-auto max-h-[380px] custom-scrollbar">
              {data.dailyForecast.map((day, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 rounded-3xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all group/item border border-transparent hover:border-slate-100 dark:hover:border-slate-600">
                  <div className="w-20">
                    <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">{day.date.split(',')[0]}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{day.date.split(',')[1]}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-1 px-4">
                    <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} className="w-10 h-10 group-hover/item:scale-110 transition-transform" alt="" />
                    <div className="hidden sm:block text-[10px] font-bold text-slate-500 flex items-center gap-1">
                      <Droplets className="w-2 h-2" /> {day.pop}% rain
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-900 dark:text-white">{day.maxTemp}°</div>
                    <div className="text-[10px] font-bold text-slate-400">{day.minTemp}°</div>
                  </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};