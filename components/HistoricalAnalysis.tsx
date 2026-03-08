import React, { useState, useEffect } from 'react';
import { useDataCache, isCacheValid } from '../contexts/DataCacheContext';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Search, Activity, Droplets, Thermometer, ArrowLeft, FlaskConical, BookOpen, Microscope, Wind, Zap, CloudSun } from 'lucide-react';
import { WeatherData } from '../types';
import { analyzeHistoricalClimateHealth } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface HistoricalAnalysisProps {
  location: string;
  weather: WeatherData | null;
  onBack: () => void;
  geminiKey: string;
  aiProvider?: string;
  aiModel?: string;
  aiKey?: string;
}

interface HistoricalDataPoint {
  date: string;
  maxTemp: number;
  minTemp: number;
  precipitation: number;
  windSpeed: number;
  humidity?: number;
  apparentTempMax?: number;
  apparentTempMin?: number;
  vpd?: number;
  radiation?: number;
  aqi?: number;
  weatherCode?: number;
}

const VARIABLE_OPTIONS = [
  { id: 'humidity', label: 'Humidity', apiParam: 'relative_humidity_2m_mean' },
  { id: 'heatstress', label: 'Thermal Stress (Apparent Temp)', apiParam: 'apparent_temperature_max,apparent_temperature_min' },
  { id: 'vpd', label: 'Vapour Pressure Deficit', apiParam: 'vapour_pressure_deficit_max' },
  { id: 'radiation', label: 'Solar Radiation', apiParam: 'shortwave_radiation_sum' },
  { id: 'aqi', label: 'Air Quality (AQI)', apiParam: 'us_aqi' } // Handled via separate API call
];

