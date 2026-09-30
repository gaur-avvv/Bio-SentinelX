/**
 * Bio-SentinelX — Privacy-First Architecture Service
 *
 * Implements the privacy-by-design layer:
 *   1. On-device processing — 90% of operations run locally
 *   2. Structured-only sync — only anonymized signals leave the device
 *   3. Data anonymization — strips PII before any cloud transmission
 *   4. Audit logging — tracks what data goes where
 *   5. Consent management — granular user controls
 *
 * Raw patient narratives and audio files NEVER leave the device.
 * Only anonymized, structured WHO surveillance signals are synchronized.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProcessingLocation = 'on_device' | 'cloud' | 'hybrid';
export type DataSensitivity = 'public' | 'anonymized' | 'sensitive' | 'pii';
export type ConsentStatus = 'granted' | 'denied' | 'not_asked';

export interface PrivacyAuditEntry {
  id: string;
  timestamp: number;
  operation: string;
  dataType: string;
  sensitivity: DataSensitivity;
  processedAt: ProcessingLocation;
  anonymized: boolean;
  fieldsRedacted: string[];
  destination: string; // 'local_storage' | 'cloud_dashboard' | 'none'
  bytesSent: number;
}

export interface AnonymizedSignal {
  signalId: string;
  syndromeCode: string;     // e.g., 'AWD', 'AFI'
  icd10Codes: string[];     // e.g., ['A00', 'A09']
  district: string;
  state: string;
  week: number;
  year: number;
  caseCount: number;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  // NO patient name, narrative, audio, or identifiable data
  timestamp: number;
}

export interface ConsentSettings {
  syndromeDataSync: ConsentStatus;
  anonymizedAlerts: ConsentStatus;
  aggregateAnalytics: ConsentStatus;
  cloudAIProcessing: ConsentStatus;
  researchDataSharing: ConsentStatus;
}

export interface PrivacyDashboard {
  totalOperations: number;
  onDeviceOperations: number;
  cloudOperations: number;
  onDevicePercentage: number;
  dataPointsAnonymized: number;
  fieldsRedacted: number;
  bytesKeptLocal: number;
  bytesSentToCloud: number;
  consentSettings: ConsentSettings;
  lastAuditTime: number;
}

// ─── PII Patterns ───────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ pattern: RegExp; field: string; replacement: string }> = [
  { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, field: 'name', replacement: '[REDACTED_NAME]' },
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, field: 'aadhaar', replacement: '[REDACTED_ID]' },
  { pattern: /\b\d{10,12}\b/g, field: 'phone', replacement: '[REDACTED_PHONE]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, field: 'email', replacement: '[REDACTED_EMAIL]' },
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, field: 'ip_address', replacement: '[REDACTED_IP]' },
  { pattern: /\b(village|house|street|road|lane|gali|mohalla)\s+[A-Za-z0-9\s,]+/gi, field: 'address', replacement: '[REDACTED_ADDRESS]' },
  { pattern: /\b(son|daughter|wife|husband)\s+of\s+[A-Z][a-z]+/gi, field: 'relation', replacement: '[REDACTED_RELATION]' },
];

// ─── Storage Keys ───────────────────────────────────────────────────────────

const AUDIT_KEY = 'biosentinel_privacy_audit';
const CONSENT_KEY = 'biosentinel_privacy_consent';
const SYNC_QUEUE_KEY = 'biosentinel_sync_queue';

// ─── Storage Helpers ────────────────────────────────────────────────────────

function loadAudit(): PrivacyAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); }
  catch { return []; }
}

function saveAudit(data: PrivacyAuditEntry[]): void {
  const trimmed = data.slice(-1000);
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed)); }
  catch { /* quota */ }
}

function loadConsent(): ConsentSettings {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_CONSENT;
}

function saveConsent(settings: ConsentSettings): void {
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(settings)); }
  catch { /* quota */ }
}

function loadSyncQueue(): AnonymizedSignal[] {
  try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function saveSyncQueue(data: AnonymizedSignal[]): void {
  const trimmed = data.slice(-500);
  try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(trimmed)); }
  catch { /* quota */ }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CONSENT: ConsentSettings = {
  syndromeDataSync: 'not_asked',
  anonymizedAlerts: 'not_asked',
  aggregateAnalytics: 'not_asked',
  cloudAIProcessing: 'not_asked',
  researchDataSharing: 'not_asked',
};

// ─── Core: Anonymization Engine ─────────────────────────────────────────────

/**
 * Strip all PII from text. Returns anonymized text and list of redacted fields.
 * Runs ENTIRELY on-device — the raw text never leaves the function.
 */
