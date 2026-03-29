/**
 * Healthcare Operations Dashboard
 * Unified UI for Medical Coding, Claims Adjudication, and Prior Authorization agents
 * with interactive forms and full audit trail visualization.
 */

import React, { useState, useCallback } from 'react';
import {
  FileText, ShieldCheck, ClipboardList, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, Info, Clock, Play,
  ArrowLeft, Loader2, Trash2, History,
} from 'lucide-react';
import type {
  AgentWorkflowTab, AuditTrail, AuditStep, ClinicalEncounter,
  CodingResult, AdjudicationResult, PriorAuthDecision,
  ClaimLineItem, DenialReason, Claim,
} from '../services/healthcareTypes';
import { processClinicalEncounter } from '../services/medicalCodingAgent';
import { adjudicateClaim, generateSampleClaim } from '../services/claimsAdjudicationAgent';
import { evaluatePriorAuth, generateSamplePriorAuth } from '../services/priorAuthAgent';
import { loadAuditHistory, clearAuditHistory } from '../services/healthcareAuditService';
import { getAllPayers } from '../services/healthcareRuleEngine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusIcon = (status: string) => {
  switch (status) {
    case 'pass': return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    case 'fail': return <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />;
    case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    case 'pending': return <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    default: return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  }
};

const statusBg = (status: string) => {
  switch (status) {
    case 'pass': return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800';
    case 'fail': return 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800';
    case 'warn': return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
    default: return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
  }
};

// ─── Audit Trail Viewer ──────────────────────────────────────────────────────

