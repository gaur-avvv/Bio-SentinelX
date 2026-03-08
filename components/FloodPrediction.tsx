import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDataCache, isCacheValid } from '../contexts/DataCacheContext';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  Waves, Activity, AlertTriangle, BookOpen, ArrowLeft,
  RefreshCw, TrendingUp, TrendingDown, Minus, Zap, Info,
  Settings, Brain, Server, CheckCircle2, XCircle, RotateCcw,
  Cpu, ChevronDown, ChevronUp, Map,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WeatherData } from '../types';

// Map SDK globals — loaded dynamically via script tags in App.tsx
declare const mappls: any;
declare const maptilersdk: any;
declare const maplibregl: any;
declare const mapboxgl: any;
import {
  fetchFloodData,
  computeFloodRisk,
  computeTrend,
  computeHistoricalStats,
  getSeasonalContext,
  findTodayIndex,
  toMonthlyFloodSeries,
  MonthlyFloodPoint,
  fetchMLPrediction,
  fetchMLStatus,
  triggerMLRetrain,
  fetchWardReadiness,
  fetchHotspots,
  enrichWardsWithGeoNames,
  fetchIndiaWardBoundaries,
  IndiaWardFeature,
  FloodDataPoint,
  FloodRiskScore,
  TrendResult,
  SeasonalContext,
  HistoricalStats,
  MLPredictionResult,
  MLTrainingStatus,
  WardReadinessItem,
  MicroHotspotResponse,
} from '../services/floodService';
import { analyzeFloodRisk, FloodAnalysisInput } from '../services/geminiService';

interface FloodPredictionProps {
  weather: WeatherData | null;
  onBack: () => void;
  aiProvider?: string;
  aiModel?: string;
  aiKey?: string;
  mapProvider?: 'mappls' | 'maptiler' | 'mapbox' | 'osm';
  mapplsToken?: string;
  mapTilerKey?: string;
  mapboxToken?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, d = 1) =>
  n == null || isNaN(n as number) ? 'N/A' : Number(n).toFixed(d);

const windDir16 = (deg: number | null | undefined): string => {
  if (deg == null || Number.isNaN(deg)) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 22.5) % 16;
  return dirs[idx];
};

const tooltipStyle = {
  borderRadius: '1rem', border: 'none',
  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold',
};

