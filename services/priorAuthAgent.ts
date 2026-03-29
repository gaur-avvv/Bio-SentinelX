/**
 * Prior Authorization Agent
 * Evaluates prior authorization requests against payer-specific policies,
 * clinical criteria, and medical necessity guidelines with full audit trail.
 */

import {
  PriorAuthRequest, PriorAuthDecision, PriorAuthStatus,
} from './healthcareTypes';
import {
  getPayerPolicy, getCPTByCode, getICD10ByCode, validateICD10Code,
  validateCPTCode, checkPayerCoverage, getMedicalNecessityCriteria,
} from './healthcareRuleEngine';
import {
  createAuditTrail, addAuditStep, finalizeAuditTrail, saveAuditTrail,
} from './healthcareAuditService';

// ─── Prior Authorization Evaluation Pipeline ─────────────────────────────────

export function evaluatePriorAuth(request: PriorAuthRequest): PriorAuthDecision {
  let trail = createAuditTrail('prior-authorization', `Prior auth evaluation for ${request.requestedService}`);

  const denialReasons: string[] = [];
  const policyReferences: string[] = [];
  const alternativeOptions: string[] = [];

  // ── Phase 1: Request Completeness ──────────────────────────────────────────

  const missingFields: string[] = [];
  if (!request.patientId) missingFields.push('Patient ID');
  if (!request.providerId) missingFields.push('Provider ID');
  if (!request.payerId) missingFields.push('Payer ID');
  if (request.cptCodes.length === 0) missingFields.push('CPT codes');
  if (request.icdCodes.length === 0) missingFields.push('ICD-10 diagnosis codes');
  if (!request.clinicalJustification) missingFields.push('Clinical justification');

  trail = addAuditStep(trail, 'Request Validation', 'Completeness Check',
    `Request ${request.requestId}: ${request.cptCodes.length} CPT codes, ${request.icdCodes.length} ICD codes, urgency: ${request.urgency}`,
    missingFields.length === 0
      ? 'Request is complete — all required fields present'
      : `Missing fields: ${missingFields.join(', ')}`,
    missingFields.length === 0 ? 'pass' : 'fail',
    missingFields.length === 0
      ? 'All required fields for prior authorization submission are present including patient demographics, provider information, procedure codes, diagnosis codes, and clinical justification.'
      : `The following required fields are missing: ${missingFields.join(', ')}. Incomplete requests cannot be processed. The submitting provider should resubmit with all required information.`,
    ['Prior Auth Submission Requirements', 'Payer Auth Form Guidelines']
  );

  if (missingFields.length > 0) {
    trail = finalizeAuditTrail(trail, 'failed');
    saveAuditTrail(trail);
    return {
      request,
      status: 'additional-info-needed',
      denialReasons: [`Missing required fields: ${missingFields.join(', ')}`],
      clinicalRationale: 'Request is incomplete. Please resubmit with all required information.',
      policyReferences: [],
      alternativeOptions: [],
      auditTrail: trail,
    };
  }

  // ── Phase 2: Payer Policy Lookup ───────────────────────────────────────────

  const policy = getPayerPolicy(request.payerId);

  trail = addAuditStep(trail, 'Policy Lookup', 'Payer Policy Identification',
    `Payer ID: ${request.payerId}, Plan: ${request.planType}`,
    policy
      ? `Found policy: ${policy.policyName} (${policy.policyId}), effective ${policy.effectiveDate}`
      : `No policy found for payer ${request.payerId}`,
    policy ? 'pass' : 'fail',
    policy
      ? `Located payer policy ${policy.policyId} (${policy.payerName}). Policy is effective from ${policy.effectiveDate}${policy.terminationDate ? ` to ${policy.terminationDate}` : ' (ongoing)'}. Will evaluate request against this policy's coverage criteria.`
      : `Unable to locate a policy for payer ${request.payerId}. This may indicate the payer is not in our system or the payer ID is incorrect. Manual processing required.`,
    ['Payer Policy Database']
  );

  if (!policy) {
    denialReasons.push('Payer policy not found — cannot determine coverage criteria');
  }

  // ── Phase 3: Code Validation ───────────────────────────────────────────────

  // Validate CPT codes
  for (const cptCode of request.cptCodes) {
    const validation = validateCPTCode(cptCode);
    const cptInfo = getCPTByCode(cptCode);

    trail = addAuditStep(trail, 'Code Validation', `CPT Code Check — ${cptCode}`,
      `CPT: ${cptCode}${cptInfo ? ` (${cptInfo.description})` : ''}`,
      validation.valid
        ? `Valid CPT code${cptInfo?.requiresPriorAuth ? ' — prior auth typically required' : ''}`
        : `Invalid CPT code: ${validation.errors.join('; ')}`,
      validation.valid ? 'pass' : 'fail',
      validation.valid
        ? `CPT ${cptCode} is a valid procedure code.${cptInfo ? ` Description: ${cptInfo.description}. Category: ${cptInfo.category}. RVU: ${cptInfo.rvu}.` : ''}${validation.warnings.length > 0 ? ` Notes: ${validation.warnings.join('; ')}` : ''}`
        : `CPT ${cptCode} is not a recognized procedure code. ${validation.errors.join('; ')}`,
      ['CPT Manual']
    );

    if (!validation.valid) {
      denialReasons.push(`Invalid CPT code: ${cptCode}`);
    }
  }

  // Validate ICD-10 codes
  for (const icdCode of request.icdCodes) {
    const validation = validateICD10Code(icdCode);
    const icdInfo = getICD10ByCode(icdCode);

    trail = addAuditStep(trail, 'Code Validation', `ICD-10 Code Check — ${icdCode}`,
      `ICD-10: ${icdCode}${icdInfo ? ` (${icdInfo.description})` : ''}`,
      validation.valid ? 'Valid ICD-10 code' : `Invalid ICD-10 code: ${validation.errors.join('; ')}`,
      validation.valid ? (validation.warnings.length > 0 ? 'warn' : 'pass') : 'fail',
      validation.valid
        ? `ICD-10 ${icdCode} is valid.${icdInfo ? ` Description: ${icdInfo.description}. Category: ${icdInfo.category}.` : ''}${validation.warnings.length > 0 ? ` Notes: ${validation.warnings.join('; ')}` : ''}`
        : `ICD-10 ${icdCode} is not valid: ${validation.errors.join('; ')}`,
      ['ICD-10-CM Tabular List']
    );

    if (!validation.valid) {
      denialReasons.push(`Invalid ICD-10 code: ${icdCode}`);
    }
  }

  // ── Phase 4: Coverage Determination ────────────────────────────────────────

  if (policy) {
    for (const cptCode of request.cptCodes) {
      const coverage = checkPayerCoverage(
        request.payerId, cptCode, request.patientAge, request.patientGender
      );

      trail = addAuditStep(trail, 'Coverage Determination', `Coverage Check — CPT ${cptCode}`,
        `CPT: ${cptCode}, Patient age: ${request.patientAge}, Gender: ${request.patientGender}`,
        coverage.covered
          ? `Service is covered under ${policy.payerName}`
          : `Service NOT covered: ${coverage.denialReasons.join(', ')}`,
        coverage.covered ? 'pass' : 'fail',
        coverage.covered
          ? `CPT ${cptCode} is a covered benefit under ${policy.policyName}. ${coverage.warnings.length > 0 ? `Notes: ${coverage.warnings.join('; ')}` : 'No restrictions apply.'}`
          : `CPT ${cptCode} is not covered: ${coverage.warnings.join('; ')}. The service does not meet the plan's coverage criteria for this patient's demographics.`,
        [policy.policyId, 'Plan Benefits Document']
      );

      if (!coverage.covered) {
        denialReasons.push(`CPT ${cptCode} not covered: ${coverage.denialReasons.join(', ')}`);
      }

      if (coverage.covered) {
        policyReferences.push(`${policy.policyName} (${policy.policyId})`);
      }
    }

    // Check if prior auth is actually required
    const authRequired = request.cptCodes.some(c => policy.priorAuthRequired.includes(c));
    const codesRequiringAuth = request.cptCodes.filter(c => policy.priorAuthRequired.includes(c));
    const codesNotRequiringAuth = request.cptCodes.filter(c => !policy.priorAuthRequired.includes(c));

    trail = addAuditStep(trail, 'Auth Requirement', 'Prior Auth Necessity Check',
      `Checking if CPT codes ${request.cptCodes.join(', ')} require prior auth under ${policy.payerName}`,
      authRequired
        ? `Prior auth REQUIRED for: ${codesRequiringAuth.join(', ')}${codesNotRequiringAuth.length > 0 ? `. Not required for: ${codesNotRequiringAuth.join(', ')}` : ''}`
        : `Prior auth is NOT required for any of the requested services under this payer`,
      authRequired ? 'info' : 'info',
      authRequired
        ? `Per ${policy.payerName} policy, the following procedures require prior authorization: ${codesRequiringAuth.join(', ')}. Proceeding with clinical criteria evaluation.`
        : `None of the requested CPT codes (${request.cptCodes.join(', ')}) require prior authorization under ${policy.payerName}. Authorization is automatically granted. The provider may proceed with scheduling.`,
      [policy.policyId, 'Auth Requirements List']
    );
  }

  // ── Phase 5: Medical Necessity Evaluation ──────────────────────────────────

  let meetsCriteria = false;
  const metCriteria: string[] = [];
  const unmetCriteria: string[] = [];

  if (policy) {
    for (const cptCode of request.cptCodes) {
      const criteria = getMedicalNecessityCriteria(request.payerId, cptCode);

      if (criteria.length === 0) {
        trail = addAuditStep(trail, 'Medical Necessity', `Criteria Evaluation — CPT ${cptCode}`,
          `Looking up medical necessity criteria for CPT ${cptCode}`,
          'No specific medical necessity criteria defined — standard review applies',
          'info',
          `No payer-specific medical necessity criteria found for CPT ${cptCode}. The service will be evaluated based on general medical necessity principles and the clinical justification provided.`,
          ['General Medical Necessity Guidelines']
        );
        meetsCriteria = true;
        continue;
      }

      trail = addAuditStep(trail, 'Medical Necessity', `Criteria Identified — CPT ${cptCode}`,
        `CPT ${cptCode}: ${criteria.length} criteria to evaluate`,
        `Criteria: ${criteria.join('; ')}`,
        'info',
        `Found ${criteria.length} medical necessity criteria for CPT ${cptCode} under ${policy.payerName}. Will evaluate the clinical justification against each criterion.`,
        [policy.policyId, 'Medical Policy']
      );

      // Evaluate clinical justification against criteria
      const justificationLower = request.clinicalJustification.toLowerCase();
      const previousTxLower = request.previousTreatments.map(t => t.toLowerCase());

      for (const criterion of criteria) {
        const criterionLower = criterion.toLowerCase();
        const keywords = criterionLower.split(/\s+/).filter(w => w.length > 3);

        // Check if justification or previous treatments mention this criterion
        const justificationMatch = keywords.some(kw => justificationLower.includes(kw));
        const prevTreatmentMatch = previousTxLower.some(tx => keywords.some(kw => tx.includes(kw)));

        const met = justificationMatch || prevTreatmentMatch;

        if (met) {
          metCriteria.push(criterion);
          meetsCriteria = true;
        } else {
          unmetCriteria.push(criterion);
        }

        trail = addAuditStep(trail, 'Medical Necessity', `Criterion Evaluation`,
          `Criterion: "${criterion}"`,
          met ? 'CRITERION MET — supported by clinical documentation' : 'CRITERION NOT MET — insufficient documentation',
          met ? 'pass' : 'warn',
          met
            ? `The clinical justification and/or previous treatment history provides evidence supporting this criterion. ${justificationMatch ? 'Relevant terms found in clinical justification.' : ''} ${prevTreatmentMatch ? 'Relevant terms found in previous treatment history.' : ''}`
            : `The submitted clinical documentation does not clearly demonstrate this criterion. The provider may need to submit additional clinical information to support medical necessity. Consider: ${criterion}`,
          ['Medical Policy', 'Clinical Guidelines']
        );
      }
    }
  } else {
    // No policy — evaluate based on clinical justification alone
    meetsCriteria = request.clinicalJustification.length > 20;
    trail = addAuditStep(trail, 'Medical Necessity', 'General Clinical Review',
      `Clinical justification: ${request.clinicalJustification.substring(0, 100)}...`,
      meetsCriteria ? 'Clinical justification is substantive' : 'Clinical justification is insufficient',
      meetsCriteria ? 'warn' : 'fail',
      meetsCriteria
        ? 'Without payer-specific criteria, evaluating based on general medical necessity. The clinical justification provides reasonable clinical rationale. Peer review may be recommended.'
        : 'The clinical justification is too brief to establish medical necessity. A more detailed explanation is needed.',
      ['General Medical Necessity Guidelines']
    );
  }

  // ── Phase 6: Previous Treatment Review ─────────────────────────────────────

  if (request.previousTreatments.length > 0) {
    trail = addAuditStep(trail, 'Treatment History', 'Previous Treatment Review',
      `${request.previousTreatments.length} previous treatments documented: ${request.previousTreatments.join('; ')}`,
      'Previous treatment history documented — supports step therapy compliance',
      'pass',
      `The request documents ${request.previousTreatments.length} previous treatments: ${request.previousTreatments.join('; ')}. This demonstrates the patient has attempted alternative/conservative approaches before requesting the current service, supporting step therapy requirements.`,
      ['Step Therapy Requirements', 'Clinical Documentation']
    );
  } else {
    const cptInfo = request.cptCodes.length > 0 ? getCPTByCode(request.cptCodes[0]) : undefined;
    const isSurgical = cptInfo?.category === 'surgery';

    trail = addAuditStep(trail, 'Treatment History', 'Previous Treatment Review',
      'No previous treatments documented',
      isSurgical
        ? 'WARNING: Surgical procedures typically require documented failed conservative treatment'
        : 'No previous treatments listed — may be acceptable for non-surgical services',
      isSurgical ? 'warn' : 'info',
      isSurgical
        ? 'No previous treatment history was provided. For surgical procedures, most payers require documentation that conservative/non-operative treatments have been attempted and failed before approving surgical intervention. The provider should document previous treatments.'
        : 'No previous treatment history was provided. For the requested service, this may be acceptable depending on the clinical scenario. Consider documenting any previous treatments to strengthen the authorization request.',
      ['Step Therapy Guidelines', 'Conservative Treatment Requirements']
    );

    if (isSurgical) {
      alternativeOptions.push('Document previous conservative treatments (physical therapy, medications, injections) that have been tried and failed');
    }
  }

  // ── Phase 7: Urgency Assessment ────────────────────────────────────────────

  trail = addAuditStep(trail, 'Urgency Assessment', 'Request Priority Classification',
    `Urgency level: ${request.urgency}`,
    request.urgency === 'emergent'
      ? 'EMERGENT — expedited review required within 24-72 hours'
      : request.urgency === 'urgent'
      ? 'URGENT — review within 72 hours'
      : 'ROUTINE — standard review timeline (up to 14 business days)',
    'info',
    request.urgency === 'emergent'
      ? 'This request is marked as emergent. Per regulatory requirements, emergent requests must be reviewed within 24-72 hours. If the service has already been provided, retrospective authorization should be processed.'
      : request.urgency === 'urgent'
      ? 'This request is marked as urgent. Per payer guidelines, urgent requests should be reviewed within 72 hours. Expedited processing will be applied.'
      : 'This is a routine prior authorization request. Standard review timelines apply (up to 14 business days per most state regulations and CMS guidelines).',
    ['CMS PA Requirements', 'State PA Timelines', '42 CFR 438.210']
  );

  // ── Phase 8: Final Determination ───────────────────────────────────────────

  let status: PriorAuthStatus;
  let clinicalRationale: string;

  if (denialReasons.length > 0 && !meetsCriteria) {
    status = 'denied';
    clinicalRationale = `Authorization denied. Reasons: ${denialReasons.join('; ')}. ${unmetCriteria.length > 0 ? `Unmet medical necessity criteria: ${unmetCriteria.join('; ')}. ` : ''}The provider may appeal this decision with additional clinical documentation.`;
    alternativeOptions.push('Submit an appeal with additional clinical documentation');
    alternativeOptions.push('Request peer-to-peer review with medical director');
  } else if (denialReasons.length > 0 || (unmetCriteria.length > 0 && metCriteria.length > 0)) {
    status = metCriteria.length > 0 ? 'partial-approval' : 'additional-info-needed';
    clinicalRationale = status === 'partial-approval'
      ? `Partial approval granted. Met criteria: ${metCriteria.join('; ')}. ${unmetCriteria.length > 0 ? `Additional criteria not met: ${unmetCriteria.join('; ')}. ` : ''}${denialReasons.length > 0 ? `Issues: ${denialReasons.join('; ')}.` : ''}`
      : `Additional information needed. ${unmetCriteria.length > 0 ? `Unmet criteria: ${unmetCriteria.join('; ')}. ` : ''}Please provide additional clinical documentation to support medical necessity.`;
    alternativeOptions.push('Submit additional clinical documentation addressing unmet criteria');
  } else if (meetsCriteria && denialReasons.length === 0) {
    status = 'approved';
    clinicalRationale = `Authorization approved. ${metCriteria.length > 0 ? `Met criteria: ${metCriteria.join('; ')}. ` : ''}Clinical justification supports medical necessity for the requested service.`;
  } else {
    status = 'peer-review';
    clinicalRationale = 'Referred to peer review. The clinical documentation requires medical director evaluation to determine medical necessity.';
    alternativeOptions.push('Await peer review determination');
    alternativeOptions.push('Request peer-to-peer discussion with medical director');
  }

  trail = addAuditStep(trail, 'Final Determination', 'Authorization Decision',
    `Request ${request.requestId}: ${request.cptCodes.join(', ')} for ${request.requestedService}`,
    `${status.toUpperCase()} — ${clinicalRationale.substring(0, 120)}...`,
    status === 'approved' ? 'pass' : status === 'denied' ? 'fail' : 'warn',
    clinicalRationale,
    [...policyReferences, 'Authorization Decision Record']
  );

  trail = finalizeAuditTrail(trail, status === 'denied' ? 'failed' : 'completed');
  saveAuditTrail(trail);

  return {
    request,
    status,
    approvedUnits: status === 'approved' || status === 'partial-approval' ? 1 : undefined,
    approvedDuration: status === 'approved' || status === 'partial-approval'
      ? `${request.serviceStartDate} to ${request.serviceEndDate}`
      : undefined,
    denialReasons,
    clinicalRationale,
    policyReferences,
    alternativeOptions: [...new Set(alternativeOptions)],
    auditTrail: trail,
  };
}

