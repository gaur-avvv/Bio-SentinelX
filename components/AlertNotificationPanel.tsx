import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bell, BellRing, X, CheckCheck, ChevronDown, ChevronUp,
  Shield, Wind, Droplets, Sun, Thermometer, Info, Gauge, Leaf, CloudRain, Zap,
  Clock,
} from 'lucide-react';
import { HealthAlert, AlertCategory, AlertSeverity } from '../types';
import { notificationPlainText, preprocessNotificationMarkdown } from '../utils/notificationText';

const notifMdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({ children, ...props }) => (
    <span className="block" {...props}>{children}</span>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-black" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>{children}</em>
  ),
  a: ({ children, ...props }) => (
    <a className="underline underline-offset-2 hover:opacity-80" {...props}>{children}</a>
  ),
  code: ({ children, ...props }) => (
    <code className="px-1 py-0.5 rounded text-[11px] font-mono bg-slate-200/60 dark:bg-slate-800/60" {...props}>{children}</code>
  ),
};

const toastMdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({ children, ...props }) => (
    <span {...props}>{children}</span>
  ),
  strong: notifMdComponents.strong,
  em: notifMdComponents.em,
  a: notifMdComponents.a,
  code: notifMdComponents.code,
};

interface AlertNotificationPanelProps {
  alerts: HealthAlert[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

// ─── Category icon ────────────────────────────────────────────────────────────────────
const CategoryIcon: React.FC<{ cat: AlertCategory; cls?: string }> = ({ cat, cls = 'w-4 h-4' }) => {
  switch (cat) {
    case 'humidity':      return <Droplets className={cls} />;
    case 'temperature':   return <Thermometer className={cls} />;
    case 'uv':            return <Sun className={cls} />;
    case 'airQuality':    return <Wind className={cls} />;
    case 'pollen':        return <Leaf className={cls} />;
    case 'wind':          return <Wind className={cls} />;
    case 'precipitation': return <CloudRain className={cls} />;
    case 'pressure':      return <Gauge className={cls} />;
    case 'heatIndex':     return <Zap className={cls} />;
    case 'dewPoint':      return <Droplets className={cls} />;
    default:              return <Info className={cls} />;
  }
};

// ─── Severity style map ──────────────────────────────────────────────────────────────────
const S: Record<AlertSeverity, { panel: string; badge: string; dot: string; label: string; toast: string; progress: string }> = {
  critical: {
    panel:    'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    badge:    'bg-rose-600 text-white',
    dot:      'bg-rose-500',
    label:    'CRITICAL',
    toast:    'bg-rose-600 border-rose-400',
    progress: 'bg-rose-300/50',
  },
  warning: {
    panel:    'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    badge:    'bg-amber-500 text-white',
    dot:      'bg-amber-400',
    label:    'WARNING',
    toast:    'bg-amber-500 border-amber-300',
    progress: 'bg-amber-300/50',
  },
  info: {
    panel:    'bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800',
    badge:    'bg-teal-600 text-white',
    dot:      'bg-teal-400',
    label:    'INFO',
    toast:    'bg-teal-600 border-teal-400',
    progress: 'bg-teal-300/50',
  },
};

// ─── Toast duration (ms) ────────────────────────────────────────────────────────────────
const TOAST_DURATION: Record<AlertSeverity, number> = {
  critical: 9000,
  warning:  6000,
  info:     4500,
};

// ─── Toast component with auto-progress bar ────────────────────────────────────────────
interface ToastProps {
  alert: HealthAlert;
  onAutoClose:   (id: string) => void;   // timer expired — no dismiss penalty
  onManualClose: (id: string) => void;   // user hit X   — increments cooldown
}
const Toast: React.FC<ToastProps> = ({ alert, onAutoClose, onManualClose }) => {
  const sty      = S[alert.severity];
  const duration = TOAST_DURATION[alert.severity];
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct > 0) { rafRef.current = requestAnimationFrame(tick); }
      else         { onAutoClose(alert.id); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative flex items-start gap-3 p-4 rounded-2xl border shadow-2xl text-white w-full overflow-hidden ${sty.toast} animate-slide-in-right`}>
      <div className={`absolute bottom-0 left-0 h-0.5 ${sty.progress} transition-none`} style={{ width: `${progress}%` }} />
      <span className="text-2xl flex-shrink-0 leading-none mt-0.5">{alert.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-75">
          {alert.severity === 'critical' ? '🚨 CRITICAL' : alert.severity === 'warning' ? '⚠️ WARNING' : 'ℹ️ INFO'}
          <span className="ml-2 opacity-60">{alert.factor}</span>
        </p>
        <div className="text-sm font-bold leading-snug mt-0.5">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={toastMdComponents}>
            {preprocessNotificationMarkdown(alert.title)}
          </ReactMarkdown>
        </div>
        <div className="text-xs opacity-85 mt-1 line-clamp-2 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={toastMdComponents}>
            {preprocessNotificationMarkdown(alert.message)}
          </ReactMarkdown>
        </div>
      </div>
      <button
        onClick={() => onManualClose(alert.id)}
        className="p-1 hover:opacity-70 flex-shrink-0 transition-opacity mt-0.5"
        title="Dismiss (reduces future alerts for this type)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// ─── Alert card in panel ──────────────────────────────────────────────────────────────
interface AlertCardProps {
  alert: HealthAlert;
  onMarkRead: (id: string) => void;
  onDismiss:  (id: string) => void;
}
const AlertCard: React.FC<AlertCardProps> = ({ alert, onMarkRead, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);
  const sty = S[alert.severity];

  return (
    <div
      onClick={() => { if (!alert.read) onMarkRead(alert.id); }}
      className={`border rounded-2xl p-3.5 transition-all cursor-pointer ${sty.panel} ${!alert.read ? 'shadow-sm' : 'opacity-60'}`}
    >
      <div className="flex items-start gap-3">
        {!alert.read && <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 animate-pulse ${sty.dot}`} />}
        <span className="text-xl flex-shrink-0 leading-none">{alert.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${sty.badge}`}>
              {sty.label}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              {alert.factor} · {alert.value}
            </span>
          </div>
          <p className="text-xs font-black text-slate-800 dark:text-slate-100 leading-snug">{notificationPlainText(alert.title, 200)}</p>
          <div className={`text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={notifMdComponents}>
              {preprocessNotificationMarkdown(alert.message)}
            </ReactMarkdown>
          </div>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">💡 Health Tip</p>
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={notifMdComponents}>
                  {preprocessNotificationMarkdown(alert.healthTip)}
                </ReactMarkdown>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-teal-600 transition-colors"
            >
              {expanded
                ? <><ChevronUp className="w-3 h-3" />Less</>
                : <><ChevronDown className="w-3 h-3" />Health Tips</>}
            </button>
            <span className="text-[10px] text-slate-300 dark:text-slate-600 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
          className="p-1 text-slate-300 hover:text-rose-400 transition-colors flex-shrink-0"
          title="Dismiss — reduces future frequency for this alert type"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ─── Snooze status pill ───────────────────────────────────────────────────────────────────
const SnoozeIndicator: React.FC = () => {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const calc = () => {
      const until = Number(localStorage.getItem('biosentinel_global_snooze') ?? 0);
      const diff  = until - Date.now();
      if (diff <= 0) { setRemaining(''); return; }
      const m = Math.ceil(diff / 60000);
      setRemaining(`Snoozed ${m}m`);
    };
    calc();
    const id = setInterval(calc, 10000);
    return () => clearInterval(id);
  }, []);
  if (!remaining) return null;
  return (
    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-full flex items-center gap-1">
      <Clock className="w-2.5 h-2.5" />{remaining}
    </span>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────
/**
 * TOAST QUEUE ALGORITHM
 * ────────────────────
 * • New critical/warning alerts enter a `toastQueue` (max 6, critical at front).
 * • Scheduler pops one item every QUEUE_INTERVAL ms into `visibleToasts` (max MAX_VISIBLE).
 * • When a slot opens the scheduler resumes immediately.
 * • Auto-expire → silent removal (no cooldown penalty).
 * • Manual X    → calls onDismiss() → increments dismiss counter → extends future cooldown.
 */
const MAX_VISIBLE    = 4;    // max simultaneous toasts
const QUEUE_INTERVAL = 2500; // ms between each new toast

export const AlertNotificationPanel: React.FC<AlertNotificationPanelProps> = ({
  alerts, onMarkRead, onMarkAllRead, onDismiss, onClearAll,
}) => {
  const [open, setOpen]                   = useState(false);
  const [toastQueue, setToastQueue]       = useState<HealthAlert[]>([]);
  const [visibleToasts, setVisibleToasts] = useState<HealthAlert[]>([]);
  const panelRef     = useRef<HTMLDivElement>(null);
  const seenRef      = useRef<Set<string>>(new Set());
  const queueRef     = useRef<HealthAlert[]>([]);
  const schedulerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1: Detect new toastable alerts and enqueue
  useEffect(() => {
    const incoming = alerts.filter(a =>
      (a.severity === 'critical' || a.severity === 'warning') &&
      !seenRef.current.has(a.id)
    );
    if (incoming.length === 0) return;
    incoming.forEach(a => seenRef.current.add(a.id));
    const sorted = [...incoming].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return b.timestamp - a.timestamp;
    });
    setToastQueue(prev => {
      const crits  = [...sorted.filter(a => a.severity === 'critical'), ...prev.filter(a => a.severity === 'critical')];
      const warns  = [...sorted.filter(a => a.severity === 'warning'),  ...prev.filter(a => a.severity === 'warning')];
      const merged = [...crits, ...warns].slice(0, 6);
      queueRef.current = merged;
      return merged;
    });
  }, [alerts]);

