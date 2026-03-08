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
      define: {
        'process.env.API_KEY':            JSON.stringify(env.GEMINI_API_KEY     || process.env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY':     JSON.stringify(env.GEMINI_API_KEY     || process.env.GEMINI_API_KEY),
        'process.env.GROQ_API_KEY':       JSON.stringify(env.GROQ_API_KEY       || process.env.GROQ_API_KEY),
        'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY),
        'process.env.POLLINATIONS_KEY':   JSON.stringify(env.POLLINATIONS_KEY   || process.env.POLLINATIONS_KEY),
        'process.env.HF_TOKEN':           JSON.stringify(env.HF_TOKEN           || process.env.HF_TOKEN),
        'process.env.OPENWEATHER_KEY':    JSON.stringify(env.OPENWEATHER_KEY    || process.env.OPENWEATHER_KEY),
        'process.env.LLAMACLOUD_KEY':     JSON.stringify(env.LLAMACLOUD_KEY     || process.env.LLAMACLOUD_KEY),
        'process.env.SILICONFLOW_API_KEY':JSON.stringify(env.SILICONFLOW_API_KEY|| process.env.SILICONFLOW_API_KEY),
        'process.env.CEREBRAS_API_KEY':   JSON.stringify(env.CEREBRAS_API_KEY   || process.env.CEREBRAS_API_KEY),
        'process.env.FLOOD_ML_API':       JSON.stringify(env.FLOOD_ML_API       || process.env.FLOOD_ML_API),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
