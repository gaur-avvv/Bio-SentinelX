/**
 * DataCacheContext
 *
 * Keeps fetched data alive across view/page switches so components don't
 * re-fetch every time the user navigates back to them.
 *
 * Each "slice" mirrors the local state of its component. Components read from
 * the cache on mount (skipping the network call if data already exists) and
 * write back to it whenever they receive fresh data.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── Flood slice ───────────────────────────────────────────────────────────
export interface FloodCacheSlice {
  rawData: any[];
  mlPrediction: any | null;
  mlStatus: any | null;
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
  mlPrediction: any | null;
  lastLocation: string;
  lastFetched: number | null;
}

interface DataCache {
  flood: FloodCacheSlice;
  historical: HistoricalCacheSlice;
  analysis: AnalysisCacheSlice;
  setFlood: (patch: Partial<FloodCacheSlice>) => void;
  setHistorical: (patch: Partial<HistoricalCacheSlice>) => void;
  setAnalysis: (patch: Partial<AnalysisCacheSlice>) => void;
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

const DataCacheContext = createContext<DataCache | null>(null);

/** Max age of cached data before it is considered stale (30 minutes) */
export const CACHE_TTL_MS = 30 * 60 * 1000;

export const DataCacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [flood, setFloodState] = useState<FloodCacheSlice>(FLOOD_DEFAULT);
  const [historical, setHistoricalState] = useState<HistoricalCacheSlice>(HISTORICAL_DEFAULT);
  const [analysis, setAnalysisState] = useState<AnalysisCacheSlice>(ANALYSIS_DEFAULT);

  const setFlood = useCallback((patch: Partial<FloodCacheSlice>) =>
    setFloodState(prev => ({ ...prev, ...patch })), []);

  const setHistorical = useCallback((patch: Partial<HistoricalCacheSlice>) =>
    setHistoricalState(prev => ({ ...prev, ...patch })), []);

  const setAnalysis = useCallback((patch: Partial<AnalysisCacheSlice>) =>
    setAnalysisState(prev => ({ ...prev, ...patch })), []);

  return (
    <DataCacheContext.Provider value={{ flood, historical, analysis, setFlood, setHistorical, setAnalysis }}>
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