const labelFmt = (l: string) =>
  new Date(l + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

type FuturePredictionWindow = {
  label: string;
  mostLikelyMean: number | null;
  bestCaseLow: number | null;
  worstCaseHigh: number | null;
  days: number;
  daysMedianExceedsHistP75: number;
  daysEnsembleP75ExceedsHistP75: number;
  precipTotalMm: number | null;
};

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function min(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.min(...nums);
}

function max(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.max(...nums);
}

// ─── Getis-Ord Gi* Hot Spot Analysis ─────────────────────────────────────────
// Computes the Gi* z-score for each feature and assigns a confidence bin.
// Reference: Getis & Ord 1992; Ord & Getis 1995.
//
// Confidence bins:
//   +3 = 99% hot spot  (dark red)
//   +2 = 95% hot spot  (medium red)
//   +1 = 90% hot spot  (light red/pink)
//    0 = not significant (beige)
//   -1 = 90% cold spot  (light blue)
//   -2 = 95% cold spot  (medium blue)
//   -3 = 99% cold spot  (dark blue)
interface GiStarFeature {
  lat: number;
  lon: number;
  value: number;
  zScore: number;
  confidenceBin: -3 | -2 | -1 | 0 | 1 | 2 | 3;
  color: string;
  label: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeGiStar(
  features: Array<{ lat: number; lon: number; value: number }>,
  distanceBandKm: number
): GiStarFeature[] {
  const n = features.length;
  if (n < 3) return [];

  // Global mean (X̄) and standard deviation (S)
  const vals = features.map(f => f.value);
  const X̄ = vals.reduce((s, v) => s + v, 0) / n;
  const S = Math.sqrt(vals.reduce((s, v) => s + v * v, 0) / n - X̄ * X̄);
  if (S === 0) return []; // No variation — Gi* undefined

  const GI_Z_THRESHOLDS = [
    { z: 2.576, bin: 3  as const, color: '#ff0066', label: '99% Hot Spot'  },
    { z: 1.960, bin: 2  as const, color: '#ff3399', label: '95% Hot Spot'  },
    { z: 1.645, bin: 1  as const, color: '#ff99cc', label: '90% Hot Spot'  },
    { z: -1.645, bin: -1 as const, color: '#00e5ff', label: '90% Cold Spot' },
    { z: -1.960, bin: -2 as const, color: '#00aaff', label: '95% Cold Spot' },
    { z: -2.576, bin: -3 as const, color: '#8800ff', label: '99% Cold Spot' },
  ];

  return features.map(fi => {
    // Binary spatial weights: 1 if within distance band, 0 otherwise (includes self)
    let sumW = 0, sumWx = 0, sumW2 = 0;
    for (let j = 0; j < n; j++) {
      const fj = features[j];
      const wij = fi === fj ? 1 : (haversineKm(fi.lat, fi.lon, fj.lat, fj.lon) <= distanceBandKm ? 1 : 0);
      sumW  += wij;
      sumWx += wij * fj.value;
      sumW2 += wij * wij;
    }

    // Gi* z-score formula
    const numerator   = sumWx - X̄ * sumW;
    const denominator = S * Math.sqrt((n * sumW2 - sumW * sumW) / (n - 1));
    const zScore = denominator === 0 ? 0 : numerator / denominator;

    // Map z-score to confidence bin — neon dark-mode palette
    let confidenceBin: GiStarFeature['confidenceBin'] = 0;
    let color = 'rgba(255,255,255,0.08)'; // near-transparent — not significant
    let label = 'Not Significant';

    if (zScore >= 2.576)       { confidenceBin = 3;  color = '#ff0066'; label = '99% Hot Spot';  }
    else if (zScore >= 1.960)  { confidenceBin = 2;  color = '#ff3399'; label = '95% Hot Spot';  }
    else if (zScore >= 1.645)  { confidenceBin = 1;  color = '#ff80c0'; label = '90% Hot Spot';  }
    else if (zScore <= -2.576) { confidenceBin = -3; color = '#8800ff'; label = '99% Cold Spot'; }
    else if (zScore <= -1.960) { confidenceBin = -2; color = '#00aaff'; label = '95% Cold Spot'; }
    else if (zScore <= -1.645) { confidenceBin = -1; color = '#00e5ff'; label = '90% Cold Spot'; }

    return { ...fi, zScore, confidenceBin, color, label };
  });
}


export const FloodPrediction: React.FC<FloodPredictionProps> = ({
  weather, onBack, aiProvider = 'gemini', aiModel = 'gemini-2.5-flash', aiKey,
  mapProvider = 'osm', mapplsToken, mapTilerKey, mapboxToken,
}) => {
  // ── Cache ───────────────────────────────────────────────────────────────────
  const { flood: floodCache, setFlood } = useDataCache();
  const cacheValid = isCacheValid(floodCache.lastFetched, floodCache.lastLocation, weather?.city ?? '');

  // ── Data state ──────────────────────────────────────────────────────────────
  const [rawData,   setRawData]   = useState<FloodDataPoint[]>(() => cacheValid ? floodCache.rawData : []);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  // ── Analysis state ──────────────────────────────────────────────────────────
  const [analysis,      setAnalysis]      = useState(() => cacheValid ? floodCache.analysis : '');
  const [analyzing,     setAnalyzing]     = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState('');

  // ── ML API config ───────────────────────────────────────────────────────────
  const [mlApiUrl,       setMlApiUrl]       = useState(() =>
    localStorage.getItem('floodMlApiUrl') || (process.env.FLOOD_ML_API as string | undefined) || 'http://localhost:8000');
  const [showApiConfig,  setShowApiConfig]  = useState(false);
  const [mlApiUrlInput,  setMlApiUrlInput]  = useState(mlApiUrl);

  // ── ML prediction state ─────────────────────────────────────────────────────
  const [mlPrediction,   setMlPrediction]   = useState<MLPredictionResult | null>(() => cacheValid ? floodCache.mlPrediction : null);
  const [mlStatus,       setMlStatus]       = useState<MLTrainingStatus | null>(() => cacheValid ? floodCache.mlStatus : null);
  const [mlLoading,      setMlLoading]      = useState(false);
  const [mlError,        setMlError]        = useState('');
  const [retraining,     setRetraining]     = useState(false);
  const [retrainMsg,     setRetrainMsg]     = useState('');

  // ── Ward readiness + hotspots (API) ───────────────────────────────────────
  const [wardReadiness, setWardReadiness] = useState<WardReadinessItem[] | null>(null);
  const [wardsLoading,  setWardsLoading]  = useState(false);
  const [wardsError,    setWardsError]    = useState('');

  const [hotspots,      setHotspots]      = useState<MicroHotspotResponse | null>(null);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [hotspotsError,   setHotspotsError]   = useState('');

  // Getis-Ord Gi* results — computed from ward data when available
  const [giStarResults, setGiStarResults] = useState<GiStarFeature[]>([]);

  // India Ward Boundaries — official ESRI ArcGIS Living Atlas polygons
  const [indiaWards,       setIndiaWards]       = useState<IndiaWardFeature[]>([]);
  const [indiaWardsLoading, setIndiaWardsLoading] = useState(false);
  const [indiaWardsError,  setIndiaWardsError]  = useState('');
  const [showWardPolygons, setShowWardPolygons] = useState(true);

  // ── Map style ready gate — prevents 'Style is not done loading' crashes ──────
  // Set to true inside 'load' event handler; all overlay useEffects depend on it.
  const [mapReady, setMapReady] = useState(false);

  /** Run `fn` immediately if the map style is loaded, else queue it via 'load'. */
  const runWhenReady = useCallback((fn: () => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded?.()) {
      fn();
    } else {
      map.once('load', fn);
    }
  }, []);

  // ── Mappls map refs & Layer State ───────────────────────────────────────────
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showHotspotZones, setShowHotspotZones] = useState(true);
  const [showWardMarkers, setShowWardMarkers] = useState(true);
  const [isSatellite, setIsSatellite] = useState(false);

  const wardMapContainerRef  = useRef<HTMLDivElement | null>(null);
  const mapRef               = useRef<any>(null);      // Map instance (mappls or maplibre)
  const markersRef           = useRef<any[]>([]);      // Marker instances
  const circlesRef           = useRef<any[]>([]);      // Hotspot circle/polygon instances
  const heatmapRef           = useRef<any>(null);      // Heatmap layer instance

  // Legend aliases for backward compatibility with existing code
  const mapplsMapRef         = mapRef;
  const mapplsMarkersRef     = markersRef;
  const mapplsCirclesRef     = circlesRef;
  const mapplsHeatmapRef     = heatmapRef;
  // Keep legacy alias names so later JSX refs still compile
  const leafletMapRef        = mapplsMapRef;
  const leafletMarkersRef    = mapplsMarkersRef;
  const leafletCirclesRef    = mapplsCirclesRef;

  // ── Geocoding loading state ─────────────────────────────────────────────
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState(0);

  // ── ML training status polling (keeps UI in sync after /train) ─────────────
  const statusPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRetrainStartRef = useRef<number | null>(null);

  const stopStatusPolling = useCallback(() => {
    if (statusPollTimeoutRef.current) {
      clearTimeout(statusPollTimeoutRef.current);
      statusPollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => stopStatusPolling, [stopStatusPolling]);

  // ── Mappls: init map + ward markers whenever wardReadiness changes ───────────
  useEffect(() => {
    if (!wardReadiness?.length || !wardMapContainerRef.current) return;
    const isMappls = mapProvider === 'mappls';
    const isMapbox = mapProvider === 'mapbox';
    // Guard: ensure required SDK is loaded for the selected provider
    if (isMappls && typeof mappls === 'undefined') return;
    if (mapProvider === 'maptiler' && typeof maptilersdk === 'undefined') return;
    if (isMapbox && typeof mapboxgl === 'undefined') return;
    if (mapProvider === 'osm' && typeof maplibregl === 'undefined') return;

    const gradeColor: Record<string, string> = {
      A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#dc2626',
    };

    /** Build a data-URI SVG circle used as the ward pin icon */
    const makeSvgUrl = (grade: string) => {
      const col  = gradeColor[grade] ?? '#94a3b8';
      const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><circle cx="17" cy="17" r="15" fill="${col}" stroke="white" stroke-width="3"/><text x="17" y="22" text-anchor="middle" font-size="13" font-weight="900" font-family="Inter,sans-serif" fill="white">${grade}</text></svg>`;
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    };

    // ─ Init map & Render Wards as Polygons ───────────────────────────────────
    const renderWards = () => {
      // Clear previous markers
      mapplsMarkersRef.current.forEach(m => { try { m.remove(); } catch { try { m.setMap(null); } catch {} } });
      mapplsMarkersRef.current = [];

      // Remove existing ward polygon layer if any
      const map = mapRef.current;
      if (!map) return;

      if (isMappls) {
        if (map.getLayer && map.getLayer('mgis-ward-layer')) {
          map.removeLayer('mgis-ward-layer');
          map.removeSource('mgis-ward-source');
        }
      } else {
        // MapTiler/MapLibre cleanup
        if (map.getLayer?.('ward-poly-layer')) map.removeLayer('ward-poly-layer');
        if (map.getSource?.('ward-poly-source')) map.removeSource('ward-poly-source');
      }

      // Arrays for the batch getWard query
      const wardIdsForApi: string[] = [];
      const gradeColor: Record<string, string> = {
        A: '22c55e', B: '84cc16', C: 'eab308', D: 'f97316', F: 'dc2626',
      };

      // Ensure geoAnalytics is loaded for Mappls
      if (isMappls && typeof mappls.geoAnalytics === 'undefined') {
        console.warn('[Mappls] geoAnalytics library missing');
      }

      wardReadiness.forEach(w => {
        if (!w.lat || !w.lon) return;

        // Try extracting numeric ward number from Ward ID (e.g. "WARD-001" -> "0001")
        // Note: mGIS expects specific ward numbers or names based on the city. 
        // Here we render the markers as fallback and also try the polygon API.
        const match = w.ward_id.match(/\d+/);
        if (match) {
           const wNo = match[0].padStart(4, '0');
           wardIdsForApi.push(wNo);
        }

        const colHex = '#' + (gradeColor[w.readiness_grade] ?? '94a3b8');
        const prob = w.flood_probability;
        const riskLabel = prob >= 0.80 ? 'CRITICAL' : prob >= 0.60 ? 'HIGH' : prob >= 0.35 ? 'MEDIUM' : prob >= 0.15 ? 'LOW' : 'SAFE';

        const popupHtml = `
          <div style="font-family:Inter,system-ui,sans-serif;min-width:220px;max-width:280px;padding:2px">
            <div style="font-size:13px;font-weight:900;color:#0f172a;margin-bottom:6px">${w.ward_name ?? w.ward_id}</div>
            <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
              <span style="background:${colHex};color:#fff;padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:800">Grade ${w.readiness_grade}</span>
              <span style="border:1.5px solid ${colHex};color:${colHex};padding:3px 8px;border-radius:9999px;font-size:10px;font-weight:800">${riskLabel}</span>
            </div>
            <div style="background:#f8fafc;border-radius:10px;padding:8px;font-size:11px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="color:#64748b;padding:3px 0">Flood Risk</td><td style="font-weight:900;text-align:right;color:${colHex}">${(prob * 100).toFixed(1)}%</td></tr>
                <tr><td style="color:#64748b;padding:3px 0">Risk Score</td><td style="font-weight:900;text-align:right">${w.risk_score?.toFixed(1) ?? '—'}/100</td></tr>
                <tr><td style="color:#64748b;padding:3px 0">Inundation Risk</td><td style="font-weight:900;text-align:right">${w.inundation_risk_score?.toFixed(1) ?? '—'}</td></tr>
                <tr><td style="color:#64748b;padding:3px 0">Drainage Health</td><td style="font-weight:900;text-align:right">${w.drainage_health_score?.toFixed(1) ?? '—'}</td></tr>
                <tr><td style="color:#64748b;padding:3px 0">Hotspots in Ward</td><td style="font-weight:900;text-align:right">${w.hotspot_count_in_ward}</td></tr>
              </table>
            </div>
          </div>`;

        if (showWardMarkers) {
          try {
            let marker: any;
            if (isMappls) {
              marker = new mappls.Marker({
                map: map,
                position: { lat: w.lat, lng: w.lon },
                icon: {
                  url: makeSvgUrl(w.readiness_grade),
                  size: { width: 34, height: 34 },
                  anchor: { x: 17, y: 17 },
                },
                htmlPopup: popupHtml,
              });
            } else if (mapProvider === 'mapbox') {
              // Mapbox marker
              const el = document.createElement('div');
              el.className = 'ward-marker-pin';
              el.innerHTML = `<img src="${makeSvgUrl(w.readiness_grade)}" width="34" height="34" style="cursor:pointer; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1))" />`;
              
              marker = new mapboxgl.Marker({ element: el })
                .setLngLat([w.lon, w.lat])
                .setPopup(new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml))
                .addTo(map);
            } else {
              // MapTiler / MapLibre marker
              const el = document.createElement('div');
              el.className = 'ward-marker-pin';
              el.innerHTML = `<img src="${makeSvgUrl(w.readiness_grade)}" width="34" height="34" style="cursor:pointer; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1))" />`;
              
              marker = new maptilersdk.Marker({ element: el })
                .setLngLat([w.lon, w.lat])
                .setPopup(new maptilersdk.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml))
                .addTo(map);
            }
            markersRef.current.push(marker);
          } catch (e) {
            console.warn('[Map] Marker creation error', e);
          }
        }
      });

      // mGIS GeoAnalytics Polygon layer (Mappls only)
      if (isMappls && wardIdsForApi.length > 0 && typeof mappls.geoAnalytics !== 'undefined' && showWardMarkers) {
        const geoParams = {
          "AccessToken": mapplsToken, 
          "GeoBoundType": "ward_no",
          "GeoBound": wardIdsForApi,
          "Attribute": "t_p",
          "Query": ">0",
          "Style": {
              BorderColor: "3b82f6",
              BorderWidth: 1,
              FillColor: "3b82f6",
              Geometry: "polygon",
              Opacity: 0.15,
          },
          "SpatialLayer": "geoAnalyticsWard",
          "SpatialLayer1": "ward"
        };
        try {
          const tilesUrl = mappls.geoAnalytics.getWard(geoParams);
          if (tilesUrl) {
            map.addSource('mgis-ward-source', {
              'type': 'raster',
              'tiles': [tilesUrl],
              'tileSize': 256
            });
            map.addLayer({
              'id': 'mgis-ward-layer',
              'type': 'raster',
              'source': 'mgis-ward-source',
              'paint': {}
            }, map.getStyle().layers[map.getStyle().layers.length - 1].id); // insert below labels
          }
        } catch (err) {
          console.warn('[Mappls] geoAnalytics ward poly failed', err);
        }
      }

      // Fit map to all ward coords
      const validWards = wardReadiness.filter(w => w.lat && w.lon);
      if (validWards.length > 0) {
        try {
          const lats = validWards.map(w => w.lat);
          const lons = validWards.map(w => w.lon);
          const swLat = Math.min(...lats); const neLat = Math.max(...lats);
          const swLon = Math.min(...lons); const neLon = Math.max(...lons);
          
          if (isMappls && typeof mappls.geoAnalytics !== 'undefined' && wardIdsForApi.length > 0) {
            // Attempt to use mGIS getBounds
             const geoParams = {
               "AccessToken": mapplsToken,
               "GeoBoundType": "ward_no",
               "GeoBound": wardIdsForApi,
             };
             try {
                map.fitBounds(mappls.geoAnalytics.getBounds('ward', geoParams));
                return;
             } catch {}
          }
          
          map.fitBounds([[swLon, swLat], [neLon, neLat]], { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: 14 });
        } catch {
          const c = validWards[0];
          // Mappls setCenter expects lat/lon object; MapTiler/Mapbox expects [lon, lat] array
          try {
            if (isMappls) map.setCenter([c.lat, c.lon]);
            else map.setCenter([c.lon, c.lat]);
          } catch {}
          map.setZoom(12);
        }
      }
    };

    if (!mapRef.current) {
      try {
        if (mapProvider === 'mappls') {
          // Mappls expects [lat, lon] for center — note reversed from GeoJSON
          mapRef.current = new mappls.Map(wardMapContainerRef.current, {
            center: [weather?.lat ?? 20.5937, weather?.lon ?? 78.9629],
            zoom: 12,
            zoomControl: true,
            mapType: isSatellite ? "satellite" : undefined,
          });
          mapRef.current.on('load', () => { setMapReady(true); renderWards(); });
        } else if (mapProvider === 'osm') {
          // ── Free / no-key: CartoDB Dark Matter via MapLibre GL JS ──
          mapRef.current = new maplibregl.Map({
            container: wardMapContainerRef.current,
            style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            center: [weather?.lon ?? 78.9629, weather?.lat ?? 20.5937],
            zoom: 12,
          });
          mapRef.current.on('load', () => { setMapReady(true); renderWards(); });
        } else if (mapProvider === 'maptiler') {
          // Initialize MapTiler SDK — zoom 12 for tighter neighbourhood-level focus
          maptilersdk.config.apiKey = mapTilerKey;
          mapRef.current = new maptilersdk.Map({
            container: wardMapContainerRef.current,
            style: isSatellite ? maptilersdk.MapStyle.SATELLITE : maptilersdk.MapStyle.STREETS,
            center: [weather?.lon ?? 78.9629, weather?.lat ?? 20.5937],
            zoom: 12,
          });
          mapRef.current.on('load', () => { setMapReady(true); renderWards(); });
        } else if (mapProvider === 'mapbox') {
          // Initialize Mapbox SDK — zoom 12 for tighter neighbourhood focus
          mapboxgl.accessToken = mapboxToken;
          mapRef.current = new mapboxgl.Map({
            container: wardMapContainerRef.current,
            style: isSatellite ? 'mapbox://styles/mapbox/satellite-v9' : 'mapbox://styles/mapbox/streets-v11',
            center: [weather?.lon ?? 78.9629, weather?.lat ?? 20.5937],
            zoom: 12,
          });
          mapRef.current.on('load', () => { setMapReady(true); renderWards(); });
        }
      } catch (e) {
        console.error(`[Map] ${mapProvider} init error`, e);
      }
    } else {
      // Map already exists — only re-render wards if style is done loading
      if (mapRef.current?.isStyleLoaded?.()) {
        renderWards();
      } else {
        mapRef.current?.once?.('load', renderWards);
      }
    }
  }, [wardReadiness, weather?.lat, weather?.lon, showWardMarkers, mapProvider, mapTilerKey, mapboxToken]);


  // ── Auto-fetch India Ward Boundaries when location changes ─────────────────
  useEffect(() => {
    if (!weather?.lat || !weather?.lon) return;
    setIndiaWardsLoading(true);
    setIndiaWardsError('');
    fetchIndiaWardBoundaries(weather.lat, weather.lon, 15)
      .then(wards => {
        setIndiaWards(wards);
        setIndiaWardsLoading(false);
      })
      .catch(err => {
        // ESRI service may be unavailable or require auth — fail silently
        console.warn('[India Ward Boundaries]', err?.message ?? err);
        setIndiaWardsError(err?.message ?? 'Failed to load ward boundaries');
        setIndiaWardsLoading(false);
      });
  }, [weather?.lat, weather?.lon]);

  // ── India Ward Polygons overlay on MapTiler/Mapbox ──────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !indiaWards.length) return;
    const isMappls = mapProvider === 'mappls';
    const map = mapRef.current;

    // Clean up previous ward polygon layers
    ['india-wards-fill', 'india-wards-stroke', 'india-wards-label'].forEach(id => {
      try { if (map.getLayer?.(id)) map.removeLayer(id); } catch {}
    });
    ['india-wards-source'].forEach(id => {
      try { if (map.getSource?.(id)) map.removeSource(id); } catch {}
    });

    if (!showWardPolygons) return;

    if (!isMappls) {
      // Build GeoJSON FeatureCollection from India ward features
      const geojsonFeatures = indiaWards
        .filter(w => w.geometry)
        .map(w => {
          // Enrich with ML ward risk data if available
          const mlWard = wardReadiness?.find(m =>
            Math.abs(m.lat - w.lat) < 0.008 && Math.abs(m.lon - w.lon) < 0.008
          );
          const grade = mlWard?.grade ?? 'C';
          const gradeColors: Record<string, string> = {
            A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#dc2626',
          };
          const fillColor = gradeColors[grade] ?? '#eab308';
          return {
            type: 'Feature' as const,
            geometry: w.geometry,
            properties: {
              wardId:   w.wardId,
              wardName: w.wardName,
              cityName: w.cityName,
              grade,
              fillColor,
              floodProbability: mlWard?.flood_probability ?? 0,
            }
          };
        });

      try {
        map.addSource('india-wards-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: geojsonFeatures }
        });

        // Fill layer — semi-transparent risk color
        map.addLayer({
          id: 'india-wards-fill',
          type: 'fill',
          source: 'india-wards-source',
          paint: {
            'fill-color': ['get', 'fillColor'],
            'fill-opacity': 0.18,
          }
        });

        // Stroke layer
        map.addLayer({
          id: 'india-wards-stroke',
          type: 'line',
          source: 'india-wards-source',
          paint: {
            'line-color': ['get', 'fillColor'],
            'line-width': 1.5,
            'line-opacity': 0.7,
          }
        });

        // Ward name labels
        map.addLayer({
          id: 'india-wards-label',
          type: 'symbol',
          source: 'india-wards-source',
          layout: {
            'text-field': ['get', 'wardName'],
            'text-size': 9,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: {
            'text-color': '#1e293b',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          }
        });

        // Click for ward popup
        map.on('click', 'india-wards-fill', (e: any) => {
          const props = e.features[0].properties;
          const PopupClass =
            mapProvider === 'maptiler' ? maptilersdk.Popup
            : mapProvider === 'mapbox' ? mapboxgl.Popup
            : maplibregl.Popup; // 'osm' uses plain MapLibre

          new PopupClass({ maxWidth: '260px' })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family:Inter,system-ui,sans-serif;padding:4px">
                <div style="font-weight:900;font-size:12px;color:#0f172a;margin-bottom:4px">${props.wardName}</div>
                <div style="font-size:10px;color:#64748b;margin-bottom:6px">${props.cityName}</div>
                <div style="display:flex;gap:6px;align-items:center">
                  <span style="background:${props.fillColor};color:#fff;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:800">Grade ${props.grade}</span>
                  <span style="font-size:10px;color:#64748b">Flood Risk: ${(props.floodProbability * 100).toFixed(1)}%</span>
                </div>
                <div style="margin-top:4px;font-size:9px;color:#94a3b8">India Ward Boundaries · ESRI Living Atlas</div>
              </div>
            `)
            .addTo(map);
        });
        map.on('mouseenter', 'india-wards-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'india-wards-fill', () => { map.getCanvas().style.cursor = ''; });
      } catch (e) {
        console.warn('[India Wards] Layer error', e);
      }
    }
  }, [indiaWards, showWardPolygons, mapProvider, wardReadiness, mapReady]);

  // ── Getis-Ord Gi* computation whenever ward data or India ward boundaries change ─
  useEffect(() => {
    // Prefer ML ward readiness data (has actual flood_probability). Fall back to India Ward centroids.
    let features: Array<{ lat: number; lon: number; value: number }> = [];

    if (wardReadiness?.length) {
      features = wardReadiness
        .filter(w => w.lat && w.lon)
        .map(w => ({ lat: w.lat, lon: w.lon, value: w.flood_probability }));
    } else if (indiaWards.length) {
      // Use uniform value = 0.5 as placeholder when no risk data is available
      features = indiaWards.map(w => ({ lat: w.lat, lon: w.lon, value: 0.5 }));
    }

    if (!features.length) { setGiStarResults([]); return; }
    // Use ~3 km distance band (optimal for urban ward density ≈ 1–5 km²)
    const results = computeGiStar(features, 3.0);
    setGiStarResults(results);
  }, [wardReadiness, indiaWards]);



  // ── Gi* Hot Spot Overlay on Map ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !giStarResults.length || !mapRef.current) return;
    const isMappls = mapProvider === 'mappls';
    const map = mapRef.current;

    // ── Clean up previous Gi* layers ──
    mapplsCirclesRef.current.forEach(c => { try { c.remove(); } catch { try { c.setMap(null); } catch {} } });
    mapplsCirclesRef.current = [];
    ['gi-star-glow-layer', 'gi-star-layer', 'gi-star-nonsig-layer'].forEach(id => {
      try { if (map.getLayer?.(id)) map.removeLayer(id); } catch {}
    });
    ['gi-star-source'].forEach(id => {
      try { if (map.getSource?.(id)) map.removeSource(id); } catch {}
    });

    if (!showHotspotZones) return;

    const makeGiPopup = (f: GiStarFeature) => `
      <div style="font-family:Inter,system-ui,sans-serif;min-width:200px;padding:2px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <div style="width:14px;height:14px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
          <span style="font-size:11px;font-weight:900;color:#0f172a">${f.label}</span>
        </div>
        <table style="font-size:10px;width:100%;border-collapse:collapse">
          <tr><td style="color:#64748b;padding:2px 0">Flood Probability</td><td style="font-weight:900;text-align:right;color:${f.color}">${(f.value * 100).toFixed(1)}%</td></tr>
          <tr><td style="color:#64748b;padding:2px 0">Gi* Z-Score</td><td style="font-weight:900;text-align:right">${f.zScore.toFixed(3)}</td></tr>
          <tr><td style="color:#64748b;padding:2px 0">Confidence Bin</td><td style="font-weight:900;text-align:right">${f.confidenceBin > 0 ? '+' : ''}${f.confidenceBin}</td></tr>
          <tr><td style="color:#64748b;padding:2px 0">Spatial Cluster</td><td style="font-weight:900;text-align:right">${f.confidenceBin > 0 ? '🔴 Hot Spot' : f.confidenceBin < 0 ? '🔵 Cold Spot' : '⬜ Not Significant'}</td></tr>
        </table>
        <div style="margin-top:6px;font-size:9px;color:#94a3b8">Getis-Ord Gi* · 3km distance band</div>
      </div>`;

    if (isMappls) {
      // ── Mappls: draw circles per Gi* feature ──
      giStarResults.forEach(f => {
        if (f.confidenceBin === 0) return; // skip beige / not significant
        try {
          const circle = new mappls.Circle({
            map,
            center: { lat: f.lat, lng: f.lon },
            radius: 600 + Math.abs(f.confidenceBin) * 150,
            fillColor: f.color,
            fillOpacity: 0.35 + Math.abs(f.confidenceBin) * 0.1,
            strokeColor: f.color,
            strokeOpacity: 0.9,
            strokeWidth: 2,
            htmlPopup: makeGiPopup(f),
          });
          mapplsCirclesRef.current.push(circle);
        } catch (e) { console.warn('[Mappls][Gi*] Circle error', e); }
      });

      // Draw not-significant features as faint beige circles
      giStarResults.filter(f => f.confidenceBin === 0).forEach(f => {
        try {
          const circle = new mappls.Circle({
            map,
            center: { lat: f.lat, lng: f.lon },
            radius: 400,
            fillColor: '#d4c5a9',
            fillOpacity: 0.15,
            strokeColor: '#d4c5a9',
            strokeOpacity: 0.3,
            strokeWidth: 1,
          });
          mapplsCirclesRef.current.push(circle);
        } catch {}
      });
    } else {
      // ── MapTiler/Mapbox: GeoJSON neon glow circle layers ──
      // Each significant feature gets: a large blurred glow ring + a sharp core circle
      const toGeoFeature = (f: GiStarFeature) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] },
        properties: {
          color: f.color,
          // Core radius: 16px (bin±1) → 28px (bin±3)
          radius:      f.confidenceBin !== 0 ? 16 + Math.abs(f.confidenceBin) * 6 : 5,
          // Glow radius: 2× core
          glowRadius:  f.confidenceBin !== 0 ? (16 + Math.abs(f.confidenceBin) * 6) * 2.5 : 8,
          coreOpacity: f.confidenceBin !== 0 ? 0.75 : 0.04,
          glowOpacity: f.confidenceBin !== 0 ? 0.18 + Math.abs(f.confidenceBin) * 0.05 : 0.01,
          strokeOpacity: f.confidenceBin !== 0 ? 1.0 : 0.0,
          popup: makeGiPopup(f),
        }
      });

      const allFeatures = giStarResults.map(toGeoFeature);

      map.addSource('gi-star-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: allFeatures }
      });

      // ── Bloom glow layer (large, very transparent soft ring) ──
      map.addLayer({
        id: 'gi-star-glow-layer',
        type: 'circle',
        source: 'gi-star-source',
        paint: {
          'circle-radius': ['get', 'glowRadius'],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'glowOpacity'],
          'circle-stroke-width': 0,
          'circle-blur': 0.6,   // soft blur for bloom look
        }
      });

      // ── Core neon circle (sharp, bright) ──
      map.addLayer({
        id: 'gi-star-layer',
        type: 'circle',
        source: 'gi-star-source',
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'coreOpacity'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': ['get', 'strokeOpacity'],
          'circle-blur': 0,
        }
      });

      // Interactive popup on click
      map.on('click', 'gi-star-layer', (e: any) => {
        const PopupClass =
          mapProvider === 'maptiler' ? maptilersdk.Popup
          : mapProvider === 'mapbox' ? mapboxgl.Popup
          : maplibregl.Popup;  // 'osm' also uses MapLibre
        new PopupClass({ maxWidth: '280px' })
          .setLngLat(e.lngLat)
          .setHTML(e.features[0].properties.popup)
          .addTo(map);
      });
      map.on('mouseenter', 'gi-star-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'gi-star-layer', () => { map.getCanvas().style.cursor = ''; });
    }
  }, [giStarResults, showHotspotZones, mapProvider, mapReady]);

  // ── Heatmap layer based on Gi* significant hot spots ───────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const isMappls = mapProvider === 'mappls';

    const map = mapRef.current;

    // Cleanup
    if (mapplsHeatmapRef.current) { try { mapplsHeatmapRef.current.remove(); } catch {} mapplsHeatmapRef.current = null; }
    try { if (map.getLayer?.('flood-heatmap-layer')) map.removeLayer('flood-heatmap-layer'); } catch {}
    try { if (map.getSource?.('flood-heatmap-source')) map.removeSource('flood-heatmap-source'); } catch {}

    if (!showHeatmap || !giStarResults.length) return;

    // Only include features in the heatmap that are statistically significant hot spots (bin > 0)
    const hotFeatures = giStarResults.filter(f => f.confidenceBin > 0);
    if (!hotFeatures.length) return;

    if (isMappls) {
      const pts = hotFeatures.map(f => ({ lat: f.lat, lng: f.lon, weight: Math.abs(f.zScore) / 3 }));
      try {
        mapplsHeatmapRef.current = new mappls.HeatmapLayer({
          map,
          data: pts,
          gradient: ['rgba(59,130,246,0)', 'rgba(59,130,246,0.6)', 'rgba(234,179,8,0.8)', 'rgba(249,115,22,1)', 'rgba(215,25,28,1)', 'rgba(127,0,0,1)'],
          radius: 35,
          opacity: 0.75,
          fitbounds: false,
        });
      } catch (e) { console.warn('[Mappls][Gi*] HeatmapLayer error', e); }
    } else {
      map.addSource('flood-heatmap-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: hotFeatures.map(f => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
            properties: { weight: Math.min(Math.abs(f.zScore) / 3, 1) }  // normalise z to 0–1
          }))
        }
      });
      map.addLayer({
        id: 'flood-heatmap-layer',
        type: 'heatmap',
        source: 'flood-heatmap-source',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 4],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(59,130,246,0)',
            0.2, 'rgba(59,130,246,0.6)',
            0.4, 'rgba(234,179,8,0.8)',
            0.6, 'rgba(249,115,22,1)',
            0.8, 'rgba(215,25,28,1)',
            1,   'rgba(127,0,0,1)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 30, 14, 70],
          'heatmap-opacity': 0.72,
        }
      });
    }
  }, [giStarResults, showHeatmap, mapProvider, mapReady]);

  // ── Reset mapReady when provider changes (map is re-created) ─────────────────
  useEffect(() => {
    setMapReady(false);
  }, [mapProvider]);






  // ── Map type toggle (Satellite vs Standard) ─────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    try {
      if (mapProvider === 'mappls') {
        map.setMapFeature({ mapType: isSatellite ? "satellite" : "standard" });
      } else if (mapProvider === 'osm') {
        // CartoDB: Positron (light) ↔ Dark Matter
        map.setStyle(
          isSatellite
            ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
            : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        );
        // Re-render overlays after style change
        map.once('styledata', () => setMapReady(true));
      } else if (mapProvider === 'maptiler') {
        setMapReady(false);
        map.setStyle(isSatellite ? maptilersdk.MapStyle.SATELLITE : maptilersdk.MapStyle.STREETS);
        map.once('load', () => setMapReady(true));
      } else {
        // Mapbox
        setMapReady(false);
        map.setStyle(isSatellite ? 'mapbox://styles/mapbox/satellite-v9' : 'mapbox://styles/mapbox/streets-v11');
        map.once('load', () => setMapReady(true));
      }
    } catch (e) {
      console.warn(`[Map] ${mapProvider} style toggle error`, e);
    }
  }, [isSatellite, mapProvider]);


  // ── Cleanup Mappls map when component unmounts ───────────────────────────
  useEffect(() => {
    return () => {
      if (mapplsMapRef.current) {
        try { mapplsMapRef.current.remove(); } catch {}
        mapplsMapRef.current = null;
      }
    };
  }, []);

  const refreshMlStatus = useCallback(async (): Promise<MLTrainingStatus | null> => {
    if (!mlApiUrl) return null;
    try {
      const status = await fetchMLStatus(mlApiUrl);
      setMlStatus(status);
      setFlood({ mlStatus: status });
      return status;
    } catch {
      return null;
    }
  }, [mlApiUrl, setFlood]);

  const startStatusPolling = useCallback((opts?: { maxMs?: number; baseIntervalMs?: number }) => {
    const maxMs = opts?.maxMs ?? 10 * 60 * 1000;
    const baseIntervalMs = opts?.baseIntervalMs ?? 5000;

    stopStatusPolling();
    const startTs = Date.now();

    const tick = async () => {
      const status = await refreshMlStatus();
      const st = status?.status;

      // Update the existing retrain message when a run finishes.
      if (lastRetrainStartRef.current != null && (st === 'completed' || st === 'failed')) {
        setRetrainMsg(`${st === 'completed' ? '✅' : '❌'} ${status?.message ?? (st === 'completed' ? 'Training complete' : 'Training failed')}`);
        lastRetrainStartRef.current = null;
      }

      const stillInProgress = st === 'queued' || st === 'running';
      if (stillInProgress && Date.now() - startTs < maxMs) {
        statusPollTimeoutRef.current = setTimeout(tick, baseIntervalMs);
      } else {
        stopStatusPolling();
      }
    };

    // Fast first refresh, then normal cadence.
    statusPollTimeoutRef.current = setTimeout(tick, 350);
  }, [refreshMlStatus, stopStatusPolling]);

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const [riskScore,      setRiskScore]      = useState<FloodRiskScore | null>(null);
  const [seasonCtx,      setSeasonCtx]      = useState<SeasonalContext | null>(null);
  const [histStats,      setHistStats]      = useState<HistoricalStats | null>(null);
  const [trend,          setTrend]          = useState<TrendResult | null>(null);
  const [todayIdx,       setTodayIdx]       = useState(0);
  const [chartData,      setChartData]      = useState<FloodDataPoint[]>([]);
  const [todayChartIdx,  setTodayChartIdx]  = useState(0);

  // ── Forecast view mode (daily vs derived monthly) ─────────────────────────
  const [forecastView, setForecastView] = useState<'daily' | 'monthly'>('daily');
  const [forecastWindowDays, setForecastWindowDays] = useState<number>(30); // Default 30 days

  // Prevent duplicate auto-fetch in React strict mode
  const didAutoFetchRef = useRef(false);

  // Save ML API URL to localStorage whenever it changes
  const saveMlApiUrl = useCallback(() => {
    let trimmed = mlApiUrlInput.trim().replace(/\/$/, '');
    // Auto-add protocol so the saved value is canonical
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      const isLocal = /^(localhost|127\.|0\.0\.0\.)/.test(trimmed);
      trimmed = `${isLocal ? 'http' : 'https'}://${trimmed}`;
    }
    setMlApiUrl(trimmed);
    setMlApiUrlInput(trimmed);
    localStorage.setItem('floodMlApiUrl', trimmed);
    setShowApiConfig(false);
  }, [mlApiUrlInput]);

  // ── Compute derived metrics when rawData changes ────────────────────────────
  useEffect(() => {
    if (rawData.length === 0 || !weather?.lat) return;

    const idx = findTodayIndex(rawData);
    setTodayIdx(idx);

    const month = new Date().getMonth() + 1; // 1-based
    const sc    = getSeasonalContext(month, weather.lat);
    setSeasonCtx(sc);

    const historical = rawData.slice(0, idx + 1);
    const stats      = computeHistoricalStats(historical);
    setHistStats(stats);

    setRiskScore(computeFloodRisk(rawData, idx, sc));
    setTrend(computeTrend(historical, stats.p50));

    // Chart window: 60 past days + dynamic forecast days
    const pastStart    = Math.max(0, idx - 59);
    const chartPast    = rawData.slice(pastStart, idx + 1);
    const chartFuture  = rawData.slice(idx + 1, idx + 1 + forecastWindowDays);
    setChartData([...chartPast, ...chartFuture]);
    setTodayChartIdx(chartPast.length - 1);
  }, [rawData, weather?.lat, forecastWindowDays]);

  // ── Fetch GloFAS data ────────────────────────────────────────────────────────
  const handleFetch = useCallback(async () => {
    if (!weather?.lat || !weather?.lon) return;
    setLoading(true);
    setError('');
    setAnalysis('');
    setMlPrediction(null);

    try {
      const result = await fetchFloodData(weather.lat, weather.lon, 92, 183);
      setRawData(result.data);
      setFlood({ rawData: result.data, lastLocation: weather.city ?? '', lastFetched: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch flood data.');
    } finally {
      setLoading(false);
    }
  }, [setFlood, weather?.city, weather?.lat, weather?.lon]);

  // Auto-fetch on entry so the discharge chart is visible by default
  useEffect(() => {
    if (didAutoFetchRef.current) return;
    if (!weather?.lat || !weather?.lon) return;
    if (rawData.length > 0) {
      didAutoFetchRef.current = true;
      return;
    }
    didAutoFetchRef.current = true;
    handleFetch();
  }, [handleFetch, rawData.length, weather?.lat, weather?.lon]);

  // Fetch model status once on entry / when ML API URL changes.
  useEffect(() => {
    if (!mlApiUrl) return;
    refreshMlStatus().then((status) => {
      const st = status?.status;
      if (st === 'queued' || st === 'running') startStatusPolling();
    });
  }, [mlApiUrl, refreshMlStatus, startStatusPolling]);

  // ── ML real-time prediction ──────────────────────────────────────────────────
  const handleMLPredict = async () => {
    if (!weather?.lat || !weather?.lon || !mlApiUrl) return;
    setMlLoading(true);
    setMlError('');
    setMlPrediction(null);

    try {
      // Also fetch ML model status (accuracy, feature importances, etc.)
      const [pred, status] = await Promise.all([
        fetchMLPrediction(
          mlApiUrl,
          weather.lat,
          weather.lon,
          {
            temp: weather.temp,
            precipitation: weather.precipitationSum,
            humidity: weather.humidity,
            pressure: weather.pressure,
          },
          rawData.length > 0 && todayIdx >= 0
            ? (rawData[todayIdx]?.river_discharge ?? rawData[todayIdx]?.river_discharge_mean ?? null)
            : null,
          histStats?.p50 ?? 0,
        ),
        fetchMLStatus(mlApiUrl).catch(() => null),
      ]);
      setMlPrediction(pred);
      if (status) setMlStatus(status);
      setFlood({ mlPrediction: pred, mlStatus: status ?? floodCache.mlStatus });
    } catch (err) {
      setMlError(err instanceof Error ? err.message : 'ML API unreachable. Check the API URL in settings.');
    } finally {
      setMlLoading(false);
    }
  };

  // ── Retrain ML model ─────────────────────────────────────────────────────────
  const handleRetrain = async () => {
    if (!weather?.lat || !weather?.lon || !mlApiUrl) return;
    setRetraining(true);
    setRetrainMsg('');
    try {
      const res = await triggerMLRetrain(mlApiUrl, weather.lat, weather.lon, 20, 10);
      setRetrainMsg(`✅ ${res.message ?? 'Retrain queued. Check status in ~5 min.'}`);

      // Immediately reflect queued state and keep polling until completion.
      lastRetrainStartRef.current = Date.now();
      setMlStatus(prev => ({
        status: 'queued',
        message: res.message ?? 'Training queued',
        trained: prev?.trained ?? false,
        accuracy: prev?.accuracy,
        f1_score: prev?.f1_score,
        roc_auc: prev?.roc_auc,
        last_trained: prev?.last_trained,
        training_samples: prev?.training_samples,
        hotspots_mapped: prev?.hotspots_mapped,
        feature_importances: prev?.feature_importances,
      } as MLTrainingStatus));
      startStatusPolling();
    } catch (err) {
      setRetrainMsg(`❌ ${err instanceof Error ? err.message : 'Retrain failed'}`);
    } finally {
      setRetraining(false);
    }
  };

  const handleLoadWards = async () => {
    if (!weather?.lat || !weather?.lon || !mlApiUrl) return;
    setWardsLoading(true);
    setWardsError('');
    try {
      const wards = await fetchWardReadiness(mlApiUrl, weather.lat, weather.lon, 15);
      // Show raw wards immediately, then enrich with Nominatim geo-names
      setWardReadiness(wards);
      setWardsLoading(false);

      // Async geocoding enrichment — updates wards in-place with real area names
      if (wards.length > 0 && wards.length <= 20) {
        setGeocoding(true);
        setGeocodingProgress(0);
        const enriched: WardReadinessItem[] = [];
        for (let i = 0; i < wards.length; i++) {
          const w = wards[i];
          const needsGeocode = !w.ward_name ||
            w.ward_name.startsWith('ward_') ||
            /^[0-9a-f-]{8,}$/i.test(w.ward_name);
          if (needsGeocode) {
            try {
              const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${w.lat}&lon=${w.lon}&format=json&zoom=14&addressdetails=1`,
                { headers: { 'Accept-Language': 'en', 'User-Agent': 'Bio-SentinelX/1.0' } }
              );
              if (res.ok) {
                const json = await res.json();
                const a = json.address ?? {};
                const name = a.neighbourhood || a.suburb || a.city_district || a.quarter ||
                             a.district || a.county || a.village || a.town || null;
                enriched.push({ ...w, ward_name: name ?? w.ward_name ?? w.ward_id });
              } else { enriched.push(w); }
            } catch { enriched.push(w); }
            if (i < wards.length - 1) await new Promise(r => setTimeout(r, 1100));
          } else {
            enriched.push(w);
          }
          setGeocodingProgress(Math.round(((i + 1) / wards.length) * 100));
          setWardReadiness([...enriched, ...wards.slice(i + 1).map(x => enriched.find(e => e.ward_id === x.ward_id) ?? x)]);
        }
        setWardReadiness(enriched);
        setGeocoding(false);
      }
    } catch (err) {
      setWardReadiness(null);
      setWardsError(err instanceof Error ? err.message : 'Failed to load ward readiness.');
      setWardsLoading(false);
    }
  };

  const handleLoadHotspots = async () => {
    if (!weather?.lat || !weather?.lon || !mlApiUrl) return;
    setHotspotsLoading(true);
    setHotspotsError('');
    try {
      const res = await fetchHotspots(mlApiUrl, weather.lat, weather.lon, {
        radiusKm: 15,      // Wider scan area
        gridSizeKm: 2.5,   // Coarser grid → fewer, more meaningful hotspots
        minRisk: 0.65,     // Only fetch genuinely high-risk cells
      });
      // Sort by flood_probability descending and cap at top 25 hotspots for readability
      const sorted = [...(res.hotspots ?? [])].sort((a, b) => b.flood_probability - a.flood_probability).slice(0, 25);
      setHotspots({ ...res, hotspots: sorted });
    } catch (err) {
      setHotspots(null);
      setHotspotsError(err instanceof Error ? err.message : 'Failed to load hotspots.');
    } finally {
      setHotspotsLoading(false);
    }
  };

  // ── AI Analysis ─────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (rawData.length === 0 || !riskScore || !histStats || !seasonCtx || !weather) return;
    setAnalyzing(true);
    setAnalysis('');
    setAnalysisPhase('Connecting to GloFAS v4 hydrological database...');

    const historical = rawData.slice(0, todayIdx + 1);
    const forecast   = rawData.slice(todayIdx + 1);

    const fcMedians = forecast
      .map(d => d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge ?? 0)
      .filter(v => v > 0);
    const peakMedian    = fcMedians.length > 0 ? Math.max(...fcMedians) : 0;
    const peakMedianDate = fcMedians.length > 0
      ? (forecast[fcMedians.indexOf(Math.max(...fcMedians))]?.date ?? 'N/A')
      : 'N/A';
    const fcMean = fcMedians.length > 0
      ? fcMedians.reduce((a, b) => a + b, 0) / fcMedians.length : 0;
    const p75Exceeded = forecast.filter(
      d => (d.river_discharge_median ?? 0) > histStats.p75
    ).length;

    // Near-term precipitation forecast (Open-Meteo daily forecast is max 16 days)
    const precipForecast = (weather.dailyForecast ?? [])
      .map(d => {
        const dateIso = new Date(d.dt * 1000).toISOString().slice(0, 10);
        const mm = typeof d.precipitationSum === 'number' ? d.precipitationSum : null;
        const pop = typeof d.pop === 'number' ? d.pop : null;
        return { date: dateIso, precipitationSumMm: mm, popPct: pop };
      })
      .filter(x => x.date);

    const precipNext7 = precipForecast.slice(0, 7).map(p => p.precipitationSumMm ?? 0);
    const precip7dTotal = precipNext7.length ? precipNext7.reduce((a, b) => a + b, 0) : null;
    const precipMaxDayMm = precipForecast.length
      ? Math.max(...precipForecast.map(p => p.precipitationSumMm ?? 0))
      : null;
    const precipMaxDayDate = precipForecast.length
      ? (precipForecast.reduce((best, cur) => ((cur.precipitationSumMm ?? 0) > (best.precipitationSumMm ?? 0) ? cur : best), precipForecast[0]).date)
      : null;

    // Decide how much detail to send to AI based on near-future conditions
    const dischargePeakOk = peakMedian <= (histStats.p75 || 0) * 1.05;
    const precipOk = (precipMaxDayMm ?? 0) <= 5 && (precip7dTotal ?? 0) <= 15;
    const ensembleOk = p75Exceeded <= 1;
    const detailLevel: 'compact' | 'full' = (dischargePeakOk && precipOk && ensembleOk) ? 'compact' : 'full';

    const dischargeForecastDaily = rawData
      .slice(todayIdx + 1, todayIdx + 31)
      .map(d => ({
        date: d.date,
        dischargeMedian: d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge ?? null,
        dischargeP75: d.river_discharge_p75 ?? null,
        dischargeMax: d.river_discharge_max ?? null,
      }));

    const monthlyForecast = toMonthlyFloodSeries(rawData, { startIndex: Math.max(0, todayIdx + 1) })
      .slice(0, 8)
      .map((m: MonthlyFloodPoint) => ({
        month: m.month,
        dischargeMedianMean: m.discharge_median_mean,
        dischargeMedianMax: m.discharge_median_max,
        days: m.days,
      }));

    const today = historical[historical.length - 1];
    const todayDischarge = today
      ? fmt(today.river_discharge ?? today.river_discharge_mean)
      : null;

    const input: FloodAnalysisInput = {
      detailLevel,
      locationName:          weather.city,
      lat:                   weather.lat,
      lon:                   weather.lon,
      pastDays:              92,
      forecastDays:          183,
      histAvgDischarge:      fmt(histStats.mean),
      histMaxDischarge:      fmt(histStats.max),
      histMinDischarge:      fmt(histStats.min),
      histP50:               fmt(histStats.p50),
      histP75:               fmt(histStats.p75),
      histP90:               fmt(histStats.p90),
      forecastPeakMedian:    fmt(peakMedian),
      forecastPeakDate:      peakMedianDate,
      forecastMeanDischarge: fmt(fcMean),
      seasonLabel:           seasonCtx.seasonLabel,
      isFloodSeason:         seasonCtx.isFloodSeason,
      seasonNote:            seasonCtx.note,
      riskLevel:             riskScore.level,
      riskScore:             riskScore.score,
      todayDischarge,
      recentTrend:           trend?.direction ?? 'STABLE',
      trendWithinNorm:       trend?.withinNorm ?? true,
      p75Exceedance:         p75Exceeded.toString(),
      currentWeather: {
        temp:          weather.temp,
        precipitation: weather.precipitationSum,
        humidity:      weather.humidity,
        description:   weather.description,
      },
      futureWeather: {
        days: precipForecast.length,
        precipitation7dTotalMm: precip7dTotal,
        precipitationMaxDayMm: precipMaxDayMm,
        precipitationMaxDayDate: precipMaxDayDate,
        // Only include the full daily list when conditions look unstable
        precipitationDailyMm: detailLevel === 'full' ? precipForecast : undefined,
      },
      forecastDischargeDaily: detailLevel === 'full' ? dischargeForecastDaily : undefined,
      forecastDischargeMonthly: monthlyForecast,
      futurePrediction: {
        windows: [future7d, future30d, future6mo]
          .filter((x): x is FuturePredictionWindow => !!x)
          .map(w => ({
            label: w.label,
            mostLikelyMean: w.mostLikelyMean,
            bestCaseLow: w.bestCaseLow,
            worstCaseHigh: w.worstCaseHigh,
            daysMedianExceedsHistP75: w.daysMedianExceedsHistP75,
            daysEnsembleP75ExceedsHistP75: w.daysEnsembleP75ExceedsHistP75,
            precipTotalMm: w.precipTotalMm,
          })),
      },
      // Inject ML prediction + model stats if available
      mlPrediction: mlPrediction ?? undefined,
      mlModelStats: mlStatus ? {
        accuracy:           mlStatus.accuracy,
        f1_score:           mlStatus.f1_score,
        roc_auc:            mlStatus.roc_auc,
        training_samples:   mlStatus.training_samples,
        feature_importances: mlStatus.feature_importances,
      } : undefined,
    };

    const phases = mlPrediction ? [
      'Ingesting GloFAS v4 river discharge model output...',
      'Processing Bio-SentinelX ML ensemble prediction...',
      'Correlating upstream catchment precipitation patterns...',
      'Applying multi-model consensus analysis...',
      'Synthesising flood risk prediction and recommendations...',
    ] : [
      'Ingesting GloFAS v4 river discharge model output...',
      'Correlating upstream catchment precipitation patterns...',
      'Applying ensemble uncertainty analysis (P25–P75 spread)...',
      'Cross-referencing regional flood frequency statistics...',
      'Synthesising flood risk prediction and recommendations...',
    ];
    phases.forEach((phase, i) => setTimeout(() => setAnalysisPhase(phase), i * 2200));

    try {
      const result = await analyzeFloodRisk(input, aiProvider, aiModel, aiKey);
      setAnalysis(result);
      setAnalysisPhase('');
      setFlood({ analysis: result });
    } catch (err) {
      setAnalysisPhase('');
      setError(err instanceof Error ? err.message : 'Failed to generate flood analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Trend icon (no panic colouring for normal seasonal rises) ───────────────
  const TrendIcon = trend?.direction === 'INCREASING'
    ? <TrendingUp  className={`w-4 h-4 ${trend.withinNorm ? 'text-slate-500' : 'text-amber-500'}`} />
    : trend?.direction === 'DECREASING'
    ? <TrendingDown className="w-4 h-4 text-green-500" />
    : <Minus        className="w-4 h-4 text-slate-400" />;

  const trendBg   = trend?.direction === 'INCREASING' && !trend.withinNorm ? 'bg-amber-50 dark:bg-amber-900/30'  :
                    trend?.direction === 'DECREASING' ? 'bg-green-50 dark:bg-green-900/30' : 'bg-slate-50 dark:bg-slate-700/60';
  const trendText = trend?.direction === 'INCREASING' && !trend.withinNorm ? 'text-amber-700 dark:text-amber-300' :
                    trend?.direction === 'DECREASING' ? 'text-green-700 dark:text-green-300' : 'text-slate-500 dark:text-slate-400';

  // ── Forecast peak (use median, not ensemble max) ────────────────────────────
  const forecastPeakMedian = rawData.length > 0 && todayIdx >= 0
    ? Math.max(0, ...rawData.slice(todayIdx + 1)
        .map(d => d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge ?? 0)
        .filter(v => v > 0))
    : 0;

  // ── Today reference-line date ───────────────────────────────────────────────
  const todayRefDate = chartData[todayChartIdx]?.date ?? null;

  const monthlySeries = rawData.length
    ? toMonthlyFloodSeries(rawData, { startIndex: Math.max(0, todayIdx + 1) })
    : [];

  const dailyPrecipSeries = (weather?.dailyForecast ?? [])
    .map(d => ({
      date: new Date(d.dt * 1000).toISOString().slice(0, 10),
      precipitationSum: typeof d.precipitationSum === 'number' ? d.precipitationSum : 0,
    }))
    .slice(0, 16);

  const buildFutureWindow = (label: string, windowDays: number): FuturePredictionWindow => {
    const start = Math.max(0, todayIdx + 1);
    const end = Math.min(rawData.length, start + windowDays);
    const slice = rawData.slice(start, end);

    const medians = slice
      .map(d => d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const lows = slice
      .map(d => d.river_discharge_min ?? d.river_discharge_p25 ?? d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const highs = slice
      .map(d => d.river_discharge_max ?? d.river_discharge_p75 ?? d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));

    const histP75 = histStats?.p75 ?? 0;
    const daysMedianExceedsHistP75 = slice.filter(d => {
      const v = d.river_discharge_median ?? d.river_discharge_mean ?? d.river_discharge;
      return typeof v === 'number' && v > histP75;
    }).length;
    const daysEnsembleP75ExceedsHistP75 = slice.filter(d => {
      const v = d.river_discharge_p75;
      return typeof v === 'number' && v > histP75;
    }).length;

    const precipTotalMm = dailyPrecipSeries.slice(0, Math.min(windowDays, dailyPrecipSeries.length))
      .reduce((a, b) => a + (b.precipitationSum ?? 0), 0);

    return {
      label,
      mostLikelyMean: mean(medians),
      bestCaseLow: min(lows),
      worstCaseHigh: max(highs),
      days: slice.length,
      daysMedianExceedsHistP75,
      daysEnsembleP75ExceedsHistP75,
      precipTotalMm: windowDays <= dailyPrecipSeries.length ? precipTotalMm : null,
    };
  };

  const future7d = rawData.length && histStats ? buildFutureWindow('7-day', 7) : null;
  const future30d = rawData.length && histStats ? buildFutureWindow('30-day', 30) : null;
  const future6mo = rawData.length && histStats ? buildFutureWindow('6-month', 183) : null;

  // ── No weather loaded ───────────────────────────────────────────────────────
  if (!weather?.lat) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-slate-500 dark:text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
              <Waves className="w-7 h-7 text-blue-500" /> Flood Prediction
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              GloFAS v4 River Discharge · AI Flood Risk Intelligence · Open-Meteo Flood API
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 flex items-start gap-4">
          <Info className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-slate-800 dark:text-slate-100 mb-1">No location loaded</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Search for a location using the sidebar first, then return here to view river discharge data and flood risk for your location.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-slate-500 dark:text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <Waves className="w-7 h-7 text-blue-500" /> Flood Prediction
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            GloFAS v4 River Discharge · AI Flood Risk Intelligence · Open-Meteo Flood API
          </p>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
            River discharge graph + current discharge summary for your selected location.
          </p>
        </div>
      </div>

      {/* ── Flood overview (shown by default) ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`${riskScore ? `${riskScore.bgColor} border ${riskScore.borderColor}` : 'bg-slate-50 dark:bg-slate-700/60 border border-slate-100 dark:border-slate-600'} p-5 rounded-[1.5rem]`}>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-slate-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Level</span>
            </div>
            <p className={`text-lg font-black ${riskScore ? riskScore.textColor : 'text-slate-600 dark:text-slate-200'}`}>{riskScore?.level ?? '—'}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Percentile-based monitoring score</p>
          </div>

          <div className={`${trendBg} dark:bg-slate-700/60 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-600`}>
            <div className="flex items-center gap-2 mb-2">
              {TrendIcon}
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">7-Day Trend</span>
            </div>
            <p className={`text-sm font-black ${trendText}`}>
              {trend ? (trend.direction === 'INCREASING' ? 'Increasing' : trend.direction === 'DECREASING' ? 'Decreasing' : 'Stable') : '—'}
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Short-term change vs prior week</p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/30 p-5 rounded-[1.5rem] border border-blue-100 dark:border-blue-700">
            <div className="flex items-center gap-2 mb-2">
              <Waves className="w-5 h-5 text-blue-400" />
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Current Discharge</span>
            </div>
            <p className="text-lg font-black text-blue-700 dark:text-blue-300">
              {rawData.length > 0 ? `${fmt(rawData[todayIdx]?.river_discharge ?? rawData[todayIdx]?.river_discharge_mean)} m³/s` : '—'}
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Today’s observed river flow</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700/60 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-600">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-slate-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forecast Peak</span>
            </div>
            <p className="text-lg font-black text-slate-700 dark:text-slate-200">
              {rawData.length > 0 ? `${fmt(forecastPeakMedian)} m³/s` : '—'}
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Most-likely median peak</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
          <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Waves className="w-4 h-4 text-blue-500" /> River Discharge Graph (m³/s)
          </h3>
          <p className="text-[10px] text-slate-400 font-bold mb-6">
            Observed vs forecast (median/mean) with today marker.
          </p>

          {chartData.length === 0 ? (
            <div className="h-96 w-full flex items-center justify-center rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-300 text-xs font-bold">
                {loading ? <Activity className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
                {loading ? 'Loading discharge data…' : 'No discharge data yet. It will load automatically, or use Fetch below.'}
              </div>
            </div>
          ) : (
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="envelopeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={v => new Date(v + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                    tickLine={false}
                    axisLine={false}
                    unit=" m³/s"
                    width={70}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={labelFmt}
                    formatter={(v: number, name: string) => [`${v?.toFixed(2)} m³/s`, name]}
                  />
                  <Legend />

                  {histStats && (
                    <>
                      <ReferenceLine
                        y={histStats.p75}
                        stroke="#eab308"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                        label={{ value: 'P75', position: 'insideTopRight', fontSize: 9, fill: '#ca8a04', fontWeight: 700 }}
                      />
                      <ReferenceLine
                        y={histStats.p90}
                        stroke="#f97316"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                        label={{ value: 'P90', position: 'insideTopRight', fontSize: 9, fill: '#ea580c', fontWeight: 700 }}
                      />
                    </>
                  )}

                  {todayRefDate && (
                    <ReferenceLine
                      x={todayRefDate}
                      stroke="#64748b"
                      strokeDasharray="6 3"
                      strokeWidth={2}
                      label={{ value: 'Today', position: 'top', fontSize: 10, fill: '#475569', fontWeight: 700 }}
                    />
                  )}

                  <Area type="monotone" dataKey="river_discharge_p75" stroke="none" fill="url(#envelopeGrad)" dot={false} name="P75 Band" connectNulls />
                  <Area type="monotone" dataKey="river_discharge_p25" stroke="none" fill="#ffffff" dot={false} name="P25 Band" connectNulls />
                  <Area type="monotone" dataKey="river_discharge" stroke="#3b82f6" strokeWidth={2.5} fill="url(#histGrad)" dot={false} name="Observed Discharge" connectNulls />
                  <Line type="monotone" dataKey="river_discharge_median" stroke="#8b5cf6" strokeWidth={2.5} dot={false} name="Forecast Median" connectNulls />
                  <Area type="monotone" dataKey="river_discharge_mean" stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 3" fill="url(#forecastGrad)" dot={false} name="Forecast Mean" connectNulls />
                  <Line type="monotone" dataKey="river_discharge_max" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="Ensemble Max" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Data source panel ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Location</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{weather.city}</p>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              {weather.lat.toFixed(4)}° N &nbsp;·&nbsp; {weather.lon.toFixed(4)}° E
            </p>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
              Fetch discharge data, then optionally run ML prediction.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-[10px] font-bold text-blue-700 uppercase tracking-widest">
              GloFAS v4 · 92 past days + 183-day forecast · 0.05° (~5 km) resolution
            </div>
            <button
              onClick={() => setShowApiConfig(v => !v)}
              className="p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest"
              title="Configure ML API"
            >
              <Settings className="w-4 h-4" />
              ML API
              {showApiConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* ── Weather snapshot (requested metrics) ─────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {([
            { label: 'Humidity',     value: `${Math.round(weather.humidity)} %`, sub: 'Relative humidity' },
            { label: 'Rain Chance',  value: `${Math.round(weather.pop ?? 0)} %`, sub: 'POP (prob. of precip)' },
            { label: 'Wind Speed',   value: `${fmt(weather.windSpeed, 1)} km/h${windDir16(weather.windDeg) ? ` ${windDir16(weather.windDeg)}` : ''}`, sub: 'Sustained wind' },
            { label: 'Pressure',     value: `${fmt(weather.pressure, 1)} hPa`, sub: 'Barometric' },
            { label: 'Visibility',   value: `${weather.visibility != null ? (weather.visibility / 1000).toFixed(1) : 'N/A'} km`, sub: 'Line-of-sight' },
            { label: 'Dew Point',    value: `${weather.dewPoint != null ? Math.round(weather.dewPoint) : 'N/A'} °`, sub: 'Comfort index' },
            { label: 'Wind Gusts',   value: `${weather.windGusts != null ? fmt(weather.windGusts, 1) : 'N/A'} km/h`, sub: 'Peak gusts' },
            { label: 'Precip Today', value: `${weather.precipitationSum != null ? fmt(weather.precipitationSum, 1) : '0.0'} mm`, sub: 'Daily total' },
          ] as const).map(s => (
            <div key={s.label} className="bg-slate-50 dark:bg-slate-700/60 p-4 rounded-xl border border-slate-100 dark:border-slate-600">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 break-all">{s.value}</p>
              <p className="text-[9px] text-slate-400 font-bold mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── ML API config collapsible ──────────────────────────────────── */}
        {showApiConfig && (
          <div className="mb-6 p-5 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Server className="w-3.5 h-3.5" /> Bio-SentinelX ML API Endpoint
            </p>
            <div className="flex gap-3">
              <input
                type="url"
                value={mlApiUrlInput}
                onChange={e => setMlApiUrlInput(e.target.value)}
                placeholder="https://your-api.railway.app  or  http://localhost:8000"
                className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
              />
              <button
                onClick={saveMlApiUrl}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-all"
              >
                Save
              </button>
            </div>
            <p className="text-[10px] font-bold text-slate-400">
              Enter the URL of your deployed Bio-SentinelX FastAPI ML backend. Leave as localhost for local dev.
              Saved to browser storage.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleFetch}
            disabled={loading}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <><Activity className="w-4 h-4 animate-spin" /> Loading GloFAS Data...</>
              : <><RefreshCw className="w-4 h-4" /> Fetch River Discharge Data</>}
          </button>
          <button
            onClick={handleMLPredict}
            disabled={mlLoading || !mlApiUrl}
            className="px-8 py-3 bg-violet-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-violet-500 transition-all shadow-lg shadow-violet-200 disabled:opacity-50 flex items-center justify-center gap-2"
            title={!rawData.length ? 'Fetch GloFAS data first for best results' : 'Run real-time ML prediction'}
          >
            {mlLoading
              ? <><Activity className="w-4 h-4 animate-spin" /> Predicting...</>
              : <><Brain className="w-4 h-4" /> ML Real-time Predict</>}
          </button>
          <button
            onClick={handleRetrain}
            disabled={retraining || !mlApiUrl}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
            title="Trigger model retraining on latest data for this location"
          >
            {retraining
              ? <><Activity className="w-4 h-4 animate-spin" /> Queueing...</>
              : <><RotateCcw className="w-4 h-4" /> Retrain Model</>}
          </button>
        </div>

        {retrainMsg && (
          <p className={`mt-3 text-xs font-bold px-4 py-2 rounded-xl ${retrainMsg.startsWith('✅') ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-700'}`}>
            {retrainMsg}
          </p>
        )}

        {(mlStatus?.status === 'queued' || mlStatus?.status === 'running') && (
          <p className="mt-3 text-xs font-bold px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
            Training status: {mlStatus.status}{mlStatus.message ? ` · ${mlStatus.message}` : ''}
          </p>
        )}
      </div>

      {/* ── ML Prediction result card ───────────────────────────────────────── */}
      {(mlLoading || mlPrediction || mlError) && (
        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-violet-100 dark:border-violet-800/40">
          <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-500" /> Bio-SentinelX ML Real-time Prediction
            <span className="text-[10px] font-bold normal-case tracking-normal ml-1 opacity-60">
              Stacked Ensemble: RF + XGBoost + LightGBM · trained on {mlStatus?.training_samples?.toLocaleString() ?? '—'} samples
            </span>
          </h3>

          {mlError && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-3">
              <XCircle className="w-4 h-4 flex-shrink-0" /> {mlError}
              <span className="text-red-400 font-normal ml-auto">Check API URL in settings above</span>
            </div>
          )}

          {mlLoading && (
            <div className="flex items-center gap-3 text-violet-600 text-sm font-bold">
              <Activity className="w-5 h-5 animate-spin" /> Querying ML API…
            </div>
          )}

          {mlPrediction && !mlLoading && (() => {
            const prob = mlPrediction.flood_probability;
            const probPct = (prob * 100).toFixed(1);
            const riskColor =
              prob >= 0.85 ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'   :
              prob >= 0.65 ? 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700' :
              prob >= 0.40 ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700'   :
              prob >= 0.20 ? 'text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700' :
              'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700';
            const barColor =
              prob >= 0.85 ? 'bg-red-500'    :
              prob >= 0.65 ? 'bg-orange-500' :
              prob >= 0.40 ? 'bg-amber-500'  :
              prob >= 0.20 ? 'bg-yellow-500' :
              'bg-green-500';

            return (
              <div className="space-y-5">
                {/* KPI row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className={`p-4 rounded-2xl border ${riskColor}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Flood Probability</p>
                    <p className="text-2xl font-black">{probPct}%</p>
                    <p className="text-[10px] font-bold mt-1 opacity-60">{mlPrediction.flood_risk_level}</p>
                  </div>
                  <div className="p-4 rounded-2xl border bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-700 text-blue-700 dark:text-blue-300">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Inundation Depth</p>
                    <p className="text-2xl font-black">{mlPrediction.estimated_inundation_depth_m.toFixed(3)} m</p>
                    <p className="text-[10px] font-bold mt-1 opacity-60">Estimated urban depth</p>
                  </div>
                  <div className="p-4 rounded-2xl border bg-violet-50 dark:bg-violet-900/30 border-violet-100 dark:border-violet-700 text-violet-700 dark:text-violet-300">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Confidence</p>
                    <p className="text-2xl font-black">{(mlPrediction.confidence * 100).toFixed(1)}%</p>
                    <p className="text-[10px] font-bold mt-1 opacity-60">Model certainty</p>
                  </div>
                  <div className="p-4 rounded-2xl border bg-slate-50 dark:bg-slate-700/60 border-slate-100 dark:border-slate-600">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Model Quality</p>
                    {mlStatus ? (
                      <>
                        <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                          {((mlStatus.accuracy ?? 0) * 100).toFixed(2)}% acc
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">
                          AUC {(mlStatus.roc_auc ?? 0).toFixed(4)} · F1 {(mlStatus.f1_score ?? 0).toFixed(3)}
                        </p>
                      </>
                    ) : <p className="text-xs font-bold text-slate-400">—</p>}
                  </div>
                </div>

                {/* Probability bar */}
                <div>
                  <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    <span>0% — Safe</span>
                    <span>Flood Probability</span>
                    <span>100% — Critical</span>
                  </div>
                  <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-700`}
                      style={{ width: `${probPct}%` }}
                    />
                  </div>
                </div>

                {/* Contributing factors */}
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    ML Contributing Factors (Attribution)
                  </p>
                  <div className="space-y-2">
                    {Object.entries(mlPrediction.contributing_factors)
                      .sort((a, b) => b[1] - a[1])
                      .map(([factor, value]) => {
                        const pct = (value * 100).toFixed(1);
                        return (
                          <div key={factor} className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-300 w-36 shrink-0 capitalize">
                              {factor.replace(/_/g, ' ')}
                            </span>
                            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-violet-500 rounded-full"
                                style={{ width: `${Math.min(value / 0.35 * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 w-10 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* ML recommendation */}
                <div className={`p-4 rounded-2xl border ${riskColor} text-sm font-bold`}>
                  {mlPrediction.recommendation}
                </div>

                {/* Top feature importances from training */}
                {mlStatus?.feature_importances && Object.keys(mlStatus.feature_importances).length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Cpu className="w-3 h-3" /> Top Trained Feature Importances (RF)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(mlStatus.feature_importances).slice(0, 8).map(([k, v]) => (
                        <span key={k} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-600">
                          {k.replace(/_/g, ' ')}
                          <span className="ml-1 text-violet-600 dark:text-violet-400">{(v * 100).toFixed(1)}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  ML prediction uses real-time weather + GloFAS river discharge as antecedent precipitation index. Retrain model with latest data for best accuracy.
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Ward readiness + hotspots (API) ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" /> Ward Readiness (API)
              </h3>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                Uses <span className="font-black">/wards/readiness</span> · radius 15 km
              </p>
            </div>
            <button
              onClick={handleLoadWards}
              disabled={!mlApiUrl || wardsLoading}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
              title={!mlApiUrl ? 'Configure ML API URL above' : 'Fetch ward readiness from API'}
            >
              {wardsLoading ? <><Activity className="w-3.5 h-3.5 animate-spin" /> Loading</> : 'Load'}
            </button>
          </div>

          {!mlApiUrl && (
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-500 dark:text-slate-300">
              Configure the ML API URL (ML API button above) to load ward readiness.
            </div>
          )}

          {wardsError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-bold border border-rose-100 dark:border-rose-700 flex items-center gap-3">
              <XCircle className="w-4 h-4 flex-shrink-0" /> {wardsError}
            </div>
          )}

          {wardReadiness && wardReadiness.length > 0 && (
            <div className="space-y-3">
              {geocoding && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  <Activity className="w-3 h-3 animate-spin" />
                  Fetching area names via OpenStreetMap Nominatim… {geocodingProgress}%
                  <div className="flex-1 h-1 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
                    <div className="h-1 bg-blue-500 rounded-full transition-all" style={{ width: `${geocodingProgress}%` }} />
                  </div>
                </div>
              )}
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Top wards by risk score
              </p>
              <div className="space-y-2">
                {[...wardReadiness]
                  .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
                  .slice(0, 10)
                  .map(w => {
                    const prob = w.flood_probability;
                    const riskLabel =
                      prob >= 0.80 ? 'CRITICAL' : prob >= 0.60 ? 'HIGH' :
                      prob >= 0.35 ? 'MEDIUM'   : prob >= 0.15 ? 'LOW' : 'SAFE';
                    const gradeColor =
                      w.readiness_grade === 'A' ? 'bg-green-100 text-green-800 border-green-200' :
                      w.readiness_grade === 'B' ? 'bg-lime-100 text-lime-800 border-lime-200' :
                      w.readiness_grade === 'C' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                      w.readiness_grade === 'D' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                                  'bg-red-100 text-red-800 border-red-200';
                    const riskBadge =
                      riskLabel === 'CRITICAL' ? 'bg-red-600 text-white'     :
                      riskLabel === 'HIGH'     ? 'bg-orange-500 text-white'  :
                      riskLabel === 'MEDIUM'   ? 'bg-yellow-400 text-black'  :
                      riskLabel === 'LOW'      ? 'bg-blue-400 text-white'    :
                                                  'bg-green-500 text-white';
                    const barW = Math.round(w.risk_score ?? 0);
                    return (
                      <div key={w.ward_id} className="p-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                              {w.ward_name ? w.ward_name : w.ward_id}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    barW >= 75 ? 'bg-red-500' : barW >= 55 ? 'bg-orange-500' : barW >= 35 ? 'bg-yellow-400' : 'bg-green-500'
                                  }`}
                                  style={{ width: `${barW}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{barW}/100</span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                              Flood {(prob * 100).toFixed(1)}% · {w.hotspot_count_in_ward} hotspots in ward
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${gradeColor}`}>
                              {w.readiness_grade}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${riskBadge}`}>
                              {riskLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {wardReadiness && wardReadiness.length === 0 && (
            <p className="text-xs font-bold text-slate-400">No ward results returned.</p>
          )}
        </div>

        {/* ── Ward Map (shown full-width below when wards are loaded) ────────── */}
        {wardReadiness && wardReadiness.length > 0 && (
          <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 col-span-full">
            <div className="flex items-center gap-2 mb-3">
              <Map className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Ward Risk Map — {wardReadiness.length} Wards Loaded
              </h3>
              <span className="ml-auto flex items-center gap-3 text-[9px] font-black uppercase tracking-widest">
                {(['A','B','C','D','F'] as const).map(g => {
                  const col = g === 'A' ? '#22c55e' : g === 'B' ? '#84cc16' : g === 'C' ? '#eab308' : g === 'D' ? '#f97316' : '#dc2626';
                  const lbl = g === 'A' ? 'Safe' : g === 'B' ? 'Low' : g === 'C' ? 'Medium' : g === 'D' ? 'High' : 'Critical';
                  return (
                    <span key={g} className="flex items-center gap-1">
                      <span style={{ background: col }} className="inline-block w-4 h-4 rounded-full shadow-sm" />
                      <span className="text-slate-500 dark:text-slate-300">{g} — {lbl}</span>
                    </span>
                  );
                })}
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mb-3">
              Click any pin for ward details — risk score, flood probability, drainage health, and recommended actions.
            </p>
            {/* Leaflet map container */}
            <div
              ref={wardMapContainerRef}
              style={{ height: '420px', borderRadius: '1rem', overflow: 'hidden', zIndex: 0 }}
              className="w-full border border-slate-100 dark:border-slate-700"
            />
            {/* Map Interactive Layer Toggles */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setShowWardMarkers(!showWardMarkers)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors flex items-center gap-1 ${showWardMarkers ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'} hover:bg-slate-100`}
              >
                Ward Polygons
              </button>
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors flex items-center gap-1 ${showHeatmap ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-400 border-slate-200'} hover:bg-slate-100`}
              >
                Risk Heatmap
              </button>
              <button
                onClick={() => setIsSatellite(!isSatellite)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors flex items-center gap-1 ${isSatellite ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-400 border-slate-200'} hover:bg-slate-100`}
              >
                mGIS SAT View
              </button>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Waves className="w-4 h-4 text-blue-500" /> Micro-Hotspots (API)
              </h3>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                Uses <span className="font-black">/hotspots</span> · radius 10 km · grid 1 km · min risk 0.5
              </p>
            </div>
            <button
              onClick={handleLoadHotspots}
              disabled={!mlApiUrl || hotspotsLoading}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
              title={!mlApiUrl ? 'Configure ML API URL above' : 'Fetch hotspot scan from API'}
            >
              {hotspotsLoading ? <><Activity className="w-3.5 h-3.5 animate-spin" /> Loading</> : 'Load'}
            </button>
          </div>

          {!mlApiUrl && (
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-500 dark:text-slate-300">
              Configure the ML API URL (ML API button above) to load hotspots.
            </div>
          )}

          {hotspotsError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-bold border border-rose-100 dark:border-rose-700 flex items-center gap-3">
              <XCircle className="w-4 h-4 flex-shrink-0" /> {hotspotsError}
            </div>
          )}

          {hotspots && (
            <div className="space-y-3">
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl border bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-700">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">Active Hotspots</p>
                  <p className="text-2xl font-black text-orange-700 dark:text-orange-300 mt-1">{hotspots.hotspots_identified}</p>
                  <p className="text-[9px] text-orange-400 font-bold mt-0.5">Min risk ≥ 50%</p>
                </div>
                <div className="p-3 rounded-2xl border bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cells Scanned</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{hotspots.total_cells_scanned}</p>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                    {hotspots.grid_size_km}km² grid · {hotspots.radius_km}km radius
                  </p>
                </div>
              </div>

              {hotspots.hotspots?.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Highest-risk cells — click map circles for details
                  </p>
                  <div className="space-y-1.5">
                    {[...hotspots.hotspots]
                      .sort((a, b) => (b.flood_probability ?? 0) - (a.flood_probability ?? 0))
                      .slice(0, 10)
                      .map(h => {
                        const prob = h.flood_probability;
                        const riskLabel =
                          prob >= 0.85 ? 'CRITICAL' : prob >= 0.65 ? 'HIGH' :
                          prob >= 0.40 ? 'MEDIUM'   : 'LOW';
                        const riskStyle =
                          prob >= 0.85 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' :
                          prob >= 0.65 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700' :
                          prob >= 0.40 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700' :
                                        'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700';
                        const riskBadge =
                          prob >= 0.85 ? 'bg-red-600 text-white'    :
                          prob >= 0.65 ? 'bg-orange-500 text-white' :
                          prob >= 0.40 ? 'bg-yellow-400 text-black' :
                                        'bg-blue-500 text-white';
                        const barColor =
                          prob >= 0.85 ? 'bg-red-500'    :
                          prob >= 0.65 ? 'bg-orange-500' :
                          prob >= 0.40 ? 'bg-yellow-400' : 'bg-blue-400';
                        return (
                          <div key={h.cell_id} className={`p-3 rounded-xl border ${riskStyle}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${riskBadge}`}>
                                    {riskLabel}
                                  </span>
                                  <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">
                                    {(prob * 100).toFixed(1)}% flood risk
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                    <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${Math.round(prob * 100)}%` }} />
                                  </div>
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 mt-1">
                                  💧 {h.inundation_depth_m.toFixed(2)} m depth · {h.area_km2.toFixed(2)} km² · {h.dominant_factor.replace(/_/g, ' ')}
                                </p>
                                <p className="text-[9px] font-mono text-slate-400">
                                  {h.lat.toFixed(4)}°N, {h.lon.toFixed(4)}°E
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-bold border border-rose-100 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {rawData.length > 0 && riskScore && seasonCtx && histStats && trend && (
        <div className="space-y-8">

          {/* ── Seasonal context banner ───────────────────────── */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            seasonCtx.isFloodSeason
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-700 text-blue-800 dark:text-blue-200'
              : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
          }`}>
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-0.5">
                Seasonal Context — {new Date().toLocaleString('default', { month: 'long' })} · {seasonCtx.seasonLabel}
              </p>
              <p className="text-xs font-bold">{seasonCtx.note}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl border bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-600">
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">More Flood Insights</p>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              Percentiles, gauges, uncertainty spread, raw table, and AI summary.
            </p>
          </div>

          {/* ── Historical percentile reference ──────────────── */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
            <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
              Historical Discharge Percentiles — 92-Day Baseline (m³/s)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Min',  value: fmt(histStats.min),  bg: 'bg-blue-50 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-300'   },
                { label: 'P50',  value: fmt(histStats.p50),  bg: 'bg-green-50 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-300'  },
                { label: 'P75',  value: fmt(histStats.p75),  bg: 'bg-yellow-50 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300'},
                { label: 'P90',  value: fmt(histStats.p90),  bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300'},
                { label: 'Max',  value: fmt(histStats.max),  bg: 'bg-red-50 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-300'     },
                { label: 'Mean', value: fmt(histStats.mean), bg: 'bg-slate-50 dark:bg-slate-700/60',   text: 'text-slate-700 dark:text-slate-200'  },
              ].map(s => (
                <div key={s.label} className={`${s.bg} dark:bg-slate-700/60 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-600`}>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                  <p className={`text-base font-black mt-1 ${s.text}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-3">
              Risk is scored by comparing the forecast ensemble median against these percentile thresholds — not the raw max member.
            </p>
          </div>

          {/* ── Risk Gauge ───────────────────────────────────── */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> Flood Monitoring Gauge
              </h3>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${riskScore.bgColor} ${riskScore.textColor}`}>
                {riskScore.level}
              </span>
            </div>
            <div className="h-4 bg-gradient-to-r from-green-200 via-yellow-200 via-orange-300 to-red-400 rounded-full relative overflow-hidden">
              <div className="absolute top-0 right-0 h-full bg-white/60 dark:bg-slate-800/60 transition-all duration-700"
                   style={{ width: `${100 - riskScore.score}%` }} />
              <div className="absolute top-0 h-full w-1 bg-slate-900 dark:bg-white rounded-full transition-all duration-700"
                   style={{ left: `calc(${riskScore.score}% - 2px)` }} />
            </div>
            <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">
              <span>Normal</span><span>Moderate</span><span>Elevated</span><span>Watch</span>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-3">{riskScore.description}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-2">
              Score reflects GloFAS ensemble median vs historical percentile distribution, seasonally adjusted for {seasonCtx.seasonLabel}.
            </p>
          </div>

          {/* ── Future prediction summary ───────────────────── */}
          {(future7d || future30d || future6mo) && (
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> Future Flood Prediction
                </h3>
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-700">
                  Model: GloFAS v4 (ensemble-derived)
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mb-6">
                Most-likely = mean of daily ensemble median. Best/worst use ensemble min/max (when available).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(() => {
                  const windows = [future7d, future30d, future6mo].filter((x): x is FuturePredictionWindow => !!x);
                  return windows.map(w => (
                    <div key={w.label} className="bg-slate-50 dark:bg-slate-700/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-600">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{w.label} Outlook</p>
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100 mt-1">
                        {w.mostLikelyMean != null ? `${w.mostLikelyMean.toFixed(2)} m³/s` : 'N/A'}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-300 font-bold mt-1">
                        Best: {w.bestCaseLow != null ? w.bestCaseLow.toFixed(2) : '—'} · Worst: {w.worstCaseHigh != null ? w.worstCaseHigh.toFixed(2) : '—'}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-300 font-bold mt-1">
                        Days median &gt; Hist P75: {w.daysMedianExceedsHistP75} · Days forecast P75 &gt; Hist P75: {w.daysEnsembleP75ExceedsHistP75}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold mt-2">
                        Precip total: {w.precipTotalMm != null ? `${w.precipTotalMm.toFixed(1)} mm` : 'N/A'}
                      </p>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* ── Ensemble range chart ─────────────────────────── */}
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-500" /> {forecastView === 'daily' ? '60-Day Forecast — Ensemble Spread (m³/s)' : 'Monthly Forecast — Aggregated Discharge (m³/s)'}
              </h3>
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-700/60 border border-slate-100 dark:border-slate-600 rounded-full p-1">
                <button
                  onClick={() => setForecastView('daily')}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${forecastView === 'daily' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setForecastView('monthly')}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${forecastView === 'monthly' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}
                >
                  Monthly
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mb-6">
              {forecastView === 'daily'
                ? 'Uncertainty view: median vs min/max spread.'
                : 'Monthly values are derived from daily ensemble median (mean + max per month).'}
            </p>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {forecastView === 'daily' ? (
                  <AreaChart data={rawData.slice(todayIdx + 1, todayIdx + 61)}>
                    <defs>
                      <linearGradient id="maxEnv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2}  />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="minEnv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date"
                      tickFormatter={v => new Date(v + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                      tickLine={false} axisLine={false} minTickGap={25} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                      tickLine={false} axisLine={false} unit=" m³/s" width={70} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={labelFmt}
                      formatter={(v: number, name: string) => [`${v?.toFixed(2)} m³/s`, name]} />
                    <Legend />
                    <Area type="monotone" dataKey="river_discharge_max"    stroke="#ef4444" strokeWidth={1.5} fill="url(#maxEnv)" dot={false} name="Ensemble Max"    connectNulls />
                    <Line  type="monotone" dataKey="river_discharge_median" stroke="#8b5cf6" strokeWidth={2.5}                     dot={false} name="Ensemble Median" connectNulls />
                    <Area type="monotone" dataKey="river_discharge_min"    stroke="#22c55e" strokeWidth={1.5} fill="url(#minEnv)" dot={false} name="Ensemble Min"    connectNulls />
                  </AreaChart>
                ) : (
                  <LineChart data={monthlySeries.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month"
                      tickFormatter={v => {
                        const [y, m] = String(v).split('-');
                        const dt = new Date(Number(y), Math.max(0, Number(m) - 1), 1);
                        return dt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
                      }}
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                      tickLine={false} axisLine={false} minTickGap={10} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                      tickLine={false} axisLine={false} unit=" m³/s" width={70} />
                    <Tooltip contentStyle={tooltipStyle}
                      labelFormatter={(l: string) => {
                        const [y, m] = String(l).split('-');
                        const dt = new Date(Number(y), Math.max(0, Number(m) - 1), 1);
                        return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                      }}
                      formatter={(v: number, name: string) => [`${v?.toFixed(2)} m³/s`, name]} />
                    <Legend />
                    <Line type="monotone" dataKey="discharge_median_mean" stroke="#8b5cf6" strokeWidth={2.5} dot={false} name="Monthly Mean (Median)" connectNulls />
                    <Line type="monotone" dataKey="discharge_median_max"  stroke="#ef4444" strokeWidth={1.8} dot={false} name="Monthly Max (Median)"  connectNulls />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Precipitation (near-term) ───────────────────── */}
          {dailyPrecipSeries.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-sky-500" /> Precipitation Forecast — Next {Math.min(16, dailyPrecipSeries.length)} Days (mm)
              </h3>
              <p className="text-[10px] text-slate-400 font-bold mb-6">
                Rainfall totals help interpret discharge rises and catchment saturation.
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyPrecipSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date"
                      tickFormatter={v => new Date(v + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                      tickLine={false} axisLine={false} minTickGap={25} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                      tickLine={false} axisLine={false} unit=" mm" width={55} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={labelFmt}
                      formatter={(v: number) => [`${v?.toFixed(1)} mm`, 'Precipitation']} />
                    <Bar dataKey="precipitationSum" name="Daily Total" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── River Discharge & ML Feature Dashboard ─────── */}
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-500" /> River Discharge &amp; ML Feature Dashboard
              </h3>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                Transparency: raw values + ML inputs and factors.
              </p>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-700">
                {rawData.length} data points · GloFAS v4
              </span>
            </div>

            {/* ── Dataset stat strip ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Points',    value: rawData.length.toString(),                                                               sub: 'Historical + forecast rows'    },
                { label: 'Date Window',     value: `${rawData[0]?.date ?? '—'} → ${rawData[rawData.length - 1]?.date ?? '—'}`,              sub: '92 past + 183 forecast days'   },
                { label: 'Today Discharge', value: `${fmt(rawData[todayIdx]?.river_discharge ?? rawData[todayIdx]?.river_discharge_mean)} m³/s`, sub: 'Current observed value'        },
                { label: 'P90 − P50 Spread', value: `${fmt(histStats.p90 - histStats.p50)} m³/s`,                                          sub: 'Upper tail variability (m³/s)' },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 dark:bg-slate-700/60 p-4 rounded-xl border border-slate-100 dark:border-slate-600">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 break-all">{s.value}</p>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">{s.sub}</p>
                  {/* Interactive Horizon Controls */}
            {forecastView === 'daily' && (
              <div className="flex bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700 w-full sm:w-auto mt-4 sm:mt-0">
                {[
                  { label: '7 Days', val: 7 },
                  { label: '15 Days', val: 15 },
                  { label: '30 Days', val: 30 },
                  { label: 'All', val: 183 }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setForecastWindowDays(opt.val)}
                    className={`flex-1 sm:px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${
                      forecastWindowDays === opt.val
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
              ))}
            </div>

            {/* ── ML model inputs fed to /predict ── */}
            {mlPrediction && (
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-violet-500" /> Feature Inputs Sent to ML /predict Endpoint
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {((): Array<{ label: string; value: string }> => {
                    const precip  = weather?.precipitationSum ?? 0;
                    const todayQ  = rawData[todayIdx]?.river_discharge ?? rawData[todayIdx]?.river_discharge_mean ?? 0;
                    const api     = histStats.p50 > 0 ? Math.min((todayQ / histStats.p50) * 30, 150) : 0;
                    return [
                      { label: 'Rainfall 1h',       value: `${fmt(precip, 2)} mm`                  },
                      { label: 'Rainfall 3h',       value: `${fmt(precip * 2.5, 2)} mm`            },
                      { label: 'Rainfall 6h',       value: `${fmt(precip * 4, 2)} mm`              },
                      { label: 'Rainfall 24h',      value: `${fmt(precip * 8, 2)} mm`              },
                      { label: 'Rainfall 48h',      value: `${fmt(precip * 12, 2)} mm`             },
                      { label: 'Rainfall 72h',      value: `${fmt(precip * 15, 2)} mm`             },
                      { label: 'Antecedent PI',     value: fmt(api, 2)                             },
                      { label: 'Temperature',       value: weather ? `${fmt(weather.temp, 1)}°C` : 'N/A' },
                      { label: 'Humidity',          value: weather ? `${weather.humidity}%` : 'N/A'     },
                      { label: 'Pressure',          value: weather ? `${weather.pressure ?? 1013} hPa` : 'N/A' },
                      { label: 'Month',             value: new Date().toLocaleString('default', { month: 'long' }) },
                      { label: 'Hour of Day',       value: `${new Date().getHours()}:00`           },
                    ];
                  })().map(f => (
                    <div key={f.label} className="flex justify-between items-center px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-100 dark:border-violet-800/40 text-[10px]">
                      <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">{f.label}</span>
                      <span className="font-black text-violet-700 dark:text-violet-300">{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Contributing factors bar chart ── */}
            {mlPrediction && Object.keys(mlPrediction.contributing_factors).length > 0 && (() => {
              const factors = Object.entries(mlPrediction.contributing_factors)
                .sort(([, a], [, b]) => b - a)
                .map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: parseFloat((v * 100).toFixed(1)) }));
              const barColors = ['#8b5cf6', '#7c3aed', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];
              return (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Contributing Factors — % Impact on Current Prediction
                  </p>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={factors} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} width={132} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'Impact']} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          {factors.map((_, i) => (
                            <Cell key={i} fill={barColors[Math.min(i, barColors.length - 1)]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

            {/* ── Feature importance chart (from mlStatus) ── */}
            {mlStatus?.feature_importances && Object.keys(mlStatus.feature_importances).length > 0 && (() => {
              const fi = Object.entries(mlStatus.feature_importances)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 12)
                .map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: parseFloat((v * 100).toFixed(1)) }));
              const fiColors = ['#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];
              return (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-emerald-500" /> Trained Model Feature Importances (top 12)
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mb-3">
                    Samples: {mlStatus.training_samples?.toLocaleString() ?? '—'} &nbsp;·&nbsp;
                    Accuracy: {mlStatus.accuracy != null ? `${(mlStatus.accuracy * 100).toFixed(1)}%` : 'N/A'} &nbsp;·&nbsp;
                    AUC-ROC: {mlStatus.roc_auc != null ? mlStatus.roc_auc.toFixed(3) : 'N/A'} &nbsp;·&nbsp;
                    F1: {mlStatus.f1_score != null ? mlStatus.f1_score.toFixed(3) : 'N/A'}
                  </p>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={fi} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} tickLine={false} axisLine={false} width={140} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'Importance']} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          {fi.map((_, i) => (
                            <Cell key={i} fill={fiColors[Math.min(i, fiColors.length - 1)]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

            {/* ── Recent + upcoming discharge data table ── */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Raw Discharge Data Table — Last 14 Days + Next 14 Days
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                <table className="min-w-full text-[10px] font-bold">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Observed</th>
                      <th className="px-3 py-2 text-right">Fc Median</th>
                      <th className="px-3 py-2 text-right">Fc Mean</th>
                      <th className="px-3 py-2 text-right">Fc Max</th>
                      <th className="px-3 py-2 text-right">Fc Min</th>
                      <th className="px-3 py-2 text-right">P25</th>
                      <th className="px-3 py-2 text-right">P75</th>
                      <th className="px-3 py-2 text-center">vs P50</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {[
                      ...rawData.slice(Math.max(0, todayIdx - 13), todayIdx + 1).map(d => ({ ...d, _type: 'hist' as const })),
                      ...rawData.slice(todayIdx + 1, todayIdx + 15).map(d => ({ ...d, _type: 'fc' as const })),
                    ].map((d, i) => {
                      const q     = d.river_discharge ?? d.river_discharge_mean ?? d.river_discharge_median ?? null;
                      const ratio = q != null && histStats.p50 > 0 ? q / histStats.p50 : null;
                      const flag  = ratio == null ? '—' : ratio > 2 ? '▲ HIGH' : ratio > 1.5 ? '▲ ELEV' : ratio < 0.5 ? '▼ LOW' : '—';
                      const flagCls = flag === '▲ HIGH' ? 'text-red-600 dark:text-red-400' :
                                      flag === '▲ ELEV' ? 'text-amber-600 dark:text-amber-400' :
                                      flag === '▼ LOW'  ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400';
                      const isToday = d.date === (chartData[todayChartIdx]?.date ?? '');
                      return (
                        <tr key={i} className={`${
                          d._type === 'fc' ? 'bg-violet-50/40 dark:bg-violet-900/10' : ''
                        } hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors`}>
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, {
                              weekday: 'short', month: 'short', day: 'numeric',
                            })}
                            {isToday && <span className="ml-1 text-teal-600 dark:text-teal-400 font-black">[TODAY]</span>}
                            {d._type === 'fc' && <span className="ml-1 text-violet-400 text-[9px]">FC</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right text-blue-700 dark:text-blue-300">{d._type === 'hist' ? fmt(q) : '—'}</td>
                          <td className="px-3 py-1.5 text-right text-purple-700 dark:text-purple-300">{fmt(d.river_discharge_median)}</td>
                          <td className="px-3 py-1.5 text-right text-orange-600 dark:text-orange-300">{fmt(d.river_discharge_mean)}</td>
                          <td className="px-3 py-1.5 text-right text-red-600 dark:text-red-300">{fmt(d.river_discharge_max)}</td>
                          <td className="px-3 py-1.5 text-right text-green-600 dark:text-green-300">{fmt(d.river_discharge_min)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{fmt(d.river_discharge_p25)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{fmt(d.river_discharge_p75)}</td>
                          <td className={`px-3 py-1.5 text-center font-black ${flagCls}`}>{flag}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 font-bold mt-2">
                FC rows (purple) = GloFAS forecast. vs P50 compares discharge to 90-day historical median.
                HIGH = &gt;2× median · ELEV = 1.5–2× · LOW = &lt;0.5×. All values in m³/s.
              </p>
            </div>
          </div>

          {/* ── AI Analysis ──────────────────────────────────── */}
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <Zap className="w-6 h-6 text-blue-600" /> AI Flood Risk Analysis
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  GloFAS v4 ensemble · {mlPrediction ? 'Bio-SentinelX ML prediction · ' : ''}Percentile-based scoring · Seasonal context · AI synthesis
                </p>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
                  Short narrative summary of the risk drivers.
                </p>
              </div>
              <button onClick={handleAnalyze} disabled={analyzing}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2">
                {analyzing
                  ? <><Activity className="w-4 h-4 animate-spin" /> Analysing...</>
                  : <><Waves className="w-4 h-4" /> {mlPrediction ? 'Run Combined AI Analysis' : 'Run AI Analysis'}</>}
              </button>
            </div>

            {analyzing && analysisPhase && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                <BookOpen className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0 animate-pulse" />
                <div>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                    {mlPrediction ? 'Multi-Model Hydrological Analysis Active' : 'Hydrological Analysis Active'}
                  </p>
                  <p className="text-xs font-bold text-blue-800 mt-0.5">{analysisPhase}</p>
                </div>
              </div>
            )}

            {!analyzing && !analysis && (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data and Model Sources</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'GloFAS v4 Reanalysis',   sub: '1984–2022 · 0.05° (~5 km) · Daily',        color: 'bg-blue-50   text-blue-700   border-blue-200'   },
                    { label: 'GloFAS v4 Forecast',      sub: '30-day ensemble · Daily updates',           color: 'bg-blue-50   text-blue-700   border-blue-200'   },
                    { label: 'GloFAS v4 Seasonal',      sub: '7-month probabilistic · Monthly updates',  color: 'bg-violet-50 text-violet-700 border-violet-200' },
                    { label: 'P25–P75 Ensemble Band',   sub: '50-member uncertainty quantification',     color: 'bg-purple-50 text-purple-700 border-purple-200' },
                    ...(mlPrediction ? [
                      { label: 'Bio-SentinelX ML',    sub: 'RF + XGBoost + LightGBM stacked ensemble',  color: 'bg-violet-100 text-violet-800 border-violet-300' },
                      { label: 'ML Inundation Depth', sub: `${mlPrediction.estimated_inundation_depth_m.toFixed(3)}m estimated urban depth`, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                    ] : []),
                    { label: 'Seasonal Flood Calendar', sub: 'Latitude-based flood regime context',       color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600' },
                    { label: 'WHO / UNDRR',             sub: 'Flood health impact and vulnerability',    color: 'bg-teal-50   text-teal-700   border-teal-200'   },
                  ].map(s => (
                    <span key={s.label} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${s.color}`}>
                      {s.label}
                      <span className="font-semibold normal-case tracking-normal opacity-70"> · {s.sub}</span>
                    </span>
                  ))}
                </div>
                {mlPrediction && (
                  <p className="text-[10px] font-bold text-violet-600 flex items-center gap-2 mt-2">
                    <Brain className="w-3.5 h-3.5" />
                    ML prediction loaded — AI will produce a multi-model consensus analysis with GloFAS + ML combined.
                  </p>
                )}
              </div>
            )}

            {analysis && (
              <div className="bg-gradient-to-br from-blue-50 dark:from-blue-950/30 to-slate-50 dark:to-slate-800/50 p-6 sm:p-8 rounded-[2rem] border border-blue-100 dark:border-blue-800/50 prose prose-sm max-w-none prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-li:text-slate-600 dark:prose-li:text-slate-300 prose-strong:text-slate-800 dark:prose-strong:text-slate-100 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 prose-headings:font-black prose-h2:text-blue-800 dark:prose-h2:text-blue-400 prose-h3:text-slate-700 dark:prose-h3:text-slate-200 prose-a:text-blue-700 dark:prose-a:text-blue-300">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto my-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <table className="min-w-full text-xs" {...props} />
                      </div>
                    ),
                    thead: ({ node, ...props }) => (
                      <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200" {...props} />
                    ),
                    tbody: ({ node, ...props }) => (
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700" {...props} />
                    ),
                    tr: ({ node, ...props }) => (
                      <tr className="even:bg-white/60 dark:even:bg-slate-800/30 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors" {...props} />
                    ),
                    th: ({ node, ...props }) => (
                      <th className="px-3 py-2 text-left font-black text-[10px] uppercase tracking-widest border-r border-slate-200 dark:border-slate-700 last:border-r-0" {...props} />
                    ),
                    td: ({ node, ...props }) => (
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800 last:border-r-0" {...props} />
                    ),
                    hr: () => <hr className="border-slate-200 dark:border-slate-700 my-6" />,
                  }}
                >
                  {analysis}
                </ReactMarkdown>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
