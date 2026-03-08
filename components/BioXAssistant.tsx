import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Bot, Send, RefreshCcw, ChevronLeft, Copy, CheckCircle, XCircle, AlertCircle, ShieldAlert, ChevronRight, Database, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WeatherData, ChatMessage, HealthAlert } from '../types';
import { chatWithWeatherAssistant } from '../services/geminiService';
import { MLPrediction, submitFeedback } from '../services/mlService';
import { maybeCreateSymptomAlertFromText } from '../services/symptomService';
import {
  getCurrentSessionMessages,
  appendMessages,
  clearCurrentSession,
  getAllSessions,
  getMemorySummary,
} from '../services/memoryService';
import { stripHiddenModelReasoning } from '../utils/aiTextSanitizer';

interface BioXAssistantProps {
  weather: WeatherData | null;
  aiKey?: string;
  aiProvider?: string;
  aiModel?: string;
  mlPrediction?: MLPrediction | null;
  analysis?: string;
  onBack: () => void;
  onAddAlerts?: (alerts: HealthAlert[]) => void;
}

// ── Isolated chat input ────────────────────────────────────────────────────────
const ChatInputForm = memo(({ onSubmit, disabled }: { onSubmit: (msg: string) => void; disabled: boolean }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 sm:p-6 bg-slate-900 border-t border-slate-800 flex gap-3"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask Bio-Assistant anything..."
        disabled={disabled}
        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-slate-400 disabled:opacity-50"
        aria-label="Chat message input"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="p-3 bg-teal-600 text-white rounded-xl hover:bg-teal-500 shadow-xl shadow-teal-900/20 transition-all active:scale-95 shrink-0 disabled:opacity-40"
        aria-label="Send message"
      >
        <Send className="w-5 h-5" />
      </button>
    </form>
  );
});

