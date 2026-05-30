/**
 * DataCacheContext
 *
 * Keeps fetched data alive across view/page switches so components don't
 * re-fetch every time the user navigates back to them.
 *
 * Implements:
 *   1. sessionStorage persistence across same-tab navigation.
 *   2. Stale-While-Revalidate (SWR) logic helper.
 *   3. Error state caching with cooling down.
 *   4. Proper TypeScript types replacing any.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ─── Proper TypeScript Types ──────────────────────────────────────────────────

export interface MLFeatureImpact {
  feature: string;
  impact: string;
}

export interface MLPrediction {
  disease: string;
  confidence: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  riskScore: number;
  primaryTrigger: string;
  topFactors: MLFeatureImpact[];
  recommendations: string[];
}

export interface FloodMLPrediction {
  riskScore: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Severe';
  confidence: number;
  factors: MLFeatureImpact[];
  alertLevel: 'Green' | 'Yellow' | 'Orange' | 'Red';
  warnings: string[];
}

// ─── Flood slice ───────────────────────────────────────────────────────────
export interface FloodCacheSlice {
  rawData: any[];
  mlPrediction: FloodMLPrediction | null;
  mlStatus: {
    status: string;
    apiLatencyMs?: number;
    fallbackReason?: string;
  } | null;
  analysis: string;
  lastLocation: string;
  lastFetched: number | null; // timestamp ms
}

// ─── Historical slice ──────────────────────────────────────────────────────
export interface HistoricalCacheSlice {
  data: any[];
  analysis: string;
  startDate: string;
  endDate: string;
  selectedVariables: string[];
  lastLocation: string;
  lastFetched: number | null;
}

// ─── Analysis Dashboard slice ──────────────────────────────────────────────
export interface AnalysisCacheSlice {
  report: string;
  mlPrediction: MLPrediction | null;
  lastLocation: string;
  lastFetched: number | null;
}

export interface ErrorCacheEntry {
  error: string;
  timestamp: number;
}

interface DataCache {
  flood: FloodCacheSlice;
  historical: HistoricalCacheSlice;
  analysis: AnalysisCacheSlice;
  errorCache: Record<string, ErrorCacheEntry>;
  setFlood: (patch: Partial<FloodCacheSlice>) => void;
  setHistorical: (patch: Partial<HistoricalCacheSlice>) => void;
  setAnalysis: (patch: Partial<AnalysisCacheSlice>) => void;
  setError: (key: string, error: string) => void;
  clearError: (key: string) => void;
  clearAllCaches: () => void;
}

const FLOOD_DEFAULT: FloodCacheSlice = {
  rawData: [],
  mlPrediction: null,
  mlStatus: null,
  analysis: '',
  lastLocation: '',
  lastFetched: null,
};

const HISTORICAL_DEFAULT: HistoricalCacheSlice = {
  data: [],
  analysis: '',
  startDate: '',
  endDate: '',
  selectedVariables: [],
  lastLocation: '',
  lastFetched: null,
};

const ANALYSIS_DEFAULT: AnalysisCacheSlice = {
  report: '',
  mlPrediction: null,
  lastLocation: '',
  lastFetched: null,
};

const SESSION_KEYS = {
  FLOOD: 'biosentinel_flood_cache_v2',
  HISTORICAL: 'biosentinel_historical_cache_v2',
  ANALYSIS: 'biosentinel_analysis_cache_v2',
  ERRORS: 'biosentinel_error_cache_v2',
} as const;

const DataCacheContext = createContext<DataCache | null>(null);

/** Max age of cached data before it is considered stale (30 minutes) */
export const CACHE_TTL_MS = 30 * 60 * 1000;

/** Duration to cache error states to prevent rapid re-fetching (2 minutes) */
export const ERROR_COOLDOWN_MS = 2 * 60 * 1000;

function safeSessionGet<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSessionSet(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[DataCache] sessionStorage set failed:', e);
  }
}

