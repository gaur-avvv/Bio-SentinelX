# Testing Bio-SentinelX

## Overview
Bio-SentinelX is a React+TypeScript health intelligence app (Vite, Tailwind CSS). It fetches weather data from Open-Meteo, runs ML predictions, and generates health reports via LLM APIs.

## Local Dev Setup
```bash
npm install
npx vite --host 0.0.0.0 --port 5173
# App available at http://localhost:5173 (or next available port like 5174)
```

## Devin Secrets Needed
- An AI provider API key is required to test report generation (Bio-Scan). Without it, the core feature cannot be tested.
- Supported providers: Gemini, Groq, Cerebras, SiliconFlow, OpenRouter, Pollinations
- **Note:** Pollinations was previously free but might now require authentication (401 errors). Do not assume it works without a key.
- For email testing: EmailJS credentials (Public Key, Service ID, Template ID) from https://www.emailjs.com/

## Key Test Areas

### 1. Settings Page
- Navigate to Settings via top nav
- Verify EmailJS config section (3 inputs: Public Key, Service ID, Template ID)
- Verify AI provider selection tabs
- smtp.dev should be labeled as "Fallback"

### 2. Weather Data
- Type a city name in the search bar on the main dashboard and click "Get"
- Weather data should load with atmospheric, air quality, and solar metrics
- No API key needed for weather (uses Open-Meteo)

### 3. Health Profile & ML Features
- Health Profile tab shows default inputs: Age, Height, Weight, Gender, Lifestyle, Exercise
- MLFeatureInputs component only appears after an ML model is trained (via ML Training tab)
- If no model is trained, the component is correctly hidden

### 4. Bio-Scan (Report Generation)
- Requires a valid AI provider API key
- Click "Trigger Bio-Scan" button at the bottom of the Intelligence Input section
- Report should generate in ~15-30 seconds
- Target report length: ~1200 words (enforced by prompt)
- If API key is missing/invalid, a "NEURAL CORE ERROR" banner should appear

### 5. Export Buttons
- Only visible after a report is generated
- Two separate buttons: "Markdown" (teal) and "HTML" (indigo)
- Markdown downloads a `.md` file
- HTML downloads a styled `.html` file

### 6. Report History
- Click "Report History" button next to Bio-Scan
- Shows modal with saved reports or "NO SAVED REPORTS YET" empty state

## Common Issues
- **Pollinations 401**: This provider might require an API key. Switch to another provider or obtain a key.
- **CORS errors from Bio-Sentinel API**: The backend at `bio-sentinel-production.up.railway.app` may have intermittent issues. These are backend-side, not frontend bugs.
- **Port conflicts**: Vite may use port 5174 if 5173 is occupied. Check terminal output for actual port.
- **EmailJS CDN**: The library is loaded via CDN in index.html. If `emailjs` is undefined in console, the CDN might be blocked.
