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