const AuditStepCard: React.FC<{ step: AuditStep; index: number; forceExpand?: boolean }> = ({ step, index, forceExpand }) => {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = forceExpand || expanded;

  return (
    <div className={`border rounded-xl p-3 ${statusBg(step.status)} transition-all`}>
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full flex items-start gap-2 text-left"
      >
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 mt-0.5 w-5 flex-shrink-0">
          {index + 1}
        </span>
        {statusIcon(step.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {step.phase}
            </span>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">|</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
              {step.rule}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
            {step.output}
          </p>
        </div>
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />}
      </button>

      {isExpanded && (
        <div className="mt-2 ml-7 space-y-1.5 text-[11px]">
          <div>
            <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[9px]">Input: </span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">{step.input}</span>
          </div>
          <div>
            <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[9px]">Output: </span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">{step.output}</span>
          </div>
          <div>
            <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[9px]">Reasoning: </span>
            <span className="font-medium text-slate-600 dark:text-slate-300">{step.reasoning}</span>
          </div>
          {step.references.length > 0 && (
            <div>
              <span className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[9px]">References: </span>
              <span className="font-medium text-slate-500 dark:text-slate-400 italic">{step.references.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AuditTrailViewer: React.FC<{ trail: AuditTrail }> = ({ trail }) => {
  const [expandAll, setExpandAll] = useState(false);
  const passed = trail.steps.filter(s => s.status === 'pass').length;
  const failed = trail.steps.filter(s => s.status === 'fail').length;
  const warned = trail.steps.filter(s => s.status === 'warn').length;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Audit Trail — {trail.steps.length} Steps
        </h4>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="text-emerald-600 dark:text-emerald-400">{passed} pass</span>
            <span className="text-amber-600 dark:text-amber-400">{warned} warn</span>
            <span className="text-rose-600 dark:text-rose-400">{failed} fail</span>
          </div>
          <button
            onClick={() => setExpandAll(!expandAll)}
            className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
          >
            {expandAll ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {trail.steps.map((step, i) => (
          <AuditStepCard key={step.id} step={step} index={i} forceExpand={expandAll} />
        ))}
      </div>
    </div>
  );
};

// ─── Medical Coding Panel ────────────────────────────────────────────────────

const MedicalCodingPanel: React.FC = () => {
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnoses, setDiagnoses] = useState('');
  const [procedures, setProcedures] = useState('');
  const [patientAge, setPatientAge] = useState('55');
  const [patientGender, setPatientGender] = useState<'male' | 'female' | 'other'>('female');
  const [providerNotes, setProviderNotes] = useState('');
  const [result, setResult] = useState<CodingResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleProcess = useCallback(() => {
    setProcessing(true);
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const encounter: ClinicalEncounter = {
        patientAge: parseInt(patientAge) || 55,
        patientGender,
        chiefComplaint,
        diagnoses: diagnoses.split('\n').map(d => d.trim()).filter(Boolean),
        procedures: procedures.split('\n').map(p => p.trim()).filter(Boolean),
        providerNotes,
        placeOfService: '11',
        dateOfService: new Date().toISOString().split('T')[0],
      };
      const codingResult = processClinicalEncounter(encounter);
      setResult(codingResult);
      setProcessing(false);
    }, 100);
  }, [chiefComplaint, diagnoses, procedures, patientAge, patientGender, providerNotes]);

  const loadSample = useCallback(() => {
    setChiefComplaint('Follow-up for type 2 diabetes and hypertension');
    setDiagnoses('type 2 diabetes\nhypertension\nhigh cholesterol');
    setProcedures('office visit\nhemoglobin a1c\nlipid panel');
    setPatientAge('58');
    setPatientGender('male');
    setProviderNotes('Established patient presenting for routine diabetes and hypertension management. A1c trending up. Reviewed medications.');
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Enter clinical encounter details to auto-assign ICD-10 and CPT codes with auditable reasoning.
        </p>
        <button onClick={loadSample} className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 hover:text-teal-700 px-2 py-1 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-all">
          Load Sample
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Chief Complaint</label>
            <input
              value={chiefComplaint}
              onChange={e => setChiefComplaint(e.target.value)}
              placeholder="e.g., Follow-up for diabetes management"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Diagnoses (one per line)</label>
            <textarea
              value={diagnoses}
              onChange={e => setDiagnoses(e.target.value)}
              placeholder={"hypertension\ntype 2 diabetes\nhigh cholesterol"}
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Procedures (one per line)</label>
            <textarea
              value={procedures}
              onChange={e => setProcedures(e.target.value)}
              placeholder={"office visit\ncbc\nmetabolic panel"}
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all resize-none"
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Patient Age</label>
              <input
                type="number"
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Gender</label>
              <select
                value={patientGender}
                onChange={e => setPatientGender(e.target.value as 'male' | 'female' | 'other')}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Provider Notes (optional)</label>
            <textarea
              value={providerNotes}
              onChange={e => setProviderNotes(e.target.value)}
              placeholder="Additional clinical context..."
              rows={5}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all resize-none"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleProcess}
        disabled={processing || (!chiefComplaint && !diagnoses && !procedures)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {processing ? 'Processing Encounter...' : 'Run Medical Coding Agent'}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">ICD-10 Codes</p>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{result.icdCodes.length}</p>
              <div className="mt-1 space-y-0.5">
                {result.icdCodes.map(c => (
                  <p key={c.code} className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {c.code} — {c.description}
                  </p>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">CPT Codes</p>
              <p className="text-lg font-black text-blue-700 dark:text-blue-300">{result.cptCodes.length}</p>
              <div className="mt-1 space-y-0.5">
                {result.cptCodes.map(c => (
                  <p key={c.code} className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    {c.code} — {c.description}
                  </p>
                ))}
              </div>
            </div>
            <div className={`border rounded-xl p-3 ${result.confidence >= 80 ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : result.confidence >= 50 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Confidence</p>
              <p className={`text-2xl font-black ${result.confidence >= 80 ? 'text-emerald-700 dark:text-emerald-300' : result.confidence >= 50 ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}>{result.confidence}%</p>
              {result.modifiers.length > 0 && (
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
                  Modifiers: {result.modifiers.join(', ')}
                </p>
              )}
            </div>
          </div>

          {/* Warnings & Errors */}
          {(result.validationWarnings.length > 0 || result.validationErrors.length > 0) && (
            <div className="space-y-1.5">
              {result.validationErrors.map((e, i) => (
                <div key={`err-${i}`} className="flex items-start gap-2 p-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg">
                  <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">{e}</p>
                </div>
              ))}
              {result.validationWarnings.map((w, i) => (
                <div key={`warn-${i}`} className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Audit Trail */}
          <AuditTrailViewer trail={result.auditTrail} />
        </div>
      )}
    </div>
  );
};

// ─── Claims Adjudication Panel ───────────────────────────────────────────────

const ClaimsAdjudicationPanel: React.FC = () => {
  const payers = getAllPayers();
  const [payerId, setPayerId] = useState(payers[0]?.id || 'BCBS-001');
  const [patientAge, setPatientAge] = useState('55');
  const [patientGender, setPatientGender] = useState<'male' | 'female' | 'other'>('female');
  const [providerNetwork, setProviderNetwork] = useState<'in-network' | 'out-of-network'>('in-network');
  const [planType, setPlanType] = useState<Claim['planType']>('ppo');
  const [priorAuthNumber, setPriorAuthNumber] = useState('');
  const [lineItemsText, setLineItemsText] = useState('');
  const [result, setResult] = useState<AdjudicationResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleProcess = useCallback(() => {
    setProcessing(true);
    setTimeout(() => {
      // Parse line items from text: "CPT|ICD1,ICD2|amount" per line
      const lines = lineItemsText.split('\n').map(l => l.trim()).filter(Boolean);
      const lineItems: ClaimLineItem[] = lines.map((line, i) => {
        const parts = line.split('|').map(p => p.trim());
        const cpt = parts[0] || '99213';
        const icds = (parts[1] || 'I10').split(',').map(c => c.trim());
        const amount = parseFloat(parts[2]) || 150;
        return {
          lineNumber: i + 1,
          cptCode: cpt,
          icdCodes: icds,
          units: 1,
          chargedAmount: amount,
          allowedAmount: 0,
          paidAmount: 0,
          status: 'pending' as const,
          denialReasons: ['none' as DenialReason],
          adjustmentReasons: [],
        };
      });

      const totalCharged = lineItems.reduce((s, l) => s + l.chargedAmount, 0);
      const claim = generateSampleClaim({
        payerId,
        patientAge: parseInt(patientAge) || 55,
        patientGender,
        providerNetwork,
        planType,
        priorAuthNumber: priorAuthNumber || undefined,
        lineItems: lineItems.length > 0 ? lineItems : undefined,
        totalCharged: lineItems.length > 0 ? totalCharged : undefined,
      });

      const adjResult = adjudicateClaim(claim);
      setResult(adjResult);
      setProcessing(false);
    }, 100);
  }, [payerId, patientAge, patientGender, providerNetwork, planType, priorAuthNumber, lineItemsText]);

  const loadSample = useCallback(() => {
    setPayerId('BCBS-001');
    setPatientAge('55');
    setPatientGender('female');
    setProviderNetwork('in-network');
    setPlanType('ppo');
    setPriorAuthNumber('');
    setLineItemsText('99214|I10,E11.9|185\n80053|E11.9|45\n83036|E11.9|35');
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Submit a claim for automated adjudication against payer policies with step-by-step reasoning.
        </p>
        <button onClick={loadSample} className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 hover:text-teal-700 px-2 py-1 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-all">
          Load Sample
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Payer</label>
              <select
                value={payerId}
                onChange={e => setPayerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                {payers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Plan Type</label>
              <select
                value={planType}
                onChange={e => setPlanType(e.target.value as Claim['planType'])}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                <option value="ppo">PPO</option>
                <option value="hmo">HMO</option>
                <option value="epo">EPO</option>
                <option value="pos">POS</option>
                <option value="hdhp">HDHP</option>
                <option value="medicare">Medicare</option>
                <option value="medicaid">Medicaid</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Patient Age</label>
              <input
                type="number"
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Gender</label>
              <select
                value={patientGender}
                onChange={e => setPatientGender(e.target.value as 'male' | 'female' | 'other')}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Network</label>
              <select
                value={providerNetwork}
                onChange={e => setProviderNetwork(e.target.value as 'in-network' | 'out-of-network')}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                <option value="in-network">In-Network</option>
                <option value="out-of-network">Out-of-Network</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Prior Auth #</label>
              <input
                value={priorAuthNumber}
                onChange={e => setPriorAuthNumber(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
            Line Items (CPT|ICD1,ICD2|Amount — one per line)
          </label>
          <textarea
            value={lineItemsText}
            onChange={e => setLineItemsText(e.target.value)}
            placeholder={"99214|I10,E11.9|185\n80053|E11.9|45\n83036|E11.9|35"}
            rows={7}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all resize-none"
          />
        </div>
      </div>

      <button
        onClick={handleProcess}
        disabled={processing}
        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {processing ? 'Adjudicating Claim...' : 'Run Claims Adjudication Agent'}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Status Banner */}
          <div className={`p-4 rounded-xl border ${
            result.finalStatus === 'approved' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            : result.finalStatus === 'denied' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {result.finalStatus === 'approved' ? <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  : result.finalStatus === 'denied' ? <XCircle className="w-6 h-6 text-rose-500" />
                  : <AlertTriangle className="w-6 h-6 text-amber-500" />}
                <div>
                  <p className="text-sm font-black uppercase tracking-widest">{result.finalStatus}</p>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Claim {result.claim.claimId}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Paid</p>
                <p className="text-lg font-black">${result.claim.totalPaid.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Charged</p>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200">${result.claim.totalCharged.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Allowed</p>
              <p className="text-sm font-black text-blue-600 dark:text-blue-400">${result.claim.totalAllowed.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Plan Paid</p>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">${result.claim.totalPaid.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Patient</p>
              <p className="text-sm font-black text-amber-600 dark:text-amber-400">${result.claim.patientResponsibility.toFixed(2)}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-2 font-black uppercase tracking-widest text-slate-400 text-[9px]">Line</th>
                  <th className="text-left py-2 px-2 font-black uppercase tracking-widest text-slate-400 text-[9px]">CPT</th>
                  <th className="text-left py-2 px-2 font-black uppercase tracking-widest text-slate-400 text-[9px]">Diagnosis</th>
                  <th className="text-right py-2 px-2 font-black uppercase tracking-widest text-slate-400 text-[9px]">Charged</th>
                  <th className="text-right py-2 px-2 font-black uppercase tracking-widest text-slate-400 text-[9px]">Allowed</th>
                  <th className="text-right py-2 px-2 font-black uppercase tracking-widest text-slate-400 text-[9px]">Paid</th>
                  <th className="text-center py-2 px-2 font-black uppercase tracking-widest text-slate-400 text-[9px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.claim.lineItems.map(line => (
                  <tr key={line.lineNumber} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 px-2 font-bold text-slate-600 dark:text-slate-300">{line.lineNumber}</td>
                    <td className="py-2 px-2 font-bold text-slate-700 dark:text-slate-200">{line.cptCode}</td>
                    <td className="py-2 px-2 font-medium text-slate-500 dark:text-slate-400">{line.icdCodes.join(', ')}</td>
                    <td className="py-2 px-2 font-bold text-slate-600 dark:text-slate-300 text-right">${line.chargedAmount.toFixed(2)}</td>
                    <td className="py-2 px-2 font-bold text-blue-600 dark:text-blue-400 text-right">${line.allowedAmount.toFixed(2)}</td>
                    <td className="py-2 px-2 font-bold text-emerald-600 dark:text-emerald-400 text-right">${line.paidAmount.toFixed(2)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        line.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                        : line.status === 'denied' ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                      }`}>
                        {line.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Denial Reasons */}
          {result.denialReasons.filter(r => r !== 'none').length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-1">Denial Reasons</p>
              {result.denialReasons.filter(r => r !== 'none').map((r, i) => (
                <p key={i} className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <XCircle className="w-3 h-3 flex-shrink-0" /> {r.replace(/-/g, ' ')}
                </p>
              ))}
            </div>
          )}

          {/* Audit Trail */}
          <AuditTrailViewer trail={result.auditTrail} />
        </div>
      )}
    </div>
  );
};

// ─── Prior Authorization Panel ───────────────────────────────────────────────

const PriorAuthPanel: React.FC = () => {
  const payers = getAllPayers();
  const [payerId, setPayerId] = useState(payers[0]?.id || 'BCBS-001');
  const [patientAge, setPatientAge] = useState('62');
  const [patientGender, setPatientGender] = useState<'male' | 'female' | 'other'>('female');
  const [planType, setPlanType] = useState<'hmo' | 'ppo' | 'epo' | 'pos' | 'hdhp' | 'medicare' | 'medicaid'>('ppo');
  const [requestedService, setRequestedService] = useState('');
  const [cptCodes, setCptCodes] = useState('');
  const [icdCodes, setIcdCodes] = useState('');
  const [justification, setJustification] = useState('');
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergent'>('routine');
  const [previousTreatments, setPreviousTreatments] = useState('');
  const [result, setResult] = useState<PriorAuthDecision | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleProcess = useCallback(() => {
    setProcessing(true);
    setTimeout(() => {
      const request = generateSamplePriorAuth({
        payerId,
        patientAge: parseInt(patientAge) || 62,
        patientGender,
        planType,
        requestedService,
        cptCodes: cptCodes.split(',').map(c => c.trim()).filter(Boolean),
        icdCodes: icdCodes.split(',').map(c => c.trim()).filter(Boolean),
        clinicalJustification: justification,
        urgency,
        previousTreatments: previousTreatments.split('\n').map(t => t.trim()).filter(Boolean),
      });
      const decision = evaluatePriorAuth(request);
      setResult(decision);
      setProcessing(false);
    }, 100);
  }, [payerId, patientAge, patientGender, planType, requestedService, cptCodes, icdCodes, justification, urgency, previousTreatments]);

  const loadSample = useCallback(() => {
    setPayerId('BCBS-001');
    setPatientAge('62');
    setPatientGender('female');
    setPlanType('ppo');
    setRequestedService('Total Knee Replacement');
    setCptCodes('27447');
    setIcdCodes('M17.11');
    setJustification('Patient has severe right knee osteoarthritis (Kellgren-Lawrence grade 4) with bone-on-bone changes. Failed conservative treatment including 6 months of physical therapy, NSAIDs, and two corticosteroid injections. Significant functional limitation with difficulty walking, climbing stairs, and performing daily activities. BMI is 28.');
    setUrgency('routine');
    setPreviousTreatments('Physical therapy (6 months, 3x/week)\nNSAIDs (ibuprofen 800mg TID, 3 months)\nCorticosteroid injection #1 (3 months ago)\nCorticosteroid injection #2 (6 weeks ago)\nHyaluronic acid injection series');
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Submit a prior authorization request for evaluation against payer criteria with full clinical reasoning.
        </p>
        <button onClick={loadSample} className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 hover:text-teal-700 px-2 py-1 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-all">
          Load Sample
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Requested Service</label>
            <input
              value={requestedService}
              onChange={e => setRequestedService(e.target.value)}
              placeholder="e.g., Total Knee Replacement"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">CPT Codes (comma-sep)</label>
              <input
                value={cptCodes}
                onChange={e => setCptCodes(e.target.value)}
                placeholder="e.g., 27447"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">ICD-10 Codes (comma-sep)</label>
              <input
                value={icdCodes}
                onChange={e => setIcdCodes(e.target.value)}
                placeholder="e.g., M17.11"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Payer</label>
              <select
                value={payerId}
                onChange={e => setPayerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                {payers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Plan</label>
              <select
                value={planType}
                onChange={e => setPlanType(e.target.value as typeof planType)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                <option value="ppo">PPO</option>
                <option value="hmo">HMO</option>
                <option value="epo">EPO</option>
                <option value="pos">POS</option>
                <option value="hdhp">HDHP</option>
                <option value="medicare">Medicare</option>
                <option value="medicaid">Medicaid</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Urgency</label>
              <select
                value={urgency}
                onChange={e => setUrgency(e.target.value as typeof urgency)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergent">Emergent</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Age</label>
              <input
                type="number"
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Gender</label>
              <select
                value={patientGender}
                onChange={e => setPatientGender(e.target.value as 'male' | 'female' | 'other')}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 transition-all"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Clinical Justification</label>
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Provide detailed clinical rationale for the requested service..."
              rows={4}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Previous Treatments (one per line)</label>
            <textarea
              value={previousTreatments}
              onChange={e => setPreviousTreatments(e.target.value)}
              placeholder={"Physical therapy (6 months)\nNSAIDs (3 months)\nCorticosteroid injections (x2)"}
              rows={4}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-500 outline-none focus:border-teal-500 transition-all resize-none"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleProcess}
        disabled={processing || !requestedService}
        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {processing ? 'Evaluating Authorization...' : 'Run Prior Authorization Agent'}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Decision Banner */}
          <div className={`p-4 rounded-xl border ${
            result.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            : result.status === 'denied' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
            : result.status === 'partial-approval' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
            : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
          }`}>
            <div className="flex items-start gap-3">
              {result.status === 'approved' ? <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                : result.status === 'denied' ? <XCircle className="w-6 h-6 text-rose-500 flex-shrink-0" />
                : <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />}
              <div>
                <p className="text-sm font-black uppercase tracking-widest">
                  {result.status.replace(/-/g, ' ')}
                </p>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1">
                  {result.clinicalRationale}
                </p>
                {result.approvedDuration && (
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
                    Approved duration: {result.approvedDuration}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Policy References */}
          {result.policyReferences.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Policy References</p>
              {result.policyReferences.map((ref, i) => (
                <p key={i} className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{ref}</p>
              ))}
            </div>
          )}

          {/* Denial Reasons */}
          {result.denialReasons.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-1">Issues</p>
              {result.denialReasons.map((r, i) => (
                <p key={i} className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {r}
                </p>
              ))}
            </div>
          )}

          {/* Alternative Options */}
          {result.alternativeOptions.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">Recommended Next Steps</p>
              {result.alternativeOptions.map((opt, i) => (
                <p key={i} className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" /> {opt}
                </p>
              ))}
            </div>
          )}

          {/* Audit Trail */}
          <AuditTrailViewer trail={result.auditTrail} />
        </div>
      )}
    </div>
  );
};

// ─── Audit History Panel ─────────────────────────────────────────────────────

const AuditHistoryPanel: React.FC = () => {
  const [history, setHistory] = useState<AuditTrail[]>(() => loadAuditHistory());
  const [selectedTrail, setSelectedTrail] = useState<AuditTrail | null>(null);

  const handleClear = useCallback(() => {
    clearAuditHistory();
    setHistory([]);
    setSelectedTrail(null);
  }, []);

  if (selectedTrail) {
    return (
      <div>
        <button
          onClick={() => setSelectedTrail(null)}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 hover:text-teal-700 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to History
        </button>
        <AuditTrailViewer trail={selectedTrail} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {history.length} audit trail{history.length !== 1 ? 's' : ''} stored
        </p>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all"
          >
            <Trash2 className="w-3 h-3" /> Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No audit history yet</p>
          <p className="text-[10px] font-semibold text-slate-300 dark:text-slate-600 mt-1">Run any agent to generate an audit trail</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map(trail => (
            <button
              key={trail.id}
              onClick={() => setSelectedTrail(trail)}
              className="w-full text-left p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-teal-300 dark:hover:border-teal-600 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {trail.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    {trail.agent.replace(/-/g, ' ')}
                  </span>
                </div>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                  {new Date(trail.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                {trail.summary}
              </p>
              <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">
                {trail.steps.length} steps — {trail.steps.filter(s => s.status === 'pass').length} pass, {trail.steps.filter(s => s.status === 'warn').length} warn, {trail.steps.filter(s => s.status === 'fail').length} fail
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

interface HealthcareOperationsProps {
  onBack: () => void;
}

export const HealthcareOperations: React.FC<HealthcareOperationsProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<AgentWorkflowTab | 'history'>('medical-coding');

  const tabs: Array<{ id: AgentWorkflowTab | 'history'; label: string; icon: React.ReactNode; color: string }> = [
    { id: 'medical-coding', label: 'Medical Coding', icon: <FileText className="w-3.5 h-3.5" />, color: 'teal' },
    { id: 'claims-adjudication', label: 'Claims', icon: <ShieldCheck className="w-3.5 h-3.5" />, color: 'blue' },
    { id: 'prior-authorization', label: 'Prior Auth', icon: <ClipboardList className="w-3.5 h-3.5" />, color: 'violet' },
    { id: 'history', label: 'Audit Log', icon: <History className="w-3.5 h-3.5" />, color: 'slate' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tighter">
            Healthcare Operations
          </h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            AI Agents — Medical Coding | Claims | Prior Auth
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
        {activeTab === 'medical-coding' && <MedicalCodingPanel />}
        {activeTab === 'claims-adjudication' && <ClaimsAdjudicationPanel />}
        {activeTab === 'prior-authorization' && <PriorAuthPanel />}
        {activeTab === 'history' && <AuditHistoryPanel />}
      </div>
    </div>
  );
};
