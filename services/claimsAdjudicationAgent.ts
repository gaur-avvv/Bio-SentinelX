/**
 * Claims Adjudication Agent
 * Processes insurance claims through a multi-step validation pipeline
 * with auditable reasoning at each adjudication decision point.
 */

import {
  Claim, ClaimLineItem, ClaimStatus, DenialReason, AdjudicationResult,
} from './healthcareTypes';
import {
  validateICD10Code, validateCPTCode, checkNCCIEdits,
  checkPayerCoverage, checkTimelyFiling, checkDiagnosisProcedureMatch,
  calculateAllowedAmount, getPayerPolicy, getCPTByCode,
} from './healthcareRuleEngine';
import {
  createAuditTrail, addAuditStep, finalizeAuditTrail, saveAuditTrail,
} from './healthcareAuditService';

// ─── Claims Adjudication Pipeline ────────────────────────────────────────────

export function adjudicateClaim(claim: Claim): AdjudicationResult {
  let trail = createAuditTrail('claims-adjudication', `Adjudicating claim ${claim.claimId}`);

  const allDenialReasons: DenialReason[] = [];
  const allAdjustments: string[] = [];
  let totalAllowed = 0;
  let totalPaid = 0;
  let totalPatientResp = 0;

  // ── Phase 1: Eligibility Verification ──────────────────────────────────────

  trail = addAuditStep(trail, 'Eligibility', 'Patient Eligibility Check',
    `Patient ID: ${claim.patientId}, Payer: ${claim.payerId}, Plan: ${claim.planType}`,
    'Patient eligibility confirmed (simulated)',
    'pass',
    `Verified patient ${claim.patientId} is enrolled in ${claim.planType.toUpperCase()} plan with payer ${claim.payerId} as of date of service ${claim.dateOfService}. Coverage is active.`,
    ['Eligibility Database', '270/271 Transaction']
  );

  // ── Phase 2: Timely Filing ─────────────────────────────────────────────────

  const filing = checkTimelyFiling(claim.payerId, claim.dateOfService, claim.dateSubmitted);
  trail = addAuditStep(trail, 'Timely Filing', 'Filing Deadline Check',
    `DOS: ${claim.dateOfService}, Submitted: ${claim.dateSubmitted}, Limit: ${filing.daysAllowed} days`,
    filing.timely
      ? `Filed within deadline (${filing.daysElapsed} of ${filing.daysAllowed} days)`
      : `LATE FILING: ${filing.daysElapsed} days exceeds ${filing.daysAllowed}-day limit`,
    filing.timely ? 'pass' : 'fail',
    filing.timely
      ? `Claim was submitted ${filing.daysElapsed} days after date of service, within the ${filing.daysAllowed}-day timely filing window for payer ${claim.payerId}.`
      : `Claim was submitted ${filing.daysElapsed} days after date of service, exceeding the ${filing.daysAllowed}-day timely filing limit. Claim subject to automatic denial unless an exception applies (e.g., retroactive eligibility, other payer delays).`,
    ['Payer Contract Terms', 'CMS Timely Filing Rules']
  );

  if (!filing.timely) {
    allDenialReasons.push('timely-filing');
  }

  // ── Phase 3: Network Status ────────────────────────────────────────────────

  trail = addAuditStep(trail, 'Network Verification', 'Provider Network Check',
    `Provider: ${claim.providerId}, Network: ${claim.providerNetwork}`,
    claim.providerNetwork === 'in-network' ? 'Provider is in-network' : 'Provider is OUT-OF-NETWORK — reduced benefits apply',
    claim.providerNetwork === 'in-network' ? 'pass' : 'warn',
    claim.providerNetwork === 'in-network'
      ? `Provider ${claim.providerId} is participating in the payer's network. Standard in-network benefit levels apply.`
      : `Provider ${claim.providerId} is out-of-network. Out-of-network benefits apply with higher patient cost-sharing. For HMO plans, this may result in claim denial unless emergency or prior authorization was obtained.`,
    ['Provider Directory', 'Network Contract']
  );

  if (claim.providerNetwork === 'out-of-network' && claim.planType === 'hmo') {
    allDenialReasons.push('out-of-network');
    trail = addAuditStep(trail, 'Network Verification', 'HMO Out-of-Network Denial',
      `Plan type: HMO, Provider: out-of-network`,
      'HMO plans do not cover out-of-network services (non-emergency)',
      'fail',
      'HMO plans require patients to use in-network providers except in emergencies. This out-of-network claim is subject to denial. The member should be advised to seek in-network alternatives.',
      ['HMO Plan Guidelines', 'Member Benefits Summary']
    );
  }

  // ── Phase 4: Duplicate Claim Check ─────────────────────────────────────────

  trail = addAuditStep(trail, 'Duplicate Detection', 'Duplicate Claim Check',
    `Claim ${claim.claimId} — DOS: ${claim.dateOfService}, Provider: ${claim.providerId}`,
    'No duplicate claims found (simulated check)',
    'pass',
    'Searched claims history for matching patient, date of service, provider, and procedure combinations. No duplicate or overlapping claims were identified.',
    ['Claims History Database']
  );

  // ── Phase 5: Line-Item Adjudication ────────────────────────────────────────

  const adjudicatedLines: ClaimLineItem[] = [];

  for (const line of claim.lineItems) {
    const lineDenialReasons: DenialReason[] = [];
    const lineAdjustments: string[] = [];

    // 5a: Validate CPT code
    const cptValidation = validateCPTCode(line.cptCode);
    trail = addAuditStep(trail, 'Line Item Validation', `CPT Validation — Line ${line.lineNumber}`,
      `CPT: ${line.cptCode}`,
      cptValidation.valid ? `CPT ${line.cptCode} is valid` : `CPT ${line.cptCode} is invalid: ${cptValidation.errors.join('; ')}`,
      cptValidation.valid ? 'pass' : 'fail',
      cptValidation.valid
        ? `CPT code ${line.cptCode} is a recognized procedure code.${cptValidation.warnings.length > 0 ? ` Warnings: ${cptValidation.warnings.join('; ')}` : ''}`
        : `CPT code ${line.cptCode} failed validation. ${cptValidation.errors.join('; ')}`,
      ['CPT Manual', 'CMS Fee Schedule']
    );

    if (!cptValidation.valid) {
      lineDenialReasons.push('invalid-procedure');
    }

    // 5b: Validate ICD-10 codes
    for (const icd of line.icdCodes) {
      const icdValidation = validateICD10Code(icd);
      trail = addAuditStep(trail, 'Line Item Validation', `ICD-10 Validation — Line ${line.lineNumber}`,
        `ICD-10: ${icd}`,
        icdValidation.valid ? `ICD-10 ${icd} is valid` : `ICD-10 ${icd} is invalid`,
        icdValidation.valid ? 'pass' : 'fail',
        icdValidation.valid
          ? `ICD-10 code ${icd} is a valid diagnosis code.${icdValidation.warnings.length > 0 ? ` Notes: ${icdValidation.warnings.join('; ')}` : ''}`
          : `ICD-10 code ${icd} is invalid: ${icdValidation.errors.join('; ')}`,
        ['ICD-10-CM Tabular List']
      );

      if (!icdValidation.valid) {
        lineDenialReasons.push('invalid-diagnosis');
      }
    }

    // 5c: Check payer coverage
    const coverage = checkPayerCoverage(claim.payerId, line.cptCode, claim.patientAge, claim.patientGender);
    trail = addAuditStep(trail, 'Coverage Determination', `Payer Coverage — Line ${line.lineNumber}`,
      `CPT ${line.cptCode}, Payer: ${claim.payerId}, Age: ${claim.patientAge}, Gender: ${claim.patientGender}`,
      coverage.covered
        ? `Service is covered${coverage.requiresPriorAuth ? ' (prior auth required)' : ''}`
        : `Service NOT covered: ${coverage.denialReasons.join(', ')}`,
      coverage.covered ? (coverage.warnings.length > 0 ? 'warn' : 'pass') : 'fail',
      coverage.covered
        ? `CPT ${line.cptCode} is a covered benefit under the patient's plan.${coverage.warnings.length > 0 ? ` Warnings: ${coverage.warnings.join('; ')}` : ''}`
        : `CPT ${line.cptCode} is not covered: ${coverage.warnings.join('; ')}. ${coverage.denialReasons.join(', ')}.`,
      ['Plan Benefits Document', 'Payer Policy Database']
    );

    if (!coverage.covered) {
      lineDenialReasons.push(...coverage.denialReasons.filter(r => r !== 'none'));
    }

    // 5d: Check prior authorization
    if (coverage.requiresPriorAuth) {
      const hasAuth = !!claim.priorAuthNumber;
      trail = addAuditStep(trail, 'Prior Authorization', `Auth Verification — Line ${line.lineNumber}`,
        `CPT ${line.cptCode} requires prior auth. Auth number: ${claim.priorAuthNumber || 'NONE'}`,
        hasAuth ? `Prior authorization verified: ${claim.priorAuthNumber}` : 'NO prior authorization on file',
        hasAuth ? 'pass' : 'fail',
        hasAuth
          ? `Prior authorization number ${claim.priorAuthNumber} is on file for CPT ${line.cptCode}. Authorization confirmed (simulated verification).`
          : `CPT ${line.cptCode} requires prior authorization per payer policy, but no authorization number was provided. This line item is subject to denial for missing prior authorization.`,
        ['Prior Auth Database', 'Payer Auth Requirements']
      );

      if (!hasAuth) {
        lineDenialReasons.push('missing-prior-auth');
      }
    }

    // 5e: Check diagnosis-procedure linkage (medical necessity)
    if (line.icdCodes.length > 0 && cptValidation.valid) {
      const linkage = checkDiagnosisProcedureMatch(line.icdCodes[0], line.cptCode);
      trail = addAuditStep(trail, 'Medical Necessity', `Dx-Px Linkage — Line ${line.lineNumber}`,
        `ICD-10 ${line.icdCodes[0]} → CPT ${line.cptCode}`,
        linkage.valid ? 'Medical necessity supported' : 'Medical necessity questionable',
        linkage.valid ? 'pass' : 'warn',
        linkage.reasoning,
        ['LCD/NCD Policies', 'Medical Necessity Guidelines']
      );

      if (!linkage.valid) {
        lineAdjustments.push(`Medical necessity review recommended for CPT ${line.cptCode} with diagnosis ${line.icdCodes[0]}`);
      }
    }

    // 5f: Calculate allowed amount and payment
    const amounts = calculateAllowedAmount(claim.payerId, line.cptCode, line.chargedAmount);
    const linePaid = lineDenialReasons.length > 0 ? 0 : Math.max(0, amounts.allowedAmount - amounts.patientResponsibility);

    trail = addAuditStep(trail, 'Payment Calculation', `Fee Schedule — Line ${line.lineNumber}`,
      `Charged: $${line.chargedAmount.toFixed(2)}, CPT: ${line.cptCode}`,
      lineDenialReasons.length > 0
        ? `DENIED — $0.00 paid`
        : `Allowed: $${amounts.allowedAmount.toFixed(2)}, Copay: $${amounts.copay.toFixed(2)}, Coinsurance: $${amounts.coinsurance.toFixed(2)}, Plan pays: $${linePaid.toFixed(2)}`,
      lineDenialReasons.length > 0 ? 'fail' : 'pass',
      lineDenialReasons.length > 0
        ? `Line ${line.lineNumber} denied: ${lineDenialReasons.join(', ')}. No payment issued.`
        : `Allowed amount calculated from CMS fee schedule (RVU x $36.04 conversion factor). Charged amount: $${line.chargedAmount.toFixed(2)}, Allowed: $${amounts.allowedAmount.toFixed(2)}. Patient responsibility: copay $${amounts.copay.toFixed(2)} + coinsurance $${amounts.coinsurance.toFixed(2)} = $${amounts.patientResponsibility.toFixed(2)}.`,
      ['CMS MPFS', 'Payer Fee Schedule']
    );

    if (line.chargedAmount > amounts.allowedAmount && lineDenialReasons.length === 0) {
      const writeoff = line.chargedAmount - amounts.allowedAmount;
      lineAdjustments.push(`Contractual adjustment (write-off): $${writeoff.toFixed(2)}`);
    }

    totalAllowed += lineDenialReasons.length > 0 ? 0 : amounts.allowedAmount;
    totalPaid += linePaid;
    totalPatientResp += lineDenialReasons.length > 0 ? line.chargedAmount : amounts.patientResponsibility;

    adjudicatedLines.push({
      ...line,
      allowedAmount: lineDenialReasons.length > 0 ? 0 : amounts.allowedAmount,
      paidAmount: linePaid,
      status: lineDenialReasons.length > 0 ? 'denied' : 'approved',
      denialReasons: lineDenialReasons.length > 0 ? lineDenialReasons : ['none'],
      adjustmentReasons: lineAdjustments,
    });

    allDenialReasons.push(...lineDenialReasons);
    allAdjustments.push(...lineAdjustments);
  }

  // ── Phase 6: NCCI Edit Check (cross-line) ──────────────────────────────────

  const allCptCodes = claim.lineItems.map(l => l.cptCode);
  const ncciViolations = checkNCCIEdits(allCptCodes);

  for (const v of ncciViolations) {
    trail = addAuditStep(trail, 'Bundling Edits', 'NCCI Cross-Line Edit',
      `CPT ${v.code1} + CPT ${v.code2}`,
      v.modifierAllowed
        ? `Bundling edit — modifier may resolve`
        : `HARD EDIT — codes cannot be billed together`,
      v.modifierAllowed ? 'warn' : 'fail',
      `${v.reason}. ${v.modifierAllowed ? 'An appropriate modifier (e.g., 25, 59) can resolve this edit.' : 'These codes are mutually exclusive and cannot be billed on the same date of service.'}`,
      ['NCCI Policy Manual']
    );

    if (!v.modifierAllowed) {
      allDenialReasons.push('bundling-edit');
    }
  }

  if (ncciViolations.length === 0 && allCptCodes.length > 1) {
    trail = addAuditStep(trail, 'Bundling Edits', 'NCCI Edit Check',
      `Checked ${allCptCodes.length} line items for bundling conflicts`,
      'No NCCI edit violations found across line items',
      'pass',
      'All CPT code combinations across claim line items passed NCCI bundling edit checks.',
      ['NCCI Policy Manual']
    );
  }

  // ── Phase 7: Final Determination ───────────────────────────────────────────

  const uniqueDenials = [...new Set(allDenialReasons)].filter(r => r !== 'none');
  const allApproved = adjudicatedLines.every(l => l.status === 'approved');
  const allDenied = adjudicatedLines.every(l => l.status === 'denied');

  const finalStatus: ClaimStatus = allDenied ? 'denied'
    : allApproved ? 'approved'
    : 'partial';

  const remittanceAdvice = generateRemittanceAdvice(
    claim, adjudicatedLines, finalStatus, totalAllowed, totalPaid, totalPatientResp
  );

  trail = addAuditStep(trail, 'Final Determination', 'Claim Disposition',
    `Claim ${claim.claimId}: ${adjudicatedLines.length} line items`,
    `${finalStatus.toUpperCase()} — Paid: $${totalPaid.toFixed(2)}, Patient: $${totalPatientResp.toFixed(2)}`,
    finalStatus === 'approved' ? 'pass' : finalStatus === 'partial' ? 'warn' : 'fail',
    `Claim ${claim.claimId} final disposition: ${finalStatus.toUpperCase()}. Total charged: $${claim.totalCharged.toFixed(2)}, Total allowed: $${totalAllowed.toFixed(2)}, Plan payment: $${totalPaid.toFixed(2)}, Patient responsibility: $${totalPatientResp.toFixed(2)}.${uniqueDenials.length > 0 ? ` Denial reasons: ${uniqueDenials.join(', ')}.` : ''}`,
    ['Adjudication Summary', '835 Remittance']
  );

  trail = finalizeAuditTrail(trail, finalStatus === 'denied' ? 'failed' : 'completed');
  saveAuditTrail(trail);

  return {
    claim: {
      ...claim,
      lineItems: adjudicatedLines,
      totalAllowed,
      totalPaid,
      patientResponsibility: totalPatientResp,
      status: finalStatus,
    },
    finalStatus,
    denialReasons: uniqueDenials.length > 0 ? uniqueDenials : ['none'],
    adjustments: allAdjustments,
    auditTrail: trail,
    remittanceAdvice,
  };
}