// ─── Sample Prior Auth Generator (for demo/testing) ──────────────────────────

let _authSeq = 0;
export function generateSamplePriorAuth(overrides?: Partial<PriorAuthRequest>): PriorAuthRequest {
  const requestId = `PA-${Date.now()}-${++_authSeq}`;
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + 14);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 90);

  return {
    requestId,
    patientId: 'PAT-10001',
    patientAge: 62,
    patientGender: 'female',
    providerId: 'PRV-20001',
    payerId: 'BCBS-001',
    planType: 'ppo',
    requestedService: 'Total Knee Replacement',
    cptCodes: ['27447'],
    icdCodes: ['M17.11'],
    clinicalJustification: 'Patient has severe right knee osteoarthritis (Kellgren-Lawrence grade 4) with bone-on-bone changes. Failed conservative treatment including 6 months of physical therapy, NSAIDs, and two corticosteroid injections. Significant functional limitation with difficulty walking, climbing stairs, and performing daily activities. BMI is 28.',
    urgency: 'routine',
    requestDate: today.toISOString().split('T')[0],
    serviceStartDate: startDate.toISOString().split('T')[0],
    serviceEndDate: endDate.toISOString().split('T')[0],
    previousTreatments: [
      'Physical therapy (6 months, 3x/week)',
      'NSAIDs (ibuprofen 800mg TID, 3 months)',
      'Corticosteroid injection #1 (3 months ago)',
      'Corticosteroid injection #2 (6 weeks ago)',
      'Hyaluronic acid injection series',
    ],
    supportingDocuments: ['Knee X-ray report', 'MRI report', 'Physical therapy notes', 'Orthopedic evaluation'],
    ...overrides,
  };
}
