import { checkCloudEarlyWarning } from './outbreakPredictionService';
import { McpSettings } from '../types';

export interface McpExecutionTrace {
  attempted: boolean;
  enabled: boolean;
  tool: string;
  serverId: string;
  timeoutMs: number;
  retryCount: number;
  success: boolean;
  signals: number;
  error?: string;
}

export interface McpExecutionResult {
  context: string;
  trace: McpExecutionTrace;
}

function pickServer(settings: McpSettings): { id: string; timeoutMs: number; retryCount: number } | null {
  const server = settings.servers.find((s) => s.enabled);
  if (!server) return null;
  return {
    id: server.id,
    timeoutMs: server.timeoutMs || settings.defaultTimeoutMs,
    retryCount: Number.isFinite(server.retryCount) ? server.retryCount : settings.defaultRetryCount,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('MCP tool timeout exceeded')), timeoutMs)),
  ]);
}

async function callMcpTool(endpoint: string, method: string, params: any, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.random().toString(36).substring(7),
        method,
        params,
      }),
      signal: controller.signal,
    });
    clearTimeout(id);

    if (!response.ok) throw new Error(`MCP HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(`MCP RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    return data.result;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}
export async function executeMcpOutbreakSweep(city: string, settings: McpSettings): Promise<McpExecutionResult> {
  const trace: McpExecutionTrace = {
    attempted: true,
    enabled: settings.enabled,
    tool: 'outbreak_sweep',
    serverId: 'none',
    timeoutMs: settings.defaultTimeoutMs,
    retryCount: settings.defaultRetryCount,
    success: false,
    signals: 0,
  };

  if (!settings.enabled || !settings.allowlistedTools.includes('outbreak_sweep')) {
    return {
      context: 'MCP TOOL SIGNALS: MCP disabled or outbreak_sweep not in allowlist.',
      trace: { ...trace, attempted: false, enabled: false },
    };
  }

  const serverConfig = settings.servers.find(s => s.enabled && s.allowedTools.includes('outbreak_sweep'));
  const server = serverConfig ? {
    id: serverConfig.id,
    endpoint: serverConfig.endpoint,
    timeoutMs: serverConfig.timeoutMs || settings.defaultTimeoutMs,
    retryCount: Number.isFinite(serverConfig.retryCount) ? serverConfig.retryCount : settings.defaultRetryCount,
  } : null;

  if (!server) {
    return {
      context: 'MCP TOOL SIGNALS: no enabled MCP server configured for outbreak_sweep.',
      trace: { ...trace, attempted: false, error: 'No enabled MCP server' },
    };
  }

  trace.serverId = server.id;
  trace.timeoutMs = server.timeoutMs;
  trace.retryCount = server.retryCount;

  let lastError: string | undefined;
  for (let attempt = 0; attempt <= server.retryCount; attempt++) {
    try {
      let result;
      // If it's the internal mock server (or local deployment that we handle specially)
      if (server.endpoint === 'internal' || server.id === 'local-biosentinel' || !server.endpoint) {
        result = await withTimeout(checkCloudEarlyWarning(city, 15), server.timeoutMs);
      } else {
        // Real external MCP call
        const rpcRes = await callMcpTool(server.endpoint, 'tools/call', { name: 'outbreak_sweep', arguments: { city } }, server.timeoutMs);
        // MCP tool results are typically { content: [{ type: 'text', text: '...' }] }
        result = rpcRes.content?.[0]?.text || JSON.stringify(rpcRes);
      }

      trace.success = true;
      const context = (typeof result === 'string') 
        ? result 
        : `MCP TOOL SIGNALS: ${result.length > 0 ? result.slice(0, 3).map((w: any) => `${w.syndromeName} (${w.caseCount} cases)`).join('; ') : 'No warnings'}`;
      
      trace.signals = Array.isArray(result) ? result.length : (typeof result === 'string' && (result as any).includes('cases') ? 1 : 0);
      
      return { context: context.startsWith('MCP TOOL SIGNALS:') ? context : `MCP TOOL SIGNALS: ${context}`, trace };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[MCP] Attempt ${attempt} calling external MCP outbreak sweep failed: ${lastError}`);
    }
  }

  // FALLBACK PATH: If all external calls fail, fall back to checkCloudEarlyWarning to ensure we don't crash
  console.warn(`[MCP] All external MCP outbreak sweeps failed for ${city}. Falling back to internal outbreak sweep.`);
  try {
    const result = await withTimeout(checkCloudEarlyWarning(city, 15), server.timeoutMs);
    trace.success = true;
    trace.error = `External failed: ${lastError || 'Unknown error'} (Recovered via internal sweep fallback)`;
    
    const context = (typeof result === 'string') 
      ? result 
      : `MCP TOOL SIGNALS: ${result.length > 0 ? result.slice(0, 3).map((w: any) => `${w.syndromeName} (${w.caseCount} cases)`).join('; ') : 'No warnings'}`;
    
    trace.signals = Array.isArray(result) ? result.length : (typeof result === 'string' && (result as any).includes('cases') ? 1 : 0);
    
    return { context: context.startsWith('MCP TOOL SIGNALS:') ? context : `MCP TOOL SIGNALS: ${context}`, trace };
  } catch (fallbackErr) {
    console.error(`[MCP] Internal outbreak sweep fallback failed:`, fallbackErr);
    trace.error = `External failed: ${lastError || 'Unknown error'}. Fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`;
    return {
      context: `MCP TOOL SIGNALS: outbreak sweep failed (${trace.error}).`,
      trace,
    };
  }
}

export async function executeMcpWikiSearch(term: string, settings: McpSettings): Promise<McpExecutionResult> {
  const trace: McpExecutionTrace = {
    attempted: true,
    enabled: settings.enabled,
    tool: 'wiki_search',
    serverId: 'deep-wiki-mcp',
    timeoutMs: settings.defaultTimeoutMs,
    retryCount: settings.defaultRetryCount,
    success: false,
    signals: 0,
  };

  if (!settings.enabled || !settings.allowlistedTools.includes('wiki_search')) {
    return {
      context: 'MCP TOOL SIGNALS: wiki_search not allowed or disabled.',
      trace: { ...trace, attempted: false, enabled: false }
    };
  }

  try {
    // Wikipedia API is open and supports CORS via origin=*
    const response = await withTimeout(
      fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&utf8=&format=json&origin=*`),
      settings.defaultTimeoutMs
    );
    if (!response.ok) throw new Error('Wikipedia search failed');
    const data = await response.json() as any;
    const items = data.query?.search || [];
    
    if (items.length === 0) {
      return {
        context: `No Wikipedia articles found for "${term}".`,
        trace: { ...trace, success: true }
      };
    }

    const topItem = items[0];
    const cleanSnippet = topItem.snippet.replace(/<\/?[^>]+(>|$)/g, "");
    
    // Also call wiki_summary (page summary REST API)
    const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topItem.title)}`);
    let summaryText = cleanSnippet;
    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json() as any;
      if (summaryData.extract) {
        summaryText = summaryData.extract;
      }
    }

    trace.success = true;
    trace.signals = items.length;
    return {
      context: `Article: "${topItem.title}"\nSource: Wikipedia\nExtract: ${summaryText}\nURL: https://en.wikipedia.org/wiki/${encodeURIComponent(topItem.title)}`,
      trace
    };
  } catch (err: any) {
    trace.error = err.message || String(err);
    console.warn(`[MCP] Deep Wiki Search MCP failed:`, err);
    // Graceful offline mock fallback
    return {
      context: `MCP WIKI SEARCH (Offline Fallback for "${term}"): Medical literature overview of ${term} outbreaks, transmission vectors, and prevention methods.`,
      trace: { ...trace, success: true, error: `CORS/Network error: ${trace.error} (Offline fallback used)` }
    };
  }
}
