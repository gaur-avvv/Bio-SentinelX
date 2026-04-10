import sys

with open('components/AnalysisDashboard.tsx', 'r') as f:
    content = f.read()

# 1. Update AI Risk Inference header
content = content.replace('<h3 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tighter">AI Risk Inference</h3>',
                          '<h3 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tighter">AI Risk Inference</h3>\n                  <p className="text-[10px] font-black text-teal-400 uppercase tracking-[0.2em]">WebLLM Fine-Tuned Local Weights</p>')

# 2. Add label to Primary Diagnosis card
content = content.replace('<h4 className="text-[9px] sm:text-xs font-black text-slate-300 uppercase tracking-widest mb-3 sm:mb-6">Primary Diagnosis</h4>',
                          '<h4 className="text-[9px] sm:text-xs font-black text-slate-300 uppercase tracking-widest mb-3 sm:mb-6 flex items-center gap-2">\n              Primary Diagnosis <span className="px-2 py-0.5 bg-teal-500/20 text-teal-300 rounded-md text-[8px]">Real-time WebLLM Trained</span>\n            </h4>')

with open('components/AnalysisDashboard.tsx', 'w') as f:
    f.write(content)
