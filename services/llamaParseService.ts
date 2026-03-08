/**
 * Bio-SentinelX LlamaParse Service
 * Wraps the LlamaCloud v2 Parse API for PDF / document extraction.
 *
 * Flow:
 *   1. Upload file to LlamaCloud Files API  →  get file_id
 *   2. Submit parse job to /api/v2/parse    →  get job_id
 *   3. Poll /api/v2/parse/{job_id}?expand=markdown,text until COMPLETED
 *   4. Return extracted markdown (falls back to text if markdown empty)
 *
 * Used as a fallback in ResearchLibrary when users need to extract text
 * from PDF files, or when the Gemini embedding quota is exceeded and users
 * want to pre-extract rich text before adding it to the vector store.
 */

const LLAMA_CLOUD_BASE = 'https://api.cloud.llamaindex.ai';

export type LlamaParseTier = 'fast' | 'cost_effective' | 'agentic' | 'agentic_plus';

export interface LlamaParseOptions {
  tier?: LlamaParseTier;
  language?: string;    // OCR language code, e.g. "en", "fr"
  customPrompt?: string;
  onStatus?: (message: string) => void;
}

/** Supported input types */
export type LlamaParseInput =
  | { kind: 'file'; file: File }
  | { kind: 'url';  url: string };

// ─── Internal helpers ────────────────────────────────────────────────────────

async function llamaFetch<T>(
  path: string,
  apiKey: string,
  opts: RequestInit,
): Promise<T> {
  const res = await fetch(`${LLAMA_CLOUD_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(opts.headers ?? {}),
    },
  });

  if (!res.ok) {
    let errMsg = `LlamaCloud API error ${res.status}`;
    try {
      const body = await res.json() as any;
      if (body?.detail) {
        errMsg = typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail);
      } else if (body?.message) {
        errMsg = body.message;
      }
    } catch { /* ignore json parse errors */ }

    if (res.status === 401) throw new Error('Invalid LlamaCloud API key. Please check it in Settings.');
    if (res.status === 402) throw new Error('LlamaCloud credits exhausted. Please top up at cloud.llamaindex.ai.');
    if (res.status === 429) throw new Error('LlamaCloud rate limit exceeded. Please wait a moment and retry.');
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

/** Step 1 — Upload file and return file_id */
async function uploadFile(file: File, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'parse');

  const data = await llamaFetch<{ id: string }>('/api/v1/files/', apiKey, {
    method: 'POST',
    body: form,
  });

  if (!data.id) throw new Error('LlamaCloud file upload did not return an id.');
  return data.id;
}

/** Step 2 — Submit parse job and return job_id */
async function submitParseJob(
  fileId: string,
  apiKey: string,
  tier: LlamaParseTier,
  language: string,
  customPrompt?: string,
): Promise<string> {
  const body: Record<string, any> = {
    file_id: fileId,
    tier,
    version: 'latest',
    processing_options: {
      ocr_parameters: { languages: [language] },
      ignore: { ignore_diagonal_text: false },
    },
    output_options: {
      images_to_save: [],
    },
  };

  if (customPrompt && tier !== 'fast') {
    body.agentic_options = { custom_prompt: customPrompt };
  }

  const data = await llamaFetch<{ id: string; status: string }>('/api/v2/parse', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!data.id) throw new Error('LlamaCloud parse job did not return an id.');
  return data.id;
}

type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface ParseResultResponse {
  job: { id: string; status: JobStatus; error_message?: string };
  markdown?: {
    pages: Array<{ page_number: number; markdown: string }>;
  };
  text?: {
    pages: Array<{ page_number: number; text: string }>;
  };
}

/** Step 3 — Poll until job completes, then return extracted text */
async function pollAndFetch(
  jobId: string,
  apiKey: string,
  onStatus?: (s: string) => void,
): Promise<string> {
  const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
  const POLL_INTERVAL_MS = 3000;
  const deadline = Date.now() + MAX_WAIT_MS;

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    onStatus?.(`Waiting for LlamaParse… (attempt ${attempt})`);

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const data = await llamaFetch<ParseResultResponse>(
      `/api/v2/parse/${jobId}?expand=markdown,text`,
      apiKey,
      { method: 'GET' },
    );

    const status: JobStatus = data.job?.status ?? 'PENDING';

    if (status === 'COMPLETED') {
      // Prefer markdown, fall back to plain text
      const mdPages = data.markdown?.pages ?? [];
      const txtPages = data.text?.pages ?? [];

      const extractedMd = mdPages.map(p => p.markdown).filter(Boolean).join('\n\n---\n\n').trim();
      const extractedTxt = txtPages.map(p => p.text).filter(Boolean).join('\n\n').trim();

      const result = extractedMd || extractedTxt;
      if (!result) throw new Error('LlamaParse returned an empty document. Try a different tier or check the file.');
      return result;
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      const msg = data.job?.error_message ?? 'Unknown error';
      throw new Error(`LlamaParse job ${status.toLowerCase()}: ${msg}`);
    }

    // PENDING or RUNNING — continue polling
  }

  throw new Error('LlamaParse timed out after 5 minutes. Please try again with a smaller file or simpler tier.');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a PDF (or any supported file) using LlamaCloud and return the
 * extracted text / markdown as a single string suitable for the vectorDB.
 */
export async function parsePdfWithLlamaCloud(
  file: File,
  apiKey: string,
  options: LlamaParseOptions = {},
): Promise<string> {
  const {
    tier = 'cost_effective',
    language = 'en',
    customPrompt,
    onStatus,
  } = options;

  onStatus?.('Uploading document to LlamaCloud…');
  const fileId = await uploadFile(file, apiKey);

  onStatus?.(`Submitting parse job (tier: ${tier})…`);
  const jobId = await submitParseJob(fileId, apiKey, tier, language, customPrompt);

  onStatus?.('Parse job submitted. Waiting for results…');
  const text = await pollAndFetch(jobId, apiKey, onStatus);

  onStatus?.('Parsing complete!');
  return text;
}

/**
 * Parse a document from a public URL using LlamaCloud.
 */
export async function parseUrlWithLlamaCloud(
  url: string,
  apiKey: string,
  options: LlamaParseOptions = {},
): Promise<string> {
  const {
    tier = 'cost_effective',
    language = 'en',
    customPrompt,
    onStatus,
  } = options;

  onStatus?.('Submitting URL parse job to LlamaCloud…');

  const body: Record<string, any> = {
    source_url: url,
    tier,
    version: 'latest',
    processing_options: {
      ocr_parameters: { languages: [language] },
    },
    output_options: { images_to_save: [] },
  };

  if (customPrompt && tier !== 'fast') {
    body.agentic_options = { custom_prompt: customPrompt };
  }

  const data = await llamaFetch<{ id: string; status: string }>('/api/v2/parse', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!data.id) throw new Error('LlamaCloud parse job did not return an id.');

  onStatus?.('Parse job submitted. Waiting for results…');
  const text = await pollAndFetch(data.id, apiKey, onStatus);

  onStatus?.('Parsing complete!');
  return text;
}

/** Returns true if the MIME type or file extension is a supported PDF/doc type */
export function isSupportedDocumentFile(file: File): boolean {
  const supportedMime = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/html',
  ];
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const supportedExt = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'html', 'htm'];
  return supportedMime.includes(file.type) || supportedExt.includes(ext);
}

/** Plain text / markdown file — just read it directly, no API needed */
export function isPlainTextFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ['txt', 'md', 'csv', 'text', 'log', 'json'].includes(ext) || file.type.startsWith('text/');
}
