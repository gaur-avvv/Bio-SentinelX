// Centralized sanitizer for AI model outputs.
// Goal: strip hidden chain-of-thought / reasoning blocks that some models emit.

function stripMetaPreamble(text: string): string {
  let out = String(text ?? '');
  if (!out.trim()) return '';

  // If the model eventually produced a structured markdown report, drop anything before it.
  // This is safe because the prompt usually requires the report to start with headings.
  const idxExec = out.search(/(^|\n)##\s*1\.?\s*Executive\s+Summary\b/i);
  if (idxExec > 0) return out.slice(idxExec).trim();

  const idxFirstHeader = out.search(/(^|\n)#{2,6}\s+\S/m);
  if (idxFirstHeader > 0) {
    const lead = out.slice(0, Math.min(idxFirstHeader, 700));
    const looksLikeMeta = /(\bokay\b|\blet me\b|\bi will\b|\bi\s*need\b|\bapproach\b|\bsystematically\b|\bhmm\b|\bscrolling\b|\bplanning\b|\bchecks?\b|\bcross-?references\b|\bre-?examines\b)/i.test(lead);
    if (looksLikeMeta) return out.slice(idxFirstHeader).trim();
  }

  // If there's a structured table/list later, do the same.
  const idxTable = out.search(/(^|\n)\|\s*Metric\s*\|\s*Value\s*\|/mi);
  if (idxTable > 0) {
    const lead = out.slice(0, Math.min(idxTable, 700));
    const looksLikeMeta = /(\bokay\b|\blet me\b|\bhmm\b|\bscrolling\b|\bplanning\b)/i.test(lead);
    if (looksLikeMeta) return out.slice(idxTable).trim();
  }

  // Last resort: drop leading paragraphs that look like internal narration.
  // Only apply if the beginning clearly looks like model meta-commentary.
  const head = out.slice(0, 700);
  const headLooksMeta = /(\bokay\b|\blet me\b|\bhere'?s how\b|\bi will\b|\bi\s*need\b|\bapproach\b|\bsystematically\b|\bhmm\b|\bscrolling\b|\bplanning\b|\bmust\s+investigate\b|\bre-?examines\b)/i.test(head);
  if (!headLooksMeta) return out.trim();

  const paras = out.split(/\n\s*\n/);
  let dropped = 0;
  while (paras.length) {
    const p = paras[0].trim();
    if (!p) { paras.shift(); dropped++; continue; }
    const pLooksMeta = /(\bokay\b|\blet me\b|\bhmm\b|\bscrolling\b|\bplanning\b|\bi\s*need\b|\bfirst,\s*i\b|\bchecks?\b|\bcross-?references\b)/i.test(p);
    // Keep if it looks like a real answer (starts with heading/bullet/table).
    const pLooksAnswer = /^(#{1,6}\s+|\-|\|\s*Metric\s*\|)/.test(p);
    if (pLooksAnswer || !pLooksMeta) break;
    paras.shift();
    dropped++;
  }

  const candidate = paras.join('\n\n').trim();
  const candidateLooksAnswer = /^(#{1,6}\s+|\-|\|\s*Metric\s*\|)/m.test(candidate);
  if (dropped > 0 && candidate && (candidateLooksAnswer || candidate.length >= 40)) return candidate;
  return out.trim();
}

export function stripHiddenModelReasoning(text: string): string {
  if (!text) return '';

  let out = String(text);

  // Some providers double-escape angle brackets (e.g. "\\u003c/think\\u003e").
  // Normalize common sequences before applying tag stripping.
  out = out
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\u003c/gi, '<')
    .replace(/\u003e/gi, '>')
    .replace(/\u0026/gi, '&');

  // Numeric HTML entities for < and > occasionally leak too.
  out = out
    .replace(/&#0*60;/g, '<')
    .replace(/&#x0*3c;/gi, '<')
    .replace(/&#0*62;/g, '>')
    .replace(/&#x0*3e;/gi, '>');

  // Remove fenced code blocks explicitly labeled as reasoning.
  out = out.replace(/```(?:thinking|think|analysis)\s*[\s\S]*?```\s*/gim, '');

  // Strip both raw and HTML-escaped tag variants.
  const tags = ['think', 'thinking', 'analysis'] as const;
  for (const tag of tags) {
    // Closed tags: <think ...> ... </think>
    out = out.replace(
      new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>\\s*`, 'gi'),
      ''
    );
    // Unclosed opening tags: remove everything from <think ...> to end.
    out = out.replace(new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*$`, 'i'), '');

    // Closed tags: &lt;think&gt; ... &lt;/think&gt;
    out = out.replace(
      new RegExp(`&lt;\\s*${tag}\\b[\\s\\S]*?&gt;[\\s\\S]*?&lt;\\s*\\/\\s*${tag}\\s*&gt;\\s*`, 'gi'),
      ''
    );
    // Unclosed opening tags (escaped)
    out = out.replace(new RegExp(`&lt;\\s*${tag}\\b[\\s\\S]*$`, 'i'), '');

    // Standalone leaked tags (raw + escaped)
    out = out.replace(new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<\\s*${tag}\\b[^>]*>`, 'gi'), '');
    out = out.replace(new RegExp(`&lt;\\s*\\/\\s*${tag}\\s*&gt;`, 'gi'), '');
    out = out.replace(new RegExp(`&lt;\\s*${tag}\\b[\\s\\S]*?&gt;`, 'gi'), '');
  }

  // If a model outputs: "...reasoning... </think> final answer" (closing tag only), keep only the final answer.
  // Apply to any supported tag name (think/thinking/analysis) and both raw + escaped variants.
  for (const tag of tags) {
    const hasOpenRaw = new RegExp(`<\\s*${tag}\\b`, 'i').test(out);
    const hasCloseRaw = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i').test(out);
    if (!hasOpenRaw && hasCloseRaw) {
      const parts = out.split(new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i'));
      out = parts[parts.length - 1] || '';
    }

    const hasOpenEsc = new RegExp(`&lt;\\s*${tag}\\b`, 'i').test(out);
    const hasCloseEsc = new RegExp(`&lt;\\s*\\/\\s*${tag}\\s*&gt;`, 'i').test(out);
    if (!hasOpenEsc && hasCloseEsc) {
      const parts = out.split(new RegExp(`&lt;\\s*\\/\\s*${tag}\\s*&gt;`, 'i'));
      out = parts[parts.length - 1] || '';
    }
  }

  // Normalize spacing.
  out = out.replace(/\n{3,}/g, '\n\n');
  out = stripMetaPreamble(out);
  return out.trim();
}
