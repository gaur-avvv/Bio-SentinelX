import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',   // required for Capacitor Android (assets use relative paths)
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],

    // ── Build optimisation ────────────────────────────────────────────────
    build: {
      // Source maps for production debugging
      sourcemap: true,

      // Use esbuild for minification (faster & smaller than terser)
      minify: 'esbuild',

      // Warn but don't fail when a chunk exceeds 1MB
      chunkSizeWarningLimit: 1000,
    },

    // ── Environment injection ─────────────────────────────────────────────
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY || process.env.GROQ_API_KEY),
      'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY),
      'process.env.POLLINATIONS_KEY': JSON.stringify(env.POLLINATIONS_KEY || process.env.POLLINATIONS_KEY),
      'process.env.HF_TOKEN': JSON.stringify(env.HF_TOKEN || process.env.HF_TOKEN),
      'process.env.OPENWEATHER_KEY': JSON.stringify(env.OPENWEATHER_KEY || process.env.OPENWEATHER_KEY),
      'process.env.LLAMACLOUD_KEY': JSON.stringify(env.LLAMACLOUD_KEY || process.env.LLAMACLOUD_KEY),
      'process.env.SILICONFLOW_API_KEY': JSON.stringify(env.SILICONFLOW_API_KEY || process.env.SILICONFLOW_API_KEY),
      'process.env.CEREBRAS_API_KEY': JSON.stringify(env.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY),
      'process.env.FLOOD_ML_API': JSON.stringify(env.FLOOD_ML_API || process.env.FLOOD_ML_API),
      'process.env.BIOSENTINEL_API': JSON.stringify(env.BIOSENTINEL_API || process.env.BIOSENTINEL_API),
      'process.env.BIOSENTINEL_API_KEY': JSON.stringify(env.BIOSENTINEL_API_KEY || process.env.BIOSENTINEL_API_KEY),
      'process.env.API_BASE_URL': JSON.stringify(env.API_BASE_URL || process.env.API_BASE_URL),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || process.env.SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
      'process.env.MAPPLS_TOKEN': JSON.stringify(env.MAPPLS_TOKEN || process.env.MAPPLS_TOKEN),
      'process.env.FIREBASE_API_KEY': JSON.stringify(env.FIREBASE_API_KEY || process.env.FIREBASE_API_KEY),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(env.FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(env.FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID),
      'process.env.FIREBASE_APP_ID': JSON.stringify(env.FIREBASE_APP_ID || process.env.FIREBASE_APP_ID),
      'process.env.FIREBASE_MEASUREMENT_ID': JSON.stringify(env.FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID),
    },

    // ── Module aliases ────────────────────────────────────────────────────
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // recharts v2 uses fast-equals which has a broken exports field;
        // point Vite directly at the CJS build to avoid resolution errors.
        'fast-equals': path.resolve(__dirname, 'node_modules/fast-equals/dist/cjs/index.cjs'),
      }
    }
  };
});
