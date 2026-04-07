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

  const server = pickServer(settings);
  if (!server) {
    return {
      context: 'MCP TOOL SIGNALS: no enabled MCP server configured.',
      trace: { ...trace, attempted: false, error: 'No enabled MCP server' },
    };
  }

  trace.serverId = server.id;
  trace.timeoutMs = server.timeoutMs;
  trace.retryCount = server.retryCount;

  let lastError: string | undefined;
  for (let attempt = 0; attempt <= server.retryCount; attempt++) {
    try {
      const warnings = await withTimeout(checkCloudEarlyWarning(city, 15), server.timeoutMs);
      trace.success = true;
      trace.signals = warnings.length;
      const context = warnings.length > 0
        ? `MCP TOOL SIGNALS: ${warnings.slice(0, 3).map((w) => `${w.syndromeName} (${w.caseCount} cases)`).join('; ')}`
        : 'MCP TOOL SIGNALS: no high-confidence regional warning from outbreak sweep.';
      return { context, trace };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  trace.error = lastError || 'Unknown MCP tool failure';
  return {
    context: `MCP TOOL SIGNALS: outbreak sweep failed (${trace.error}).`,
    trace,
  };
}
