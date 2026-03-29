/**
 * Medical Coding Agent
 * Processes clinical encounters to assign ICD-10 and CPT codes
 * with step-by-step auditable reasoning at each decision point.
 */

import {
  ClinicalEncounter, CodingResult, ICD10Code, CPTCode,
} from './healthcareTypes';
import {
  lookupICD10, lookupCPT, validateICD10Code, validateCPTCode,
  checkNCCIEdits, checkDiagnosisProcedureMatch,
} from './healthcareRuleEngine';
import {
  createAuditTrail, addAuditStep, finalizeAuditTrail, saveAuditTrail,
} from './healthcareAuditService';

// ─── Clinical Term → ICD-10 Mapping ─────────────────────────────────────────

const CLINICAL_TERM_MAP: Record<string, string[]> = {
  'hypertension': ['I10'],
  'high blood pressure': ['I10'],
  'htn': ['I10'],
  'diabetes': ['E11.9'],
  'type 2 diabetes': ['E11.9'],
  'dm2': ['E11.9'],
  'diabetes with neuropathy': ['E11.40'],
  'diabetic neuropathy': ['E11.40'],
  'diabetes with nephropathy': ['E11.21'],
  'diabetic nephropathy': ['E11.21'],
  'diabetes with retinopathy': ['E11.319'],
  'diabetic retinopathy': ['E11.319'],
  'hyperglycemia': ['E11.65'],
  'high cholesterol': ['E78.5'],
  'hyperlipidemia': ['E78.5'],
  'hypercholesterolemia': ['E78.00'],
  'obesity': ['E66.01'],
  'morbid obesity': ['E66.01'],
  'hypothyroidism': ['E03.9'],
  'depression': ['F32.9'],
  'major depression': ['F32.9'],
  'anxiety': ['F41.9'],
  'generalized anxiety': ['F41.1'],
  'gad': ['F41.1'],
  'alcohol dependence': ['F10.20'],
  'migraine': ['G43.909'],
  'insomnia': ['G47.00'],
  'chronic pain': ['G89.4'],
  'chest pain': ['R07.9'],
  'abdominal pain': ['R10.9'],
  'back pain': ['M54.5'],
  'low back pain': ['M54.5'],
  'lbp': ['M54.5'],
  'knee pain': ['M17.11'],
  'knee osteoarthritis': ['M17.11'],
  'oa knee': ['M17.11'],
  'hip fracture': ['S72.001A'],
  'heart failure': ['I50.9'],
  'chf': ['I50.9'],
  'congestive heart failure': ['I50.9'],
  'atrial fibrillation': ['I48.91'],
  'afib': ['I48.91'],
  'coronary artery disease': ['I25.10'],
  'cad': ['I25.10'],
  'stroke': ['I63.9'],
  'cva': ['I63.9'],
  'pneumonia': ['J18.9'],
  'bronchitis': ['J20.9'],
  'acute bronchitis': ['J20.9'],
  'copd': ['J44.1'],
  'copd exacerbation': ['J44.1'],
  'asthma': ['J45.20'],
  'severe asthma': ['J45.50'],
  'upper respiratory infection': ['J06.9'],
  'uri': ['J06.9'],
  'cold': ['J06.9'],
  'uti': ['N39.0'],
  'urinary tract infection': ['N39.0'],
  'ckd': ['N18.3'],
  'chronic kidney disease': ['N18.3'],
  'gerd': ['K21.0'],
  'reflux': ['K21.0'],
  'appendicitis': ['K35.80'],
  'gallstones': ['K80.20'],
  'cholelithiasis': ['K80.20'],
  'dermatitis': ['L30.9'],
  'eczema': ['L30.9'],
  'anemia': ['D64.9'],
  'lung cancer': ['C34.90'],
  'breast cancer': ['C50.919'],
  'prostate cancer': ['C61'],
  'sepsis': ['A41.9'],
  'fever': ['R50.9'],
  'cough': ['R05.9'],
  'shortness of breath': ['R06.02'],
  'dyspnea': ['R06.02'],
  'headache': ['R51.9'],
  'fatigue': ['R53.83'],
  'prediabetes': ['R73.03'],
  'leg pain': ['M79.604'],
  'well visit': ['Z00.00'],
  'annual exam': ['Z00.00'],
  'physical exam': ['Z00.00'],
  'preventive visit': ['Z00.00'],
  'immunization': ['Z23'],
  'vaccination': ['Z23'],
  'insulin use': ['Z79.4'],
  'gastroenteritis': ['A09'],
  'viral infection': ['B34.9'],
  'bacterial infection': ['A49.9'],
};