// ── Main page ─────────────────────────────────────────────────────────────────
export const BioXAssistant: React.FC<BioXAssistantProps> = ({
  weather,
  aiKey,
  aiProvider,
  aiModel,
  mlPrediction,
  analysis = '',
  onBack,
  onAddAlerts,
}) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      // Load from memory service (migrates legacy chat automatically)
      return getCurrentSessionMessages(weather?.city || undefined);
    } catch {
      return [];
    }
  });
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<number, boolean>>({});
  const [feedbackComments, setFeedbackComments] = useState<Record<number, string>>({});
  const [showCommentInput, setShowCommentInput] = useState<number | null>(null);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Stable ref so sendMessage never changes identity during typing
  const chatCtxRef = useRef({ weather, isChatLoading, aiKey, mlPrediction, aiProvider, aiModel, chatMessages } as any);
  chatCtxRef.current = { weather, isChatLoading, aiKey, mlPrediction, aiProvider, aiModel, chatMessages };

  useEffect(() => {
    // Persist to memory service (handles cross-session summaries)
    appendMessages(chatMessages, weather?.city || undefined);
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);   // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (message: string) => {
    const { weather, isChatLoading, aiKey, mlPrediction, aiProvider, aiModel, chatMessages } = chatCtxRef.current;
    if (!message.trim() || !weather || isChatLoading) return;
    const userMsg = message.trim();

    // Persist symptom history and trigger a notification if it looks serious.
    try {
      const symptomAlert = maybeCreateSymptomAlertFromText(userMsg, weather);
      if (symptomAlert && onAddAlerts) onAddAlerts([symptomAlert]);
    } catch { /* ignore symptom parsing errors */ }

    setChatError(null);
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);
    try {
      const rawResponse = await chatWithWeatherAssistant(weather, chatMessages, userMsg, aiKey, mlPrediction, aiProvider, aiModel);
      const response = stripHiddenModelReasoning(rawResponse);
      setChatMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (err: any) {
      setChatError(err?.message || 'Bio-Assistant link interrupted. Check your network or API key.');
    } finally {
      setIsChatLoading(false);
    }
  }, []);

  const clearChat = () => {
    clearCurrentSession();
    setChatMessages([]);
    setChatError(null);
    setSelectedOptions([]);
  };

  const handleFeedback = async (msgIdx: number, isHelpful: boolean) => {
    if (feedbackStatus[msgIdx]) return;
    setFeedbackStatus(prev => ({ ...prev, [msgIdx]: true }));
    setShowCommentInput(msgIdx);
    await submitFeedback({ predictionId: `chat-msg-${msgIdx}-${Date.now()}`, isHelpful, timestamp: new Date().toISOString() });
  };

  const submitComment = async (msgIdx: number) => {
    const comment = feedbackComments[msgIdx];
    if (!comment) return;
    await submitFeedback({ predictionId: `chat-msg-${msgIdx}-${Date.now()}`, isHelpful: true, userComment: comment, timestamp: new Date().toISOString() });
    setShowCommentInput(null);
  };

  const suggestedPrompts = (() => {
    // Read persisted profile to generate personalised prompts
    let lifestyle: any = null;
    let userFeedback = '';
    try {
      const raw = localStorage.getItem('biosentinel_lifestyle_data');
      if (raw) lifestyle = JSON.parse(raw);
      userFeedback = localStorage.getItem('biosentinel_user_feedback') || '';
    } catch { /* noop */ }

    const hasProfile = lifestyle && (lifestyle.age || lifestyle.medicalHistory || lifestyle.allergies);
    const hasAnalysis = !!(analysis || mlPrediction);

    const profilePrompts: string[] = [];
    if (lifestyle?.medicalHistory && lifestyle.medicalHistory !== 'None')
      profilePrompts.push(`How does current weather affect my ${lifestyle.medicalHistory}?`);
    if (lifestyle?.allergies && lifestyle.allergies !== 'None')
      profilePrompts.push(`Allergy risk check for ${lifestyle.allergies} today`);
    if (lifestyle?.medication && lifestyle.medication !== 'None')
      profilePrompts.push(`Medication interaction: ${lifestyle.medication} & current AQI`);
    if (userFeedback)
      profilePrompts.push(`Analyse my reported observation: "${userFeedback.slice(0, 60)}"`);

    const analysisPrompts = hasAnalysis ? [
      'Explain my top bio-risks in simple terms',
      'Generate a personalised 24h safety protocol',
      ...(mlPrediction?.disease ? [`Prevention plan for ${mlPrediction.disease}`] : []),
      ...(analysis.toLowerCase().includes('respiratory') ? ['Respiratory risk — what should I do?'] : []),
      ...(analysis.toLowerCase().includes('heat') ? ['Heat stress mitigation steps'] : []),
    ] : [];

    const genericPrompts = [
      'What health risks does today\'s weather pose for me?',
      'Analyse local AQI impact on my health',
      'Start symptom intake: I feel unwell',
      'Identify seasonal disease risks in my area',
      'What should I avoid outdoors today?',
      'Summarise today\'s health risks',
    ];

    // Priority: profile-aware > analysis-aware > generic, deduplicated, max 6
    const combined = [...profilePrompts, ...analysisPrompts, ...genericPrompts];
    const seen = new Set<string>();
    return combined.filter(p => { if (seen.has(p)) return false; seen.add(p); return true; }).slice(0, 6);
  })();

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-slate-900 rounded-none sm:rounded-[2.5rem] overflow-hidden shadow-2xl border-0 sm:border border-slate-800">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950 shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="p-2 sm:p-2.5 bg-teal-500/20 rounded-xl border border-teal-500/30">
            <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-teal-400" />
          </div>
          <div>
            <h2 className="font-black text-white uppercase text-sm sm:text-base tracking-tight">
              BioX<span className="text-teal-400">Assistant</span>
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              <p className="text-[9px] font-black text-teal-400 uppercase tracking-[0.2em]">AI Assistant Active</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {!weather && (
            <span className="hidden sm:block text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-1.5">
              No weather data
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowSessionHistory(v => !v)}
            className={`p-2 sm:p-2.5 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 ${
              showSessionHistory
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                : 'hover:bg-white/10 text-slate-300 hover:text-white'
            }`}
            title="View past sessions"
            aria-label="Session history"
          >
            <Database className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={clearChat}
            className="p-2 sm:p-2.5 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
            title="Reset session"
            aria-label="Reset chat history"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-6 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.05),transparent)]"
        aria-live="polite"
        role="log"
        aria-label="Chat history"
      >
        {/* Empty state */}
        {chatMessages.length === 0 && (
          <>
            <div className="flex flex-col items-center justify-center text-center py-10 space-y-5">
              <div className="p-6 bg-slate-800 rounded-full shadow-2xl shadow-teal-500/10">
                <Bot className="w-14 h-14 text-teal-400" />
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Assistant Ready</p>
                <p className="text-[10px] font-bold text-slate-400 max-w-[260px] mx-auto leading-relaxed">
                  {weather
                    ? `Weather loaded for ${weather.city}. Ask me anything.`
                    : 'Fetch weather data first to enable full bio-analysis.'}
                </p>
              </div>
            </div>

            {/* Suggested prompts */}
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Suggested Inquiries</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedPrompts.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={!weather}
                    onClick={() => sendMessage(opt)}
                    aria-label={`Ask: ${opt}`}
                    className="w-full text-left p-3 sm:p-4 bg-slate-800/60 border border-slate-700 rounded-2xl text-[10px] font-bold text-slate-100 hover:bg-teal-600 hover:text-white hover:border-teal-500 transition-all flex items-center justify-between group shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {opt}
                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

            {/* Memory summary badge */}
            {(() => {
              const mem = getMemorySummary();
              if (!mem.ongoingConcerns.length && !mem.recentCities.length) return null;
              return (
                <div className="bg-teal-950/60 border border-teal-800/50 rounded-2xl p-3 space-y-1.5">
                  <p className="text-[9px] font-black text-teal-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Database className="w-3 h-3" /> Persistent Memory Active
                  </p>
                  {mem.recentCities.length > 0 && (
                    <p className="text-[10px] text-slate-400">
                      <span className="text-slate-300 font-bold">Monitored:</span> {mem.recentCities.join(', ')}
                    </p>
                  )}
                  {mem.ongoingConcerns.length > 0 && (
                    <p className="text-[10px] text-slate-400">
                      <span className="text-slate-300 font-bold">Known concerns:</span> {mem.ongoingConcerns.slice(0, 3).join(', ')}
                    </p>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* Messages */}
        {chatMessages.map((msg, idx) => {
          const { cleanText, options, prediction } = msg.role === 'model'
            ? (() => {
                let text = msg.text;
                let opts: string[] = [];
                let pred: { risk: string; confidence: string; summary: string } | null = null;

                text = stripHiddenModelReasoning(text);

                // Collect ALL [OPTIONS: …] blocks (multiple are valid for multi-question flows)
                const allOptMatches = [...text.matchAll(/\[OPTIONS:\s*(.*?)\]/g)];
                if (allOptMatches.length > 0) {
                  opts = allOptMatches.flatMap(m => m[1].split('|').map(o => o.trim()));
                  text = text.replace(/\[OPTIONS:\s*.*?\]/g, '').trim();
                }

                const predMatch = text.match(/\[PREDICTION:\s*(.*?)\s*\|\s*CONFIDENCE:\s*(.*?)\s*\|\s*SUMMARY:\s*(.*?)\]/);
                if (predMatch) {
                  pred = { risk: predMatch[1], confidence: predMatch[2], summary: predMatch[3] };
                  text = text.replace(/\[PREDICTION:\s*.*?\]/, '').trim();
                }
                return { cleanText: text, options: opts, prediction: pred };
              })()
            : { cleanText: msg.text, options: [], prediction: null };

          const isLast = idx === chatMessages.length - 1;

          return (
            <div key={idx} className="space-y-3">
              <div className={`flex items-end gap-2 sm:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === 'model' && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 shadow-lg">
                    <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-400" />
                  </div>
                )}
                <div className={`group relative max-w-[92%] sm:max-w-[80%] p-3 sm:p-5 rounded-2xl text-xs sm:text-sm ${
                  msg.role === 'user'
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20 rounded-br-none'
                    : 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xl rounded-bl-none'
                }`}>
                  <div className={`prose prose-sm max-w-none break-words [overflow-wrap:anywhere] ${msg.role === 'user' ? 'prose-invert text-white' : 'prose-invert text-slate-100'}
                    prose-p:leading-relaxed prose-p:my-1 prose-li:my-0.5 prose-strong:text-teal-300 prose-strong:font-black prose-headings:text-white prose-a:text-teal-400`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ node, ...props }) => (
                          <div className="overflow-x-auto my-3 rounded-xl border border-slate-600">
                            <table className="min-w-full text-xs" {...props} />
                          </div>
                        ),
                        thead: ({ node, ...props }) => (
                          <thead className="bg-teal-900/60 text-teal-300" {...props} />
                        ),
                        tbody: ({ node, ...props }) => (
                          <tbody className="divide-y divide-slate-700" {...props} />
                        ),
                        tr: ({ node, ...props }) => (
                          <tr className="even:bg-slate-700/30 hover:bg-slate-700/50 transition-colors" {...props} />
                        ),
                        th: ({ node, ...props }) => (
                          <th className="px-3 py-2 text-left font-black text-[10px] uppercase tracking-wider border-r border-slate-600 last:border-r-0" {...props} />
                        ),
                        td: ({ node, ...props }) => (
                          <td className="px-3 py-2 text-slate-200 border-r border-slate-700 last:border-r-0" {...props} />
                        ),
                      }}
                    >
                      {cleanText}
                    </ReactMarkdown>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(cleanText)}
                    className="absolute -top-2 -right-2 p-1.5 sm:p-2 bg-slate-900 border border-slate-700 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:text-teal-400 text-slate-300 shadow-lg focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    title="Copy"
                    aria-label="Copy message"
                  >
                    <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
              </div>

              {/* Prediction card */}
              {prediction && (
                <div className="mx-2 sm:mx-4 p-4 sm:p-6 bg-slate-800 border-2 border-teal-500/30 rounded-2xl shadow-2xl space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-teal-400" />
                      <span className="text-[9px] sm:text-[10px] font-black text-white uppercase tracking-widest">Neural Prediction</span>
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-black text-teal-400 uppercase bg-teal-500/10 border border-teal-500/20 rounded-full px-2 sm:px-3 py-1">
                      {prediction.confidence} Confidence
                    </span>
                  </div>
                  <div>
                    <h4 className="text-lg sm:text-xl font-black text-white uppercase leading-tight">{prediction.risk}</h4>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-200 mt-2 leading-relaxed">{prediction.summary}</p>
                  </div>
                  <div className="pt-3 border-t border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                        {feedbackStatus[idx] ? 'Thank you!' : 'Was this helpful?'}
                      </span>
                      {!feedbackStatus[idx] && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleFeedback(idx, true)} className="p-2 hover:bg-teal-500/10 rounded-lg text-slate-300 hover:text-teal-400 transition-all" aria-label="Helpful">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => handleFeedback(idx, false)} className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-300 hover:text-rose-400 transition-all" aria-label="Not helpful">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {showCommentInput === idx && (
                      <div className="space-y-3">
                        <textarea
                          value={feedbackComments[idx] || ''}
                          onChange={(e) => setFeedbackComments(prev => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="Optional: Provide more context..."
                          className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-[10px] font-bold text-slate-100 focus:border-teal-500 outline-none resize-none h-20 placeholder:text-slate-400"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setShowCommentInput(null)} className="px-3 py-1.5 text-[9px] font-black text-slate-300 uppercase hover:text-white">Skip</button>
                          <button onClick={() => submitComment(idx)} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-[9px] font-black uppercase">Submit</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Multi-select options */}
              {msg.role === 'model' && options.length > 0 && isLast && (
                <div className="pl-2 sm:pl-4 space-y-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select one or more · then submit</p>
                  <div className="flex flex-wrap gap-2">
                    {options.map((opt) => {
                      const isSelected = selectedOptions.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedOptions(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt])}
                          aria-pressed={isSelected}
                          className={`px-3 py-2.5 border rounded-xl text-[11px] font-black transition-all tracking-wide focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                            isSelected ? 'bg-teal-600 border-teal-500 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-teal-400 hover:bg-teal-600 hover:text-white hover:border-teal-500'
                          }`}
                        >
                          {isSelected && '✓ '}{opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Loading indicator */}
        {isChatLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex gap-2 items-center shadow-xl">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" />
              </div>
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2">Thinking...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {chatError && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] font-bold text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {chatError}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Sticky Selection Submit Bar (appears when options are chosen) ── */}
      {selectedOptions.length > 0 && (
        <div className="shrink-0 px-4 py-3 bg-slate-800/90 backdrop-blur-sm border-t border-teal-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse shrink-0" />
            <span className="text-[10px] font-black text-teal-300 uppercase tracking-widest truncate">
              {selectedOptions.length} selected
            </span>
            <div className="flex gap-1 min-w-0 overflow-hidden">
              {selectedOptions.slice(0, 2).map(o => (
                <span key={o} className="text-[9px] font-bold text-slate-400 bg-slate-700 rounded-lg px-2 py-0.5 truncate max-w-[90px]">{o}</span>
              ))}
              {selectedOptions.length > 2 && (
                <span className="text-[9px] font-bold text-slate-400 bg-slate-700 rounded-lg px-2 py-0.5 shrink-0">+{selectedOptions.length - 2}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedOptions([])}
              className="px-3 py-2 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-all"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { const combined = selectedOptions.join(', '); setSelectedOptions([]); sendMessage(combined); }}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-500 active:scale-95 transition-all shadow-lg shadow-teal-900/30"
            >
              <Send className="w-3 h-3" /> Submit
            </button>
          </div>
        </div>
      )}

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <ChatInputForm onSubmit={sendMessage} disabled={isChatLoading || !weather} />

      {/* ── Session History Drawer ────────────────────────────────────────── */}
      {showSessionHistory && (() => {
        const sessions = getAllSessions().filter(s => s.messageCount > 0);
        return (
          <div className="absolute inset-0 z-40 flex flex-col bg-slate-900/97 backdrop-blur-md rounded-none sm:rounded-[2.5rem] overflow-hidden">
            {/* Drawer header */}
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-teal-400" />
                <span className="font-black text-white text-sm uppercase tracking-wider">Session Memory</span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 rounded-lg px-2 py-0.5 border border-slate-700">
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setShowSessionHistory(false)}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Memory summary */}
            {(() => {
              const mem = getMemorySummary();
              return (
                <div className="px-5 py-3 bg-teal-950/40 border-b border-teal-900/30 shrink-0 space-y-1">
                  <p className="text-[9px] font-black text-teal-400 uppercase tracking-widest">Persistent Memory</p>
                  {mem.recentCities.length > 0 && (
                    <p className="text-[10px] text-slate-300">
                      <span className="text-teal-400 font-bold">Locations:</span> {mem.recentCities.join(' · ')}
                    </p>
                  )}
                  {mem.ongoingConcerns.length > 0 && (
                    <p className="text-[10px] text-slate-300">
                      <span className="text-teal-400 font-bold">Health concerns:</span> {mem.ongoingConcerns.join(' · ')}
                    </p>
                  )}
                  {mem.keyHealthInsights.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {mem.keyHealthInsights.slice(0, 3).map((insight, i) => (
                        <p key={i} className="text-[10px] text-slate-400 flex gap-1.5">
                          <span className="text-teal-500 shrink-0">›</span>{insight}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Session list */}
            <div className="flex-1 overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Clock className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-xs font-black uppercase tracking-widest">No past sessions yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {sessions.map((session, i) => (
                    <div
                      key={session.id}
                      className="px-5 py-4 hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (session.messages.length > 0) {
                          setChatMessages(session.messages);
                          setShowSessionHistory(false);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            #{sessions.length - i} · {new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {session.city && (
                            <span className="text-[9px] font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-md">
                              {session.city}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] font-bold text-slate-500">
                          {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {session.summary ? (
                        <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-3">{session.summary}</p>
                      ) : (
                        <p className="text-[10px] text-slate-600 italic">No summary available</p>
                      )}
                      {session.messages.length > 0 && (
                        <p className="text-[9px] text-teal-500 mt-1.5 font-bold">Tap to restore session →</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clear all sessions */}
            {sessions.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-800 shrink-0 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {sessions.reduce((a, s) => a + s.messageCount, 0)} messages across {sessions.length} sessions
                </span>
                <button
                  onClick={() => {
                    if (!confirm('Clear all session history? Memory summaries will be kept.')) return;
                    localStorage.removeItem('biosentinel_chat_sessions_v2');
                    localStorage.removeItem('biosentinel_chat_v1');
                    setShowSessionHistory(false);
                  }}
                  className="text-[10px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest"
                >
                  Clear Sessions
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
