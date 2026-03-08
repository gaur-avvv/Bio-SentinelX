import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Database, Plus, Trash2, RefreshCw, Search, FileText,
  ChevronDown, ChevronUp, Upload, BookOpen, Zap, CheckCircle2,
  AlertCircle, Info, FlaskConical, ArrowLeft, Layers, X,
  FileUp, Link2, Type, Cpu,
} from 'lucide-react';
import {
  addDocument, removeDocument, getAllDocuments, getEmbeddingStats,
  clearAllDocuments, retrieveRelevant, reEmbedDocument, getDocumentChunks,
  ResearchDocument, EmbeddingStats,
} from '../services/vectorDB';
import {
  parsePdfWithLlamaCloud, parseUrlWithLlamaCloud,
  isSupportedDocumentFile, isPlainTextFile, LlamaParseTier,
} from '../services/llamaParseService';

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  geminiKey?: string;
  llamaCloudKey?: string;
  setLlamaCloudKey?: (key: string) => void;
  onBack: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtSize(chars: number): string {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)} M chars`;
  if (chars >= 1_000) return `${(chars / 1_000).toFixed(1)} K chars`;
  return `${chars} chars`;
}
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────
type InputMethod = 'paste' | 'file' | 'pdf' | 'url';

export const ResearchLibrary: React.FC<Props> = ({ geminiKey, llamaCloudKey, setLlamaCloudKey, onBack }) => {
  const [docs, setDocs] = useState<ResearchDocument[]>([]);
  const [stats, setStats] = useState<EmbeddingStats>({ totalDocs: 0, totalChunks: 0, embeddedChunks: 0, tfidfChunks: 0 });

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [inputMethod, setInputMethod] = useState<InputMethod>('paste');
  const [formTitle, setFormTitle] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formContent, setFormContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState<{ done: number; total: number } | null>(null);
  const [addError, setAddError] = useState('');

  // LlamaParse state
  const [parseTier, setParseTier] = useState<LlamaParseTier>('cost_effective');
  const [parseUrl, setParseUrl] = useState('');
  const [parseStatus, setParseStatus] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // Re-embed
  const [reEmbedId, setReEmbedId] = useState<string | null>(null);
  const [reEmbedProgress, setReEmbedProgress] = useState<{ done: number; total: number } | null>(null);

  // Retrieval test
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testing, setTesting] = useState(false);

  // Expanded doc card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setDocs(getAllDocuments());
    setStats(getEmbeddingStats());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Plain-text file upload (.txt, .md, .csv) ─────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) { setAddError('File too large — max 5 MB for plain text files.'); return; }
    if (!isPlainTextFile(file)) {
      setAddError('Unsupported file type. Use .txt, .md, .csv — or use the PDF tab for PDFs.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      setFormContent(ev.target?.result as string || '');
      if (!formTitle) setFormTitle(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── PDF / Doc upload via LlamaParse ──────────────────────────────────────
  const handlePdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await runLlamaParse(() => parsePdfWithLlamaCloud(file, llamaCloudKey!, { tier: parseTier, onStatus: setParseStatus }), file.name);
  };

  const handleUrlParse = async () => {
    if (!parseUrl.trim()) return;
    await runLlamaParse(() => parseUrlWithLlamaCloud(parseUrl.trim(), llamaCloudKey!, { tier: parseTier, onStatus: setParseStatus }), parseUrl.trim());
  };

  const runLlamaParse = async (parseFn: () => Promise<string>, nameHint: string) => {
    if (!llamaCloudKey) { setAddError('LlamaCloud API key is required. Enter it in the key field at the top.'); return; }
    setAddError('');
    setIsParsing(true);
    setParseStatus('Starting…');
    try {
      const text = await parseFn();
      setFormContent(text);
      if (!formTitle) {
        const hint = nameHint.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Parsed Document';
        setFormTitle(hint);
      }
      if (!formSource) setFormSource('LlamaParse extraction');
      setParseStatus('');
      // Auto-switch to paste view so user can see/edit content
      setInputMethod('paste');
    } catch (err: any) {
      setParseStatus('');
      setAddError(err?.message || 'LlamaParse failed.');
    } finally {
      setIsParsing(false);
    }
  };

  // ── Add document ─────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!formTitle.trim()) { setAddError('Please enter a document title.'); return; }
    if (!formContent.trim() || formContent.trim().length < 50) {
      setAddError('Document content is too short (min 50 characters).'); return;
    }
    setAddError('');
    setAdding(true);
    setEmbedProgress({ done: 0, total: 1 });
    try {
      await addDocument(
        formTitle.trim(),
        formSource.trim() || 'User upload',
        formContent.trim(),
        geminiKey || undefined,
        (done, total) => setEmbedProgress({ done, total }),
      );
      setFormTitle('');
      setFormSource('');
      setFormContent('');
      setShowForm(false);
      refresh();
    } catch (e: any) {
      setAddError(e?.message || 'Failed to add document.');
    } finally {
      setAdding(false);
      setEmbedProgress(null);
    }
  };

  // ── Remove document ──────────────────────────────────────────────────────
  const handleRemove = (docId: string) => {
    if (!confirm('Remove this document and all its embeddings from the Research Library?')) return;
    removeDocument(docId);
    refresh();
  };

  // ── Clear all ────────────────────────────────────────────────────────────
  const handleClearAll = () => {
    if (!confirm('Clear the entire Research Library? This cannot be undone.')) return;
    clearAllDocuments();
    refresh();
  };

  // ── Re-embed ─────────────────────────────────────────────────────────────
  const handleReEmbed = async (docId: string) => {
    if (!geminiKey) { alert('A Gemini API key is required for dense embedding. Please add it in Settings.'); return; }
    setReEmbedId(docId);
    setReEmbedProgress({ done: 0, total: 1 });
    try {
      await reEmbedDocument(docId, geminiKey, (done, total) => setReEmbedProgress({ done, total }));
      refresh();
    } catch (e: any) {
      alert(`Re-embedding failed: ${e?.message}`);
    } finally {
      setReEmbedId(null);
      setReEmbedProgress(null);
    }
  };

  // ── Retrieval test ───────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResult('');
    try {
      const result = await retrieveRelevant(testQuery.trim(), 4, geminiKey || undefined);
      setTestResult(result || '_No relevant chunks found for this query. Try different keywords._');
    } catch (e: any) {
      setTestResult(`Error: ${e?.message}`);
    } finally {
      setTesting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const hasDense = stats.embeddedChunks > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
                <Database className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Research Library</h2>
            </div>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-0.5 ml-[3.25rem]">
              Vector Knowledge Base · RAG-Powered AI Enhancement
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500
                         border border-rose-200 rounded-xl hover:bg-rose-50 transition-all"
            >
              Clear All
            </button>
          )}
          <button
            onClick={() => { setShowForm(v => !v); setAddError(''); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-[10px] font-black
                       uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Research
          </button>
        </div>
      </div>

      {/* LlamaCloud API Key */}
      <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-800/50 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-100 rounded-lg">
              <Cpu className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <span className="text-[10px] font-black text-violet-700 uppercase tracking-widest">LlamaCloud API Key</span>
            {llamaCloudKey && <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Active</span>}
          </div>
          <a href="https://cloud.llamaindex.ai" target="_blank" rel="noopener noreferrer"
            className="text-[9px] font-black text-violet-600 uppercase hover:underline">Get Free Key</a>
        </div>
        <div className="relative group">
          <input
            type="password"
            value={llamaCloudKey || ''}
            onChange={e => {
              setLlamaCloudKey?.(e.target.value);
              localStorage.setItem('biosentinel_llamacloud_key', e.target.value);
            }}
            placeholder="llx-..."
            className="w-full pl-4 pr-4 py-2.5 bg-white dark:bg-slate-700 border border-violet-200 dark:border-violet-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 focus:border-violet-500 transition-all"
          />
        </div>
        <p className="text-[9px] font-bold text-slate-400 leading-snug">
          Required to parse PDFs, DOCX, PPTX, and web pages via LlamaParse.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Documents', value: stats.totalDocs, icon: FileText, color: 'indigo' },
          { label: 'Text Chunks', value: stats.totalChunks, icon: Layers, color: 'violet' },
          {
            label: 'Dense Vectors',
            value: stats.embeddedChunks,
            icon: Zap,
            color: 'teal',
            sub: hasDense ? 'Gemini Embedded' : '',
          },
          { label: 'TF-IDF Chunks', value: stats.tfidfChunks, icon: BookOpen, color: 'amber', sub: 'Fallback' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl bg-${s.color}-50 flex items-center justify-center mb-2`}>
              <s.icon className={`w-4 h-4 text-${s.color}-600`} />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{s.value}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</div>
            {s.sub && <div className={`text-[9px] font-bold text-${s.color}-500 uppercase tracking-wider mt-0.5`}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* RAG info banner */}
      <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl">
        <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 leading-relaxed">
          Documents stored here are automatically chunked and embedded. When you run any AI analysis
          (Live Monitor, Historical Research, Flood Prediction), Bio-SentinelX retrieves the most
          relevant passages from this library and injects them into the AI prompt — grounding the
          output in your own research evidence.
          {geminiKey
            ? ' Dense Gemini embeddings are active for high-accuracy semantic retrieval.'
            : ' No Gemini key detected — using TF-IDF keyword retrieval (still effective). Add a Gemini key in Settings for semantic embedding.'}
        </p>
      </div>

      {/* Add Document form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-indigo-100 dark:border-slate-700 shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Add Research Document</h3>
            <button onClick={() => { setShowForm(false); setAddError(''); setParseStatus(''); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-400 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Title + Source */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Document Title *</label>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="e.g. WHO Report on Climate & Health 2024"
                className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                           rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Source / Reference</label>
              <input
                value={formSource}
                onChange={e => setFormSource(e.target.value)}
                placeholder="e.g. WHO, 2024 | DOI or URL"
                className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                           rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Input method tabs */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Input Method</label>
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-700 rounded-2xl mb-4 overflow-x-auto">
              {([
                { id: 'paste' as InputMethod, icon: Type,    label: 'Paste Text' },
                { id: 'file'  as InputMethod, icon: Upload,  label: '.TXT / .MD' },
                { id: 'pdf'   as InputMethod, icon: FileUp,  label: 'PDF / Doc' },
                { id: 'url'   as InputMethod, icon: Link2,   label: 'URL' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setInputMethod(tab.id); setAddError(''); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all whitespace-nowrap flex-1 justify-center ${
                    inputMethod === tab.id
                      ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white'
                  }`}
                >
                  <tab.icon className="w-3 h-3" />{tab.label}
                </button>
              ))}
            </div>

            {/* ── Paste Text ── */}
            {inputMethod === 'paste' && (
              <>
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  rows={9}
                  placeholder={`Paste the full text of the research paper, report, or study abstract here\n\nMinimum 50 characters. For best results, paste the complete text (introduction, methods, results, discussion).`}
                  className="w-full px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                             rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent
                             resize-y transition-all leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 font-semibold mt-1.5">
                  {formContent.length.toLocaleString()} characters
                  {formContent.length > 0 && ` ≈ ${Math.ceil(formContent.length / 650)} chunks`}
                </p>
              </>
            )}

            {/* ── Plain-text file (.txt / .md) ── */}
            {inputMethod === 'file' && (
              <div>
                <input ref={fileRef} type="file" accept=".txt,.md,.csv,.text,text/plain,text/markdown" className="hidden" onChange={handleFile} />
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed border-indigo-200
                             rounded-2xl bg-indigo-50/50 cursor-pointer hover:bg-indigo-50 transition-all"
                >
                  <div className="p-4 bg-indigo-100 rounded-2xl">
                    <Upload className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-slate-800">Click to upload .txt or .md</p>
                    <p className="text-[11px] font-semibold text-slate-400 mt-1">Supported: .txt · .md · .csv — max 5 MB</p>
                  </div>
                </div>
                {formContent && (
                  <div className="mt-3 p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                    <p className="text-xs font-bold text-teal-700">
                      File loaded — {formContent.length.toLocaleString()} characters ≈ {Math.ceil(formContent.length / 650)} chunks
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── PDF / Doc via LlamaParse ── */}
            {inputMethod === 'pdf' && (
              <div className="space-y-4">
                {!llamaCloudKey && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-amber-700">
                      LlamaCloud API key required. Enter it in the field above.
                      <a href="https://cloud.llamaindex.ai" target="_blank" rel="noopener noreferrer" className="ml-1 text-amber-600 underline font-black">Get a free key →</a>
                    </p>
                  </div>
                )}
                {/* Tier selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Parse Tier</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl">
                    {([
                      { value: 'fast',           label: 'Fast',         desc: 'Text-only, quickest' },
                      { value: 'cost_effective', label: 'Balanced',     desc: 'Good for most docs' },
                      { value: 'agentic',        label: 'Agentic',      desc: 'Complex layouts' },
                      { value: 'agentic_plus',   label: 'Agentic Plus', desc: 'Maximum accuracy' },
                    ] as { value: LlamaParseTier; label: string; desc: string }[]).map(t => (
                      <button
                        key={t.value}
                        onClick={() => setParseTier(t.value)}
                        className={`px-3 py-2 rounded-xl text-left transition-all ${
                          parseTier === t.value ? 'bg-white dark:bg-slate-600 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white'
                        }`}
                      >
                        <p className="text-[10px] font-black uppercase tracking-wide">{t.label}</p>
                        <p className="text-[9px] font-semibold opacity-70">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  ref={pdfRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.html,.htm,application/pdf"
                  className="hidden"
                  onChange={handlePdfFile}
                />
                <div
                  onClick={() => !isParsing && llamaCloudKey && pdfRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed rounded-2xl transition-all ${
                    !llamaCloudKey || isParsing
                      ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                      : 'border-violet-200 bg-violet-50/50 cursor-pointer hover:bg-violet-50'
                  }`}
                >
                  <div className="p-4 bg-violet-100 rounded-2xl">
                    {isParsing
                      ? <RefreshCw className="w-6 h-6 text-violet-600 animate-spin" />
                      : <Cpu className="w-6 h-6 text-violet-600" />
                    }
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-slate-800">
                      {isParsing ? 'Parsing via LlamaParse…' : 'Click to upload PDF / DOCX / PPTX'}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400 mt-1">
                      {isParsing ? parseStatus : 'Supported: .pdf · .docx · .pptx · .xlsx · .html'}
                    </p>
                  </div>
                </div>
                {formContent && inputMethod === 'pdf' && (
                  <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                    <p className="text-xs font-bold text-teal-700">
                      Extracted {formContent.length.toLocaleString()} characters ≈ {Math.ceil(formContent.length / 650)} chunks. Review content in Paste Text tab.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── URL via LlamaParse ── */}
            {inputMethod === 'url' && (
              <div className="space-y-4">
                {!llamaCloudKey && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-amber-700">
                      LlamaCloud API key required. Enter it in the field above.
                      <a href="https://cloud.llamaindex.ai" target="_blank" rel="noopener noreferrer" className="ml-1 text-amber-600 underline font-black">Get a free key →</a>
                    </p>
                  </div>
                )}
                {/* Tier selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Parse Tier</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl">
                    {([
                      { value: 'fast',           label: 'Fast',         desc: 'Text-only, quickest' },
                      { value: 'cost_effective', label: 'Balanced',     desc: 'Good for most docs' },
                      { value: 'agentic',        label: 'Agentic',      desc: 'Complex layouts' },
                      { value: 'agentic_plus',   label: 'Agentic Plus', desc: 'Maximum accuracy' },
                    ] as { value: LlamaParseTier; label: string; desc: string }[]).map(t => (
                      <button
                        key={t.value}
                        onClick={() => setParseTier(t.value)}
                        className={`px-3 py-2 rounded-xl text-left transition-all ${
                          parseTier === t.value ? 'bg-white dark:bg-slate-600 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white'
                        }`}
                      >
                        <p className="text-[10px] font-black uppercase tracking-wide">{t.label}</p>
                        <p className="text-[9px] font-semibold opacity-70">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    value={parseUrl}
                    onChange={e => setParseUrl(e.target.value)}
                    placeholder="https://example.com/paper.pdf"
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                               rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all"
                  />
                  <button
                    onClick={handleUrlParse}
                    disabled={isParsing || !parseUrl.trim() || !llamaCloudKey}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-[10px] font-black
                               uppercase tracking-widest rounded-xl hover:bg-violet-700
                               disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {isParsing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    Parse
                  </button>
                </div>
                {isParsing && parseStatus && (
                  <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-100 rounded-xl">
                    <RefreshCw className="w-3.5 h-3.5 text-violet-500 animate-spin shrink-0" />
                    <p className="text-xs font-semibold text-violet-700">{parseStatus}</p>
                  </div>
                )}
                {formContent && !isParsing && (
                  <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                    <p className="text-xs font-bold text-teal-700">
                      Extracted {formContent.length.toLocaleString()} characters ≈ {Math.ceil(formContent.length / 650)} chunks.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {addError && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-rose-700">{addError}</p>
            </div>
          )}

          {embedProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <span>{geminiKey ? 'Embedding chunks with Gemini…' : 'Building TF-IDF vectors…'}</span>
                <span>{embedProgress.done} / {embedProgress.total}</span>
              </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${(embedProgress.done / embedProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => { setShowForm(false); setAddError(''); setParseStatus(''); }}
              className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400
                         border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || isParsing || !formContent.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black
                         uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {adding ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Add to Library
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-5 bg-slate-100 dark:bg-slate-700 rounded-full mb-4">
            <BookOpen className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-2">Library is Empty</h3>
          <p className="text-xs font-semibold text-slate-400 max-w-xs">
            Add research papers, WHO reports, or clinical studies. The AI will automatically
            use the most relevant passages to ground its analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            {docs.length} Document{docs.length !== 1 ? 's' : ''} in Library
          </p>
          {docs.map(doc => {
            const isExpanded = expandedId === doc.id;
            const reEmbedding = reEmbedId === doc.id;
            return (
              <div key={doc.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="flex items-start gap-4 p-5">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl shrink-0">
                    <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{doc.title}</h4>
                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{doc.source}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[9px] font-black uppercase tracking-wider rounded-full">
                        {doc.chunkIds.length} chunks
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[9px] font-black uppercase tracking-wider rounded-full">
                        {fmtSize(doc.charCount)}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[9px] font-black uppercase tracking-wider rounded-full">
                        Added {fmtDate(doc.addedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {geminiKey && (
                      <button
                        onClick={() => handleReEmbed(doc.id)}
                        disabled={reEmbedding}
                        title="Re-embed with Gemini for denser vectors"
                        className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-xl transition-all disabled:opacity-50"
                      >
                        {reEmbedding
                          ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : <Zap className="w-4 h-4" />
                        }
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                      className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-all"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleRemove(doc.id)}
                      className="p-2 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Re-embed progress */}
                {reEmbedding && reEmbedProgress && (
                  <div className="px-5 pb-4 space-y-1">
                    <div className="flex justify-between text-[10px] font-black text-teal-600 uppercase tracking-widest">
                      <span>Re-embedding with Gemini…</span>
                      <span>{reEmbedProgress.done} / {reEmbedProgress.total}</span>
                    </div>
                    <div className="h-1 bg-teal-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full transition-all duration-200"
                        style={{ width: `${(reEmbedProgress.done / reEmbedProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Expanded: chunk preview */}
                {isExpanded && (() => {
                  const docChunks = getDocumentChunks(doc.id);
                  const denseCount = docChunks.filter(c => c.hasDense).length;
                  return (
                    <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                          {docChunks.length} Chunks
                        </span>
                        <div className="flex gap-2">
                          {denseCount > 0 && (
                            <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-[9px] font-black uppercase tracking-wider rounded-full">
                              {denseCount} Dense
                            </span>
                          )}
                          {denseCount < docChunks.length && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[9px] font-black uppercase tracking-wider rounded-full">
                              {docChunks.length - denseCount} TF-IDF
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {docChunks.slice(0, 3).map((c, idx) => (
                          <div key={c.id} className="bg-slate-50 dark:bg-slate-700/60 rounded-xl p-3 border border-slate-100 dark:border-slate-600">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Chunk {idx + 1}</span>
                              <span className={`text-[9px] font-black uppercase tracking-wider ${
                                c.hasDense ? 'text-teal-500' : 'text-amber-500'
                              }`}>● {c.hasDense ? 'Dense' : 'TF-IDF'}</span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{c.text}</p>
                          </div>
                        ))}
                        {docChunks.length > 3 && (
                          <p className="text-[10px] font-semibold text-slate-400 text-center">
                            +{docChunks.length - 3} more chunks not shown
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Retrieval Test Panel */}
      {docs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-50 dark:bg-violet-900/40 rounded-xl">
              <FlaskConical className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Retrieval Test</h3>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                Preview which research chunks would be injected for a given query
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              value={testQuery}
              onChange={e => setTestQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTest(); }}
              placeholder="e.g. dengue mosquito temperature threshold, mental health heatwave solastalgia"
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                         rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent transition-all"
            />
            <button
              onClick={handleTest}
              disabled={testing || !testQuery.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-[10px] font-black
                         uppercase tracking-widest rounded-xl hover:bg-violet-700
                         disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-200"
            >
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Test
            </button>
          </div>

          {testResult && (
            <div className="bg-slate-50 dark:bg-slate-700/60 rounded-2xl border border-slate-100 dark:border-slate-600 p-5 max-h-96 overflow-y-auto">
              <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{testResult}</pre>
            </div>
          )}
        </div>
      )}

      {/* Usage notes */}
      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-teal-500" />
          <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">How RAG Works in Bio-SentinelX</span>
        </div>
        <div className="space-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
          <p>1. <strong className="text-slate-700 dark:text-slate-200">Chunking:</strong> Uploaded text is split into ~650-character overlapping segments, preserving sentence boundaries.</p>
          <p>2. <strong className="text-slate-700 dark:text-slate-200">Embedding:</strong> {geminiKey ? 'Gemini text-embedding-004 generates 768-dim dense vectors for each chunk.' : 'TF-IDF sparse vectors are built per chunk (Gemini key needed for dense semantic embedding).'} If Gemini quota is exceeded, TF-IDF fallback activates automatically.</p>
          <p>3b. <strong className="text-slate-700 dark:text-slate-200">PDF Parsing (LlamaParse):</strong> {llamaCloudKey ? 'LlamaCloud API key detected. Use the PDF or URL tab to extract text from PDFs, DOCX, PPTX, or web pages before adding to the library.' : 'Enter a LlamaCloud API key in the field above to enable PDF/DOCX parsing via LlamaParse.'}</p>
          <p>3. <strong className="text-slate-700 dark:text-slate-200">Retrieval:</strong> Before every AI call, a query is built from the current weather context + location. Top-6 most similar chunks are fetched via cosine similarity with source-diversity constraints.</p>
          <p>4. <strong className="text-slate-700 dark:text-slate-200">Injection:</strong> Retrieved passages are prepended to the AI prompt as <em>Retrieved Research Context</em>, grounding the output in your uploaded evidence alongside Bio-SentinelX's built-in science framework.</p>
        </div>
      </div>
    </div>
  );
};
