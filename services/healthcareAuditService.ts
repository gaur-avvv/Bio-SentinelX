/**
 * Healthcare Audit Trail Service
 * Tracks every reasoning step across medical coding, claims adjudication,
 * and prior authorization agents with full traceability.
 */

import { AuditStep, AuditTrail, AuditStepStatus } from './healthcareTypes';

let _auditSeq = 0;
const auditUid = () => `audit_${Date.now()}_${++_auditSeq}`;
const stepUid = () => `step_${Date.now()}_${++_auditSeq}`;

// ─── Audit Trail Builder ─────────────────────────────────────────────────────

export function createAuditTrail(
  agent: AuditTrail['agent'],
  summary: string
): AuditTrail {
  return {
    id: auditUid(),
    createdAt: Date.now(),
    agent,
    summary,
    status: 'in-progress',
    steps: [],
  };
}

export function addAuditStep(
  trail: AuditTrail,
  phase: string,
  rule: string,
  input: string,
  output: string,
  status: AuditStepStatus,
  reasoning: string,
  references: string[] = []
): AuditTrail {
  const step: AuditStep = {
    id: stepUid(),
    timestamp: Date.now(),
    agent: trail.agent,
    phase,
    rule,
    input,
    output,
    status,
    reasoning,
    references,
  };

  return {
    ...trail,
    steps: [...trail.steps, step],
  };
}

export function finalizeAuditTrail(
  trail: AuditTrail,
  status: 'completed' | 'failed'
): AuditTrail {
  return {
    ...trail,
    status,
    summary: generateAuditSummary(trail),
  };
}

// ─── Audit Summary Generation ────────────────────────────────────────────────

function generateAuditSummary(trail: AuditTrail): string {
  const totalSteps = trail.steps.length;
  const passed = trail.steps.filter(s => s.status === 'pass').length;
  const failed = trail.steps.filter(s => s.status === 'fail').length;
  const warnings = trail.steps.filter(s => s.status === 'warn').length;

  const agentLabel = trail.agent === 'medical-coding'
    ? 'Medical Coding'
    : trail.agent === 'claims-adjudication'
    ? 'Claims Adjudication'
    : 'Prior Authorization';

  return `${agentLabel}: ${totalSteps} steps evaluated — ${passed} passed, ${failed} failed, ${warnings} warnings`;
}

// ─── Audit Trail Storage ─────────────────────────────────────────────────────

const STORAGE_KEY = 'biosentinel_healthcare_audit_history';
const MAX_HISTORY = 50;

export function saveAuditTrail(trail: AuditTrail): void {
  try {
    const history = loadAuditHistory();
    history.unshift(trail);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage full — silently skip
  }
}

export function loadAuditHistory(): AuditTrail[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditTrail[];
  } catch {
    return [];
  }
}

export function clearAuditHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Audit Trail Formatting ──────────────────────────────────────────────────

export function formatAuditStepForDisplay(step: AuditStep): string {
  const statusEmoji = step.status === 'pass' ? 'PASS'
    : step.status === 'fail' ? 'FAIL'
    : step.status === 'warn' ? 'WARN'
    : step.status === 'pending' ? 'PEND'
    : 'INFO';

  return `[${statusEmoji}] ${step.phase} | ${step.rule}\n  Input: ${step.input}\n  Output: ${step.output}\n  Reasoning: ${step.reasoning}${
    step.references.length > 0 ? `\n  References: ${step.references.join(', ')}` : ''
  }`;
}

export function formatAuditTrailMarkdown(trail: AuditTrail): string {
  const lines: string[] = [
    `## Audit Trail: ${trail.summary}`,
    `**Agent:** ${trail.agent} | **Status:** ${trail.status} | **Time:** ${new Date(trail.createdAt).toLocaleString()}`,
    '',
    '### Reasoning Steps',
    '',
  ];

  for (const step of trail.steps) {
    const icon = step.status === 'pass' ? '**PASS**'
      : step.status === 'fail' ? '**FAIL**'
      : step.status === 'warn' ? '**WARN**'
      : step.status === 'pending' ? '**PEND**'
      : '**INFO**';

    lines.push(`#### ${icon} ${step.phase} — ${step.rule}`);
    lines.push(`- **Input:** ${step.input}`);
    lines.push(`- **Output:** ${step.output}`);
    lines.push(`- **Reasoning:** ${step.reasoning}`);
    if (step.references.length > 0) {
      lines.push(`- **References:** ${step.references.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
