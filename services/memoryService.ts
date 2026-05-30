/**
 * BioSentinelX — Persistent Memory Service
 *
 * Stores and retrieves:
 *  1. Report History  — saved health risk reports per location/date
 *  2. Chat Sessions   — full multi-session chat history with auto-summaries
 *  3. Cross-session Memory — compressed summaries injected into future chats
 *
 * All data is stored in localStorage — no backend or DB required.
 * Max storage caps prevent quota exhaustion.
 */

import {
  tokenize,
  buildTFIDF,
  cosineSparse,
  cosineDense,
  hybridSearch,
  embedWithGemini,
  type SearchChunk
} from './vectorSearchEngine';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const KEYS = {
  REPORTS:        'biosentinel_report_history_v2',
  REPORT_CHUNKS:  'biosentinel_report_chunks_v2',   // ← section chunks, separately stored
  CHAT_SESSIONS:  'biosentinel_chat_sessions_v2',
  MEMORY_SUMMARY: 'biosentinel_memory_summary_v2',
  SYMPTOM_LOG:    'biosentinel_symptom_log_v1',
  // legacy keys
  LEGACY_REPORTS: 'biosentinel_reports_memory',
  LEGACY_CHAT:    'biosentinel_chat_v1',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredReport {
  id: string;
  timestamp: number;          // Unix ms
  date: string;               // ISO string
  city: string;               // Location
  title: string;              // e.g. "Health Risk Assessment – Mumbai"
  summary: string;            // First 300 chars of markdown (preview)
  content?: string;           // Full markdown — omitted when sectionCount is set (content lives in chunks)
  sectionCount?: number;      // Number of parsed sections stored as chunks
  riskScore?: number;         // 0-100 from ML prediction if available
  primaryRisk?: string;       // e.g. "High AQI", "Heat Stress"
  provider?: string;          // AI provider used
  model?: string;             // AI model used
}

// ── Section chunk stored separately ──────────────────────────────────────────

export interface ReportSection {
  id: string;                           // unique chunk id
  reportId: string;                     // parent report id
  city: string;
  date: string;
  sectionTitle: string;                 // e.g. "Weather-Health Correlation"
  text: string;                         // full section text
  tfidf: Record<string, number>;        // TF-IDF vector for retrieval
  embedding?: number[];                 // Dense embedding for semantic hybrid search
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp?: number;
}

export interface ChatSession {
  id: string;
  startedAt: number;
  lastActivity: number;
  city?: string;
  messages: ChatMessage[];
  summary?: string;           // Compressed 2-3 sentence summary for cross-session memory
  embedding?: number[];       // Dense embedding of the summary for semantic retrieval
  messageCount: number;
}

export interface MemorySummary {
  lastUpdated: number;
  recentCities: string[];     // Last 5 unique cities visited
  keyHealthInsights: string[]; // Up to 10 bullet points extracted from past reports
  ongoingConcerns: string[];  // Conditions/risks mentioned across sessions
  userPreferences: string[];  // Deduced from chat (e.g. "prefers outdoor workouts")
}

// ─── Symptom History (lightweight, user-entered) ─────────────────────────────

export type SymptomSeverity = 'info' | 'warning' | 'critical';

export interface SymptomEntry {
  id: string;
  timestamp: number;
  city?: string;
  text: string;
  severity?: SymptomSeverity;
  tags?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // localStorage quota exceeded — try to free up space
    console.warn('[Memory] localStorage quota hit, pruning old data...');
    pruneStorage();
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

/** Remove oldest data to free space */
function pruneStorage(): void {
  // Trim reports to 5
  const reports = safeGet<StoredReport[]>(KEYS.REPORTS, []);
  if (reports.length > 5) {
    const pruned = reports.slice(-5);
    safeSet(KEYS.REPORTS, pruned);
    // Also prune orphaned chunks
    const keepIds = new Set(pruned.map(r => r.id));
    const chunks = safeGet<ReportSection[]>(KEYS.REPORT_CHUNKS, []);
    safeSet(KEYS.REPORT_CHUNKS, chunks.filter(c => keepIds.has(c.reportId)));
  }
  // Trim sessions to 3 and strip full messages (keep summary only)
  const sessions = safeGet<ChatSession[]>(KEYS.CHAT_SESSIONS, []);
  if (sessions.length > 3) {
    const pruned = sessions.slice(-3).map(s => ({ ...s, messages: s.messages.slice(-10) }));
    safeSet(KEYS.CHAT_SESSIONS, pruned);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Symptom Log API ─────────────────────────────────────────────────────────

function loadSymptomLog(): SymptomEntry[] {
  return safeGet<SymptomEntry[]>(KEYS.SYMPTOM_LOG, []);
}

function saveSymptomLog(entries: SymptomEntry[]): void {
  safeSet(KEYS.SYMPTOM_LOG, entries.slice(-60));
}

export function appendSymptomEntry(entry: Omit<SymptomEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): SymptomEntry {
  const e: SymptomEntry = {
    id: entry.id ?? generateId(),
    timestamp: entry.timestamp ?? Date.now(),
    city: entry.city,
    text: entry.text,
    severity: entry.severity,
    tags: entry.tags,
  };
  const existing = loadSymptomLog();
  saveSymptomLog([...existing, e]);
  return e;
}

export function getRecentSymptoms(limit = 20): SymptomEntry[] {
  const all = loadSymptomLog();
  return all.slice(-Math.max(1, limit)).reverse();
}

export function clearSymptomLog(): void {
  localStorage.removeItem(KEYS.SYMPTOM_LOG);
}

// ─── Section parser ───────────────────────────────────────────────────────────

/**
 * Parse a health report markdown string into named sections.
 * Splits on `### Heading` and `#### Sub-heading` markers.
 * Sections shorter than 40 chars are merged into the previous one.
 */
function parseMarkdownSections(markdown: string): Array<{ title: string; text: string }> {
  const lines = markdown.split('\n');
  const sections: Array<{ title: string; text: string }> = [];
  let currentTitle = 'Overview';
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (text.length >= 40) {
      sections.push({ title: currentTitle, text });
    } else if (sections.length > 0) {
      // merge short orphan into previous section
      sections[sections.length - 1].text += '\n' + text;
    }
    currentLines = [];
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flush();
      currentTitle = h[2].trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();
  return sections;
}

// ─── Chunk storage helpers ────────────────────────────────────────────────────

function loadReportChunks(): ReportSection[] {
  return safeGet<ReportSection[]>(KEYS.REPORT_CHUNKS, []);
}

function saveReportChunks(chunks: ReportSection[]): void {
  // Keep last 500 chunks total (~50 reports × 10 sections average)
  const trimmed = chunks.slice(-500);
  safeSet(KEYS.REPORT_CHUNKS, trimmed);
}

/**
 * Chunk a report into sections, build TF-IDF for each, and persist.
 * Returns the number of sections stored.
 */
function chunkAndStoreReport(
  reportId: string,
  city: string,
  date: string,
  markdown: string
): number {
  const existing = loadReportChunks().filter(c => c.reportId !== reportId); // dedupe
  const sections = parseMarkdownSections(markdown);

  const newChunks: ReportSection[] = sections.map(s => ({
    id: generateId(),
    reportId,
    city,
    date,
    sectionTitle: s.title,
    text: s.text,
    tfidf: buildTFIDF(`${s.title} ${s.text}`),
  }));

  saveReportChunks([...existing, ...newChunks]);
  return newChunks.length;
}

/**
 * Retrieve all section chunks for a specific report.
 */
export function getReportChunks(reportId: string): ReportSection[] {
  return loadReportChunks().filter(c => c.reportId === reportId);
}

/**
 * Reconstruct full markdown from stored section chunks.
 * Falls back to `report.content` if chunks are absent (backward compat).
 */
export function reconstructReportContent(report: StoredReport): string {
  const chunks = getReportChunks(report.id);
  if (chunks.length > 0) {
    return chunks.map(c => `### ${c.sectionTitle}\n${c.text}`).join('\n\n');
  }
  return report.content ?? '';
}

/**
 * Hybrid search across all stored report section chunks.
 * Leverages dense search if embeddings and geminiKey are present, otherwise falls back to TF-IDF.
 */
export async function searchReportChunks(
  query: string,
  topK = 5,
  city?: string,
  geminiKey?: string
): Promise<ReportSection[]> {
  const chunks = loadReportChunks();
  let filtered = city ? chunks.filter(c => c.city === city) : chunks;
  if (filtered.length === 0) return [];

  // If geminiKey and any chunk has dense embedding, use hybridSearch from vectorSearchEngine
  const hasDense = filtered.some(c => !!c.embedding);
  if (geminiKey && hasDense) {
    try {
      const searchChunks: SearchChunk[] = filtered.map(c => ({
        id: c.id,
        text: c.text,
        embedding: c.embedding,
        tfidf: c.tfidf,
        docId: c.reportId,
        docTitle: c.sectionTitle
      }));
      const results = await hybridSearch(query, searchChunks, {
        topK,
        geminiKey,
        useDense: true,
        useSparse: true,
        rerank: false
      });
      // Map results back to ReportSections
      return results
        .map(r => filtered.find(c => c.id === r.chunkId)!)
        .filter(Boolean);
    } catch (e) {
      console.warn('[MemoryService] Hybrid chunk search failed, falling back to TF-IDF:', e);
    }
  }

  // Fallback to TF-IDF search
  const queryVec = buildTFIDF(query);
  return filtered
    .map(c => ({ chunk: c, score: cosineSparse(queryVec, c.tfidf) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(x => x.chunk);
}

/**
 * Delete all chunks belonging to a report.
 */
function deleteReportChunksById(reportId: string): void {
  const chunks = loadReportChunks().filter(c => c.reportId !== reportId);
  saveReportChunks(chunks);
}

function extractSummary(markdown: string, chars = 300): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')   // remove headings
    .replace(/\*\*/g, '')           // remove bold markers
    .replace(/\n{2,}/g, ' ')        // collapse newlines
    .trim()
    .slice(0, chars);
}

/** Extract key risk/insight bullet from report markdown */
function extractKeyInsights(markdown: string): string[] {
  const lines = markdown.split('\n');
  const insights: string[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim();
    if (
      trimmed.length > 20 &&
      trimmed.length < 200 &&
      /\b(risk|concern|warning|avoid|recommend|elevated|high|alert|caution|exposure|protect)\b/i.test(trimmed)
    ) {
      insights.push(trimmed);
      if (insights.length >= 10) break;
    }
  }
  return insights;
}

/** Build a 2-3 sentence session summary from messages */
function buildSessionSummary(messages: ChatMessage[]): string {
  const userMsgs = messages.filter(m => m.role === 'user').map(m => m.text).slice(0, 5);
  const modelMsgs = messages.filter(m => m.role === 'model').map(m => m.text.slice(0, 150)).slice(0, 3);
  if (userMsgs.length === 0) return '';
  return `User asked about: ${userMsgs.join('; ')}. Key advice: ${modelMsgs.join(' | ')}`.slice(0, 600);
}

// ─── Report History API ───────────────────────────────────────────────────────

export function saveReport(params: {
  city: string;
  content: string;
  riskScore?: number;
  primaryRisk?: string;
  provider?: string;
  model?: string;
}): StoredReport {
  const { city, content, riskScore, primaryRisk, provider, model } = params;
  const now = Date.now();
  const id = generateId();

  const report: StoredReport = {
    id,
    timestamp: now,
    date: new Date(now).toISOString(),
    city,
    title: `Health Risk Assessment — ${city}`,
    summary: extractSummary(content),
    riskScore,
    primaryRisk,
    provider,
    model,
  };

  const existing = safeGet<StoredReport[]>(KEYS.REPORTS, []);

  // Deduplicate by city + first 200 chars of content
  const duplicate = existing.some(r => {
    const rContent = reconstructReportContent(r);
    return r.city === city && rContent.slice(0, 200) === content.slice(0, 200);
  });
  if (duplicate) return existing[existing.length - 1] ?? report;

  // Chunk, parse, index, and store sections
  const sectionCount = chunkAndStoreReport(id, city, report.date, content);
  report.sectionCount = sectionCount;

  const updated = [...existing, report];
  if (updated.length > 20) updated.splice(0, updated.length - 20);
  safeSet(KEYS.REPORTS, updated);

  _updateMemorySummary(report, [], content);
  return report;
}

export function getReports(): StoredReport[] {
  const reports = safeGet<StoredReport[]>(KEYS.REPORTS, []);
  migrateLegacyReports();
  return safeGet<StoredReport[]>(KEYS.REPORTS, reports).sort((a, b) => b.timestamp - a.timestamp);
}

export function deleteReport(id: string): void {
  const reports = safeGet<StoredReport[]>(KEYS.REPORTS, []);
  safeSet(KEYS.REPORTS, reports.filter(r => r.id !== id));
  deleteReportChunksById(id);
}

export function clearAllReports(): void {
  localStorage.removeItem(KEYS.REPORTS);
  localStorage.removeItem(KEYS.REPORT_CHUNKS);
  localStorage.removeItem(KEYS.LEGACY_REPORTS);
}

// ─── Chat Session API ─────────────────────────────────────────────────────────

let _activeSessionId: string | null = null;

export function getOrCreateSession(city?: string): ChatSession {
  const sessions = safeGet<ChatSession[]>(KEYS.CHAT_SESSIONS, []);
  migrateLegacyChat(city);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  let session = sessions.find(s =>
    s.id === _activeSessionId ||
    s.startedAt >= todayStart.getTime()
  );

  if (!session) {
    session = {
      id: generateId(),
      startedAt: Date.now(),
      lastActivity: Date.now(),
      city,
      messages: [],
      messageCount: 0,
    };
    sessions.push(session);
    safeSet(KEYS.CHAT_SESSIONS, sessions.slice(-10));
  }

  _activeSessionId = session.id;
  return session;
}

export function appendMessages(messages: ChatMessage[], city?: string, geminiKey?: string): void {
  const sessions = safeGet<ChatSession[]>(KEYS.CHAT_SESSIONS, []);
  const session = getOrCreateSession(city);
  const idx = sessions.findIndex(s => s.id === session.id);
  
  const updated: ChatSession = {
    ...session,
    messages,
    messageCount: messages.length,
    lastActivity: Date.now(),
    city: city || session.city,
  };

  // Build summary once conversation gets substantial
  if (messages.length >= 4 && messages.length % 4 === 0) {
    const summaryText = buildSessionSummary(messages);
    updated.summary = summaryText;

    // Generate dense embedding for summary if key is available
    if (geminiKey && summaryText) {
      embedWithGemini(summaryText, geminiKey, 'RETRIEVAL_DOCUMENT')
        .then(emb => {
          updated.embedding = emb;
          const currentSessions = safeGet<ChatSession[]>(KEYS.CHAT_SESSIONS, []);
          const uIdx = currentSessions.findIndex(s => s.id === updated.id);
          if (uIdx >= 0) {
            currentSessions[uIdx] = updated;
            safeSet(KEYS.CHAT_SESSIONS, currentSessions);
          }
        })
        .catch(err => {
          console.warn('[Memory] Failed to generate chat summary embedding:', err);
        });
    }
  }

  if (idx >= 0) sessions[idx] = updated;
  else sessions.push(updated);

  safeSet(KEYS.CHAT_SESSIONS, sessions.slice(-10));
  _updateMemorySummary(null, messages);
}

export function getAllSessions(): ChatSession[] {
  return safeGet<ChatSession[]>(KEYS.CHAT_SESSIONS, []).sort((a, b) => b.lastActivity - a.lastActivity);
}

export function getCurrentSessionMessages(city?: string): ChatMessage[] {
  return getOrCreateSession(city).messages;
}

export function clearCurrentSession(): void {
  const sessions = safeGet<ChatSession[]>(KEYS.CHAT_SESSIONS, []);
  const session = getOrCreateSession();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    if (sessions[idx].messages.length > 0) {
      sessions[idx].summary = buildSessionSummary(sessions[idx].messages);
    }
    sessions[idx].messages = [];
    sessions[idx].messageCount = 0;
    safeSet(KEYS.CHAT_SESSIONS, sessions);
  }
  localStorage.removeItem(KEYS.LEGACY_CHAT);
  _activeSessionId = null;
}

// ─── Cross-Session Memory ─────────────────────────────────────────────────────

function _updateMemorySummary(report: StoredReport | null, messages: ChatMessage[], rawContent?: string): void {
  const mem = safeGet<MemorySummary>(KEYS.MEMORY_SUMMARY, {
    lastUpdated: 0,
    recentCities: [],
    keyHealthInsights: [],
    ongoingConcerns: [],
    userPreferences: [],
  });

  if (report) {
    if (report.city && !mem.recentCities.includes(report.city)) {
      mem.recentCities = [report.city, ...mem.recentCities].slice(0, 5);
    }
    const content = rawContent ?? reconstructReportContent(report);
    const newInsights = extractKeyInsights(content);
    mem.keyHealthInsights = [...new Set([...mem.keyHealthInsights, ...newInsights])].slice(0, 15);
  }

  if (messages.length > 0) {
    const concerns: string[] = [];
    for (const m of messages) {
      if (m.role !== 'user') continue;
      const text = m.text.toLowerCase();
      if (/asthma|breathe|lungs|chest/.test(text)) concerns.push('Respiratory sensitivity');
      if (/allerg|sneez|pollen/.test(text)) concerns.push('Allergy concerns');
      if (/heart|cardio|blood pressure|bp/.test(text)) concerns.push('Cardiovascular health');
      if (/diabetes|sugar|insulin/.test(text)) concerns.push('Diabetes management');
      if (/outdoor|exercise|run|hike/.test(text)) concerns.push('Outdoor exercise interest');
      if (/child|kid|infant|baby/.test(text)) concerns.push('Child health concerns');
      if (/elderly|senior|aged|parent/.test(text)) concerns.push('Elderly care concerns');
    }
    mem.ongoingConcerns = [...new Set([...mem.ongoingConcerns, ...concerns])].slice(0, 10);
  }

  mem.lastUpdated = Date.now();
  safeSet(KEYS.MEMORY_SUMMARY, mem);
}

export function getMemorySummary(): MemorySummary {
  return safeGet<MemorySummary>(KEYS.MEMORY_SUMMARY, {
    lastUpdated: 0,
    recentCities: [],
    keyHealthInsights: [],
    ongoingConcerns: [],
    userPreferences: [],
  });
}

/**
 * Build a compact memory context string to inject at the start of a chat prompt.
 * Uses hybrid / TF-IDF chunk search to surface the most relevant past report sections.
 */
export async function buildMemoryContext(city?: string, geminiKey?: string): Promise<string> {
  const mem = getMemorySummary();
  const sessions = getAllSessions().filter(s => s.summary);
  const recentReports = getReports().slice(0, 5);

  const parts: string[] = ['=== PERSISTENT MEMORY (across sessions) ==='];

  if (mem.recentCities.length) {
    parts.push(`Recently monitored locations: ${mem.recentCities.join(', ')}`);
  }
  if (mem.ongoingConcerns.length) {
    parts.push(`User health concerns noted in past sessions: ${mem.ongoingConcerns.join('; ')}`);
  }
  if (mem.keyHealthInsights.length) {
    parts.push(`Key insights from prior reports:\n${mem.keyHealthInsights.slice(0, 5).map(i => `• ${i}`).join('\n')}`);
  }
  if (sessions.length > 0) {
    const sessionSummaries = sessions.slice(0, 3).map(s =>
      `[${new Date(s.startedAt).toLocaleDateString()}${s.city ? ` — ${s.city}` : ''}]: ${s.summary}`
    );
    parts.push(`Past chat session summaries:\n${sessionSummaries.join('\n')}`);
  }

  // Surface relevant report sections via TF-IDF or dense hybrid search
  const queryTerms = [city, 'risk alert warning health recommendation'].filter(Boolean).join(' ');
  const relevantChunks = await searchReportChunks(queryTerms, 6, city, geminiKey);
  if (relevantChunks.length > 0) {
    const chunkText = relevantChunks.map(c =>
      `[${new Date(c.date).toLocaleDateString()} — ${c.city} | ${c.sectionTitle}]:\n${c.text.slice(0, 350)}`
    ).join('\n\n');
    parts.push(`Relevant sections from past reports (retrieved by context):\n${chunkText}`);
  } else if (recentReports.length > 0) {
    const reportPreviews = recentReports.map(r =>
      `[${new Date(r.timestamp).toLocaleDateString()} — ${r.city}]: ${r.summary.slice(0, 200)}`
    );
    parts.push(`Recent health report previews:\n${reportPreviews.join('\n\n')}`);
  }

  if (parts.length === 1) return '';
  parts.push('=== END MEMORY ===\n');
  return parts.join('\n\n');
}

/** Get past session summaries for a given city */
export function getPastSessionsForCity(city: string): ChatSession[] {
  return getAllSessions().filter(s => s.city === city && s.messageCount > 0);
}

// ─── Migration helpers ────────────────────────────────────────────────────────

let _migratedReports = false;
function migrateLegacyReports(): void {
  if (_migratedReports) return;
  _migratedReports = true;
  try {
    const legacy = safeGet<any[]>(KEYS.LEGACY_REPORTS, []);
    if (!legacy.length) return;
    const existing = safeGet<StoredReport[]>(KEYS.REPORTS, []);
    if (existing.length > 0) return; // already migrated
    const migrated: StoredReport[] = legacy.map((r, i) => {
      const id = generateId();
      const content: string = r.content || '';
      const date = r.date || new Date().toISOString();
      const city: string = r.city || 'Unknown';
      const sectionCount = content ? chunkAndStoreReport(id, city, date, content) : 0;
      return {
        id,
        timestamp: new Date(date).getTime() || Date.now() - i * 86400000,
        date,
        city,
        title: r.type || 'Health Risk Assessment',
        summary: extractSummary(content),
        sectionCount,
      };
    });
    safeSet(KEYS.REPORTS, migrated);
  } catch { /* noop */ }
}

let _migratedChat = false;
function migrateLegacyChat(city?: string): void {
  if (_migratedChat) return;
  _migratedChat = true;
  try {
    const legacyMsgs = safeGet<ChatMessage[]>(KEYS.LEGACY_CHAT, []);
    if (!legacyMsgs.length) return;
    const sessions = safeGet<ChatSession[]>(KEYS.CHAT_SESSIONS, []);
    if (sessions.length > 0) return; // already migrated

    const session: ChatSession = {
      id: generateId(),
      startedAt: Date.now() - 86400000, // "yesterday"
      lastActivity: Date.now() - 86400000,
      city,
      messages: legacyMsgs,
      messageCount: legacyMsgs.length,
      summary: buildSessionSummary(legacyMsgs),
    };
    safeSet(KEYS.CHAT_SESSIONS, [session]);
  } catch { /* noop */ }
}
