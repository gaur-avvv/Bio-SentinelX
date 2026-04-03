import React, { useState, useRef, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell } from 'recharts';
import { Upload, Brain, Cpu, Database, TrendingUp, Loader2, CheckCircle, AlertCircle, BarChart3, Layers, Zap, Settings, Play, RotateCcw, FileDown, ChevronDown, ChevronUp } from 'lucide-react';
import { parseCSV } from '../utils/csvHelper';
import {
  autoDetectFeaturesAndLabel,
  trainModel,
  DEFAULT_TRAINING_CONFIG,
  isModelTrained,
  getTrainedModelInfo,
  saveTrainedModel,
  loadTrainedModel,
  type TrainingConfig,
  type AutoDetectResult,
  type TrainingResult,
  type TrainingMetrics,
} from '../services/realtimeMLService';

interface MLTrainingPanelProps {
  onModelReady?: () => void;
}

const MLTrainingPanel: React.FC<MLTrainingPanelProps> = ({ onModelReady }) => {
  // Data state
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [autoDetect, setAutoDetect] = useState<AutoDetectResult | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [fileName, setFileName] = useState('');

  // Config state
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_TRAINING_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Training state
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<TrainingMetrics[]>([]);
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadModelInputRef = useRef<HTMLInputElement>(null);

  const handleExportModel = useCallback(() => {
    const modelData = saveTrainedModel();
    if (!modelData) return;
    const blob = new Blob([modelData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biosentinel_model_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleLoadModel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      const success = loadTrainedModel(data);
      if (success) {
        setError('');
        // Trigger a re-render or notification if needed.
        // We'll just reset some states to show it's loaded.
        setTrainingResult(null);
        setAutoDetect(null);
        setRawData([]);
        setFileName('Loaded from JSON');
        onModelReady?.();
      } else {
        setError('Failed to load model. Invalid JSON format.');
      }
    };
    reader.readAsText(file);
    if (loadModelInputRef.current) loadModelInputRef.current.value = '';
  }, [onModelReady]);


  // ── File Upload Handler ────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setTrainingResult(null);
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
      setSelectedFeatures(detected.features);
      setSelectedLabel(detected.label);
      setConfig(prev => ({ ...prev, modelType: detected.suggestedModelType }));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file.');
    }
  }, []);


  // ── Train Model ────────────────────────────────────────────────────
  const handleTrain = useCallback(async () => {
    if (!autoDetect || rawData.length === 0 || !selectedLabel || selectedFeatures.length === 0) return;

    setIsTraining(true);
    setError('');
    setTrainingProgress([]);
    setTrainingResult(null);

    const customDetect = {
      ...autoDetect,
      features: selectedFeatures,
      label: selectedLabel
    };

    try {
      const result = await trainModel(
        rawData,
        config,
        customDetect,
        (metrics) => {
          setTrainingProgress(prev => [...prev, metrics]);
        }
      );

      setTrainingResult(result);
      onModelReady?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Training failed.');
    } finally {
      setIsTraining(false);
    }
  }, [rawData, config, autoDetect, onModelReady]);

  // ── Reset ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setRawData([]);
    setAutoDetect(null);
    setFileName('');
    setConfig(DEFAULT_TRAINING_CONFIG);
    setTrainingResult(null);
    setTrainingProgress([]);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const modelInfo = getTrainedModelInfo();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl shadow-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Real-Time ML Training</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Train models directly from your CSV data</p>
          </div>
        </div>

        {isModelTrained() && modelInfo && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                {modelInfo.type} Model Active
              </span>
            </div>
            <button onClick={handleExportModel} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 transition-colors">
              <FileDown className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest">Export</span>
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => loadModelInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Upload className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">Load Model</span>
          </button>
          <input type="file" ref={loadModelInputRef} accept=".json" className="hidden" onChange={handleLoadModel} />
        </div>

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

      {/* Step 1: Upload CSV */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">1</div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Upload Dataset</h4>
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
              {fileName || 'Click to upload CSV file'}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Auto-detects features, labels, and best model type</p>
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
            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Auto-Detected Schema</h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Samples</p>
              <p className="text-xl font-black text-indigo-700 dark:text-indigo-300">{autoDetect.numSamples}</p>
            </div>
            <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
              <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Features</p>
              <p className="text-xl font-black text-violet-700 dark:text-violet-300">{autoDetect.numFeatures}</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Task Type</p>
              <p className="text-sm font-black text-amber-700 dark:text-amber-300 uppercase">{autoDetect.taskType}</p>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Classes</p>
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

          {/* Feature list (collapsed) */}
          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Features ({autoDetect.features.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {autoDetect.features.slice(0, 15).map(f => (
                <span key={f} className="px-2 py-0.5 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300">{f}</span>
              ))}
              {autoDetect.features.length > 15 && (
                <span className="px-2 py-0.5 text-[10px] font-bold text-slate-400">+{autoDetect.features.length - 15} more</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Configure & Train */}
      {autoDetect && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">3</div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Configure & Train</h4>
          </div>

          {/* Model Type Selection */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              { type: 'xgboost' as const, label: 'XGBoost', desc: 'Gradient Boosted Trees', icon: TrendingUp, color: 'emerald' },
              { type: 'deeplearning' as const, label: 'Deep Learning', desc: 'Neural Network (MLP)', icon: Brain, color: 'violet' },
              { type: 'webml_tflite' as const, label: 'WebML + TFLite', desc: 'Quantized Neural Inference', icon: Cpu, color: 'sky' },
              { type: 'ensemble' as const, label: 'Ensemble', desc: 'RF + XGB + NN Combined', icon: Layers, color: 'indigo' },
            ]).map(m => (
              <button
                key={m.type}
                onClick={() => setConfig(prev => ({ ...prev, modelType: m.type }))}
                className={`p-4 rounded-xl border-2 transition-all text-left ${config.modelType === m.type
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
            Advanced Settings
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
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Learning Rate</label>
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
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">N Estimators (Trees)</label>
                <input type="number" value={config.nEstimators} onChange={e => setConfig(prev => ({ ...prev, nEstimators: parseInt(e.target.value) || 100 }))}
                  className="w-full mt-1 p-2 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg text-xs font-bold text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Max Depth</label>
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
                Training... ({trainingProgress.length} epochs)
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Train {config.modelType === 'ensemble'
                  ? 'Ensemble'
                  : config.modelType === 'xgboost'
                    ? 'XGBoost'
                    : config.modelType === 'webml_tflite'
                      ? 'WebML + TFLite'
                      : 'Neural Network'} Model
              </>
            )}
          </button>
        </div>
      )}

      {/* Training Progress */}
      {trainingProgress.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Training Progress</h4>
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

      {/* Training Results */}
      {trainingResult && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Training Complete</h4>
            </div>
            <span className="text-[10px] font-bold text-slate-400">{trainingResult.trainTime.toFixed(1)}s</span>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Accuracy</p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{(trainingResult.accuracy * 100).toFixed(1)}%</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">F1 Score</p>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{(trainingResult.f1Score * 100).toFixed(1)}%</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
              <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Precision</p>
              <p className="text-2xl font-black text-violet-700 dark:text-violet-300">{(trainingResult.precision * 100).toFixed(1)}%</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Recall</p>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{(trainingResult.recall * 100).toFixed(1)}%</p>
            </div>
          </div>

          {/* Feature Importance Chart */}
          {trainingResult.featureImportance.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Feature Importance (Top 10)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trainingResult.featureImportance.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 9 }} domain={[0, 1]} />
                    <YAxis type="category" dataKey="feature" tick={{ fontSize: 9 }} width={120} />
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

          {/* Model Info */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Model Summary</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-slate-400">Type:</span> <span className="font-bold text-slate-700 dark:text-slate-200">{trainingResult.modelType}</span></div>
              <div><span className="text-slate-400">Loss:</span> <span className="font-bold text-slate-700 dark:text-slate-200">{trainingResult.loss.toFixed(4)}</span></div>
              {trainingResult.classNames && (
                <div className="col-span-2"><span className="text-slate-400">Classes:</span> <span className="font-bold text-slate-700 dark:text-slate-200">{trainingResult.classNames.join(', ')}</span></div>
              )}
            </div>
          </div>

          {/* Status: model ready for predictions */}
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            <Zap className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">Model Ready for Predictions</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">The trained model will be used for report generation instead of the remote API.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MLTrainingPanel;
