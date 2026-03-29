/**
 * Healthcare Operations Types
 * Types for medical coding, claims adjudication, and prior authorization agents.
 * Supports ICD-10, CPT, payer-specific policies, and auditable reasoning.
 */

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export type AuditStepStatus = 'pass' | 'fail' | 'warn' | 'info' | 'pending';

export interface AuditStep {
  id: string;
  timestamp: number;
  agent: 'medical-coding' | 'claims-adjudication' | 'prior-authorization';
  phase: string;
  rule: string;
  input: string;
  output: string;
  status: AuditStepStatus;
  reasoning: string;
  references: string[];
}

export interface AuditTrail {
  id: string;
  createdAt: number;
  agent: 'medical-coding' | 'claims-adjudication' | 'prior-authorization';
  summary: string;
  status: 'completed' | 'failed' | 'in-progress';
  steps: AuditStep[];
}

// ─── ICD-10 Codes ────────────────────────────────────────────────────────────

export interface ICD10Code {
  code: string;
  description: string;
  category: string;
  chapter: string;
  isValid: boolean;
  specificity: 'category' | 'subcategory' | 'full';
  excludes1?: string[];
  excludes2?: string[];
  includes?: string[];
  codeFirst?: string[];
  useAdditionalCode?: string[];
}

export interface ICD10LookupResult {
  query: string;
  matches: ICD10Code[];
  suggestions: string[];
  auditTrail: AuditTrail;
}

// ─── CPT Codes ───────────────────────────────────────────────────────────────

export type CPTCategory = 'evaluation-management' | 'anesthesia' | 'surgery' |
  'radiology' | 'pathology-lab' | 'medicine' | 'hcpcs';

export interface CPTCode {
  code: string;
  description: string;
  category: CPTCategory;
  rvu: number;
  globalPeriod: number | null;
  modifiers: string[];
  requiresPriorAuth: boolean;
  commonDiagnoses: string[];
}

export interface CPTValidationResult {
  code: string;
  isValid: boolean;
  warnings: string[];
  errors: string[];
  suggestedModifiers: string[];
  relatedCodes: string[];
}

// ─── Medical Coding ──────────────────────────────────────────────────────────

export interface ClinicalEncounter {
  patientAge: number;
  patientGender: 'male' | 'female' | 'other';
  chiefComplaint: string;
  diagnoses: string[];
  procedures: string[];
  providerNotes: string;
  placeOfService: string;
  dateOfService: string;
}

export interface CodingResult {
  encounter: ClinicalEncounter;
  icdCodes: ICD10Code[];
  cptCodes: CPTCode[];
  modifiers: string[];
  validationWarnings: string[];
  validationErrors: string[];
  auditTrail: AuditTrail;
  confidence: number;
}

// ─── Claims Adjudication ─────────────────────────────────────────────────────

export type ClaimStatus = 'pending' | 'approved' | 'denied' | 'partial' |
  'pended-review' | 'resubmit';

export type DenialReason =
  | 'missing-prior-auth'
  | 'non-covered-service'
  | 'timely-filing'
  | 'duplicate-claim'
  | 'bundling-edit'
  | 'medical-necessity'
  | 'invalid-diagnosis'
  | 'invalid-procedure'
  | 'coordination-of-benefits'
  | 'patient-ineligible'
  | 'out-of-network'
  | 'max-benefit-reached'
  | 'age-limit'
  | 'gender-mismatch'
  | 'frequency-limit'
  | 'none';

export interface ClaimLineItem {
  lineNumber: number;
  cptCode: string;
  icdCodes: string[];
  units: number;
  chargedAmount: number;
  allowedAmount: number;
  paidAmount: number;
  status: ClaimStatus;
  denialReasons: DenialReason[];
  adjustmentReasons: string[];
}

export interface Claim {
  claimId: string;
  patientId: string;
  patientAge: number;
  patientGender: 'male' | 'female' | 'other';
  providerId: string;
  providerNetwork: 'in-network' | 'out-of-network';
  payerId: string;
  planType: 'hmo' | 'ppo' | 'epo' | 'pos' | 'hdhp' | 'medicare' | 'medicaid';
  dateOfService: string;
  dateSubmitted: string;
  placeOfService: string;
  lineItems: ClaimLineItem[];
  priorAuthNumber?: string;
  totalCharged: number;
  totalAllowed: number;
  totalPaid: number;
  patientResponsibility: number;
  status: ClaimStatus;
}

export interface AdjudicationResult {
  claim: Claim;
  finalStatus: ClaimStatus;
  denialReasons: DenialReason[];
  adjustments: string[];
  auditTrail: AuditTrail;
  remittanceAdvice: string;
}

// ─── Prior Authorization ─────────────────────────────────────────────────────

export type PriorAuthStatus = 'pending' | 'approved' | 'denied' |
  'partial-approval' | 'additional-info-needed' | 'peer-review';

export type UrgencyLevel = 'routine' | 'urgent' | 'emergent';

export interface PriorAuthRequest {
  requestId: string;
  patientId: string;
  patientAge: number;
  patientGender: 'male' | 'female' | 'other';
  providerId: string;
  payerId: string;
  planType: 'hmo' | 'ppo' | 'epo' | 'pos' | 'hdhp' | 'medicare' | 'medicaid';
  requestedService: string;
  cptCodes: string[];
  icdCodes: string[];
  clinicalJustification: string;
  urgency: UrgencyLevel;
  requestDate: string;
  serviceStartDate: string;
  serviceEndDate: string;
  previousTreatments: string[];
  supportingDocuments: string[];
}

export interface PriorAuthDecision {
  request: PriorAuthRequest;
  status: PriorAuthStatus;
  approvedUnits?: number;
  approvedDuration?: string;
  denialReasons: string[];
  clinicalRationale: string;
  policyReferences: string[];
  alternativeOptions: string[];
  auditTrail: AuditTrail;
}

// ─── Payer Policies ──────────────────────────────────────────────────────────

export interface PayerPolicy {
  payerId: string;
  payerName: string;
  policyId: string;
  policyName: string;
  effectiveDate: string;
  terminationDate: string | null;
  coveredServices: string[];
  excludedServices: string[];
  priorAuthRequired: string[];
  frequencyLimits: Record<string, { maxUnits: number; period: 'day' | 'week' | 'month' | 'year' }>;
  ageLimits: Record<string, { minAge?: number; maxAge?: number }>;
  genderRestrictions: Record<string, ('male' | 'female' | 'other')[]>;
  medicalNecessityCriteria: Record<string, string[]>;
  bundlingEdits: Record<string, string[]>;
  maxBenefits: Record<string, number>;
  timelyFilingDays: number;
  copay: Record<string, number>;
  coinsurance: number;
  deductible: number;
}

// ─── Agent Workflow State ────────────────────────────────────────────────────

export type AgentWorkflowTab = 'medical-coding' | 'claims-adjudication' | 'prior-authorization';

export interface AgentWorkflowState {
  activeTab: AgentWorkflowTab;
  isProcessing: boolean;
  currentAuditTrail: AuditTrail | null;
  history: AuditTrail[];
}
