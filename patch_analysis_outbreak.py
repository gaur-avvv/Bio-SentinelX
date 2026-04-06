import re

with open('components/AnalysisDashboard.tsx', 'r') as f:
    content = f.read()

# Add imports for new outbreak functionality
import_addition = """
import { checkCloudEarlyWarning, type CloudEarlyWarning } from '../services/outbreakPredictionService';
"""
if "checkCloudEarlyWarning" not in content:
    content = content.replace("import { stripHiddenModelReasoning } from '../utils/aiTextSanitizer';",
                              "import { stripHiddenModelReasoning } from '../utils/aiTextSanitizer';\n" + import_addition)

# Add state for early warnings
state_addition = """
  const [cloudWarnings, setCloudWarnings] = useState<CloudEarlyWarning[]>([]);
"""
if "const [cloudWarnings, setCloudWarnings]" not in content:
    content = content.replace("const [error, setError] = useState<string>(\"\");",
                              "const [error, setError] = useState<string>(\"\");\n" + state_addition)

# Add cloud warning fetch logic
fetch_logic = """
      // 1. Fetch Cloud-Enhanced Outbreak Early Warnings
      if (weather.city) {
        checkCloudEarlyWarning(weather.city, 15).then(warnings => {
          setCloudWarnings(warnings);
        }).catch(err => console.error("Cloud warning fetch error:", err));
      }
"""
if "checkCloudEarlyWarning(weather.city, 15)" not in content:
    # insert it right after the initial error resetting in runAnalysis
    content = content.replace("setMlWarnings([]);", "setMlWarnings([]);\n" + fetch_logic)


# Add UI for cloud warnings
ui_addition = """
              {/* Cloud-Enhanced Early Outbreak Warnings */}
              {cloudWarnings.length > 0 && (
                <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                  {cloudWarnings.map((cw, idx) => (
                    <div key={idx} className="bg-rose-900 border border-rose-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Bug className="w-12 h-12 text-rose-400" />
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-rose-500 text-white">
                          Cloud Outbreak Warning
                        </span>
                      </div>
                      <h4 className="text-xl font-black text-white uppercase tracking-tighter mb-1">{cw.syndromeName}</h4>
                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-4">Location: {cw.city}</p>

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-[9px] font-black text-rose-200 uppercase mb-1">
                            <span>Reported Cases</span>
                            <span>{cw.caseCount} / 15 threshold</span>
                          </div>
                          <div className="h-1.5 bg-rose-950 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-rose-500"
                              style={{ width: `${Math.min((cw.caseCount / 15) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-rose-300 font-bold leading-tight">{cw.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
"""

if "{/* Cloud-Enhanced Early Outbreak Warnings */}" not in content:
    content = content.replace("{activeInputTab === 'profile' && (", ui_addition + "\n              {activeInputTab === 'profile' && (")

with open('components/AnalysisDashboard.tsx', 'w') as f:
    f.write(content)
