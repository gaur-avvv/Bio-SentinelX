import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type AppMode = 'auto' | 'light' | 'dark';
export type WeatherCardMode = 'light' | 'partial-dark' | 'full-dark';

export interface CustomColors {
  accent: string;      // primary accent (hex)
  surface: string;     // card background (hex)
  text: string;        // primary text (hex)
}

const DEFAULT_CUSTOM_COLORS: CustomColors = {
  accent: '#14b8a6',   // teal-500
  surface: '#ffffff',
  text: '#0f172a',
};

interface ThemeContextValue {
  appMode: AppMode;
  setAppMode: (m: AppMode) => void;
  systemPreference: 'light' | 'dark'; // resolved OS preference
  weatherCardMode: WeatherCardMode;
  setWeatherCardMode: (m: WeatherCardMode) => void;
  weatherThemeLocked: boolean;
  setWeatherThemeLocked: (v: boolean) => void;
  customColors: CustomColors;
  setCustomColors: (c: CustomColors) => void;
  useCustomColors: boolean;
  setUseCustomColors: (v: boolean) => void;
  autoWeatherTheme: (localHour: number) => WeatherCardMode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};

const load = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [appMode, setAppModeState] = useState<AppMode>(() => load('bsx_app_mode', 'auto'));
  const [weatherCardMode, setWeatherCardModeState] = useState<WeatherCardMode>(() => load('bsx_weather_mode', 'light'));
  const [weatherThemeLocked, setWeatherThemeLockedState] = useState<boolean>(() => load('bsx_weather_locked', false));
  const [customColors, setCustomColorsState] = useState<CustomColors>(() => load('bsx_custom_colors', DEFAULT_CUSTOM_COLORS));
  const [useCustomColors, setUseCustomColorsState] = useState<boolean>(() => load('bsx_use_custom', false));

  // Detect OS dark/light preference
  const getSystemPref = (): 'light' | 'dark' =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemPref);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPreference(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setAppMode = (m: AppMode) => {
    setAppModeState(m);
    localStorage.setItem('bsx_app_mode', JSON.stringify(m));
  };
  const setWeatherCardMode = (m: WeatherCardMode) => {
    setWeatherCardModeState(m);
    localStorage.setItem('bsx_weather_mode', JSON.stringify(m));
  };
  const setWeatherThemeLocked = (v: boolean) => {
    setWeatherThemeLockedState(v);
    localStorage.setItem('bsx_weather_locked', JSON.stringify(v));
  };
  const setCustomColors = (c: CustomColors) => {
    setCustomColorsState(c);
    localStorage.setItem('bsx_custom_colors', JSON.stringify(c));
  };
  const setUseCustomColors = (v: boolean) => {
    setUseCustomColorsState(v);
    localStorage.setItem('bsx_use_custom', JSON.stringify(v));
  };

  const autoWeatherTheme = useCallback((h: number): WeatherCardMode => {
    if (h >= 6 && h < 18) return 'light';
    if (h >= 18 && h < 21) return 'partial-dark';
    return 'full-dark';
  }, []);

  // Apply dark class to <html> — 'auto' follows OS preference
  useEffect(() => {
    const resolved = appMode === 'auto' ? systemPreference : appMode;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [appMode, systemPreference]);

  // Apply custom CSS variables whenever colors change
  useEffect(() => {
    const root = document.documentElement;
    // Always define variables so the UI can consistently reference them.
    // When custom colors are disabled, fall back to the default palette.
    const palette = useCustomColors ? customColors : DEFAULT_CUSTOM_COLORS;
    root.style.setProperty('--bsx-accent', palette.accent);
    root.style.setProperty('--bsx-surface', palette.surface);
    root.style.setProperty('--bsx-text', palette.text);

    // Used by CSS overrides to restyle existing Tailwind teal classes.
    root.classList.toggle('bsx-custom', useCustomColors);
  }, [useCustomColors, customColors]);

  return (
    <ThemeContext.Provider value={{
      appMode, setAppMode,
      systemPreference,
      weatherCardMode, setWeatherCardMode,
      weatherThemeLocked, setWeatherThemeLocked,
      customColors, setCustomColors,
      useCustomColors, setUseCustomColors,
      autoWeatherTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