// ─── Procedure → CPT Mapping ─────────────────────────────────────────────────

const PROCEDURE_TERM_MAP: Record<string, string[]> = {
  'office visit': ['99213'],
  'follow up': ['99213'],
  'follow-up': ['99213'],
  'established patient visit': ['99214'],
  'new patient visit': ['99203'],
  'complex visit': ['99215'],
  'comprehensive visit': ['99204'],
  'emergency visit': ['99283'],
  'er visit': ['99283'],
  'critical care': ['99291'],
  'preventive exam': ['99386'],
  'annual physical': ['99386'],
  'well visit': ['99386'],
  'total knee replacement': ['27447'],
  'tkr': ['27447'],
  'knee replacement': ['27447'],
  'total hip replacement': ['27130'],
  'thr': ['27130'],
  'hip replacement': ['27130'],
  'cholecystectomy': ['47562'],
  'gallbladder removal': ['47562'],
  'appendectomy': ['44970'],
  'cabg': ['33533'],
  'bypass surgery': ['33533'],
  'coronary bypass': ['33533'],
  'spinal fusion': ['22551'],
  'cervical fusion': ['22551'],
  'lumpectomy': ['19301'],
  'mastectomy': ['19301'],
  'chest xray': ['71046'],
  'chest x-ray': ['71046'],
  'cxr': ['71046'],
  'mri lumbar': ['72148'],
  'mri back': ['72148'],
  'lumbar mri': ['72148'],
  'ct abdomen': ['74177'],
  'abdominal ct': ['74177'],
  'mammogram': ['77067'],
  'screening mammography': ['77067'],
  'mri brain': ['70553'],
  'brain mri': ['70553'],
  'cmp': ['80053'],
  'metabolic panel': ['80053'],
  'comprehensive metabolic panel': ['80053'],
  'cbc': ['85025'],
  'complete blood count': ['85025'],
  'a1c': ['83036'],
  'hemoglobin a1c': ['83036'],
  'hba1c': ['83036'],
  'lipid panel': ['80061'],
  'cholesterol panel': ['80061'],
  'urinalysis': ['81001'],
  'ua': ['81001'],
  'tsh': ['84443'],
  'thyroid test': ['84443'],
  'vaccination': ['90471'],
  'immunization': ['90471'],
  'injection': ['96372'],
  'therapeutic injection': ['96372'],
  'psychotherapy': ['90837'],
  'therapy session': ['90837'],
  'counseling': ['90837'],
  'physical therapy': ['97110'],
  'pt': ['97110'],
  'therapeutic exercise': ['97110'],
  'manual therapy': ['97140'],
  'ekg': ['93000'],
  'ecg': ['93000'],
  'electrocardiogram': ['93000'],
};

// ─── Medical Coding Agent ────────────────────────────────────────────────────

