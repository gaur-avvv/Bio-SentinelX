import sys

with open('components/IndianSurveillance.tsx', 'r') as f:
    content = f.read()

target = "{kgContext && kgContext.chains.length > 0 && ("
ui_block = """      {agenticSearchContext && (
        <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-2xl p-5 animate-fade-in mb-6">
          <h4 className="text-[10px] font-black text-sky-700 dark:text-sky-300 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Search className="w-3.5 h-3.5" /> Regional Agentic Search — Regional Outbreak Context
          </h4>
          <div className="prose prose-xs dark:prose-invert max-w-none text-xs font-semibold text-sky-600 dark:text-sky-300 leading-relaxed">
            <ReactMarkdown>{agenticSearchContext}</ReactMarkdown>
          </div>
        </div>
      )}

      """
content = content.replace(target, ui_block + target)

with open('components/IndianSurveillance.tsx', 'w') as f:
    f.write(content)
