import re
import os

with open('components/AnalysisDashboard.tsx', 'r') as f:
    content = f.read()


content = re.sub(r"import \{ parseCSVString \} from '\.\./utils/csvHelper';\nimport defaultCsvData from '\.\./Weather-related disease prediction\.csv\?raw';\n", "", content)

# Remove the useEffect hook that uses defaultCsvData
content = re.sub(r"  // Auto-train default model on mount\n  useEffect\(\(\) => \{[\s\S]*?initDefaultModel\(\);\n    \}\n  \}, \[\]\);\n\n", "", content)

# I also noticed we didn't successfully remove the outbreak predictions mapping code because my regex missed it previously.
# Let's remove the map block correctly:
content = re.sub(r"              <div className=\"mb-8 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in\">\n                \{outbreakPredictions\.map\(\(op: any, idx: any\) => \([\s\S]*?\}\)\}\n              </div>\n\n", "", content)
content = re.sub(r"              <div className=\"mb-8 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in\">\n                \{outbreakPredictions\.map\(\(op, idx\) => \([\s\S]*?\}\)\}\n              </div>\n\n", "", content)

# Update activeInputTab initial state to always 'profile' (if it wasn't caught before)
content = re.sub(r"  const \[activeInputTab, setActiveInputTab\] = useState<'profile' \| 'intel' \| 'ml-train' \| 'assistant'>\(\(\) =>\n    isModelTrained\(\) \? 'profile' : 'ml-train'\n  \);\n", "  const [activeInputTab, setActiveInputTab] = useState<'profile' | 'intel' | 'assistant'>('profile');\n", content)

with open('components/AnalysisDashboard.tsx', 'w') as f:
    f.write(content)