// ─── Remittance Advice Generator ─────────────────────────────────────────────

function generateRemittanceAdvice(
  claim: Claim,
  lines: ClaimLineItem[],
  status: ClaimStatus,
  totalAllowed: number,
  totalPaid: number,
  totalPatientResp: number
): string {
  const sections: string[] = [
    `### Remittance Advice — Claim ${claim.claimId}`,
    `**Status:** ${status.toUpperCase()}`,
    `**Patient:** ${claim.patientId} | **Provider:** ${claim.providerId}`,
    `**Date of Service:** ${claim.dateOfService} | **Payer:** ${claim.payerId}`,
    '',
    '| Line | CPT | Diagnosis | Charged | Allowed | Paid | Status |',
    '|------|-----|-----------|---------|---------|------|--------|',
  ];

  for (const line of lines) {
    sections.push(
      `| ${line.lineNumber} | ${line.cptCode} | ${line.icdCodes.join(', ')} | $${line.chargedAmount.toFixed(2)} | $${line.allowedAmount.toFixed(2)} | $${line.paidAmount.toFixed(2)} | ${line.status} |`
    );
  }

  sections.push('');
  sections.push(`**Total Charged:** $${claim.totalCharged.toFixed(2)}`);
  sections.push(`**Total Allowed:** $${totalAllowed.toFixed(2)}`);
  sections.push(`**Total Paid:** $${totalPaid.toFixed(2)}`);
  sections.push(`**Patient Responsibility:** $${totalPatientResp.toFixed(2)}`);

  const deniedLines = lines.filter(l => l.status === 'denied');
  if (deniedLines.length > 0) {
    sections.push('');
    sections.push('#### Denial Details');
    for (const line of deniedLines) {
      sections.push(`- **Line ${line.lineNumber} (CPT ${line.cptCode}):** ${line.denialReasons.join(', ')}`);
    }
  }

  return sections.join('\n');
}

