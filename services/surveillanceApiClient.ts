export type AlertSeverity = 'monitor' | 'district_alert' | 'state_escalation' | (string & {});

export interface CaseIntakePayload {
    text: string;
    state: string;
    district: string;
}

export interface IngestBatchPayload {
    events: CaseIntakePayload[];
}

export interface RecordSummary {
    syndrome?: string;
    confidence?: number;
    [key: string]: unknown;
}

export interface SurveillanceRecord {
    record_id: string;
    text?: string;
    state?: string;
    district?: string;
    syndrome?: string;
    created_at?: string;
    timestamp?: string;
    [key: string]: unknown;
}

export interface SurveillanceAlert {
    alert_id?: string;
    severity?: AlertSeverity;
    score?: number;
    message?: string;
    timestamp?: string;
    linked_record_id?: string;
    [key: string]: unknown;
}

export interface PipelineIngestResponse {
    record?: SurveillanceRecord;
    summary?: RecordSummary | Record<string, unknown>;
    alert?: SurveillanceAlert;
    fhir?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface PipelineIngestBatchResponse {
    summary?: {
        total_submitted?: number;
        accepted?: number;
        rejected?: number;
        [key: string]: number | undefined;
    };
    alerts?: SurveillanceAlert[];
    records?: SurveillanceRecord[];
    [key: string]: unknown;
}

export interface OverviewStatsResponse {
    total_records?: number;
    records_last_24h?: number;
    total_alerts?: number;
    top_syndromes?: string[];
    [key: string]: unknown;
}

export interface AlertsQuery {
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
}

export interface RecordsQuery {
    state?: string;
    district?: string;
    syndrome?: string;
    limit?: number;
    offset?: number;
}

export interface PagedRecordsResponse {
    records: SurveillanceRecord[];
    total?: number;
}

export interface ApiSuccess<T> {
    data: T;
    requestId?: string;
}

export interface NormalizedApiError {
    message: string;
    status?: number;
    requestId?: string;
    details?: unknown;
}

const DEFAULT_SURVEILLANCE_API_BASE = 'https://web-production-37f41.up.railway.app';

function getApiBaseUrl(): string {
    const fromSettings = localStorage.getItem('biosentinel_surveillance_api_base_url') || '';
    const fromEnv = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BIOSENTINEL_API || '';
    return (fromSettings || fromEnv || DEFAULT_SURVEILLANCE_API_BASE).replace(/\/$/, '');
}

function getApiKey(): string {
    return localStorage.getItem('biosentinel_surveillance_api_key') || '';
}

const MOCK_DELAY_MS = 300;

const mockRecords: SurveillanceRecord[] = [
    {
        record_id: 'REC-1001',
        text: 'Clusters of fever and rash reported in ward 4 schools',
        state: 'Maharashtra',
        district: 'Pune',
        syndrome: 'febrile_rash',
        created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
    {
        record_id: 'REC-1002',
        text: 'Acute watery diarrhea in peri-urban settlement',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        syndrome: 'acute_diarrheal',
        created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    },
    {
        record_id: 'REC-1003',
        text: 'Respiratory complaints and high absenteeism in industrial block',
        state: 'Delhi',
        district: 'North West',
        syndrome: 'respiratory_cluster',
        created_at: new Date(Date.now() - 1000 * 60 * 700).toISOString(),
    },
];

const mockAlerts: SurveillanceAlert[] = [
    {
        alert_id: 'ALT-5001',
        severity: 'monitor',
        score: 0.45,
        message: 'Mild anomaly in febrile rash trend',
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        linked_record_id: 'REC-1001',
    },
    {
        alert_id: 'ALT-5002',
        severity: 'district_alert',
        score: 0.71,
        message: 'Localized diarrheal spike warrants district follow-up',
        timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        linked_record_id: 'REC-1002',
    },
    {
        alert_id: 'ALT-5003',
        severity: 'state_escalation',
        score: 0.88,
        message: 'Cross-district respiratory signal requires state escalation',
        timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
        linked_record_id: 'REC-1003',
    },
];

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
            search.set(key, String(value));
        }
    });
    return search.toString();
}

function getRequestId(headers: Headers): string | undefined {
    return headers.get('x-request-id') || headers.get('X-Request-ID') || undefined;
}

