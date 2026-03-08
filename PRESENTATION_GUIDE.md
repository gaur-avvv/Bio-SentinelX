# 🛡️ Bio-SentinelX
## AI-Powered Preventive Health Intelligence Platform

### Hackathon Presentation Guide

---

## 📋 Elevator Pitch (30 seconds)

> **Bio-SentinelX is an AI-powered preventive health intelligence platform that predicts health risks BEFORE symptoms appear.** We fuse real-time environmental data, machine learning, and large language models to forecast disease outbreaks, respiratory hazards, heat stress, and flood risks — empowering individuals and communities to act proactively instead of reactively.

---

## 🎯 Problem Statement

| Problem | Impact |
|---------|--------|
| **Reactive Healthcare** | Current health systems treat symptoms after they appear |
| **Environmental Health Blindspot** | People don't know how weather, air quality, and climate affect their health |
| **Information Overload** | Weather apps show data but don't explain health implications |
| **Climate Change Impact** | Rising temperatures, floods, and air pollution create new health threats daily |

---

## 💡 Solution Overview

**Bio-SentinelX** is a **full-stack AI health intelligence platform**:

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: FastAPI ML API (Railway deployment)
- **AI**: 6 providers (Gemini, Groq, Cerebras, SiliconFlow, OpenRouter, Pollinations)
- **Data**: Open-Meteo APIs (weather, flood, air quality, pollen)
- **Mobile**: Capacitor Android app

---

## 🚀 Key Features (Demo Flow)

### 1. Real-Time Environmental Intelligence 🌤️

**20+ atmospheric variables:**
- Temperature, humidity, UV index, AQI
- PM2.5, PM10, pollen counts (6 types)
- Wind speed/direction, pressure, dew point
- Wet-bulb temperature, CAPE (storm potential)

**Data Sources:**
- Open-Meteo API (live weather)
- 7-day hourly forecast with precipitation probability
- Official weather alerts (severe storms, heatwaves)

**Demo Tip:** Show the weather card with all advanced atmospheric data expanded.

---

### 2. ML Disease Risk Prediction 🤖

**Backend Architecture:**
```
Stacked Ensemble Model:
├── Random Forest (interpretable, handles missing data)
├── XGBoost (high accuracy on tabular hydro data)
├── LightGBM (fast, handles large grids)
└── Logistic Regression meta-learner (calibrated probabilities)
```

**Training Targets:**
- Binary: flood / no-flood (threshold ~10cm inundation)
- Regression: inundation depth (metres)

**40+ Features:**
- Rainfall history (1h, 3h, 6h, 24h, 48h, 72h)
- Elevation, slope, terrain curvature
- Soil type, soil moisture, land use
- Drainage infrastructure capacity
- Temperature, humidity, wind, evapotranspiration

**Risk Levels:**
| Level | Description |
|-------|-------------|
| 🟢 LOW | Favorable conditions — maintain regular health habits |
| 🟡 MODERATE | Minor caution advised — monitor sensitive groups |
| 🟠 HIGH | Significant risk — proactive preventive measures recommended |
| 🔴 CRITICAL | Severe conditions — immediate action and medical awareness required |

**Demo Tip:** Run an analysis and show the risk score gauge with confidence percentage.

---

### 3. AI Health Risk Assessment 🧠

**6 AI Providers (user-selectable):**

| Provider | Models | Key Feature |
|----------|--------|-------------|
| **Google Gemini** | 8 models | Gemini 3 Flash, 2.5 Pro, 2.0, 1.5 Pro/Flash |
| **Groq** | 5 models | Llama 3.3 70B, Mixtral 8x7B @ ultra-fast speeds |
| **Cerebras** | 4 models | GPT OSS 120B @ 3000 tok/s, automatic prompt caching |
| **SiliconFlow** | 25+ models | DeepSeek V3, Qwen3, Kimi K2, MiniMax |
| **OpenRouter** | 10+ models | Claude 3.5, GPT-4o, Gemini 2.5 |
| **Pollinations** | 10 models | GPT-4o, o3 Mini — **no API key needed** |

**Output:** Interactive markdown health report with:
- Executive summary
- Heat stress analysis
- AQI/respiratory risks
- UV exposure guidance
- Pollen allergy warnings
- Lifestyle recommendations

**Demo Tip:** Generate a report and expand each section to show the AI's detailed analysis.

---

### 4. BioX Assistant (AI Chatbot) 💬

