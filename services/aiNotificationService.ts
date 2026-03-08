/**
 * aiNotificationService.ts
 * ─────────────────────────────────────────────────────────
 * Generates dynamic, AI-powered notification headings for
 * health alerts using a waterfall of AI providers:
 *
 *   1. Pollinations AI  — completely free, no API key needed
 *   2. Groq             — free tier (key from localStorage)
 *   3. OpenRouter       — free-tier models (key from localStorage)
 *   4. SiliconFlow      — paid API (key from localStorage)
 *
 * Falls back to the original hardcoded title if every provider fails.
 */

import { notificationPlainText } from '../utils/notificationText';

export interface AlertAIContext {
  category: string;
  severity: 'critical' | 'warning' | 'info';
  factor: string;
  value: string;
  city: string;
  temp: number;
  humidity: number;
  rawTitle: string;    // hardcoded fallback title
  rawMessage: string;  // brief context for the AI
  userContext?: string; // optional: saved profile + recent symptoms
}

// ─── In-memory LRU-style cache ────────────────────────────────────────────────
// key: `${severity}_${category}_${value}` → { title, message }
const _cache = new Map<string, { title: string; message: string }>();
const MAX_CACHE = 60;
const _cacheKey = (ctx: AlertAIContext) =>
  `${ctx.severity}|${ctx.category}|${ctx.value}`;

function readLocalKey(storageKey: string): string {
  try { return localStorage.getItem(storageKey) ?? ''; } catch { return ''; }
}

// ─── Build prompt ─────────────────────────────────────────────────────────────
function buildTitlePrompt(ctx: AlertAIContext): string {
  return `You are a health-alert notification AI for the app Bio-SentinelX.

Generate a SHORT, URGENT, SPECIFIC notification heading for this weather-health alert.

Alert context:
- Location: ${ctx.city}
- Condition: ${ctx.factor} = ${ctx.value}
- Severity: ${ctx.severity.toUpperCase()}
- Category: ${ctx.category}
- Current temp: ${ctx.temp}°C | humidity: ${ctx.humidity}%
- User context: ${(ctx.userContext ?? 'None').slice(0, 260)}
- Original heading: ${ctx.rawTitle}
- Details: ${ctx.rawMessage.slice(0, 200)}

Rules:
1. Max 9 words — punchy, headline style
2. Include the actual measured value (e.g. "${ctx.value}")
3. Match severity tone: CRITICAL = alarming/urgent, WARNING = cautious, INFO = advisory
4. Use active/imperative voice
5. NO markdown, NO quotes, NO explanation — return ONLY the heading text

Heading:`;
}

function buildMessagePrompt(ctx: AlertAIContext): string {
  return `You are a health-alert AI for Bio-SentinelX.

Rewrite this health-alert body text to be MORE SPECIFIC, PERSONAL, and URGENT.

Alert context:
- Location: ${ctx.city}
- ${ctx.factor}: ${ctx.value}  |  Severity: ${ctx.severity.toUpperCase()}
- Temperature: ${ctx.temp}°C  |  Humidity: ${ctx.humidity}%
- User context: ${(ctx.userContext ?? 'None').slice(0, 400)}
- Original message: ${ctx.rawMessage}

Rules:
1. 2–3 sentences maximum
2. Mention the actual value (${ctx.value}) and city (${ctx.city})
3. Describe the health risk clearly
4. NO markdown, NO bullet points, NO quotes — plain text only
5. Return ONLY the alert message text

Alert message:`;
}

// ─── Provider 1: Pollinations AI (free, no key required) ─────────────────────
// Models tried in order; first success wins
const POLLINATIONS_MODELS = [
  'openai',        // GPT-4o mini via Pollinations — fastest, free
  'mistral',       // Mistral 7B
  'llama',         // Llama 3.1 8B
  'qwen',          // Qwen 2.5
];

async function pollinationsGenerate(prompt: string): Promise<string> {
  const apiKey = readLocalKey('biosentinel_pollinations_key');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let lastError = '';
  for (const model of POLLINATIONS_MODELS) {
    try {
      const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 80,
          private: true,
        }),
      });
      if (!res.ok) {
        lastError = `Pollinations/${model} ${res.status}`;
        continue;
      }
      const data = await res.json() as any;
      const text = (data.choices?.[0]?.message?.content ?? '').trim();
      if (text.length > 3) return text;
    } catch (e: any) {
      lastError = e?.message ?? 'Pollinations error';
    }
  }
  throw new Error(`Pollinations failed: ${lastError}`);
}

// ─── Provider 2: Groq (free tier) ────────────────────────────────────────────
const GROQ_MODELS = [
  'llama-3.1-8b-instant',    // fastest
  'llama3-8b-8192',          // fallback
  'gemma2-9b-it',            // Google Gemma free
  'mixtral-8x7b-32768',      // Mixtral free
];

async function groqGenerate(prompt: string): Promise<string> {
  const apiKey = readLocalKey('biosentinel_groq_key');
  if (!apiKey) throw new Error('No Groq key');

  let lastError = '';
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 80,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        // 429 = rate limit — stop trying more models, they share quota
        if (res.status === 429) throw new Error('Groq rate limit');
        lastError = err?.error?.message ?? `Groq/${model} ${res.status}`;
        continue;
      }
      const data = await res.json() as any;
      const text = (data.choices?.[0]?.message?.content ?? '').trim();
      if (text.length > 3) return text;
    } catch (e: any) {
      if (e?.message?.includes('rate limit')) throw e; // bubble up to stop loop
      lastError = e?.message ?? 'Groq error';
    }
  }
  throw new Error(`Groq failed: ${lastError}`);
}

