import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Trash2, ChevronDown, ChevronUp, Zap, Database, BarChart2, RefreshCw, ShieldCheck } from 'lucide-react';
import { contextManager, SessionUsageStats, CallType, getModelProfile } from '../services/contextManager';
import { promptCache, PromptCacheStats } from '../services/promptCacheService';
import { AiProvider } from '../types';

interface TokenBudgetPanelProps {
  aiProvider: AiProvider;
  aiModel: string;
}

const CALL_LABELS: Record<CallType, string> = {
  health_assessment: 'Health Report',
  historical_research: 'Research',
  chat: 'Chat',
  flood_analysis: 'Flood Analysis',
};

const CALL_COLORS: Record<CallType, string> = {
  health_assessment: 'bg-teal-500',
  historical_research: 'bg-violet-500',
  chat: 'bg-sky-500',
  flood_analysis: 'bg-amber-500',
};

export const TokenBudgetPanel: React.FC<TokenBudgetPanelProps> = ({ aiProvider, aiModel }) => {
  const [stats, setStats] = useState<SessionUsageStats | null>(null);
  const [cacheStats, setCacheStats] = useState<PromptCacheStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(() => {
    setStats(contextManager.getStats());
    setCacheStats(promptCache.getStats());
  }, []);

  useEffect(() => {
    refresh();
    // Refresh stats every 10 s so usage updates after each call
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const profile = getModelProfile(aiProvider, aiModel);
  const contextWindowLabel = contextManager.formatContextWindow(aiProvider, aiModel);
  const inputBudgetLabel   = contextManager.formatTokens(profile.inputBudget);
  const outputLabel        = contextManager.formatTokens(profile.maxOutputTokens);

  const totalIn   = stats?.totalInputTokens  ?? 0;
  const totalOut  = stats?.totalOutputTokens ?? 0;
  const total     = totalIn + totalOut;
  const calls     = stats?.totalCalls ?? 0;
  const savedToks = stats?.compressionsSaved ?? 0;
  const cachedToks = (stats?.totalCachedTokens ?? 0) + (cacheStats?.serverCachedTokens ?? 0);
  const clientCacheHits = cacheStats?.clientHits ?? 0;
  const serverCacheHits = cacheStats?.serverCacheHits ?? 0;
  const totalSaved = savedToks + (cacheStats?.clientTokensSaved ?? 0) + (cacheStats?.serverCachedTokens ?? 0);

  // Usage bar: percentage of the model's 24h soft budget (rough: inputBudget * 10 calls as "daily budget")
  const dailySoftBudget = profile.inputBudget * 20;
  const usedPct = Math.min(100, Math.round((totalIn / dailySoftBudget) * 100));
  const barColor =
    usedPct >= 80 ? 'bg-rose-500' :
    usedPct >= 50 ? 'bg-amber-500' :
    'bg-teal-500';

  const callTypes = Object.keys(CALL_LABELS) as CallType[];

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-slate-900 rounded-lg">
            <Cpu className="w-3 h-3 text-teal-400" />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Token Budget</p>
            <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 leading-tight">
              {contextWindowLabel} ctx · {inputBudgetLabel} in · {outputLabel} out
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all"
            title="Refresh stats"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Usage bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[9px] font-bold text-slate-400">24h Input Usage</span>
          <span className="text-[9px] font-black text-slate-600 dark:text-slate-300">{contextManager.formatTokens(totalIn)} / {contextManager.formatTokens(dailySoftBudget)}</span>
        </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="text-[9px] font-bold text-slate-400">{usedPct}% of soft daily budget used</p>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Calls', value: calls, icon: <Zap className="w-3 h-3" /> },
          { label: 'Tokens', value: contextManager.formatTokens(total), icon: <Database className="w-3 h-3" /> },
          { label: 'Saved', value: contextManager.formatTokens(totalSaved), icon: <BarChart2 className="w-3 h-3" /> },
          { label: 'Cached', value: contextManager.formatTokens(cachedToks), icon: <ShieldCheck className="w-3 h-3" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white dark:bg-slate-700/60 border border-slate-100 dark:border-slate-600 rounded-xl p-2 text-center">
            <div className="flex justify-center text-slate-400 dark:text-slate-400 mb-1">{icon}</div>
            <p className="text-[11px] font-black text-slate-700 dark:text-slate-100">{value}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Expanded: per-call breakdown + model profile */}
      {expanded && (
        <div className="space-y-3 animate-fade-in">
          {/* Cache stats */}
          {(clientCacheHits > 0 || serverCacheHits > 0) && (
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 rounded-xl p-3 space-y-1">
              <p className="text-[9px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-2">Prompt Cache Activity</p>
              {[
                ['Client Hits', clientCacheHits, 'System instruction memoized'],
                ['Server Hits', serverCacheHits, 'API-reported prefix cache hits'],
                ['Server Cached', contextManager.formatTokens(cacheStats?.serverCachedTokens ?? 0), 'tokens'],
                ['Client Saved', contextManager.formatTokens(cacheStats?.clientTokensSaved ?? 0), 'est. tokens'],
              ].map(([k, v, note]) => (
                <div key={String(k)} className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-teal-500 dark:text-teal-400">{k}</span>
                  <span className="text-[9px] font-black text-teal-700 dark:text-teal-200">{v} <span className="font-normal text-teal-400">{note}</span></span>
                </div>
              ))}
            </div>
          )}

          {/* Call-type breakdown */}
          {calls > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">By Call Type</p>
              {callTypes.filter(ct => (stats?.callsByType[ct] ?? 0) > 0).map(ct => {
                const n = stats!.callsByType[ct];
                const pct = calls > 0 ? Math.round((n / calls) * 100) : 0;
                return (
                  <div key={ct} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${CALL_COLORS[ct]}`} />
                    <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${CALL_COLORS[ct]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 w-24 text-right truncate">{CALL_LABELS[ct]}</span>
                    <span className="text-[9px] font-black text-slate-700 dark:text-slate-200 w-5 text-right">{n}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Model profile info */}
          <div className="bg-white dark:bg-slate-700/60 border border-slate-100 dark:border-slate-600 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Model Profile</p>
            {[
              ['Context Window', contextWindowLabel],
              ['Max Input',      contextManager.formatTokens(profile.maxInputTokens)],
              ['Input Budget',   inputBudgetLabel],
              ['Max Output',     outputLabel],
              ['Report Temp',    profile.reportTemperature.toFixed(1)],
              ['Chat Temp',      profile.chatTemperature.toFixed(1)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-400">{k}</span>
                <span className="text-[9px] font-black text-slate-700 dark:text-slate-200">{v}</span>
              </div>
            ))}
          </div>

          {/* Recent calls */}
          {stats && stats.entries.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recent Calls</p>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {[...stats.entries].reverse().slice(0, 8).map((e, i) => (
                  <div key={i} className="flex items-center justify-between bg-white dark:bg-slate-700/60 border border-slate-100 dark:border-slate-600 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${CALL_COLORS[e.callType]}`} />
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{CALL_LABELS[e.callType]}</span>
                      {e.compressed && (
                        <span className="text-[8px] font-black text-violet-500 bg-violet-50 px-1 py-0.5 rounded">COMPRESSED</span>
                      )}
                    </div>
                    <span className="text-[9px] font-black text-slate-600 dark:text-slate-300">
                      {contextManager.formatTokens(e.estimatedInputTokens + e.estimatedOutputTokens)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clear button */}
          <button
            onClick={() => { contextManager.clearStats(); promptCache.clear(); refresh(); }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition-all text-[9px] font-black uppercase tracking-widest"
          >
            <Trash2 className="w-3 h-3" />
            Clear Usage History
          </button>
        </div>
      )}
    </div>
  );
};