export const DataCacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize state directly from sessionStorage for persistency across same-tab navigation
  const [flood, setFloodState] = useState<FloodCacheSlice>(() => 
    safeSessionGet<FloodCacheSlice>(SESSION_KEYS.FLOOD, FLOOD_DEFAULT)
  );
  
  const [historical, setHistoricalState] = useState<HistoricalCacheSlice>(() => 
    safeSessionGet<HistoricalCacheSlice>(SESSION_KEYS.HISTORICAL, HISTORICAL_DEFAULT)
  );
  
  const [analysis, setAnalysisState] = useState<AnalysisCacheSlice>(() => 
    safeSessionGet<AnalysisCacheSlice>(SESSION_KEYS.ANALYSIS, ANALYSIS_DEFAULT)
  );

  const [errorCache, setErrorCacheState] = useState<Record<string, ErrorCacheEntry>>(() =>
    safeSessionGet<Record<string, ErrorCacheEntry>>(SESSION_KEYS.ERRORS, {})
  );

  // Synchronize state changes to sessionStorage in the background
  const setFlood = useCallback((patch: Partial<FloodCacheSlice>) => {
    setFloodState(prev => {
      const updated = { ...prev, ...patch };
      safeSessionSet(SESSION_KEYS.FLOOD, updated);
      return updated;
    });
  }, []);

  const setHistorical = useCallback((patch: Partial<HistoricalCacheSlice>) => {
    setHistoricalState(prev => {
      const updated = { ...prev, ...patch };
      safeSessionSet(SESSION_KEYS.HISTORICAL, updated);
      return updated;
    });
  }, []);

  const setAnalysis = useCallback((patch: Partial<AnalysisCacheSlice>) => {
    setAnalysisState(prev => {
      const updated = { ...prev, ...patch };
      safeSessionSet(SESSION_KEYS.ANALYSIS, updated);
      return updated;
    });
  }, []);

  const setError = useCallback((key: string, error: string) => {
    setErrorCacheState(prev => {
      const updated = { ...prev, [key]: { error, timestamp: Date.now() } };
      safeSessionSet(SESSION_KEYS.ERRORS, updated);
      return updated;
    });
  }, []);

  const clearError = useCallback((key: string) => {
    setErrorCacheState(prev => {
      const updated = { ...prev };
      delete updated[key];
      safeSessionSet(SESSION_KEYS.ERRORS, updated);
      return updated;
    });
  }, []);

  const clearAllCaches = useCallback(() => {
    setFloodState(FLOOD_DEFAULT);
    setHistoricalState(HISTORICAL_DEFAULT);
    setAnalysisState(ANALYSIS_DEFAULT);
    setErrorCacheState({});
    
    try {
      sessionStorage.removeItem(SESSION_KEYS.FLOOD);
      sessionStorage.removeItem(SESSION_KEYS.HISTORICAL);
      sessionStorage.removeItem(SESSION_KEYS.ANALYSIS);
      sessionStorage.removeItem(SESSION_KEYS.ERRORS);
    } catch {}
  }, []);

  // Periodic passive pruning of expired error cache entries
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setErrorCacheState(prev => {
        let hasChanges = false;
        const cleaned: Record<string, ErrorCacheEntry> = {};
        for (const [key, val] of Object.entries(prev)) {
          if (now - val.timestamp < ERROR_COOLDOWN_MS) {
            cleaned[key] = val;
          } else {
            hasChanges = true;
          }
        }
        if (hasChanges) {
          safeSessionSet(SESSION_KEYS.ERRORS, cleaned);
          return cleaned;
        }
        return prev;
      });
    }, 30 * 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <DataCacheContext.Provider 
      value={{ 
        flood, 
        historical, 
        analysis, 
        errorCache, 
        setFlood, 
        setHistorical, 
        setAnalysis, 
        setError, 
        clearError,
        clearAllCaches
      }}
    >
      {children}
    </DataCacheContext.Provider>
  );
};

export const useDataCache = (): DataCache => {
  const ctx = useContext(DataCacheContext);
  if (!ctx) throw new Error('useDataCache must be used inside <DataCacheProvider>');
  return ctx;
};

/** Returns true when cached data is fresh enough and belongs to the same location */
export const isCacheValid = (
  lastFetched: number | null,
  lastLocation: string,
  currentLocation: string,
  ttl = CACHE_TTL_MS,
): boolean => {
  if (!lastFetched || !lastLocation) return false;
  if (lastLocation.trim().toLowerCase() !== currentLocation.trim().toLowerCase()) return false;
  return Date.now() - lastFetched < ttl;
};

/**
 * Returns true if an error has occurred for the given key and is still
 * within the error cooldown period.
 */
export const isErrorCached = (
  errorCache: Record<string, ErrorCacheEntry>,
  key: string,
  cooldown = ERROR_COOLDOWN_MS
): boolean => {
  const entry = errorCache[key];
  if (!entry) return false;
  return Date.now() - entry.timestamp < cooldown;
};