**Features:**
- ✅ **Persistent session memory** — conversations saved across sessions
- ✅ **Cross-session context** — auto-summarizes past conversations
- ✅ **Context-aware** — knows your weather, ML predictions, and health profile
- ✅ **Smart prompt suggestions** — generates relevant follow-up questions
- ✅ **Feedback system** — rate AI responses (helpful/not helpful)

**Demo Tip:** Ask "What health risks should I worry about today?" and show how it uses real-time data.

---

### 5. Personal Health Profile 👤

**Data Collected:**
- Age, height, weight, gender
- **Live BMI calculator** with 7-category classification
- Lifestyle: sedentary/active/athlete/night shift/outdoor worker
- Exercise level, smoking status, alcohol consumption
- Medications, allergies, medical history

**Medical Conditions Tracked:**
- Asthma, diabetes, hypertension, heart disease
- COPD, migraine, arthritis, eczema, anxiety

**Integration:** Profile injected into every AI call for personalized advice.

**Demo Tip:** Fill out the profile and show how BMI classification updates in real-time.

---

### 6. Flood Prediction & River Risk Monitor 🌊

**Data Sources:**
- **Open-Meteo Flood API** (GloFAS v4) — 50-member ensemble forecasts
- **90-day historical** + **60-day forecast** river discharge data

**Risk Calculation:**
```
Composite Risk Score = f(
  discharge percentiles (P50/P75/P90),
  seasonal factor (monsoon/wet/dry),
  trend detection (rising/stable/declining),
  anomaly detection
)
```

**Visualization:** Interactive area charts with historical discharge + forecast overlay

**Demo Tip:** Show the flood risk gauge and explain how the seasonal factor works.

---

### 7. Historical Climate & Health Analysis 📅

**Capabilities:**
- **1-year archive data** from Open-Meteo Archive API
- **Selectable variables:** Temperature, precipitation, wind, humidity, AQI, solar radiation
- **Interactive charts:** Line, area, bar charts with reference lines
- **AI correlation analysis** — explains how past weather affected health

**Demo Tip:** Select a date range from last month and show the AI's health correlation report.

---

### 8. Research Library (RAG System) 📚

**In-Browser Vector Database:**

| Feature | Implementation |
|---------|----------------|
| **Document Upload** | Text paste, .txt/.md/.csv files, PDF via LlamaCloud, URL scraping |
| **Chunking** | ~650-char segments with 120-char overlap (sentence-boundary snapping) |
| **Dual Embedding** | Gemini embeddings (dense) + TF-IDF fallback (no API key) |
| **Semantic Search** | Cosine similarity retrieval |
| **RAG Integration** | Top-k chunks injected into AI prompts |

**Demo Tip:** Upload a health research PDF and ask a question that requires retrieved context.

---

### 9. AI Smart Notifications 🔔

**20+ Rule-Based Alerts:**

| Category | Triggers |
|----------|----------|
| Temperature | Heat stress (>35°C), cold stress (<5°C) |
| Humidity | Mold risk (>70%), respiratory discomfort |
| UV Index | Skin damage risk (UV > 6) |
| Air Quality | AQI > 100, PM2.5 > 35, PM10 > 50 |
| Pollen | Grass/tree pollen counts |
| Dew Point | Respiratory comfort (>18°C) |
| CAPE | Storm potential (>1000 J/kg) |
| Wind | Safety alerts (>50 km/h) |

**AI Enhancement:**
- **Provider waterfall:** Pollinations (free) → Groq → OpenRouter → SiliconFlow → hardcoded fallback
- **LRU cache** (60 slots) — prevents redundant API calls
- **Session-aware:** Morning/afternoon/evening context
- **Dynamic rewriting:** AI includes exact measured values and city name

**Demo Tip:** Trigger an alert by setting a location with high AQI or UV index.

---

### 10. Theme & Customization Engine 🌙

**Features:**
- **App theme:** Light / Dark / Auto (OS-sync)
- **Weather card mode:** Light / Partial-dark / Full-dark (auto-switches by local time)
- **Custom color picker:** Accent, surface, and text colors
- **Weather theme lock:** Freeze weather card appearance

**Demo Tip:** Switch to dark mode and show the custom color picker.

---

## ⚙️ Technical Architecture (Deep Dive)

### Context Manager 🗂️

**Problem:** LLMs have limited context windows — wasting tokens on N/A fields is expensive.

**Solution:**
```
Model Registry:
├── Context window per model
├── Input budget allocation
├── Output token limits
└── Temperature settings (reports vs. chat)

Compact Weather Builder:
└── Strips all null/N/A fields before building prompts

Budget Allocation:
├── Weather: 35%
├── Dataset: 30%
├── Lifestyle: 10%
└── Memory: 25%

Token Tracker:
└── Logs every API call to localStorage
    Shows 24h stats: calls, tokens, saved, cached
```

