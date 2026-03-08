import React, { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { stripHiddenModelReasoning } from '../utils/aiTextSanitizer';

// Strip emoji characters and fix common AI markdown formatting issues
const preprocessMarkdown = (md: string): string => {
  let out = stripHiddenModelReasoning(md);
  // Remove emojis (covers most unicode emoji ranges)
  out = out.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA9F}\u{231A}-\u{23FF}\u{25AA}-\u{25FE}\u{2B50}\u{2B55}\u{FE0F}]/gu, '');
  // Fix lone list marker followed by **Bold**: on the very next line → merge onto same line
  // Pattern: '-\n**...**' or '-\n\n**...**'
  out = out.replace(/^([ \t]*[-*]|[ \t]*\d+\.)[ \t]*\n[ \t]*(\*\*[^\n]+)/gm, '$1 $2');
  // Fix **Bold**:\n content → **Bold**: content (when bold label is alone on a line ending with ':')
  out = out.replace(/^([ \t]*\*\*[^*\n]+\*\*:?)[ \t]*\n[ \t]+([^\n]+)/gm, (_, label, content) => {
    // Only merge if the label line doesn't already look like a heading (preceded by list marker will be caught above)
    if (/^[ \t]*\*\*/.test(label) && !label.match(/^#+/)) {
      return `${label.trim()} ${content.trim()}`;
    }
    return `${label}\n${content}`;
  });
  return out;
};

interface ReportRendererProps {
  markdown: string;
}

interface Section {
  id: string;
  title: string;
  content: string;
  isSubSection?: boolean;
  level?: number; // 1 = ###, 2 = ####, etc.
}

// Custom ReactMarkdown components for better list-item rendering
// These use dark-mode-friendly colors since ReportRenderer is always rendered inside
// dark card containers (bg-slate-800 / bg-slate-900) in AnalysisDashboard.
const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // Bullet text — dark slate
  li: ({ children, ...props }) => (
    <li style={{ color: '#1e293b' }} className="my-1.5 leading-relaxed" {...props}>{children}</li>
  ),
  ul: ({ children, ...props }) => (
    <ul className="space-y-1 my-2" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="space-y-1 my-2" {...props}>{children}</ol>
  ),
  // Bold inline labels → teal-700
  strong: ({ children, ...props }) => (
    <strong style={{ color: '#0f766e' }} className="font-bold" {...props}>{children}</strong>
  ),
  // Italic → slate-600
  em: ({ children, ...props }) => (
    <em style={{ color: '#475569' }} className="italic" {...props}>{children}</em>
  ),
  // Paragraphs: standalone-bold lines → blue heading; body → dark slate
  p: ({ children, node, ...props }: any) => {
    const kids = node?.children ?? [];
    const isStandaloneHeading =
      kids.length > 0 &&
      kids.every((k: any) => k.type === 'element' && k.tagName === 'strong');
    if (isStandaloneHeading) {
      return (
        <p
          style={{ color: '#0369a1' }}
          className="my-3 font-black text-sm uppercase tracking-wide border-b border-sky-200 pb-1"
          {...props}
        >
          {children}
        </p>
      );
    }
    return <p style={{ color: '#1e293b' }} className="my-2 leading-relaxed" {...props}>{children}</p>;
  },
  h1: ({ children, ...props }) => (
    <h1 style={{ color: '#0f172a' }} className="text-lg font-black uppercase tracking-wide mt-5 mb-3" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 style={{ color: '#0f172a' }} className="text-base font-black uppercase tracking-wide mt-4 mb-2" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 style={{ color: '#0369a1' }} className="text-sm font-black uppercase tracking-wide mt-4 mb-2" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 style={{ color: '#0f766e' }} className="text-sm font-black uppercase tracking-wide mt-3 mb-1.5" {...props}>{children}</h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 style={{ color: '#7c3aed' }} className="text-xs font-bold uppercase tracking-wide mt-3 mb-1" {...props}>{children}</h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 style={{ color: '#334155' }} className="text-xs font-bold mt-2 mb-1" {...props}>{children}</h6>
  ),
  a: ({ children, ...props }) => (
    <a style={{ color: '#0891b2' }} className="underline underline-offset-2 hover:opacity-70" {...props}>{children}</a>
  ),
  code: ({ children, ...props }) => (
    <code style={{ background: '#f1f5f9', color: '#0f766e' }} className="px-1 py-0.5 rounded text-xs font-mono border border-slate-200" {...props}>{children}</code>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote style={{ color: '#475569' }} className="border-l-4 border-teal-400 pl-3 my-2 italic bg-teal-50 py-1 rounded-r" {...props}>{children}</blockquote>
  ),
  hr: () => <hr className="border-slate-200 my-4" />,
};