function normalizeError(error: unknown): NormalizedApiError {
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const asAny = error as Record<string, unknown>;
        return {
            message: String(asAny.message || 'Request failed'),
            status: typeof asAny.status === 'number' ? asAny.status : undefined,
            requestId: typeof asAny.requestId === 'string' ? asAny.requestId : undefined,
            details: asAny.details,
        };
    }

    if (error instanceof Error) {
        return { message: error.message };
    }

    return { message: 'An unexpected error occurred.' };
}

async function parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }
    const text = await response.text();
    return text || null;
}

async function request<T>(
    path: string,
    options: RequestInit = {},
): Promise<ApiSuccess<T>> {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
        throw { message: 'VITE_API_BASE_URL is not configured.' };
    }

    const apiKey = getApiKey();

    const response = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'x-api-key': apiKey } : {}),
            ...(options.headers || {}),
        },
    });

    const requestId = getRequestId(response.headers);
    const body = await parseResponseBody(response);

    if (!response.ok) {
        const message =
            typeof body === 'object' && body !== null && 'detail' in body
                ? String((body as Record<string, unknown>).detail)
                : `Request failed with status ${response.status}`;

        throw {
            message,
            status: response.status,
            requestId,
            details: body,
        };
    }

    return {
        data: body as T,
        requestId,
    };
}

function paginateRecords(records: SurveillanceRecord[], offset = 0, limit = 10): PagedRecordsResponse {
    return {
        total: records.length,
        records: records.slice(offset, offset + limit),
    };
}

function filterRecords(records: SurveillanceRecord[], query: RecordsQuery): SurveillanceRecord[] {
    return records.filter(record => {
        const statePass = !query.state || (record.state || '').toLowerCase().includes(query.state.toLowerCase());
        const districtPass =
            !query.district || (record.district || '').toLowerCase().includes(query.district.toLowerCase());
        const syndromePass =
            !query.syndrome || (record.syndrome || '').toLowerCase().includes(query.syndrome.toLowerCase());
        return statePass && districtPass && syndromePass;
    });
}

export function toPagedRecords(raw: unknown): PagedRecordsResponse {
    if (Array.isArray(raw)) {
        return { records: raw as SurveillanceRecord[] };
    }

    if (raw && typeof raw === 'object') {
        const asObj = raw as Record<string, unknown>;
        if (Array.isArray(asObj.records)) {
            return {
                records: asObj.records as SurveillanceRecord[],
                total: typeof asObj.total === 'number' ? asObj.total : undefined,
            };
        }
        if (Array.isArray(asObj.items)) {
            return {
                records: asObj.items as SurveillanceRecord[],
                total: typeof asObj.total === 'number' ? asObj.total : undefined,
            };
        }
    }

    return { records: [] };
}