export function anonymizeText(text: string): { anonymized: string; redactedFields: string[] } {
  let result = text;
  const redactedFields: string[] = [];

  for (const { pattern, field, replacement } of PII_PATTERNS) {
    if (pattern.test(result)) {
      redactedFields.push(field);
      result = result.replace(pattern, replacement);
    }
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
  }

  return { anonymized: result, redactedFields };
}

/**
 * Create an anonymized surveillance signal from a field conversation.
 * This is the ONLY data format that can be synced to cloud dashboards.
 */
export function createAnonymizedSignal(
  syndromeCode: string,
  icd10Codes: string[],
  district: string,
  state: string,
  caseCount: number,
  severity: 'low' | 'moderate' | 'high' | 'critical',
): AnonymizedSignal {
  const now = new Date();
  const signal: AnonymizedSignal = {
    signalId: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    syndromeCode,
    icd10Codes,
    district,
    state,
    week: getISOWeek(now),
    year: now.getFullYear(),
    caseCount,
    severity,
    timestamp: Date.now(),
  };

  // Log the audit entry
  logAuditEntry({
    operation: 'create_anonymized_signal',
    dataType: 'syndromic_signal',
    sensitivity: 'anonymized',
    processedAt: 'on_device',
    anonymized: true,
    fieldsRedacted: ['patient_name', 'narrative', 'audio'],
    destination: 'sync_queue',
    bytesSent: 0,
  });

  // Add to sync queue
  const queue = loadSyncQueue();
  queue.push(signal);
  saveSyncQueue(queue);

  return signal;
}

// ─── Audit Logging ──────────────────────────────────────────────────────────

function logAuditEntry(entry: Omit<PrivacyAuditEntry, 'id' | 'timestamp'>): void {
  const audit = loadAudit();
  audit.push({
    ...entry,
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    timestamp: Date.now(),
  });
  saveAudit(audit);
}

/**
 * Log an on-device processing operation.
 */
export function logOnDeviceProcessing(operation: string, dataType: string): void {
  logAuditEntry({
    operation,
    dataType,
    sensitivity: 'sensitive',
    processedAt: 'on_device',
    anonymized: false,
    fieldsRedacted: [],
    destination: 'local_storage',
    bytesSent: 0,
  });
}

/**
 * Log a cloud sync operation (only anonymized data).
 */
export function logCloudSync(operation: string, bytesSent: number): void {
  logAuditEntry({
    operation,
    dataType: 'anonymized_signal',
    sensitivity: 'anonymized',
    processedAt: 'cloud',
    anonymized: true,
    fieldsRedacted: ['patient_name', 'narrative', 'audio', 'location_precise'],
    destination: 'cloud_dashboard',
    bytesSent,
  });
}

// ─── Consent Management ─────────────────────────────────────────────────────

export function getConsentSettings(): ConsentSettings {
  return loadConsent();
}

export function updateConsentSettings(patch: Partial<ConsentSettings>): ConsentSettings {
  const current = loadConsent();
  const updated = { ...current, ...patch };
  saveConsent(updated);
  return updated;
}

// ─── Sync Queue Management ──────────────────────────────────────────────────

/**
 * Get pending signals in the sync queue (for when connectivity is restored).
 */
export function getSyncQueue(): AnonymizedSignal[] {
  return loadSyncQueue();
}

/**
 * Clear the sync queue (after successful sync).
 */