// ─── Sample Claim Generator (for demo/testing) ──────────────────────────────

let _claimSeq = 0;
export function generateSampleClaim(overrides?: Partial<Claim>): Claim {
  const claimId = `CLM-${Date.now()}-${++_claimSeq}`;
  const today = new Date();
  const dos = new Date(today);
  dos.setDate(dos.getDate() - 7);

  return {
    claimId,
    patientId: 'PAT-10001',
    patientAge: 55,
    patientGender: 'female',
    providerId: 'PRV-20001',
    providerNetwork: 'in-network',
    payerId: 'BCBS-001',
    planType: 'ppo',
    dateOfService: dos.toISOString().split('T')[0],
    dateSubmitted: today.toISOString().split('T')[0],
    placeOfService: '11',
    lineItems: [
      {
        lineNumber: 1,
        cptCode: '99214',
        icdCodes: ['I10', 'E11.9'],
        units: 1,
        chargedAmount: 185.00,
        allowedAmount: 0,
        paidAmount: 0,
        status: 'pending',
        denialReasons: ['none'],
        adjustmentReasons: [],
      },
      {
        lineNumber: 2,
        cptCode: '80053',
        icdCodes: ['E11.9'],
        units: 1,
        chargedAmount: 45.00,
        allowedAmount: 0,
        paidAmount: 0,
        status: 'pending',
        denialReasons: ['none'],
        adjustmentReasons: [],
      },
      {
        lineNumber: 3,
        cptCode: '83036',
        icdCodes: ['E11.9'],
        units: 1,
        chargedAmount: 35.00,
        allowedAmount: 0,
        paidAmount: 0,
        status: 'pending',
        denialReasons: ['none'],
        adjustmentReasons: [],
      },
    ],
    totalCharged: 265.00,
    totalAllowed: 0,
    totalPaid: 0,
    patientResponsibility: 0,
    status: 'pending',
    ...overrides,
  };
}