export const surveillanceApiClient = {
    normalizeError,

    async health(mockMode = false): Promise<ApiSuccess<Record<string, unknown>>> {
        if (mockMode) {
            await wait(MOCK_DELAY_MS);
            return { data: { status: 'ok', mode: 'mock' }, requestId: 'mock-health' };
        }
        try {
            return await request<Record<string, unknown>>('/health', { method: 'GET' });
        } catch (error) {
            throw normalizeError(error);
        }
    },

    async ingest(payload: CaseIntakePayload, mockMode = false): Promise<ApiSuccess<PipelineIngestResponse>> {
        if (mockMode) {
            await wait(MOCK_DELAY_MS);
            const newRecord: SurveillanceRecord = {
                record_id: `REC-${Math.floor(Math.random() * 10000)}`,
                text: payload.text,
                state: payload.state,
                district: payload.district,
                syndrome: 'under_review',
                created_at: new Date().toISOString(),
            };
            mockRecords.unshift(newRecord);
            const generatedAlert: SurveillanceAlert = {
                alert_id: `ALT-${Math.floor(Math.random() * 10000)}`,
                severity: 'monitor',
                score: 0.51,
                message: 'New event ingested and flagged for monitoring.',
                timestamp: new Date().toISOString(),
                linked_record_id: newRecord.record_id,
            };
            mockAlerts.unshift(generatedAlert);
            return {
                data: {
                    record: newRecord,
                    summary: { syndrome: newRecord.syndrome, confidence: 0.63 },
                    alert: generatedAlert,
                    fhir: { resourceType: 'Observation', id: newRecord.record_id },
                },
                requestId: 'mock-ingest',
            };
        }

        try {
            return await request<PipelineIngestResponse>('/pipeline/ingest', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
        } catch (error) {
            throw normalizeError(error);
        }
    },

    async ingestBatch(payload: IngestBatchPayload, mockMode = false): Promise<ApiSuccess<PipelineIngestBatchResponse>> {
        if (mockMode) {
            await wait(MOCK_DELAY_MS);
            const accepted = payload.events.length;
            const createdRecords = payload.events.map((event, index) => ({
                record_id: `REC-B-${Date.now()}-${index + 1}`,
                text: event.text,
                state: event.state,
                district: event.district,
                syndrome: 'under_review',
                created_at: new Date().toISOString(),
            }));

            mockRecords.unshift(...createdRecords);

            const createdAlerts = createdRecords.slice(0, Math.min(2, createdRecords.length)).map((record, index) => ({
                alert_id: `ALT-B-${Date.now()}-${index + 1}`,
                severity: index % 2 === 0 ? 'district_alert' : 'monitor',
                score: 0.6 + index * 0.1,
                message: `Batch ingest generated alert for ${record.district}.`,
                timestamp: new Date().toISOString(),
                linked_record_id: record.record_id,
            }));

            mockAlerts.unshift(...createdAlerts);

            return {
                data: {
                    summary: {
                        total_submitted: payload.events.length,
                        accepted,
                        rejected: 0,
                    },
                    alerts: createdAlerts,
                    records: createdRecords,
                },
                requestId: 'mock-ingest-batch',
            };
        }

        try {
            return await request<PipelineIngestBatchResponse>('/pipeline/ingest-batch', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
        } catch (error) {
            throw normalizeError(error);
        }
    },

    async overview(mockMode = false): Promise<ApiSuccess<OverviewStatsResponse>> {
        if (mockMode) {
            await wait(MOCK_DELAY_MS);
            return {
                data: {
                    total_records: mockRecords.length,
                    records_last_24h: mockRecords.length,
                    total_alerts: mockAlerts.length,
                    top_syndromes: ['acute_diarrheal', 'febrile_rash', 'respiratory_cluster'],
                },
                requestId: 'mock-overview',
            };
        }

        try {
            return await request<OverviewStatsResponse>('/stats/overview', { method: 'GET' });
        } catch (error) {
            throw normalizeError(error);
        }
    },

    async alerts(query: AlertsQuery = {}, mockMode = false): Promise<ApiSuccess<SurveillanceAlert[]>> {
        if (mockMode) {
            await wait(MOCK_DELAY_MS);
            const filtered = mockAlerts.filter(alert => !query.severity || alert.severity === query.severity);
            const offset = query.offset || 0;
            const limit = query.limit || 10;
            return {
                data: filtered.slice(offset, offset + limit),
                requestId: 'mock-alerts',
            };
        }

        const queryString = buildQueryString({
            severity: query.severity,
            limit: query.limit,
            offset: query.offset,
        });

        try {
            return await request<SurveillanceAlert[]>(`/alerts${queryString ? `?${queryString}` : ''}`, {
                method: 'GET',
            });
        } catch (error) {
            throw normalizeError(error);
        }
    },

    async records(query: RecordsQuery = {}, mockMode = false): Promise<ApiSuccess<PagedRecordsResponse>> {
        if (mockMode) {
            await wait(MOCK_DELAY_MS);
            const filtered = filterRecords(mockRecords, query);
            return {
                data: paginateRecords(filtered, query.offset, query.limit),
                requestId: 'mock-records',
            };
        }

        const queryString = buildQueryString({
            state: query.state,
            district: query.district,
            syndrome: query.syndrome,
            limit: query.limit,
            offset: query.offset,
        });

        try {
            const response = await request<unknown>(`/records${queryString ? `?${queryString}` : ''}`, {
                method: 'GET',
            });
            return {
                data: toPagedRecords(response.data),
                requestId: response.requestId,
            };
        } catch (error) {
            throw normalizeError(error);
        }
    },

    async recordById(recordId: string, mockMode = false): Promise<ApiSuccess<SurveillanceRecord>> {
        if (mockMode) {
            await wait(MOCK_DELAY_MS);
            const record = mockRecords.find(item => item.record_id === recordId);
            if (!record) {
                throw { message: 'Record not found in mock mode.', status: 404, requestId: 'mock-record-not-found' };
            }
            return {
                data: record,
                requestId: 'mock-record-detail',
            };
        }

        try {
            return await request<SurveillanceRecord>(`/records/${encodeURIComponent(recordId)}`, {
                method: 'GET',
            });
        } catch (error) {
            throw normalizeError(error);
        }
    },
};
