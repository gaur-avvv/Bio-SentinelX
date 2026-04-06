import re

with open('components/AnalysisDashboard.tsx', 'r') as f:
    content = f.read()

# Target exactly the outbreakPredictions map that is failing
pattern = r"""              <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                \{outbreakPredictions\.map\(\(op, idx\) => \(
                  <div key=\{idx\} className="bg-slate-900 border border-teal-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Bug className="w-12 h-12 text-teal-400" />
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className=\{`px-2 py-0\.5 rounded text-\[8px\] font-black uppercase tracking-widest \$\{op\.riskLevel === 'CRITICAL' \? 'bg-rose-500 text-white' : 'bg-teal-500 text-slate-900'
                        \}`\}>WebLLM Prediction</span>
                    </div>
                    <h4 className="text-xl font-black text-white uppercase tracking-tighter mb-1">\{op\.syndrome\}</h4>
                    <p className="text-\[10px\] font-bold text-teal-400 uppercase tracking-widest mb-4">Expected: \{op\.expectedDate\}</p>

                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-\[9px\] font-black text-slate-400 uppercase mb-1">
                          <span>Risk Probability</span>
                          <span>\{Math\.round\(op\.probability \* 100\)\}%</span>
                        </div>
                        <div className="h-1\.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className=\{`h-full rounded-full \$\{op\.riskLevel === 'CRITICAL' \? 'bg-rose-500' : 'bg-teal-500'\}`\}
                            style=\{\{ width: `\$\{op\.probability \* 100\}%` \}\}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        \{op\.factors\.map\(f => \(
                          <span key=\{f\} className="px-2 py-0\.5 bg-slate-800 text-\[8px\] font-bold text-slate-300 rounded-md border border-slate-700">\{f\}</span>
                        \)\)\}
                      </div>
                    </div>
                  </div>
                \)\)\}
              </div>"""

content = re.sub(pattern, "", content)

# also replace any remaining import of parseCSVString and defaultCsvData
content = re.sub(r"import \{ parseCSVString \} from '\.\./utils/csvHelper';\nimport defaultCsvData from '\.\./Weather-related disease prediction\.csv\?raw';\n", "", content)

# update activeInputTab type
content = re.sub(r"const \[activeInputTab, setActiveInputTab\] = useState<'profile' \| 'intel' \| 'ml-train' \| 'assistant'>\('profile'\);", "const [activeInputTab, setActiveInputTab] = useState<'profile' | 'intel' | 'assistant'>('profile');", content)

with open('components/AnalysisDashboard.tsx', 'w') as f:
    f.write(content)