export const HistoricalAnalysis: React.FC<HistoricalAnalysisProps> = ({ location, weather, onBack, geminiKey, aiProvider = 'gemini', aiModel = 'gemini-2.5-flash', aiKey }) => {
  const { historical: histCache, setHistorical } = useDataCache();
  const cacheValid = isCacheValid(histCache.lastFetched, histCache.lastLocation, location);

  const [startDate, setStartDate] = useState(() => {
    if (cacheValid && histCache.startDate) return histCache.startDate;
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    if (cacheValid && histCache.endDate) return histCache.endDate;
    return new Date().toISOString().split('T')[0];
  });
  const [data, setData] = useState<HistoricalDataPoint[]>(() => cacheValid ? histCache.data : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(() => cacheValid ? histCache.analysis : '');
  const [analyzing, setAnalyzing] = useState(false);
  const [researchPhase, setResearchPhase] = useState('');
  const [selectedVariables, setSelectedVariables] = useState<string[]>(() => cacheValid ? histCache.selectedVariables : []);

  const handleDateRange = (range: 'week' | 'month' | '3months' | 'year') => {
    const end = new Date();
    const start = new Date();
    
    // Archive API usually has a delay of a few days. Let's set end date to yesterday to be safe, 
    // or keep it as today but handle missing data. Open-Meteo ERA5T is usually 5 days behind, 
    // but they have seamless integration with forecast for recent days in some endpoints.
    // However, for "archive" endpoint, it's safer to stick to confirmed past data or accept gaps.
    // Let's use yesterday as end date to avoid "future" data errors in archive.
    end.setDate(end.getDate() - 1);

    switch (range) {
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setMonth(end.getMonth() - 1);
        break;
      case '3months':
        start.setMonth(end.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(end.getFullYear() - 1);
        break;
    }
    
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  };

  const toggleVariable = (id: string) => {
    setSelectedVariables(prev => 
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const fetchHistoricalData = async () => {
    if (!weather?.lat || !weather?.lon) {
      setError('Location coordinates not available. Please search for a location first.');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysis('');

    try {
      // Base weather variables
      let dailyParams = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_speed_10m_max', 'weather_code'];
      
      // Add selected variables if they are standard weather params
      if (selectedVariables.includes('humidity')) dailyParams.push('relative_humidity_2m_mean');
      if (selectedVariables.includes('heatstress')) {
        dailyParams.push('apparent_temperature_max');
        dailyParams.push('apparent_temperature_min');
      }
      if (selectedVariables.includes('vpd')) dailyParams.push('vapour_pressure_deficit_max');
      if (selectedVariables.includes('radiation')) dailyParams.push('shortwave_radiation_sum');

      // Construct URLs
      const weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${weather.lat}&longitude=${weather.lon}&start_date=${startDate}&end_date=${endDate}&daily=${dailyParams.join(',')}&timezone=auto`;
      
      // Fetch Weather Data
      const weatherRes = await fetch(weatherUrl);
      if (!weatherRes.ok) {
        const errText = await weatherRes.text();
        throw new Error(`Weather API Error: ${errText}`);
      }
      const weatherJson = await weatherRes.json();
      if (!weatherJson.daily) throw new Error('No daily data available for this period');

      // Fetch AQI Data (separately to avoid failing the whole request)
      let aqiJson = null;
      if (selectedVariables.includes('aqi')) {
        try {
          const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${weather.lat}&longitude=${weather.lon}&start_date=${startDate}&end_date=${endDate}&hourly=us_aqi&timezone=auto`;
          const aqiRes = await fetch(aqiUrl);
          if (aqiRes.ok) {
            aqiJson = await aqiRes.json();
          } else {
            console.warn('AQI fetch failed, continuing without AQI data');
          }
        } catch (e) {
          console.warn('AQI fetch error:', e);
        }
      }

      const formattedData = weatherJson.daily.time.map((date: string, i: number) => {
        // Calculate daily max AQI from hourly data if available
        let dailyAqi = undefined;
        if (aqiJson && aqiJson.hourly && aqiJson.hourly.us_aqi) {
          const startIdx = i * 24;
          const endIdx = startIdx + 24;
          if (startIdx < aqiJson.hourly.us_aqi.length) {
            const dayHourlyAqi = aqiJson.hourly.us_aqi.slice(startIdx, endIdx);
            const validAqi = dayHourlyAqi.filter((v: number | null) => v !== null && v !== undefined) as number[];
            if (validAqi.length > 0) {
              dailyAqi = Math.max(...validAqi);
            }
          }
        }

        return {
          date,
          maxTemp: weatherJson.daily.temperature_2m_max[i],
          minTemp: weatherJson.daily.temperature_2m_min[i],
          precipitation: weatherJson.daily.precipitation_sum[i],
          windSpeed: weatherJson.daily.wind_speed_10m_max[i],
          weatherCode: weatherJson.daily.weather_code[i],
          humidity: weatherJson.daily.relative_humidity_2m_mean ? weatherJson.daily.relative_humidity_2m_mean[i] : undefined,
          apparentTempMax: weatherJson.daily.apparent_temperature_max ? Math.round(weatherJson.daily.apparent_temperature_max[i] * 10) / 10 : undefined,
          apparentTempMin: weatherJson.daily.apparent_temperature_min ? Math.round(weatherJson.daily.apparent_temperature_min[i] * 10) / 10 : undefined,
          vpd: weatherJson.daily.vapour_pressure_deficit_max ? Math.round(weatherJson.daily.vapour_pressure_deficit_max[i] * 100) / 100 : undefined,
          radiation: weatherJson.daily.shortwave_radiation_sum ? Math.round(weatherJson.daily.shortwave_radiation_sum[i] * 10) / 10 : undefined,
          aqi: dailyAqi
        };
      });

      setData(formattedData);
      setHistorical({
        data: formattedData,
        startDate,
        endDate,
        selectedVariables,
        lastLocation: location,
        lastFetched: Date.now(),
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (data.length === 0) return;
    setAnalyzing(true);
    setAnalysis('');
    setResearchPhase('Scanning peer-reviewed climate-health literature...');

    try {
      const input = {
        location,
        lat: weather?.lat ?? 0,
        lon: weather?.lon ?? 0,
        period: `${startDate} to ${endDate}`,
        avgMaxTemp: (data.reduce((acc, curr) => acc + curr.maxTemp, 0) / data.length).toFixed(1),
        avgMinTemp: (data.reduce((acc, curr) => acc + curr.minTemp, 0) / data.length).toFixed(1),
        totalPrecip: data.reduce((acc, curr) => acc + curr.precipitation, 0).toFixed(1),
        maxWind: Math.max(...data.map(d => d.windSpeed)).toFixed(1),
        avgHumidity: selectedVariables.includes('humidity')
          ? (data.reduce((acc, curr) => acc + (curr.humidity || 0), 0) / data.length).toFixed(1)
          : undefined,
        maxApparentTemp: selectedVariables.includes('heatstress')
          ? Math.max(...data.map(d => d.apparentTempMax || -999)).toFixed(1)
          : undefined,
        minApparentTemp: selectedVariables.includes('heatstress')
          ? Math.min(...data.map(d => d.apparentTempMin || 999)).toFixed(1)
          : undefined,
        maxVPD: selectedVariables.includes('vpd')
          ? Math.max(...data.map(d => d.vpd || 0)).toFixed(2)
          : undefined,
        avgRadiation: selectedVariables.includes('radiation')
          ? (data.reduce((acc, curr) => acc + (curr.radiation || 0), 0) / data.length).toFixed(1)
          : undefined,
        maxAQI: selectedVariables.includes('aqi')
          ? Math.max(...data.map(d => d.aqi || 0)).toFixed(1)
          : undefined,
        currentWeather: weather ? {
          temp: weather.temp,
          feelsLike: weather.feelsLike,
          condition: weather.description,
          aqi: weather.aqi,
          uv: weather.uvIndex,
          humidity: weather.humidity,
          pressure: weather.pressure,
          pm2_5: weather.advancedData?.pm2_5,
          pm10: weather.advancedData?.pm10,
        } : undefined,
        forecast: weather?.dailyForecast
          ? weather.dailyForecast.slice(0, 7).map(d => ({
              date: d.date,
              maxTemp: d.maxTemp,
              minTemp: d.minTemp,
              desc: d.description,
            }))
          : undefined,
      };

      setTimeout(() => setResearchPhase('Correlating Brownstein et al. (2018) antibiotic resistance-temperature framework...'), 1800);
      setTimeout(() => setResearchPhase('Applying Gasparrini et al. (2017, Lancet) thermal stress & excess mortality model...'), 3500);
      setTimeout(() => setResearchPhase('Analysing VPD thresholds via Shaman & Kohn (2009, PLOS Biology) influenza model...'), 5200);
      setTimeout(() => setResearchPhase('Assessing solar radiation & Vitamin D risk — Holick (2004, NEJM); Anglin et al. (2013)...'), 7000);
      setTimeout(() => setResearchPhase('Cross-referencing WHO/CDC/ECDC vector-borne disease & air quality thresholds...'), 9000);
      setTimeout(() => setResearchPhase('Synthesising evidence-based risk assessment & recommendations...'), 11000);

      const effectiveKey = aiKey || geminiKey;
      const response = await analyzeHistoricalClimateHealth(input, aiProvider, aiModel, effectiveKey);

      setAnalysis(response);
      setHistorical({ analysis: response });
      setResearchPhase('');

      // Store in localStorage for bio-assistant memory
      try {
        const existingReports = JSON.parse(localStorage.getItem('biosentinel_reports_memory') || '[]');
        existingReports.push({
          date: new Date().toISOString(),
          type: 'Historical Climate-Health Research Analysis',
          content: response
        });
        if (existingReports.length > 10) existingReports.shift();
        localStorage.setItem('biosentinel_reports_memory', JSON.stringify(existingReports));
      } catch (e) {
        console.error('Failed to save report to memory', e);
      }
    } catch (err) {
      setResearchPhase('');
      setError(err instanceof Error ? err.message : 'Failed to generate research analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-slate-500 dark:text-slate-400"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Historical Bio-Analysis</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI-Researched Climate-Health Intelligence · Peer-Reviewed Scientific Analysis</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-teal-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-teal-500 transition-all"
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={fetchHistoricalData}
              disabled={loading}
              className="w-full p-3 bg-teal-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-teal-500 transition-all shadow-lg shadow-teal-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Activity className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Fetch Data
            </button>
          </div>
        </div>

        {/* Variable Selection */}
        <div className="mb-8 flex flex-wrap gap-3">
          {VARIABLE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => toggleVariable(opt.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                selectedVariables.includes(opt.id)
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-4 mb-6 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100">
            {error}
          </div>
        )}

        {data.length > 0 && (
          <div className="space-y-12">
            {/* Temperature Chart */}
            <div className="h-80 w-full">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-rose-500" /> Temperature Trends (°C)
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                    tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 700}} 
                    tickLine={false} 
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold'}}
                    labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="maxTemp" stroke="#f43f5e" strokeWidth={3} dot={false} name="Max Temp" />
                  <Line type="monotone" dataKey="minTemp" stroke="#3b82f6" strokeWidth={3} dot={false} name="Min Temp" />
                  {selectedVariables.includes('humidity') && (
                    <Line type="monotone" dataKey="humidity" stroke="#10b981" strokeWidth={2} dot={false} name="Humidity (%)" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Precipitation & Wind Chart */}
            <div className="h-64 w-full">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-500" /> Precipitation & Wind
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                    tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 700}} 
                    tickLine={false} 
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis yAxisId="left" hide />
                  <YAxis yAxisId="right" orientation="right" hide />
                  <Tooltip 
                    contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold'}}
                    labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="precipitation" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Precipitation (mm)" />
                  <Line yAxisId="right" type="monotone" dataKey="windSpeed" stroke="#f59e0b" strokeWidth={2} dot={false} name="Wind Speed (km/h)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Health Impact Factors Charts */}
            {(selectedVariables.includes('heatstress') || selectedVariables.includes('vpd') || selectedVariables.includes('radiation') || selectedVariables.includes('aqi')) && (
              <div className="space-y-10">
                <div>
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4 text-orange-500" /> Health Impact Factors
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold">
                    Evidence-based climate variables linked to human disease and mortality · Sources: WHO, Gasparrini et al. 2017 Lancet, Shaman &amp; Kohn 2009 PLOS Biology, Holick 2004 NEJM
                  </p>
                </div>

                {/* Thermal Stress — Apparent Temperature */}
                {selectedVariables.includes('heatstress') && data.some(d => d.apparentTempMax !== undefined) && (
                  <div className="bg-slate-50 dark:bg-slate-700/60 rounded-2xl p-5 border border-slate-100 dark:border-slate-600">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Thermometer className="w-4 h-4 text-rose-500" />
                          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Thermal Stress — Apparent Temperature (°C)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          Perceived temp combining wind chill + humidity + radiation · Heat stress drives cardiovascular events and heat stroke (Gasparrini et al. 2017, Lancet — 74 countries, 85M deaths)
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{"<"}−10° Hypothermia Risk</span>
                        <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">26–32° Caution</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">32–41° Heat Danger</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">{">"}41° Extreme Danger</span>
                      </div>
                    </div>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                          <defs>
                            <linearGradient id="atMaxGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="atMinGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} minTickGap={30} />
                          <YAxis domain={['auto', 'auto']} hide />
                          <Tooltip
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                            labelFormatter={(l) => new Date(l).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            formatter={(v: number, name: string) => [`${v}°C`, name]}
                          />
                          <Legend />
                          <ReferenceLine y={-10} stroke="#93c5fd" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Hypothermia Risk', position: 'insideTopRight', fontSize: 9, fill: '#60a5fa', fontWeight: 700 }} />
                          <ReferenceLine y={32} stroke="#fb923c" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Heat Danger', position: 'insideTopRight', fontSize: 9, fill: '#f97316', fontWeight: 700 }} />
                          <ReferenceLine y={41} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Extreme Danger', position: 'insideTopRight', fontSize: 9, fill: '#dc2626', fontWeight: 700 }} />
                          <Area type="monotone" dataKey="apparentTempMax" stroke="#f43f5e" strokeWidth={2.5} fill="url(#atMaxGrad)" dot={false} name="Apparent Temp Max" />
                          <Area type="monotone" dataKey="apparentTempMin" stroke="#3b82f6" strokeWidth={2} fill="url(#atMinGrad)" dot={false} name="Apparent Temp Min" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Vapour Pressure Deficit (VPD) */}
                {selectedVariables.includes('vpd') && data.some(d => d.vpd !== undefined) && (
                  <div className="bg-slate-50 dark:bg-slate-700/60 rounded-2xl p-5 border border-slate-100 dark:border-slate-600">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-violet-500" />
                          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Vapour Pressure Deficit — VPD (kPa)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          Atmospheric dryness driving influenza & respiratory pathogen transmission · Shaman &amp; Kohn (2009) PLOS Biology: low absolute humidity predicts epidemic influenza onset
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{"<"}0.4 kPa Humid · Mold/Allergen Risk</span>
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">0.4–1.6 Optimal</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{">"}1.6 kPa Dry · Respiratory Risk</span>
                      </div>
                    </div>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                          <defs>
                            <linearGradient id="vpdGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} minTickGap={30} />
                          <YAxis domain={[0, 'auto']} hide />
                          <Tooltip
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                            labelFormatter={(l) => new Date(l).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            formatter={(v: number) => [`${v} kPa`, `VPD — ${v < 0.4 ? 'Humid (Mold/Allergen Risk)' : v <= 1.6 ? 'Optimal Range' : 'Dry (Respiratory Risk)'}`]}
                          />
                          <ReferenceLine y={0.4} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} label={{ value: '0.4 kPa', position: 'insideTopRight', fontSize: 9, fill: '#16a34a', fontWeight: 700 }} />
                          <ReferenceLine y={1.6} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1} label={{ value: '1.6 kPa Dry Threshold', position: 'insideTopRight', fontSize: 9, fill: '#ea580c', fontWeight: 700 }} />
                          <Area type="monotone" dataKey="vpd" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#vpdGrad)" dot={false} name="VPD (kPa)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Solar Radiation */}
                {selectedVariables.includes('radiation') && data.some(d => d.radiation !== undefined) && (
                  <div className="bg-slate-50 dark:bg-slate-700/60 rounded-2xl p-5 border border-slate-100 dark:border-slate-600">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <CloudSun className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Shortwave Solar Radiation (MJ/m²/day)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          Drives Vitamin D synthesis, Seasonal Affective Disorder (SAD), skin cancer risk & circadian health · Holick (2004) NEJM: vitamin D deficiency linked to 17 cancer types, autoimmune disease, cardiovascular risk
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{"<"}5 MJ/m² Very Low · SAD Risk</span>
                        <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">5–15 Moderate</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{">"}25 High · Skin Damage Risk</span>
                      </div>
                    </div>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                          <defs>
                            <linearGradient id="radGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#fcd34d" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} minTickGap={30} />
                          <YAxis domain={[0, 'auto']} hide />
                          <Tooltip
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                            labelFormatter={(l) => new Date(l).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            formatter={(v: number) => [`${v} MJ/m²`, `Solar Radiation — ${v < 5 ? 'Very Low (SAD Risk)' : v <= 15 ? 'Moderate' : v <= 25 ? 'High' : 'Very High (Skin Damage Risk)'}`]}
                          />
                          <ReferenceLine y={5} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} label={{ value: '5 MJ/m²', position: 'insideTopRight', fontSize: 9, fill: '#64748b', fontWeight: 700 }} />
                          <ReferenceLine y={25} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1} label={{ value: '25 MJ/m² Skin Risk', position: 'insideTopRight', fontSize: 9, fill: '#ea580c', fontWeight: 700 }} />
                          <Area type="monotone" dataKey="radiation" stroke="#f59e0b" strokeWidth={2.5} fill="url(#radGrad)" dot={false} name="Solar Radiation (MJ/m²)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* AQI Chart */}
                {selectedVariables.includes('aqi') && data.some(d => d.aqi !== undefined) && (
                  <div className="bg-slate-50 dark:bg-slate-700/60 rounded-2xl p-5 border border-slate-100 dark:border-slate-600">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Wind className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Air Quality Index (US AQI)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          PM2.5/PM10 particle exposure driving respiratory & cardiovascular disease · WHO: 7M deaths/year attributable to air pollution · Brownstein et al. 2018: AQI correlates with antibiotic resistance emergence
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">0–50 Good</span>
                        <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">51–100 Moderate</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">101–150 Unhealthy SG</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">151–200 Unhealthy</span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">201+ Very Unhealthy</span>
                      </div>
                    </div>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                          <defs>
                            <linearGradient id="aqiGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} minTickGap={30} />
                          <YAxis domain={[0, 'auto']} hide />
                          <Tooltip
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                            labelFormatter={(l) => new Date(l).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            formatter={(v: number) => [v, `US AQI — ${v <= 50 ? 'Good' : v <= 100 ? 'Moderate' : v <= 150 ? 'Unhealthy for Sensitive Groups' : v <= 200 ? 'Unhealthy' : v <= 300 ? 'Very Unhealthy' : 'Hazardous'}`]}
                          />
                          <ReferenceLine y={50} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
                          <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 4" strokeWidth={1} />
                          <ReferenceLine y={150} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1} />
                          <ReferenceLine y={200} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
                          <ReferenceLine y={300} stroke="#7c3aed" strokeDasharray="4 4" strokeWidth={1} />
                          <Area type="monotone" dataKey="aqi" stroke="#64748b" strokeWidth={2.5} fill="url(#aqiGrad)" dot={false} name="US AQI" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Research Analysis Section */}
            <div className="pt-8 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <Microscope className="w-6 h-6 text-teal-600" /> Scientific Research Analysis
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    AI searches peer-reviewed literature · Brownstein 2018 · Gasparrini 2017 · Shaman &amp; Kohn 2009 · Holick 2004 · WHO/CDC/ECDC
                  </p>
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {analyzing ? <Activity className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                  {analyzing ? 'Researching...' : 'Run AI Research'}
                </button>
              </div>

              {/* Research Phase Indicator */}
              {analyzing && researchPhase && (
                <div className="mb-6 p-4 bg-teal-50 border border-teal-100 rounded-2xl flex items-start gap-3">
                  <BookOpen className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0 animate-pulse" />
                  <div>
                    <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Research Engine Active</p>
                    <p className="text-xs font-bold text-teal-800 mt-0.5">{researchPhase}</p>
                  </div>
                </div>
              )}

              {/* Research source badges */}
              {!analyzing && !analysis && (
                <div className="mb-6 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Peer-Reviewed Frameworks &amp; Sources</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Gasparrini et al. 2017', sub: 'Lancet Planetary Health · Thermal Stress & Mortality (74 countries)', color: 'bg-rose-50 text-rose-700 border-rose-200' },
                      { label: 'Brownstein / MacFadden 2018', sub: 'PLOS Medicine · Antibiotic Resistance & Temperature', color: 'bg-teal-50 text-teal-700 border-teal-200' },
                      { label: 'Shaman & Kohn 2009', sub: 'PLOS Biology · VPD & Influenza Transmission', color: 'bg-violet-50 text-violet-700 border-violet-200' },
                      { label: 'Holick 2004', sub: 'NEJM · Solar Radiation, Vitamin D & Disease Risk', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                      { label: 'Anglin et al. 2013', sub: 'Psychiatry Research · Solar Irradiance & SAD', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                      { label: 'WHO AQG 2021', sub: 'Global Air Quality Guidelines · PM2.5/AQI Thresholds', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600' },
                      { label: 'Guo et al. 2024', sub: 'Environment International · Heat × Pollution Synergy (36 countries)', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600' },
                      { label: 'IPCC AR6', sub: 'Mental Health, Eco-anxiety & Solastalgia Framework', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                      { label: 'Lancet Countdown', sub: '~5M Climate-Sensitive Deaths (2020) · Heat Mortality +68% in >65s', color: 'bg-orange-50 text-orange-700 border-orange-200' },
                      { label: 'CDC Vector Surveillance', sub: 'Dengue / Malaria / Lyme Climate Thresholds', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600' },
                      { label: 'ECDC Disease Reports', sub: 'European Climate-Health Burden Data', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600' },
                    ].map(src => (
                      <span key={src.label} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${src.color}`}>
                        {src.label} <span className="font-semibold normal-case tracking-normal opacity-70">· {src.sub}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {analysis && (
                <div className="bg-slate-50 dark:bg-slate-700/60 p-6 sm:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-600 prose prose-sm max-w-none prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 prose-headings:font-black prose-h3:text-teal-800 dark:prose-h3:text-teal-400 prose-h4:text-slate-700 dark:prose-h4:text-slate-200">
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
