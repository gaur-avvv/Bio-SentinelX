import { stripHiddenModelReasoning } from './aiTextSanitizer';

/**
 * Prepare AI/remote text for display inside ReactMarkdown.
 * Keeps markdown emphasis but removes common malformed artifacts
 * (e.g. trailing/unmatched ** that render as literal asterisks).
 */
export function preprocessNotificationMarkdown(input: string): string {
  if (!input) return '';
  let out = stripHiddenModelReasoning(String(input));

  // Normalize newlines/spaces.
  out = out.replace(/\r\n?/g, '\n');
  out = out.replace(/\t/g, ' ');

  // If a model leaks fenced code blocks, keep only the text part.
  out = out.replace(/```[\s\S]*?```/g, (m) => {
    // If it's a small inline-ish fence, drop it; notifications shouldn't include code.
    return m.includes('\n') ? '' : '';
  });

  // Remove common label prefixes.
  out = out.replace(/^(notification|alert|title|heading|message|body)\s*:\s*/i, '');

  // If emphasis markers are unbalanced, remove them to avoid showing literal ** in plain text renderers.
  const boldAsterisks = out.match(/\*\*/g)?.length ?? 0;
  if (boldAsterisks % 2 === 1) out = out.replace(/\*\*/g, '');
  const boldUnderscores = out.match(/__/g)?.length ?? 0;
  if (boldUnderscores % 2 === 1) out = out.replace(/__/g, '');

  // Collapse excessive whitespace.
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.replace(/ {2,}/g, ' ');
  return out.trim();
}

/**
 * Convert markdown-ish notification text to plain text.
 * Use for browser/OS notifications which do not render markdown.
 */
export function notificationPlainText(input: string, maxLen = 600): string {
  if (!input) return '';
  let out = preprocessNotificationMarkdown(input);

  // Images: ![alt](url) -> alt
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Links: [text](url) -> text
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Inline emphasis/code.
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');

  // Headings / quotes / lists.
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  out = out.replace(/^\s{0,3}>\s?/gm, '');
  out = out.replace(/^\s*([-*]|\d+\.)\s+/gm, '');

  // Remove any leftover formatting characters.
  out = out.replace(/[~*_]{2,}/g, '');
  out = out.replace(/\s+/g, ' ').trim();

  if (out.length > maxLen) out = out.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
  return out;
}