export function clearSyncQueue(): void {
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

/**
 * Get count of pending signals.
 */
export function getSyncQueueCount(): number {
  return loadSyncQueue().length;
}

// ─── Privacy Dashboard ──────────────────────────────────────────────────────

/**
 * Get the privacy dashboard metrics.
 */
export function getPrivacyDashboard(): PrivacyDashboard {
  const audit = loadAudit();
  const consent = loadConsent();

  const onDevice = audit.filter(a => a.processedAt === 'on_device').length;
  const cloud = audit.filter(a => a.processedAt === 'cloud').length;
  const total = audit.length;
  const anonymized = audit.filter(a => a.anonymized).length;
  const fieldsRedacted = audit.reduce((sum, a) => sum + a.fieldsRedacted.length, 0);
  const bytesSent = audit.reduce((sum, a) => sum + a.bytesSent, 0);

  return {
    totalOperations: total,
    onDeviceOperations: onDevice,
    cloudOperations: cloud,
    onDevicePercentage: total > 0 ? Math.round((onDevice / total) * 100) : 100,
    dataPointsAnonymized: anonymized,
    fieldsRedacted,
    bytesKeptLocal: 0, // Tracked separately if needed
    bytesSentToCloud: bytesSent,
    consentSettings: consent,
    lastAuditTime: audit.length > 0 ? audit[audit.length - 1].timestamp : 0,
  };
}

/**
 * Get recent audit entries.
 */
export function getAuditLog(limit: number = 50): PrivacyAuditEntry[] {
  return loadAudit().slice(-limit).reverse();
}

/**
 * Clear all privacy audit data.
 */
export function clearPrivacyData(): void {
  localStorage.removeItem(AUDIT_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/**
 * Get a formatted anonymized signal for cloud sync.
 */
export function getAnonymizedSignalForSync(signal: AnonymizedSignal) {
  return {
    syndrome_code: signal.syndromeCode,
    icd10_codes: signal.icd10Codes,
    district: signal.district,
    state: signal.state,
    week: signal.week,
    year: signal.year,
    case_count: signal.caseCount,
    severity: signal.severity,
    timestamp: new Date(signal.timestamp).toISOString(),
  };
}

// ─── Mathematical (ε, δ)-Differential Privacy Engine ──────────────────────────

export interface DPBudgetState {
  totalBudgetEpsilon: number;
  spentBudgetEpsilon: number;
  delta: number;
}

let privacyBudget: DPBudgetState = {
  totalBudgetEpsilon: 2.0,
  spentBudgetEpsilon: 0.0,
  delta: 1e-5,
};

/**
 * Samples noise from Laplace(0, scale) via inverse CDF method.
 * scale = sensitivity / epsilon
 */
export function addLaplaceNoise(value: number, sensitivity: number, epsilon: number): number {
  if (epsilon <= 0) return value;
  const scale = sensitivity / epsilon;
  const u = Math.random() - 0.5;
  const sign = u < 0 ? -1 : 1;
  const noise = -scale * sign * Math.log(1 - 2 * Math.abs(u) + 1e-15);
  privacyBudget.spentBudgetEpsilon += epsilon;
  return Number((value + noise).toFixed(4));
}

/**
 * Samples noise from Gaussian(0, sigma^2) using Box-Muller transform for (ε, δ)-DP.
 * sigma = sqrt(2 * ln(1.25 / delta)) * (sensitivity / epsilon)
 */
export function addGaussianNoise(
  value: number,
  sensitivity: number,
  epsilon: number,
  delta: number = 1e-5
): number {
  if (epsilon <= 0) return value;
  const sigma = Math.sqrt(2 * Math.log(1.25 / delta)) * (sensitivity / epsilon);
  const u1 = Math.max(1e-15, Math.random());
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  privacyBudget.spentBudgetEpsilon += epsilon;
  return Number((value + z0 * sigma).toFixed(4));
}

/**
 * Perturbs clinical vital telemetry using Laplace Differential Privacy.
 */
export function sanitizeClinicalMetricsWithDP(
  metrics: Record<string, number>,
  epsilon: number = 0.5,
  sensitivities: Record<string, number> = {}
): Record<string, number> {
  const perturbed: Record<string, number> = {};
  const perFeatureEps = epsilon / Math.max(1, Object.keys(metrics).length);

  for (const [key, val] of Object.entries(metrics)) {
    // Default clinical sensitivity: 1.0 (or specific bounded domain ranges)
    const sens = sensitivities[key] ?? 1.0;
    perturbed[key] = addLaplaceNoise(val, sens, perFeatureEps);
  }

  return perturbed;
}

/**
 * Perturbs epidemiological case count with integer-bounded Differential Privacy.
 */
export function anonymizeSignalWithDP(
  signal: AnonymizedSignal,
  epsilon: number = 0.2
): AnonymizedSignal {
  const noisyCases = Math.max(0, Math.round(addLaplaceNoise(signal.caseCount, 1.0, epsilon)));
  return {
    ...signal,
    caseCount: noisyCases,
  };
}

/**
 * Inspect remaining Differential Privacy budget.
 */
export function getPrivacyBudgetStatus(): DPBudgetState & { remainingBudgetEpsilon: number } {
  return {
    ...privacyBudget,
    remainingBudgetEpsilon: Math.max(0, Number((privacyBudget.totalBudgetEpsilon - privacyBudget.spentBudgetEpsilon).toFixed(4))),
  };
}

/**
 * Reset privacy budget (e.g. for a new clinical reporting cycle).
 */
export function resetPrivacyBudget(totalBudget: number = 2.0, delta: number = 1e-5): void {
  privacyBudget = {
    totalBudgetEpsilon: totalBudget,
    spentBudgetEpsilon: 0.0,
    delta,
  };
}