export function processClinicalEncounter(encounter: ClinicalEncounter): CodingResult {
  let trail = createAuditTrail('medical-coding', `Coding encounter for ${encounter.chiefComplaint}`);

  // Step 1: Parse clinical encounter
  trail = addAuditStep(trail, 'Input Validation', 'Encounter Completeness Check',
    `Chief complaint: "${encounter.chiefComplaint}", ${encounter.diagnoses.length} diagnoses, ${encounter.procedures.length} procedures`,
    encounter.diagnoses.length > 0 && encounter.procedures.length > 0 ? 'Encounter data is complete' : 'Partial encounter data — will infer missing codes',
    encounter.diagnoses.length > 0 && encounter.procedures.length > 0 ? 'pass' : 'warn',
    'Validating that the clinical encounter has sufficient information for code assignment. Both diagnosis and procedure information are needed for complete coding.',
    ['CMS Coding Guidelines Section 1.A']
  );

  // Step 2: Map diagnoses to ICD-10 codes
  const icdCodes: ICD10Code[] = [];
  const allDiagnoses = [...encounter.diagnoses];

  // Also check chief complaint for additional diagnoses
  if (encounter.chiefComplaint) {
    const ccLower = encounter.chiefComplaint.toLowerCase();
    for (const [term, codes] of Object.entries(CLINICAL_TERM_MAP)) {
      if (ccLower.includes(term) && !allDiagnoses.some(d => d.toLowerCase().includes(term))) {
        allDiagnoses.push(term);
      }
    }
  }

  for (const diagnosis of allDiagnoses) {
    const diagLower = diagnosis.toLowerCase().trim();

    // Try exact term mapping first
    const mappedCodes = CLINICAL_TERM_MAP[diagLower];
    if (mappedCodes) {
      for (const code of mappedCodes) {
        const results = lookupICD10(code);
        if (results.length > 0 && !icdCodes.some(c => c.code === results[0].code)) {
          icdCodes.push(results[0]);
          trail = addAuditStep(trail, 'Diagnosis Coding', 'ICD-10 Term Mapping',
            `Clinical term: "${diagnosis}"`,
            `Mapped to ${results[0].code} — ${results[0].description}`,
            'pass',
            `Direct clinical term mapping found for "${diagnosis}". Code ${results[0].code} is the standard ICD-10-CM code for this condition (Chapter ${results[0].chapter}: ${results[0].category}).`,
            ['ICD-10-CM Official Guidelines', `Chapter ${results[0].chapter}`]
          );
        }
      }
    } else {
      // Try fuzzy search
      const searchResults = lookupICD10(diagnosis);
      if (searchResults.length > 0) {
        const best = searchResults[0];
        if (!icdCodes.some(c => c.code === best.code)) {
          icdCodes.push(best);
          trail = addAuditStep(trail, 'Diagnosis Coding', 'ICD-10 Fuzzy Search',
            `Clinical term: "${diagnosis}"`,
            `Best match: ${best.code} — ${best.description} (${searchResults.length} candidates evaluated)`,
            'warn',
            `No exact term mapping found. Used fuzzy search against ICD-10 database. Best match selected from ${searchResults.length} candidates. Manual review recommended.`,
            ['ICD-10-CM Index']
          );
        }
      } else {
        trail = addAuditStep(trail, 'Diagnosis Coding', 'ICD-10 Lookup Failed',
          `Clinical term: "${diagnosis}"`,
          'No matching ICD-10 code found',
          'fail',
          `Unable to find an ICD-10-CM code for the clinical term "${diagnosis}". The term may require clarification or more specific documentation from the provider.`,
          ['ICD-10-CM Guidelines Section I.A.19']
        );
      }
    }
  }

  // Step 3: Validate ICD-10 codes
  for (const icd of icdCodes) {
    const validation = validateICD10Code(icd.code);
    trail = addAuditStep(trail, 'Code Validation', 'ICD-10 Code Validity Check',
      `Validating ICD-10 code: ${icd.code}`,
      validation.valid ? `Code ${icd.code} is valid (specificity: ${icd.specificity})` : `Code ${icd.code} has validation issues: ${validation.errors.join('; ')}`,
      validation.valid ? (validation.warnings.length > 0 ? 'warn' : 'pass') : 'fail',
      validation.valid
        ? `Code ${icd.code} passes structural and content validation.${validation.warnings.length > 0 ? ` Warnings: ${validation.warnings.join('; ')}` : ''}`
        : `Code ${icd.code} failed validation: ${validation.errors.join('; ')}`,
      ['ICD-10-CM Tabular List', 'Official Coding Guidelines']
    );
  }

  // Step 4: Map procedures to CPT codes
  const cptCodes: CPTCode[] = [];
  const allProcedures = [...encounter.procedures];

  for (const procedure of allProcedures) {
    const procLower = procedure.toLowerCase().trim();

    const mappedCodes = PROCEDURE_TERM_MAP[procLower];
    if (mappedCodes) {
      for (const code of mappedCodes) {
        const results = lookupCPT(code);
        if (results.length > 0 && !cptCodes.some(c => c.code === results[0].code)) {
          cptCodes.push(results[0]);
          trail = addAuditStep(trail, 'Procedure Coding', 'CPT Term Mapping',
            `Procedure: "${procedure}"`,
            `Mapped to CPT ${results[0].code} — ${results[0].description} (RVU: ${results[0].rvu})`,
            'pass',
            `Direct procedure term mapping found. CPT ${results[0].code} is the standard code for "${procedure}" (Category: ${results[0].category}).${results[0].requiresPriorAuth ? ' NOTE: This procedure typically requires prior authorization.' : ''}`,
            ['CPT Manual', `Category: ${results[0].category}`]
          );
        }
      }
    } else {
      const searchResults = lookupCPT(procedure);
      if (searchResults.length > 0) {
        const best = searchResults[0];
        if (!cptCodes.some(c => c.code === best.code)) {
          cptCodes.push(best);
          trail = addAuditStep(trail, 'Procedure Coding', 'CPT Fuzzy Search',
            `Procedure: "${procedure}"`,
            `Best match: CPT ${best.code} — ${best.description}`,
            'warn',
            `No exact term mapping found. Used fuzzy search against CPT database. Best match selected. Manual review recommended.`,
            ['CPT Index']
          );
        }
      } else {
        trail = addAuditStep(trail, 'Procedure Coding', 'CPT Lookup Failed',
          `Procedure: "${procedure}"`,
          'No matching CPT code found',
          'fail',
          `Unable to find a CPT code for "${procedure}". The procedure description may need clarification.`,
          ['CPT Guidelines']
        );
      }
    }
  }

  // Step 5: Validate CPT codes
  for (const cpt of cptCodes) {
    const validation = validateCPTCode(cpt.code);
    trail = addAuditStep(trail, 'Code Validation', 'CPT Code Validity Check',
      `Validating CPT code: ${cpt.code}`,
      validation.valid ? `CPT ${cpt.code} is valid` : `CPT ${cpt.code} has issues: ${validation.errors.join('; ')}`,
      validation.valid ? (validation.warnings.length > 0 ? 'warn' : 'pass') : 'fail',
      validation.valid
        ? `CPT ${cpt.code} passes validation.${validation.warnings.length > 0 ? ` Warnings: ${validation.warnings.join('; ')}` : ''}`
        : `CPT ${cpt.code} failed validation: ${validation.errors.join('; ')}`,
      ['CPT Manual', 'CMS Fee Schedule']
    );
  }

  // Step 6: Check NCCI bundling edits
  const cptCodeList = cptCodes.map(c => c.code);
  const ncciViolations = checkNCCIEdits(cptCodeList);
  const validationWarnings: string[] = [];
  const validationErrors: string[] = [];
  const modifiers: string[] = [];

  for (const v of ncciViolations) {
    if (v.modifierAllowed) {
      validationWarnings.push(`NCCI Edit: ${v.code1} and ${v.code2} — ${v.reason}. Modifier may resolve.`);
      modifiers.push('25', '59');
      trail = addAuditStep(trail, 'Bundling Edits', 'NCCI Edit Check',
        `Checking CPT pair: ${v.code1} + ${v.code2}`,
        `Bundling edit detected but modifier allowed — add modifier 25/59 to resolve`,
        'warn',
        `${v.reason}. The NCCI allows these codes to be billed together if an appropriate modifier (25 on E/M, 59 on secondary procedure) is appended to indicate distinct services.`,
        ['NCCI Policy Manual', 'CMS NCCI Edits']
      );
    } else {
      validationErrors.push(`NCCI Edit: ${v.code1} and ${v.code2} cannot be billed together — ${v.reason}`);
      trail = addAuditStep(trail, 'Bundling Edits', 'NCCI Edit Violation',
        `Checking CPT pair: ${v.code1} + ${v.code2}`,
        `HARD EDIT: These codes cannot be billed together. ${v.reason}`,
        'fail',
        `${v.reason}. No modifier override allowed. One of these codes must be removed from the claim. The more comprehensive code should be retained.`,
        ['NCCI Policy Manual', 'CMS NCCI Edits']
      );
    }
  }

  if (ncciViolations.length === 0 && cptCodeList.length > 1) {
    trail = addAuditStep(trail, 'Bundling Edits', 'NCCI Edit Check',
      `Checked ${cptCodeList.length} CPT codes for bundling conflicts`,
      'No NCCI edit violations found',
      'pass',
      'All CPT code combinations passed NCCI bundling edit checks. No code pair conflicts detected.',
      ['NCCI Policy Manual']
    );
  }

  // Step 7: Cross-validate diagnosis-procedure linkage
  for (const cpt of cptCodes) {
    for (const icd of icdCodes) {
      const match = checkDiagnosisProcedureMatch(icd.code, cpt.code);
      trail = addAuditStep(trail, 'Medical Necessity', 'Diagnosis-Procedure Linkage',
        `ICD-10 ${icd.code} ↔ CPT ${cpt.code}`,
        match.valid ? 'Linkage supported' : 'Linkage may not support medical necessity',
        match.valid ? 'pass' : 'warn',
        match.reasoning,
        ['LCD/NCD Policies', 'CMS Medical Necessity Guidelines']
      );
    }
  }

  // Step 8: Calculate confidence score
  const totalSteps = trail.steps.length;
  const passedSteps = trail.steps.filter(s => s.status === 'pass').length;
  const warnSteps = trail.steps.filter(s => s.status === 'warn').length;
  const failedSteps = trail.steps.filter(s => s.status === 'fail').length;
  const confidence = Math.max(0, Math.min(100,
    Math.round(((passedSteps + warnSteps * 0.5) / Math.max(totalSteps, 1)) * 100)
  ));

  trail = addAuditStep(trail, 'Final Assessment', 'Confidence Calculation',
    `${totalSteps} total steps: ${passedSteps} pass, ${warnSteps} warn, ${failedSteps} fail`,
    `Coding confidence: ${confidence}%`,
    confidence >= 80 ? 'pass' : confidence >= 50 ? 'warn' : 'fail',
    `Confidence score computed as weighted ratio of passed (1.0) and warned (0.5) steps to total steps. Score of ${confidence}% indicates ${confidence >= 80 ? 'high' : confidence >= 50 ? 'moderate' : 'low'} confidence in code assignment accuracy.`,
    ['Internal Quality Metrics']
  );

  // Deduplicate modifiers
  const uniqueModifiers = [...new Set(modifiers)];

  // Finalize
  trail = finalizeAuditTrail(trail, failedSteps > 0 && icdCodes.length === 0 ? 'failed' : 'completed');
  saveAuditTrail(trail);

  return {
    encounter,
    icdCodes,
    cptCodes,
    modifiers: uniqueModifiers,
    validationWarnings,
    validationErrors,
    auditTrail: trail,
    confidence,
  };
}