  // Step 2: Scheduler — pop from queue when a visible slot opens
  const scheduleNext = useCallback(() => {
    if (schedulerRef.current) return;
    const tryShow = () => {
      schedulerRef.current = null;
      if (queueRef.current.length === 0) return;
      setVisibleToasts(prev => {
        if (prev.length >= MAX_VISIBLE) {
          schedulerRef.current = setTimeout(tryShow, QUEUE_INTERVAL);
          return prev;
        }
        const [next, ...rest] = queueRef.current;
        queueRef.current = rest;
        setToastQueue(rest);
        if (rest.length > 0) schedulerRef.current = setTimeout(tryShow, QUEUE_INTERVAL);
        return [next, ...prev];
      });
    };
    schedulerRef.current = setTimeout(tryShow, 400);
  }, []);

  useEffect(() => {
    if (toastQueue.length > 0 && visibleToasts.length < MAX_VISIBLE) scheduleNext();
    return () => { if (schedulerRef.current) { clearTimeout(schedulerRef.current); schedulerRef.current = null; } };
  }, [toastQueue.length, visibleToasts.length, scheduleNext]);

  const removeVisible     = useCallback((id: string) => setVisibleToasts(p => p.filter(t => t.id !== id)), []);
  const handleAutoClose   = useCallback((id: string) => removeVisible(id), [removeVisible]);
  const handleManualClose = useCallback((id: string) => { removeVisible(id); onDismiss(id); }, [removeVisible, onDismiss]);

