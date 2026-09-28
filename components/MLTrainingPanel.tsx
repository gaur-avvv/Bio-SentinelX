import React, { useState, useRef, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell } from 'recharts';
import {
  Upload, Brain, Cpu, Database, TrendingUp, Loader2, CheckCircle, AlertCircle,
  BarChart3, Layers, Zap, Settings, Play, RotateCcw, FileDown, ChevronDown,
  ChevronUp, Copy, Check, Table, Download, FileText, Award, RefreshCw, Sparkles,
  FileCode, Activity
} from 'lucide-react';
import { parseCSV, parseCSVString } from '../utils/csvHelper';
import {
  autoDetectFeaturesAndLabel,
  trainModel,
  DEFAULT_TRAINING_CONFIG,
  isModelTrained,
  getTrainedModelInfo,
  runStratifiedCrossValidation,
  generateIEEELaTeXTable,
  exportExperimentalResultsCSV,
  type TrainingConfig,
  type AutoDetectResult,
  type TrainingResult,
  type TrainingMetrics,
  type CrossValidationSummary,
} from '../services/realtimeMLService';

export const MLTrainingPanel: React.FC = () => {
  // Data state
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [autoDetect, setAutoDetect] = useState<AutoDetectResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [isLoadingBundled, setIsLoadingBundled] = useState(false);

  // Config state
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_TRAINING_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Training state
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<TrainingMetrics[]>([]);
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [error, setError] = useState('');

  // Cross-Validation state
  const [isCrossValidating, setIsCrossValidating] = useState(false);
  const [cvFolds, setCvFolds] = useState<number>(5);
  const [cvProgress, setCvProgress] = useState<{ fold: number; total: number } | null>(null);
  const [cvResult, setCvResult] = useState<CrossValidationSummary | null>(null);

  // IEEE Export state
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [showLatexPreview, setShowLatexPreview] = useState(false);
  const [resultSubTab, setResultSubTab] = useState<'overview' | 'confusion' | 'roc' | 'perclass' | 'crossval' | 'export'>('overview');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File Upload Handler ────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setTrainingResult(null);
    setCvResult(null);
    setTrainingProgress([]);
    setFileName(file.name);

    try {
      const parsed = await parseCSV(file);
      if (parsed.length === 0) {
        setError('No valid data found in CSV file.');
        return;
      }

      setRawData(parsed as Record<string, unknown>[]);

      // Auto-detect features and label
      const detected = autoDetectFeaturesAndLabel(parsed as Record<string, unknown>[]);
      setAutoDetect(detected);
      setConfig(prev => ({ ...prev, modelType: detected.suggestedModelType }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file.');
    }
  }, []);

  // ── Load Pre-Bundled Dataset ───────────────────────────────────────
  const handleLoadBundledDataset = useCallback(async () => {
    setIsLoadingBundled(true);
    setError('');
    setTrainingResult(null);
    setCvResult(null);
    try {
      const baseUrl = import.meta.env.BASE_URL || './';
      const csvPath = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}Weather-related disease prediction.csv`;
      let response = await fetch(csvPath);
      if (!response.ok) {
        response = await fetch('/Weather-related disease prediction.csv');
      }
      if (!response.ok) {
        throw new Error('Bundled dataset not found at expected path.');
      }
      const text = await response.text();
      const parsed = parseCSVString(text);

      if (parsed.length === 0) {
        throw new Error('Parsed bundled dataset was empty.');
      }

      setFileName('Weather-related disease prediction.csv');
      setRawData(parsed);

      const detected = autoDetectFeaturesAndLabel(parsed);
      setAutoDetect(detected);
      setConfig(prev => ({ ...prev, modelType: detected.suggestedModelType }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pre-bundled dataset.');
    } finally {
      setIsLoadingBundled(false);
    }
  }, []);

  // ── Train Model ────────────────────────────────────────────────────
  const handleTrain = useCallback(async () => {
    if (!autoDetect || rawData.length === 0) return;

    setIsTraining(true);
    setError('');
    setTrainingProgress([]);
    setTrainingResult(null);

    try {
      const result = await trainModel(
        rawData,
        config,
        autoDetect,
        (metrics) => {
          setTrainingProgress(prev => [...prev, metrics]);
        }
      );
      setTrainingResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Training failed.');
    } finally {
      setIsTraining(false);
    }
  }, [rawData, config, autoDetect]);

  // ── Run Stratified K-Fold Cross-Validation ─────────────────────────
  const handleRunCrossValidation = useCallback(async () => {
    if (!autoDetect || rawData.length === 0) return;

    setIsCrossValidating(true);
    setError('');
    setCvProgress({ fold: 1, total: cvFolds });

    try {
      const summary = await runStratifiedCrossValidation(
        rawData,
        config,
        autoDetect,
        cvFolds,
        (fold, total) => {
          setCvProgress({ fold, total });
        }
      );
      setCvResult(summary);

      if (trainingResult) {
        setTrainingResult({
          ...trainingResult,
          crossValidation: summary,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cross-validation failed.');
    } finally {
      setIsCrossValidating(false);
      setCvProgress(null);
    }
  }, [rawData, config, autoDetect, cvFolds, trainingResult]);

  // ── Copy IEEE LaTeX Table ──────────────────────────────────────────
  const handleCopyLatex = useCallback(() => {
    if (!trainingResult) return;
    const latex = generateIEEELaTeXTable(trainingResult, autoDetect ?? undefined);
    navigator.clipboard.writeText(latex);
    setCopiedLatex(true);
    setTimeout(() => setCopiedLatex(false), 3000);
  }, [trainingResult, autoDetect]);

  // ── Download Experimental CSV ──────────────────────────────────────
  const handleDownloadCSV = useCallback(() => {
    if (!trainingResult) return;
    const csvContent = exportExperimentalResultsCSV(trainingResult);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `BioSentinelX_${trainingResult.modelType}_IEEE_Metrics.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [trainingResult]);

  // ── Reset ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setRawData([]);
    setAutoDetect(null);
    setFileName('');
    setConfig(DEFAULT_TRAINING_CONFIG);
    setTrainingResult(null);
    setCvResult(null);
    setTrainingProgress([]);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const modelInfo = getTrainedModelInfo();

  // ROC Chart series data
  const rocChartData = (trainingResult?.rocCurves?.macro || []).map((pt, i) => ({
    fpr: pt.fpr,
    macroTpr: pt.tpr,
    microTpr: trainingResult?.rocCurves?.micro[i]?.tpr ?? pt.tpr,
    chance: pt.fpr,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl shadow-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Real-Time ML Training & IEEE Benchmark Suite</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">In-browser training, multiclass ROC-AUC, stratified CV, & paper export</p>
          </div>
        </div>
        {isModelTrained() && modelInfo && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
              {modelInfo.type} Model Active
            </span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-rose-800 dark:text-rose-300">{error}</p>
          </div>
        </div>
      )}

      {/* Step 1: Upload or Load Dataset */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">1</div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Dataset Ingestion</h4>
          </div>
          <button
            onClick={handleLoadBundledDataset}
            disabled={isLoadingBundled}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          >
            {isLoadingBundled ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-500" />}
            Load Bundled Cohort (5,202 Records)
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all flex flex-col items-center gap-3 group"
        >
          <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          <div className="text-center">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-indigo-600">
              {fileName || 'Click to upload custom clinical/weather CSV file'}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Auto-detects numeric/categorical features, clinical targets, and best architecture</p>
          </div>
        </button>

        {fileName && rawData.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
            <Database className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{fileName}</span>
            <span className="text-[10px] font-bold text-slate-400">
              {rawData.length} rows &middot; {Object.keys(rawData[0]).length} columns
            </span>
            <button onClick={handleReset} className="ml-auto p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors">
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Auto-Detected Schema */}
      {autoDetect && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">2</div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Auto-Detected Schema & Epidemiology</h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Samples ($N$)</p>
              <p className="text-xl font-black text-indigo-700 dark:text-indigo-300">{autoDetect.numSamples}</p>
            </div>
            <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
              <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Features ($D$)</p>
              <p className="text-xl font-black text-violet-700 dark:text-violet-300">{autoDetect.numFeatures}</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Task Type</p>
              <p className="text-sm font-black text-amber-700 dark:text-amber-300 uppercase">{autoDetect.taskType}</p>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Classes ($C$)</p>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{autoDetect.numClasses || 'N/A'}</p>
            </div>
          </div>

          {/* Detected Label */}
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Label (Auto-Detected)</p>
            <p className="text-sm font-black text-slate-900 dark:text-white">{autoDetect.label}</p>
            {autoDetect.classNames && autoDetect.classNames.length <= 20 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {autoDetect.classNames.map(cn => (
                  <span key={cn} className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-800/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-bold">{cn}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Configure & Train */}
      {autoDetect && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">3</div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Architecture Selection</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              { type: 'ensemble' as const, label: 'Ensemble Learning', desc: 'RF + XGBoost + MLP + TFLite weighted averaging', icon: Layers, color: 'indigo' },
              { type: 'xgboost' as const, label: 'XGBoost GBDT', desc: 'Gradient Boosted Decision Trees with shrinkage', icon: Zap, color: 'violet' },
              { type: 'deeplearning' as const, label: 'Deep Learning MLP', desc: 'Configurable multi-layer neural network with Xavier init', icon: Brain, color: 'blue' },
              { type: 'webml_tflite' as const, label: 'WebML + TFLite', desc: '8-bit quantized edge neural inference for mobile', icon: Cpu, color: 'emerald' },
            ].map(m => (
              <button
                key={m.type}
                onClick={() => setConfig(prev => ({ ...prev, modelType: m.type }))}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  config.modelType === m.type
                    ? `border-${m.color}-500 bg-${m.color}-50 dark:bg-${m.color}-900/20`
                    : 'border-slate-200 dark:border-slate-600 hover:border-slate-300'
                }`}
              >
                <m.icon className={`w-5 h-5 mb-2 ${config.modelType === m.type ? `text-${m.color}-600` : 'text-slate-400'}`} />
                <p className={`text-xs font-black uppercase tracking-widest ${config.modelType === m.type ? `text-${m.color}-700 dark:text-${m.color}-300` : 'text-slate-600 dark:text-slate-400'}`}>{m.label}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>

          {/* Advanced Settings Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-500 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Hyperparameters & Training Settings
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl animate-fade-in">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Epochs</label>
                <input type="number" value={config.epochs} onChange={e => setConfig(prev => ({ ...prev, epochs: parseInt(e.target.value) || 50 }))}
                  className="w-full mt-1 p-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-xs font-bold text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Learning Rate ($\eta$)</label>
                <input type="number" step="0.001" value={config.learningRate} onChange={e => setConfig(prev => ({ ...prev, learningRate: parseFloat(e.target.value) || 0.01 }))}
                  className="w-full mt-1 p-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-xs font-bold text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Batch Size</label>
                <input type="number" value={config.batchSize} onChange={e => setConfig(prev => ({ ...prev, batchSize: parseInt(e.target.value) || 32 }))}
                  className="w-full mt-1 p-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-xs font-bold text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Validation Split</label>
                <input type="number" step="0.05" value={config.validationSplit} onChange={e => setConfig(prev => ({ ...prev, validationSplit: parseFloat(e.target.value) || 0.2 }))}
                  className="w-full mt-1 p-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-xs font-bold text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Trees / Estimators</label>
                <input type="number" value={config.nEstimators} onChange={e => setConfig(prev => ({ ...prev, nEstimators: parseInt(e.target.value) || 100 }))}
                  className="w-full mt-1 p-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-xs font-bold text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Max Tree Depth</label>
                <input type="number" value={config.maxDepth} onChange={e => setConfig(prev => ({ ...prev, maxDepth: parseInt(e.target.value) || 6 }))}
                  className="w-full mt-1 p-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-xs font-bold text-slate-800 dark:text-white" />
              </div>
            </div>
          )}

          {/* Train Button */}
          <button
            onClick={handleTrain}
            disabled={isTraining || rawData.length === 0}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg hover:shadow-xl hover:from-indigo-500 hover:to-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isTraining ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Training In Browser... ({trainingProgress.length} Epochs)
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Train {config.modelType.toUpperCase()} Engine
              </>
            )}
          </button>
        </div>
      )}

      {/* Training Progress Loss Curve */}
      {trainingProgress.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Training Convergence Curves</h4>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trainingProgress}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="epoch" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="trainLoss" stroke="#6366f1" name="Train Loss" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="valLoss" stroke="#f43f5e" name="Val Loss" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="trainAccuracy" stroke="#10b981" name="Train Acc" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="valAccuracy" stroke="#f59e0b" name="Val Acc" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Advanced Scientific Evaluation & IEEE Results Suite */}
      {trainingResult && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Evaluation & IEEE Benchmark Suite</h4>
                <p className="text-[9px] font-bold text-slate-400">Trained in {trainingResult.trainTime.toFixed(2)}s on {rawData.length} records</p>
              </div>
            </div>

            {/* Sub-Tabs for Analysis Views */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
              {[
                { id: 'overview' as const, label: 'Overview' },
                { id: 'confusion' as const, label: 'Confusion Matrix' },
                { id: 'roc' as const, label: 'ROC-AUC' },
                { id: 'perclass' as const, label: 'Class Metrics' },
                { id: 'crossval' as const, label: '5-Fold CV' },
                { id: 'export' as const, label: 'IEEE Export' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setResultSubTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    resultSubTab === t.id
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* TAB 1: OVERVIEW */}
          {resultSubTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Overall Accuracy</p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{(trainingResult.accuracy * 100).toFixed(1)}%</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Macro F1 Score</p>
                  <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{(trainingResult.f1Score * 100).toFixed(1)}%</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
                  <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Macro Precision</p>
                  <p className="text-2xl font-black text-violet-700 dark:text-violet-300">{(trainingResult.precision * 100).toFixed(1)}%</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Macro AUC-ROC</p>
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{(trainingResult.macroAuc ?? 0).toFixed(3)}</p>
                </div>
              </div>

              {/* Feature Importance Chart */}
              {trainingResult.featureImportance.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">SHAP-Like Permutation Feature Importance (Top 10)</p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trainingResult.featureImportance.slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 9 }} domain={[0, 1]} />
                        <YAxis type="category" dataKey="feature" tick={{ fontSize: 9 }} width={140} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                        <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                          {trainingResult.featureImportance.slice(0, 10).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index < 3 ? '#6366f1' : index < 6 ? '#8b5cf6' : '#a78bfa'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONFUSION MATRIX */}
          {resultSubTab === 'confusion' && trainingResult.confusionMatrix && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Multiclass Confusion Matrix</h5>
                  <p className="text-[10px] text-slate-400">Rows represent ground-truth actual disease classes; columns represent predicted classes.</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40 inline-block" /> True Positive</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500/10 border border-rose-500/30 inline-block" /> Misclassification</span>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="w-full text-[11px] text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                      <th className="p-2.5 text-left font-black text-slate-500 uppercase tracking-wider">Actual \ Predicted</th>
                      {trainingResult.classNames?.map((name, i) => (
                        <th key={i} className="p-2.5 font-black text-slate-700 dark:text-slate-300 truncate max-w-[90px]" title={name}>
                          {name}
                        </th>
                      ))}
                      <th className="p-2.5 font-black text-indigo-600 uppercase tracking-wider">Row Recall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingResult.confusionMatrix.map((row, rIdx) => {
                      const rowTotal = row.reduce((a, b) => a + b, 0);
                      const tp = row[rIdx];
                      const recallPct = rowTotal > 0 ? ((tp / rowTotal) * 100).toFixed(1) : '0.0';

                      return (
                        <tr key={rIdx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="p-2 text-left font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-900/50">
                            {trainingResult.classNames?.[rIdx] || `Class ${rIdx}`}
                          </td>
                          {row.map((val, cIdx) => {
                            const isDiagonal = rIdx === cIdx;
                            return (
                              <td
                                key={cIdx}
                                className={`p-2 transition-colors ${
                                  isDiagonal
                                    ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-black'
                                    : val > 0
                                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 font-medium'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              >
                                {val}
                                {rowTotal > 0 && val > 0 && (
                                  <span className="block text-[8px] opacity-75 font-normal">
                                    {((val / rowTotal) * 100).toFixed(0)}%
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-2 font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20">
                            {recallPct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ROC & AUC CURVES */}
          {resultSubTab === 'roc' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Multiclass Receiver Operating Characteristic (ROC)</h5>
                  <p className="text-[10px] text-slate-400">One-vs-Rest (OvR) Macro and Micro averaged true positive rate vs false positive rate.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-black">
                    Macro AUC: {(trainingResult.macroAuc ?? 0).toFixed(3)}
                  </span>
                  <span className="px-2.5 py-1 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-lg text-xs font-black">
                    Micro AUC: {(trainingResult.microAuc ?? 0).toFixed(3)}
                  </span>
                </div>
              </div>

              <div className="h-64 border border-slate-100 dark:border-slate-700/60 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rocChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="fpr"
                      type="number"
                      domain={[0, 1]}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'False Positive Rate (1 - Specificity)', position: 'insideBottom', offset: -5, fontSize: 10 }}
                    />
                    <YAxis
                      domain={[0, 1]}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'True Positive Rate (Sensitivity)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                    />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                    <Line type="monotone" dataKey="macroTpr" stroke="#6366f1" strokeWidth={2.5} dot={false} name="Macro-Average ROC" />
                    <Line type="monotone" dataKey="microTpr" stroke="#0ea5e9" strokeWidth={2.5} dot={false} name="Micro-Average ROC" />
                    <Line type="monotone" dataKey="chance" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Chance (AUC=0.50)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 4: PER-CLASS METRICS */}
          {resultSubTab === 'perclass' && trainingResult.perClassMetrics && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Per-Disease Prognosis Performance Breakdown</h5>
                  <p className="text-[10px] text-slate-400">Class-level sensitivity, specificity, positive predictive value, and F1 score.</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-black uppercase tracking-wider text-[9px]">
                      <th className="p-3">Disease Prognosis</th>
                      <th className="p-3 text-right">Support ($N$)</th>
                      <th className="p-3 text-right">Precision (PPV)</th>
                      <th className="p-3 text-right">Recall (Sens.)</th>
                      <th className="p-3 text-right">Specificity</th>
                      <th className="p-3 text-right">F1-Score</th>
                      <th className="p-3 text-right">AUC-ROC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingResult.perClassMetrics.map(pc => (
                      <tr key={pc.classIndex} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{pc.className}</td>
                        <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">{pc.support}</td>
                        <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{(pc.precision * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{(pc.recall * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-400">{(pc.specificity * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right font-black text-indigo-600 dark:text-indigo-400">{(pc.f1Score * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{pc.auc.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: STRATIFIED K-FOLD CROSS-VALIDATION */}
          {resultSubTab === 'crossval' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Stratified K-Fold Cross-Validation (IEEE Standard)</h5>
                  <p className="text-[10px] text-slate-400">Evaluates generalizability and eliminates train/test split bias with stratified partitioning.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={cvFolds}
                    onChange={e => setCvFolds(parseInt(e.target.value) || 5)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-bold"
                  >
                    <option value={3}>3-Fold</option>
                    <option value={5}>5-Fold (Recommended)</option>
                    <option value={10}>10-Fold</option>
                  </select>
                  <button
                    onClick={handleRunCrossValidation}
                    disabled={isCrossValidating}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase tracking-wider shadow transition-all disabled:opacity-50"
                  >
                    {isCrossValidating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Running Fold {cvProgress?.fold} of {cvProgress?.total}...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Run {cvFolds}-Fold CV
                      </>
                    )}
                  </button>
                </div>
              </div>

              {cvResult ? (
                <div className="space-y-4">
                  {/* Summary Cards with Confidence Intervals */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Accuracy ($\mu \pm \sigma$)</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                        {(cvResult.meanAccuracy * 100).toFixed(2)}% &plusmn; {(cvResult.stdAccuracy * 100).toFixed(2)}%
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold mt-1">
                        95% CI: [{(cvResult.ci95Accuracy[0] * 100).toFixed(1)}%, {(cvResult.ci95Accuracy[1] * 100).toFixed(1)}%]
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Macro F1 ($\mu \pm \sigma$)</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                        {(cvResult.meanF1 * 100).toFixed(2)}% &plusmn; {(cvResult.stdF1 * 100).toFixed(2)}%
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold mt-1">
                        95% CI: [{(cvResult.ci95F1[0] * 100).toFixed(1)}%, {(cvResult.ci95F1[1] * 100).toFixed(1)}%]
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Macro AUC ($\mu \pm \sigma$)</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                        {cvResult.meanAuc.toFixed(3)} &plusmn; {cvResult.stdAuc.toFixed(3)}
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold mt-1">Stratified {cvResult.kFolds} Folds</p>
                    </div>
                  </div>

                  {/* Folds Table */}
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-black uppercase tracking-wider text-[9px]">
                          <th className="p-3">Evaluation Fold</th>
                          <th className="p-3 text-right">Val Samples</th>
                          <th className="p-3 text-right">Accuracy</th>
                          <th className="p-3 text-right">Precision</th>
                          <th className="p-3 text-right">Recall</th>
                          <th className="p-3 text-right">F1-Score</th>
                          <th className="p-3 text-right">Macro AUC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cvResult.folds.map(f => (
                          <tr key={f.fold} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="p-3 font-bold text-slate-800 dark:text-slate-200">Fold {f.fold}</td>
                            <td className="p-3 text-right text-slate-500">{f.valSamples}</td>
                            <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">{(f.accuracy * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right text-slate-700 dark:text-slate-300">{(f.precision * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right text-slate-700 dark:text-slate-300">{(f.recall * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right font-black text-indigo-600">{(f.f1Score * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right font-bold text-emerald-600">{f.auc.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  <Activity className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Stratified Cross-Validation Not Yet Run</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-sm mx-auto">
                    Click the button above to partition the dataset into {cvFolds} stratified folds and compute publication-standard confidence intervals.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: IEEE PUBLICATION EXPORT */}
          {resultSubTab === 'export' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">One-Click IEEE Publication Generator</h5>
                  <p className="text-[10px] text-slate-400">Instantly generate publication-ready LaTeX tables, experimental CSVs, and BibTeX citations.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyLatex}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow transition-all"
                  >
                    {copiedLatex ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLatex ? 'Copied LaTeX!' : 'Copy LaTeX Table'}
                  </button>
                  <button
                    onClick={handleDownloadCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </button>
                </div>
              </div>

              {/* Code Preview */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">IEEEtran LaTeX Table Output</span>
                  <button
                    onClick={() => setShowLatexPreview(!showLatexPreview)}
                    className="text-[10px] font-bold text-indigo-600 hover:underline"
                  >
                    {showLatexPreview ? 'Collapse' : 'Expand Preview'}
                  </button>
                </div>
                <pre className={`p-4 bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto ${showLatexPreview ? 'max-h-96' : 'max-h-48'} transition-all`}>
                  <code>{generateIEEELaTeXTable(trainingResult, autoDetect ?? undefined)}</code>
                </pre>
              </div>

              {/* BibTeX citation box */}
              <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-xl">
                <p className="text-[9px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">Recommended Citation Format</p>
                <code className="text-[10px] text-slate-700 dark:text-slate-300 block font-mono">
                  @article&#123;biosentinelx2026,<br />
                  &nbsp;&nbsp;title=&#123;Bio-SentinelX: Client-Centric Multi-Model Machine Learning and Epidemiological Forecasting Architecture&#125;,<br />
                  &nbsp;&nbsp;journal=&#123;IEEE Transactions on Biomedical Engineering&#125;,<br />
                  &nbsp;&nbsp;year=&#123;2026&#125;<br />
                  &#125;
                </code>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MLTrainingPanel;
