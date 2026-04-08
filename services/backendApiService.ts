export interface BackendRequestMeta {
  method: 'GET' | 'POST';
  url: string;
  payload?: unknown;
  startedAt: string;
  endedAt: string;
}

export interface BackendResponseMeta<T = unknown> {
  status: number;
  requestId?: string;
  headers: Record<string, string>;
  data: T;
}

export interface BackendError {
  kind: 'network' | 'timeout' | 'validation' | 'internal' | 'unknown';
  message: string;
  status?: number;
  requestId?: string;
  details?: unknown;
}

export interface BackendEnvelope<T = unknown> {
  request: BackendRequestMeta;
  response: BackendResponseMeta<T>;
  error: BackendError | null;
}

export interface IngestEvent {
  text: string;
  state: string;
  district: string;
}

export interface TrainRequestPayload {
  data: Record<string, unknown>[];
  label_column?: string;
  model_type?: string;
}

export interface PredictCustomPayload {
  temp: number;
  feels_like: number;
  pressure: number;
  humidity: number;
  wind_speed: number;
  wind_deg: number;
  clouds: number;
  visibility: number;
  uv_index: number;
  air_quality_PM2_5: number;
  air_quality_PM10: number;
  aqi: number;
}

const DEFAULT_BASE = 'https://web-production-37f41.up.railway.app';

function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function getBaseUrl(): string {
  const fromStorage = localStorage.getItem('biosentinel_ml_api_base_url') || '';
  const fromEnv = import.meta.env.VITE_BIOSENTINEL_API || '';
  return (fromStorage || fromEnv || DEFAULT_BASE).replace(/\/+$/, '');
}

async function executeRequest<T>(
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown,
  timeoutMs = 15000,
  acceptText = false
): Promise<BackendEnvelope<T>> {
  const startedAt = new Date().toISOString();
  const fullUrl = `${getBaseUrl()}${url}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(fullUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(acceptText ? { Accept: 'text/plain' } : {})
      },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      signal: controller.signal
    });

    const endedAt = new Date().toISOString();
    const headers = normalizeHeaders(response.headers);
    const requestId = headers['x-request-id'];
    const data = (acceptText ? await response.text() : await response.json()) as T;

    if (!response.ok) {
      const errorType = response.status === 422 ? 'validation' : response.status >= 500 ? 'internal' : 'unknown';
      return {
        request: { method, url, payload, startedAt, endedAt },
        response: { status: response.status, requestId, headers, data },
        error: {
          kind: errorType,
          message: (data as { error?: { message?: string } })?.error?.message || `Request failed with status ${response.status}`,
          status: response.status,
          requestId,
          details: data
        }
      };
    }

    return {
      request: { method, url, payload, startedAt, endedAt },
      response: { status: response.status, requestId, headers, data },
      error: null
    };
  } catch (error) {
    const endedAt = new Date().toISOString();
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    return {
      request: { method, url, payload, startedAt, endedAt },
      response: { status: 0, requestId: undefined, headers: {}, data: {} as T },
      error: {
        kind: isAbort ? 'timeout' : 'network',
        message: isAbort ? 'Request timed out.' : error instanceof Error ? error.message : 'Network request failed.'
      }
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function apiHealth(): Promise<BackendEnvelope<{ status?: string; service?: string }>> {
  return executeRequest<{ status?: string; service?: string }>('GET', '/health');
}

export async function apiMetrics(): Promise<BackendEnvelope<string>> {
  return executeRequest<string>('GET', '/metrics', undefined, 20000, true);
}

export async function apiSingleIngest(payload: IngestEvent & Record<string, unknown>): Promise<BackendEnvelope<Record<string, unknown>>> {
  return executeRequest<Record<string, unknown>>('POST', '/pipeline/ingest', payload);
}

export async function apiBatchIngest(events: Array<IngestEvent & Record<string, unknown>>): Promise<BackendEnvelope<Record<string, unknown>>> {
  return executeRequest<Record<string, unknown>>('POST', '/pipeline/ingest-batch', { events });
}

export async function apiTrainStatus(): Promise<BackendEnvelope<Record<string, unknown>>> {
  return executeRequest<Record<string, unknown>>('GET', '/train/status');
}

export async function apiTrainDetect(payload: { data: Record<string, unknown>[] }): Promise<BackendEnvelope<Record<string, unknown>>> {
  return executeRequest<Record<string, unknown>>('POST', '/train/detect', payload, 30000);
}

export async function apiTrain(payload: TrainRequestPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
  return executeRequest<Record<string, unknown>>('POST', '/train', payload, 60000);
}

export async function apiTrainAuto(payload: TrainRequestPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
  return executeRequest<Record<string, unknown>>('POST', '/train/auto', payload, 60000);
}

export async function apiPredictCustom(payload: PredictCustomPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
  return executeRequest<Record<string, unknown>>('POST', '/predict/custom', payload);
}