  // Outside-click closes panel
  useEffect(() => {
    const h = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const unread        = alerts.filter(a => !a.read).length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.read).length;
  const grouped = {
    realtime:  alerts.filter(a => a.session === 'realtime'),
    morning:   alerts.filter(a => a.session === 'morning'),
    afternoon: alerts.filter(a => a.session === 'afternoon'),
    evening:   alerts.filter(a => a.session === 'evening'),
  };
  const sessionLabels: Record<string, string> = {
    realtime: '⚡ Real-time Alerts', morning: '🌅 Morning Briefing',
    afternoon: '☀️ Afternoon Update', evening: '🌙 Evening Briefing',
  };

  return (
    <>
      {/* Staggered toast stack — bottom right */}
      <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom)+var(--vv-bottom,0px))] right-[calc(0.75rem+env(safe-area-inset-right))] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom)+var(--vv-bottom,0px))] sm:right-[calc(1.5rem+env(safe-area-inset-right))] z-[9999] w-80 max-w-[calc(100vw-1.5rem)] pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-2.5 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
          {visibleToasts.map(t => (
            <div key={t.id}>
              <Toast alert={t} onAutoClose={handleAutoClose} onManualClose={handleManualClose} />
            </div>
          ))}
        </div>
        {toastQueue.length > 0 && (
          <div className="pointer-events-none flex justify-end">
            <span className="text-[9px] font-black bg-slate-800/80 text-slate-300 px-2 py-1 rounded-full">
              +{toastQueue.length} queued
            </span>
          </div>
        )}
      </div>

      {/* Bell + dropdown */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className={`relative p-2.5 rounded-xl transition-all ${
            criticalCount > 0
              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-200 animate-pulse-bell'
              : unread > 0
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          aria-label={`Health alerts${unread > 0 ? ` (${unread} unread)` : ''}`}
        >
          {unread > 0 ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          {unread > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-black text-white rounded-full px-1 ${criticalCount > 0 ? 'bg-rose-600' : 'bg-amber-500'}`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+8px)] w-96 max-w-[calc(100vw-2rem)] max-h-[80vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Health Alerts</h3>
                  <SnoozeIndicator />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {unread > 0 ? `${unread} unread · ` : ''}{alerts.length} total
                  {criticalCount > 0 && <span className="text-rose-500 ml-1">· {criticalCount} critical</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={onMarkAllRead} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 hover:text-teal-700 transition-colors">
                    <CheckCheck className="w-3.5 h-3.5" />Read All
                  </button>
                )}
                {alerts.length > 0 && (
                  <button onClick={onClearAll} title="Snooze all new alerts for 30 minutes" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors">
                    Snooze 30m
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Shield className="w-10 h-10 text-teal-300 mb-3" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">All Clear</p>
                  <p className="text-xs text-slate-400 mt-1">No health alerts right now.</p>
                </div>
              ) : (
                (['realtime', 'morning', 'afternoon', 'evening'] as const).map(session => {
                  const grp = grouped[session];
                  if (grp.length === 0) return null;
                  return (
                    <div key={session}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 px-1">
                        {sessionLabels[session]}<span className="text-slate-300 dark:text-slate-700 ml-1">({grp.length})</span>
                      </p>
                      <div className="space-y-2">
                        {grp.map(a => <AlertCard key={a.id} alert={a} onMarkRead={onMarkRead} onDismiss={onDismiss} />)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
              <p className="text-[9px] text-center text-slate-400 uppercase tracking-widest font-bold leading-relaxed">
                🤖 Smart cooldown · Dismiss X reduces frequency · Snooze 30m pauses all
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
