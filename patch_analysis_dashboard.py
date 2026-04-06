import re
import os

with open('components/AnalysisDashboard.tsx', 'r') as f:
    content = f.read()

# Remove imports
content = re.sub(r"import MLTrainingPanel from '\./MLTrainingPanel';\n", "", content)
content = re.sub(r"import \{ performWebLLMTraining, predictOutbreak, OutbreakPrediction \} from '\.\./services/webLLMTrainingService';\n", "", content)
content = re.sub(r"import \{ isModelTrained, predictWithTrainedModel, getTrainedModelInfo, getTrainedModelPerformanceMetrics, trainModel, DEFAULT_TRAINING_CONFIG, autoDetectFeaturesAndLabel \} from '\.\./services/realtimeMLService';\n", "import { isModelTrained, predictWithTrainedModel, getTrainedModelInfo, getTrainedModelPerformanceMetrics, trainModel, DEFAULT_TRAINING_CONFIG, autoDetectFeaturesAndLabel } from '../services/realtimeMLService';\n", content)

# Remove useEffect for auto-train default model on mount
content = re.sub(r"  // Auto-train default model on mount\n  useEffect\(\(\) => \{[\s\S]*?initDefaultModel\(\);\n    \}\n  \}, \[\]\);\n\n", "", content)

# Remove performWebLLMTraining interval and outbreak predictions state
content = re.sub(r"const \[outbreakPredictions, setOutbreakPredictions\] = useState<OutbreakPrediction\[\]>\(\[\]\);\n  ", "", content)
content = re.sub(r"const autoRetrainLastRunRef = useRef<number>\(0\);\n", "", content)

content = re.sub(r"  useEffect\(\(\) => \{\n    if \(\!weather\) return;\n\n    let cancelled = false;\n    const runAutoRetrainTick = async \(\) => \{[\s\S]*?clearInterval\(timer\);\n    \};\n  \}, \[weather\]\);\n\n", "", content)


# Remove from runAnalysis function
content = re.sub(r"      // 0. Perform Real-time WebLLM Training \(Edge Fine-tuning\)\n      await performWebLLMTraining\(weather\);\n      let updatedOutbreaks = predictOutbreak\(weather\);\n      setOutbreakPredictions\(updatedOutbreaks\);\n\n", "", content)

# Remove ML Train Tab
content = re.sub(r"                  \{ id: 'ml-train', label: 'ML Train', icon: BarChart3 \},\n", "", content)

# Remove Outbreak Predictions UI blocks
content = re.sub(r"              <div className=\"mb-8 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in\">\n                \{outbreakPredictions\.map\(\(op, idx\) => \([\s\S]*?\}\)\}\n              </div>\n\n", "", content)

# Remove ml-train activeInputTab Panel
content = re.sub(r"              \{activeInputTab === 'ml-train' && \(\n                <div className=\"space-y-6 animate-fade-in\" id=\"panel-ml-train\" role=\"tabpanel\" aria-labelledby=\"tab-ml-train\">\n                  <label className=\"text-\[11px\] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2\">\n                    <BarChart3 className=\"w-4 h-4\" /> ML Training \(CSV Upload \+ Auto Feature/Label\)\n                  </label>\n                  <MLTrainingPanel onModelReady=\{\(\) => setActiveInputTab\('profile'\)\} />\n                </div>\n              \)\}\n", "", content)

# Update activeInputTab initial state to always 'profile'
content = re.sub(r"  const \[activeInputTab, setActiveInputTab\] = useState<'profile' \| 'intel' \| 'ml-train' \| 'assistant'>\(\(\) =>\n    isModelTrained\(\) \? 'profile' : 'ml-train'\n  \);\n", "  const [activeInputTab, setActiveInputTab] = useState<'profile' | 'intel' | 'assistant'>('profile');\n", content)


with open('components/AnalysisDashboard.tsx', 'w') as f:
    f.write(content)