export const ReportRenderer: React.FC<ReportRendererProps> = ({ markdown }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<string>('');

  const cleanMarkdown = useMemo(() => preprocessMarkdown(markdown), [markdown]);

  const sections = useMemo(() => {
    const parsedSections: Section[] = [];
    const lines = cleanMarkdown.split('\n');
    let currentSection: Section | null = null;
    let lastLineWasListMarker = false;

    const pushCurrent = () => {
      if (currentSection && (currentSection.content.trim() || parsedSections.length === 0)) {
        parsedSections.push({ ...currentSection });
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentSection) currentSection.content += '\n';
        continue;
      }

      // --- 1. Detect markdown hash headers: #, ##, ###, ####, etc. ---
      const hashMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (hashMatch) {
        const depth = hashMatch[1].length;
        const rawTitle = hashMatch[2].trim();
        pushCurrent();
        currentSection = {
          id: rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          title: rawTitle,
          content: '',
          isSubSection: depth >= 4,
          level: depth,
        };
        continue;
      }

      // --- 2. Detect bold standalone headers: **1. Title** or **Title** (whole line only) ---
      // Matches lines that are ENTIRELY a bold element (not inline within a paragraph).
      // Skip if the previous non-empty line was a list marker (it's a list item label, not a heading).
      const boldStandalone = trimmed.match(/^\*\*(\d+\.\s*)?([^*]+?)\*\*:?\s*$/);
      if (boldStandalone && !lastLineWasListMarker) {
        const num = boldStandalone[1] || '';
        const label = boldStandalone[2].trim();
        const fullTitle = num ? `${num.trim()} ${label}` : label;
        // Only treat as section if label looks like a heading (Title Case, or has key words)
        const looksLikeHeading =
          /^[A-Z]/.test(label) && (
            label.split(' ').length <= 8 ||
            /\b(summary|plan|outlook|potential|measures?|triggers?|note|analysis|risk|alert|overview|warning|disclaimer|conclusion|forecast|report|strategy|context|contact|status|resources?|recommendation|optimization|prevention|protocol|monitoring|exposure|spread|outbreak|impact|action|medical|environmental|bio-safety|telemetry|radar|correlation|inference|prediction|biosafety|safety|disease|vector|airborne|vaccination|syndromic|surveillance|intervention|pathogen|cluster|mutation|quarantine|isolation|containment)\b/i.test(label)
          );
        if (looksLikeHeading) {
          pushCurrent();
          currentSection = {
            id: fullTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            title: fullTitle,
            content: '',
            isSubSection: false,
            level: 3,
          };
          continue;
        }
      }

      // --- 3. Detect inline bold note/alert labels: **Note:** rest of text ---
      // These start a new minor section, with only the label as the title.
      const inlineBoldLabel = trimmed.match(/^\*\*([A-Z][^*]{2,40}?):\*\*\s+(.+)$/);
      if (inlineBoldLabel) {
        const label = inlineBoldLabel[1].trim();
        const isNotableTerm = /\b(note|alert|warning|caution|important|system|biosent)\b/i.test(label);
        if (isNotableTerm) {
          pushCurrent();
          // Include the rest of the line as the first content line
          const restOfLine = `**${label}:** ${inlineBoldLabel[2]}`;
          currentSection = {
            id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            title: label,
            content: restOfLine + '\n',
            isSubSection: true,
            level: 4,
          };
          continue;
        }
      }

      // --- 4. Content line ---
      // Track if this line is a bare list marker so next bold line isn't treated as heading
      lastLineWasListMarker = /^([-*]|\d+\.)\s*$/.test(trimmed);
      if (currentSection) {
        currentSection.content += line + '\n';
      } else {
        // Content before any header — create an implicit intro section
        currentSection = {
          id: 'overview',
          title: 'Overview',
          content: line + '\n',
          isSubSection: false,
          level: 2,
        };
      }
    }

    pushCurrent();
    return parsedSections;
  }, [markdown]);

  useEffect(() => {
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0].id);
    }
  }, [sections, activeSection]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrint = () => {
    window.print();
  };

  // Light palette — always white/light regardless of app theme
  const getSectionColors = (_sectionTitle: string) => ({
    bg: 'bg-white',
    border: 'border-slate-200',
    headerBg: 'bg-slate-50',
    headerHover: 'hover:bg-slate-100',
    badgeBg: 'bg-teal-100',
    badgeText: 'text-teal-700',
    badgeBorder: 'border-teal-300',
    tocActiveBg: 'bg-teal-100',
    tocActiveText: 'text-teal-700',
    tocActiveBorder: 'border-teal-300',
  });

  // If no sections were parsed, just render markdown
  if (sections.length === 0) {
    return (
      <div style={{ color: '#1e293b', backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem' }} className="prose prose-sm sm:prose-base max-w-none">
        <ReactMarkdown components={mdComponents}>{cleanMarkdown}</ReactMarkdown>
      </div>
    );
  }

  const mainSections = sections.filter(s => !s.isSubSection);
  const subSections = sections.filter(s => s.isSubSection);

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="flex flex-col gap-6">
      {/* Sticky Table of Contents & Print Button */}
      <div style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }} className="sticky top-0 z-10 backdrop-blur-md p-4 rounded-2xl border shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2.5">
              <h5 style={{ color: '#0f766e' }} className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                Table of Contents
                <span style={{ background: '#ccfbf1', color: '#0f766e', borderColor: '#99f6e4' }} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border">
                  {sections.length} sections
                </span>
              </h5>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const allExpanded: Record<string, boolean> = {};
                    sections.forEach(s => { allExpanded[s.id] = true; });
                    setExpandedSections(allExpanded);
                  }}
                  style={{ color: '#475569', borderColor: '#cbd5e1' }}
                  className="px-2 py-0.5 text-[9px] font-bold hover:text-teal-700 border rounded-md transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={() => setExpandedSections({})}
                  style={{ color: '#475569', borderColor: '#cbd5e1' }}
                  className="px-2 py-0.5 text-[9px] font-bold hover:text-teal-700 border rounded-md transition-colors"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Main sections row */}
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {mainSections.map((section, idx) => {
                const isActive = activeSection === section.id;
                const numMatch = section.title.match(/^(\d+)\.\s*(.*)/);
                const sectionNum = numMatch ? numMatch[1] : null;
                const sectionLabel = numMatch ? numMatch[2] : section.title;
                const colors = getSectionColors(section.title);
                return (
                  <a
                    key={`toc-${section.id}`}
                    href={`#${section.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setExpandedSections(prev => ({ ...prev, [section.id]: true }));
                      setActiveSection(section.id);
                      document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    title={sectionLabel}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                      isActive
                        ? `${colors.tocActiveBg} ${colors.tocActiveText} ${colors.tocActiveBorder} shadow-sm`
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black shrink-0 ${isActive ? `${colors.badgeBg} ${colors.badgeText}` : 'bg-slate-100 text-slate-600'}`}>
                      {sectionNum ?? (idx + 1)}
                    </span>
                    <span className="max-w-[110px] truncate">{sectionLabel}</span>
                  </a>
                );
              })}
            </div>

            {/* Sub-sections row */}
            {subSections.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-1 border-l-2 border-slate-200">
                {subSections.map((section) => {
                  const isActive = activeSection === section.id;
                  return (
                    <a
                      key={`toc-sub-${section.id}`}
                      href={`#${section.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setExpandedSections(prev => ({ ...prev, [section.id]: true }));
                        setActiveSection(section.id);
                        document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      title={section.title}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold transition-all border ${
                        isActive
                          ? 'bg-teal-100 text-teal-700 border-teal-300'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300'
                      }`}
                    >
                      <span className="w-1 h-1 rounded-full bg-current shrink-0" />
                      <span className="max-w-[100px] truncate">{section.title}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={handlePrint}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-colors shadow-lg shadow-teal-900/30"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Report Sections */}
      <div className="space-y-3 print:space-y-6">
        {sections.map((section, index) => {
          const isExpanded = expandedSections[section.id] ?? (index === 0);
          const isSub = section.isSubSection;
          const colors = getSectionColors(section.title);

          return (
            <div
              key={section.id}
              id={section.id}
              style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}
              className={`border rounded-xl overflow-hidden scroll-mt-28 print:border-none print:bg-transparent ${
                isSub ? 'ml-4' : ''
              }`}
            >
              <button
                onClick={() => toggleSection(section.id)}
                style={{ backgroundColor: isSub ? '#f1f5f9' : '#f8fafc' }}
                className={`w-full px-5 py-3 flex items-center justify-between transition-colors print:hidden hover:brightness-95`}
              >
                <div className="flex items-center gap-2 text-left">
                  {!isSub && (() => {
                    const numMatch = section.title.match(/^(\d+)\./);
                    return numMatch ? (
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${colors.badgeBg} ${colors.badgeText} ${colors.badgeBorder} border text-[10px] font-black shrink-0`}>
                        {numMatch[1]}
                      </span>
                    ) : null;
                  })()}
                  <span style={{ color: '#0f172a' }} className={`font-black ${isSub ? 'text-xs' : 'text-sm sm:text-base'}`}>
                    {section.title.replace(/^\d+\.\s*/, '')}
                  </span>
                </div>
                {isExpanded
                  ? <ChevronUp className={`shrink-0 ${isSub ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-slate-400`} />
                  : <ChevronDown className={`shrink-0 ${isSub ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-slate-400`} />
                }
              </button>

              {/* Print-only header */}
              <h3 className="hidden print:block text-lg font-black text-black border-b border-gray-300 pb-2 mb-4">
                {section.title}
              </h3>

              {isExpanded && (
                <div
                  style={{ color: '#1e293b', backgroundColor: '#ffffff' }}
                  className={`text-sm leading-relaxed ${isSub ? 'px-4 py-3' : 'p-5 sm:p-6'}`}
                >
                  <ReactMarkdown components={mdComponents}>{section.content}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};