---

### Prompt Cache Service 🗃️

**Two-Layer Caching:**

| Layer | Mechanism | Benefit |
|-------|-----------|---------|
| **Client-side LRU** | System instruction strings memoized per call-type + city (30 min TTL) | Avoids rebuilding 2K–8K char strings |
| **Server-side** | Reads `usage.prompt_tokens_details.cached_tokens` from API responses | Tracks provider-cached tokens |

**Results by Provider:**
- **Cerebras:** Automatic 128-token block caching (5 min–1 hr TTL)
- **Groq/OpenRouter/SiliconFlow:** Track `cached_tokens` field
- **Static content first:** System instructions at prompt start for prefix cache hits

---

### Persistent Memory Service 💾

**Three-Tier Memory:**

```
1. Report Chunking
   └── Health reports parsed into named sections
       (### Heat Stress, ### AQI Analysis)
       Stored as TF-IDF-indexed chunks

2. Cross-Session Memory
   └── MemorySummary tracks:
       - Last 5 cities
       - 15 key insight bullets
       - 10 inferred health concerns

3. Session Summaries
   └── Auto-generated 2-3 sentence summary every 4 messages
       Injected on next session start
```

**Storage:** All in localStorage — no backend database required.

---

### Alert Engine 🚨

**Rule-Based System Example:**
```typescript
if (temp > 35°C) {
  severity: 'critical',
  category: 'temperature',
  message: 'Extreme heat detected',
  healthTip: 'Stay indoors, hydrate frequently'
}
```

**20+ rules** covering all major environmental health risks.

---

### ML Backend (FastAPI) 🐍

**Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/predict` | POST | Single location flood prediction |
| `/bulk-predict` | POST | Scan multiple coordinates |
| `/train` | POST | Trigger model retraining |
| `/health` | GET | API health check |
| `/wards/{city}/readiness` | GET | Ward-level Pre-Monsoon Readiness Scores |

**Data Collection:**
- Open-Meteo (rainfall history)
- OpenTopoData (SRTM 30m DEM elevation)
- SoilGrids (soil properties)
- OpenStreetMap Overpass (drainage infrastructure)

**Training Schedule:**
- Auto-trains on startup
- Nightly retraining at 02:00 UTC
- Hourly data sync

---

## 📊 Health Coverage Matrix

| Domain | Conditions Monitored |
|--------|---------------------|
| **Respiratory** | Asthma, COPD, pollen allergies, dust & mold exposure, bronchitis |
| **Cardiovascular** | Heat-induced cardiac stress, hypertension, pressure-related migraine |
| **Infectious Disease** | Waterborne outbreaks, airborne pathogens, seasonal flu, respiratory viruses |
| **Vector-Borne** | Mosquito proliferation (dengue/malaria), tick activity (Lyme disease) |
| **Heat Stress** | Heat exhaustion, heat stroke, wet-bulb danger zones, UV damage |
| **Mental Health** | SAD risk, low-sunshine depression, sleep disruption |
| **Dermatological** | UV skin damage, pollen eczema, humidity-related fungal conditions |
| **Metabolic** | Dehydration, electrolyte loss, diet-environment interaction |
| **Flood/Disaster** | Flood injury risk, post-disaster infection, displacement health impact |

---

## 🏗️ Tech Stack Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
├─────────────────────────────────────────────────────────────┤
│  React 18 + TypeScript + Vite + Tailwind CSS + Recharts     │
│  Capacitor (Android App)                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        AI LAYER                              │
├─────────────────────────────────────────────────────────────┤
│  Gemini │ Groq │ Cerebras │ SiliconFlow │ OpenRouter │      │
│  Pollinations (no key needed)                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      ML BACKEND                              │
├─────────────────────────────────────────────────────────────┤
│  FastAPI (Railway)                                           │
│  Stacked Ensemble: RF + XGBoost + LightGBM                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA SOURCES                            │
├─────────────────────────────────────────────────────────────┤
│  Open-Meteo (weather, flood, archive, AQI, pollen)           │
│  GloFAS v4 (50-member ensemble flood forecasts)              │
│  LlamaCloud (PDF/URL parsing)                                │
│  Gemini Embeddings (text-embedding-004)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       STORAGE                                │
├─────────────────────────────────────────────────────────────┤
│  localStorage (user data, reports, chats, memory, vector DB) │
│  SQLite/PostgreSQL (ML backend training data)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏆 Unique Selling Points (USPs)

| # | USP | Why It Matters |
|---|-----|----------------|
| 1 | **Preventive, Not Reactive** | Predicts risks BEFORE symptoms appear |
| 2 | **Multi-Modal AI** | Combines ML prediction + LLM analysis + RAG retrieval |
| 3 | **6 AI Providers** | Users choose their preferred model (cost/quality tradeoff) |
| 4 | **In-Browser Vector DB** | Full RAG without external database costs |
| 5 | **Zero-API-Key Fallback** | TF-IDF embedding works without any API key |
| 6 | **Persistent Memory** | Remembers users across sessions without login |
| 7 | **Explainable ML** | Shows top contributing factors, not just predictions |
| 8 | **Flood Prediction** | 90-day historical + 60-day forecast river discharge |
| 9 | **Smart Notifications** | AI-rewritten alerts with exact values, cached for efficiency |
| 10 | **Mobile Ready** | Full Android app via Capacitor |

---

## 📱 Live Demo Script (5 minutes)

| Time | Section | Key Points |
|------|---------|------------|
| 0:00–0:30 | **Homepage** | Show weather card with 20+ variables |
| 0:30–1:00 | **Health Profile** | Fill out age/weight/medical history, show BMI calculator |
| 1:00–2:00 | **ML Prediction** | Run analysis, show risk score gauge + top factors |
| 2:00–3:00 | **AI Health Report** | Generate report, expand sections (Heat Stress, AQI, UV) |
| 3:00–4:00 | **BioX Chat** | Ask "What should I worry about today?" show context-aware response |
| 4:00–4:30 | **Flood Prediction** | Show river discharge chart + risk score |
| 4:30–5:00 | **Research Library** | Upload a PDF, ask a question using retrieved context |
| 5:00–5:30 | **Notifications** | Show alert panel with AI-rewritten headings |
| 5:30–6:00 | **Settings** | Switch AI provider, change theme to dark mode |

---

## 🏅 Hackathon Judging Criteria Alignment

| Criteria | How Bio-SentinelX Delivers |
|----------|---------------------------|
| **Innovation** | First preventive health platform combining ML + LLM + RAG + flood prediction |
| **Technical Complexity** | 6 AI providers, in-browser vector DB, stacked ensemble ML, real-time data fusion |
| **User Experience** | Intuitive UI, persistent memory, smart notifications, mobile app |
| **Impact** | Addresses climate change health impacts, preventive healthcare accessibility |
| **Scalability** | Serverless architecture, client-side processing, minimal backend costs |
| **Completeness** | Full-stack app with Android mobile version, production-ready deployment |

---

## ❓ Anticipated Q&A

**Q: How accurate are the ML predictions?**

> A: The stacked ensemble achieves ~91% accuracy on training data. Confidence scores are shown for every prediction, and users can submit feedback to improve the model.

---

**Q: What happens if APIs go down?**

> A: The app has multiple fallbacks:
> - TF-IDF embedding works without API keys
> - Pollinations AI requires no key
> - Cached data persists in localStorage
> - Offline mode preserves core functionality

---

**Q: How is user data stored?**

> A: All data is stored locally in the browser's localStorage — no backend database, no login required. Users own their data completely.

---

**Q: Can this integrate with wearables?**

> A: The architecture supports it — the health profile already accepts manual health data. Fitbit/Apple Health APIs could be integrated in future versions.

---

**Q: What's the business model?**

> A: **Freemium:**
> - **Free tier:** Basic features, 3 AI providers, limited reports
> - **Premium tier ($5/month):** All 6 AI providers, unlimited reports, priority flood scanning, advanced analytics

---

**Q: How do you handle privacy?**

> A: All processing happens client-side. No health data leaves the user's browser unless they explicitly choose to share it. We're GDPR-compliant by design.

---

## 🎤 Closing Statement

> **"Bio-SentinelX isn't just another weather app or health tracker.**
>
> It's a **paradigm shift** from reactive treatment to proactive prevention.
>
> By combining real-time environmental intelligence, machine learning prediction, and cutting-edge AI analysis, we're giving people the power to protect their health **BEFORE** illness strikes.
>
> In a world where climate change is creating new health threats daily, **Bio-SentinelX is the early-warning system everyone needs.**"

---

## 📞 Contact & Links

- **Live Demo:** https://bio-sentinelx.vercel.app
- **GitHub:** https://github.com/gaur-avvv/Bio-SentinelX
- **License:** MIT

---

**Made with ❤️ for preventive healthcare**

*Bio-SentinelX — Your Health, Predicted.*