// ─── Provider 3: OpenRouter free models ──────────────────────────────────────
const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-3-4b-it:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'qwen/qwen-2.5-7b-instruct:free',
];

async function openrouterGenerate(prompt: string): Promise<string> {
  const apiKey = readLocalKey('biosentinel_openrouter_key');
  if (!apiKey) throw new Error('No OpenRouter key');

  let lastError = '';
  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://bio-sentinelx.app',
          'X-Title': 'Bio-SentinelX Alerts',
        },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 80,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        lastError = err?.error?.message ?? `OpenRouter/${model} ${res.status}`;
        continue;
      }
      const data = await res.json() as any;
      const text = (data.choices?.[0]?.message?.content ?? '').trim();
      if (text.length > 3) return text;
    } catch (e: any) {
      lastError = e?.message ?? 'OpenRouter error';
    }
  }
  throw new Error(`OpenRouter failed: ${lastError}`);
}

// ─── Provider 4: SiliconFlow API ─────────────────────────────────────────────
async function siliconflowGenerate(prompt: string): Promise<string> {
  const apiKey = readLocalKey('biosentinel_siliconflow_key');
  if (!apiKey) throw new Error('No SiliconFlow key');

  const res = await fetch('https://api.siliconflow.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 80,
    }),
  });
  if (!res.ok) throw new Error(`SiliconFlow ${res.status}`);
  const data = await res.json() as any;
  const text = (data.choices?.[0]?.message?.content ?? '').trim();
  if (text.length > 3) return text;
  throw new Error('SiliconFlow: empty response');
}

// ─── Clean & validate AI output ───────────────────────────────────────────────
function cleanTitle(raw: string, fallback: string): string {
  // Strip common AI artifacts
  let t = notificationPlainText(raw, 800)
    .replace(/^["'`«»]|["'`«»]$/g, '')   // surrounding quotes
    .replace(/\s+/g, ' ')
    .trim();

  // Sanity: max 80 chars, min 5 chars, must not be pure whitespace
  if (t.length < 5 || t.length > 80) return fallback;
  return t;
}

function cleanMessage(raw: string, fallback: string): string {
  let t = notificationPlainText(raw, 2000)
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 10 || t.length > 600) return fallback;
  return t;
}

// ─── Provider waterfall ───────────────────────────────────────────────────────
async function runProviderWaterfall(prompt: string): Promise<string> {
  const providers: Array<() => Promise<string>> = [
    () => pollinationsGenerate(prompt),
    () => groqGenerate(prompt),
    () => openrouterGenerate(prompt),
    () => siliconflowGenerate(prompt),
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result && result.length > 3) return result;
    } catch (_) {
      // Try next provider silently
    }
  }
  throw new Error('All AI providers failed');
}

// ─── Public: generate AI heading + message for one alert ────────────────────
/**
 * Returns AI-generated { title, message } for the alert context.
 * Falls back to the original hardcoded values on any failure.
 * Results are cached so repeated calls for the same condition are instant.
 */
export async function generateAIAlertContent(
  ctx: AlertAIContext
): Promise<{ title: string; message: string }> {
  const key = _cacheKey(ctx);

  // Cache hit
  if (_cache.has(key)) return _cache.get(key)!;

  // Default fallback
  const fallback = { title: ctx.rawTitle, message: ctx.rawMessage };

  try {
    // Generate title and message in parallel for speed
    const [titleRaw, messageRaw] = await Promise.allSettled([
      runProviderWaterfall(buildTitlePrompt(ctx)),
      runProviderWaterfall(buildMessagePrompt(ctx)),
    ]);

    const title   = titleRaw.status   === 'fulfilled'
      ? cleanTitle(titleRaw.value, ctx.rawTitle)
      : ctx.rawTitle;

    const message = messageRaw.status === 'fulfilled'
      ? cleanMessage(messageRaw.value, ctx.rawMessage)
      : ctx.rawMessage;

    const result = { title, message };

    // Store in cache (LRU eviction: remove oldest if full)
    if (_cache.size >= MAX_CACHE) {
      _cache.delete(_cache.keys().next().value!);
    }
    _cache.set(key, result);

    console.info(`[AI Alert] Generated: "${title}"`);
    return result;

  } catch (e) {
    console.warn('[AI Alert] All providers failed, using fallback title:', e);
    return fallback;
  }
}

/**
 * Enrich an array of HealthAlert objects with AI-generated titles/messages.
 * Each alert is enriched concurrently. Original values are kept on failure.
 */
export async function enrichAlertsWithAI(
  alerts: Array<{
    id: string; category: string; severity: 'critical' | 'warning' | 'info';
    factor: string; value: string; title: string; message: string;
  }>,
  weatherCtx: { city: string; temp: number; humidity: number },
  opts?: { userContext?: string }
): Promise<void> {
  await Promise.all(
    alerts.map(async (alert) => {
      const ctx: AlertAIContext = {
        category:   alert.category,
        severity:   alert.severity,
        factor:     alert.factor,
        value:      alert.value,
        city:       weatherCtx.city,
        temp:       weatherCtx.temp,
        humidity:   weatherCtx.humidity,
        rawTitle:   alert.title,
        rawMessage: alert.message,
        userContext: opts?.userContext,
      };
      const { title, message } = await generateAIAlertContent(ctx);
      alert.title   = title;
      alert.message = message;
    })
  );
}
