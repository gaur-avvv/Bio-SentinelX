/**
 * Healthcare Rule Engine
 * Comprehensive ICD-10, CPT knowledge base, and payer policy rule sets
 * for medical coding validation, claims adjudication, and prior authorization.
 */

import {
  ICD10Code, CPTCode, CPTCategory, PayerPolicy, DenialReason,
} from './healthcareTypes';

// ─── ICD-10 Code Database (representative subset) ────────────────────────────

const ICD10_DATABASE: ICD10Code[] = [
  // Chapter I: Certain infectious and parasitic diseases (A00-B99)
  { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified', category: 'Intestinal infectious diseases', chapter: 'I', isValid: true, specificity: 'full', excludes1: ['K52.9'] },
  { code: 'A41.9', description: 'Sepsis, unspecified organism', category: 'Other sepsis', chapter: 'I', isValid: true, specificity: 'full', codeFirst: [], useAdditionalCode: ['R65.2'] },
  { code: 'A49.9', description: 'Bacterial infection, unspecified', category: 'Bacterial infection of unspecified site', chapter: 'I', isValid: true, specificity: 'full' },
  { code: 'B34.9', description: 'Viral infection, unspecified', category: 'Viral infection of unspecified site', chapter: 'I', isValid: true, specificity: 'full' },

  // Chapter II: Neoplasms (C00-D49)
  { code: 'C34.90', description: 'Malignant neoplasm of unspecified part of unspecified bronchus or lung', category: 'Malignant neoplasm of bronchus and lung', chapter: 'II', isValid: true, specificity: 'full' },
  { code: 'C50.919', description: 'Malignant neoplasm of unspecified site of unspecified female breast', category: 'Malignant neoplasm of breast', chapter: 'II', isValid: true, specificity: 'full' },
  { code: 'C61', description: 'Malignant neoplasm of prostate', category: 'Malignant neoplasm of prostate', chapter: 'II', isValid: true, specificity: 'full' },
  { code: 'D64.9', description: 'Anemia, unspecified', category: 'Other anemias', chapter: 'II', isValid: true, specificity: 'full' },

  // Chapter IV: Endocrine, nutritional and metabolic diseases (E00-E89)
  { code: 'E08.9', description: 'Diabetes mellitus due to underlying condition without complications', category: 'Diabetes mellitus', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'Type 2 diabetes mellitus', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia', category: 'Type 2 diabetes mellitus', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E11.40', description: 'Type 2 diabetes mellitus with diabetic neuropathy, unspecified', category: 'Type 2 diabetes mellitus', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E11.21', description: 'Type 2 diabetes mellitus with diabetic nephropathy', category: 'Type 2 diabetes mellitus', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E11.319', description: 'Type 2 diabetes mellitus with unspecified diabetic retinopathy without macular edema', category: 'Type 2 diabetes mellitus', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E78.5', description: 'Hyperlipidemia, unspecified', category: 'Disorders of lipoprotein metabolism', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E78.00', description: 'Pure hypercholesterolemia, unspecified', category: 'Disorders of lipoprotein metabolism', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E66.01', description: 'Morbid (severe) obesity due to excess calories', category: 'Overweight and obesity', chapter: 'IV', isValid: true, specificity: 'full' },
  { code: 'E03.9', description: 'Hypothyroidism, unspecified', category: 'Other hypothyroidism', chapter: 'IV', isValid: true, specificity: 'full' },

  // Chapter V: Mental and behavioral disorders (F01-F99)
  { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified', category: 'Major depressive disorder', chapter: 'V', isValid: true, specificity: 'full' },
  { code: 'F41.1', description: 'Generalized anxiety disorder', category: 'Other anxiety disorders', chapter: 'V', isValid: true, specificity: 'full' },
  { code: 'F41.9', description: 'Anxiety disorder, unspecified', category: 'Other anxiety disorders', chapter: 'V', isValid: true, specificity: 'full' },
  { code: 'F10.20', description: 'Alcohol dependence, uncomplicated', category: 'Alcohol related disorders', chapter: 'V', isValid: true, specificity: 'full' },

  // Chapter VI: Diseases of the nervous system (G00-G99)
  { code: 'G43.909', description: 'Migraine, unspecified, not intractable, without status migrainosus', category: 'Migraine', chapter: 'VI', isValid: true, specificity: 'full' },
  { code: 'G47.00', description: 'Insomnia, unspecified', category: 'Sleep disorders', chapter: 'VI', isValid: true, specificity: 'full' },
  { code: 'G89.4', description: 'Chronic pain syndrome', category: 'Pain, not elsewhere classified', chapter: 'VI', isValid: true, specificity: 'full' },

  // Chapter IX: Diseases of the circulatory system (I00-I99)
  { code: 'I10', description: 'Essential (primary) hypertension', category: 'Hypertensive diseases', chapter: 'IX', isValid: true, specificity: 'full' },
  { code: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery without angina pectoris', category: 'Chronic ischemic heart disease', chapter: 'IX', isValid: true, specificity: 'full' },
  { code: 'I48.91', description: 'Unspecified atrial fibrillation', category: 'Atrial fibrillation and flutter', chapter: 'IX', isValid: true, specificity: 'full' },
  { code: 'I50.9', description: 'Heart failure, unspecified', category: 'Heart failure', chapter: 'IX', isValid: true, specificity: 'full' },
  { code: 'I63.9', description: 'Cerebral infarction, unspecified', category: 'Cerebral infarction', chapter: 'IX', isValid: true, specificity: 'full' },

  // Chapter X: Diseases of the respiratory system (J00-J99)
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', category: 'Acute upper respiratory infections', chapter: 'X', isValid: true, specificity: 'full' },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism', category: 'Pneumonia', chapter: 'X', isValid: true, specificity: 'full' },
  { code: 'J20.9', description: 'Acute bronchitis, unspecified', category: 'Acute bronchitis', chapter: 'X', isValid: true, specificity: 'full' },
  { code: 'J44.1', description: 'Chronic obstructive pulmonary disease with (acute) exacerbation', category: 'Other chronic obstructive pulmonary disease', chapter: 'X', isValid: true, specificity: 'full' },
  { code: 'J45.20', description: 'Mild intermittent asthma, uncomplicated', category: 'Asthma', chapter: 'X', isValid: true, specificity: 'full' },
  { code: 'J45.50', description: 'Severe persistent asthma, uncomplicated', category: 'Asthma', chapter: 'X', isValid: true, specificity: 'full' },

  // Chapter XI: Diseases of the digestive system (K00-K95)
  { code: 'K21.0', description: 'Gastro-esophageal reflux disease with esophagitis', category: 'GERD', chapter: 'XI', isValid: true, specificity: 'full' },
  { code: 'K35.80', description: 'Unspecified acute appendicitis', category: 'Acute appendicitis', chapter: 'XI', isValid: true, specificity: 'full' },
  { code: 'K80.20', description: 'Calculus of gallbladder without cholecystitis without obstruction', category: 'Cholelithiasis', chapter: 'XI', isValid: true, specificity: 'full' },

  // Chapter XII: Diseases of the skin (L00-L99)
  { code: 'L30.9', description: 'Dermatitis, unspecified', category: 'Dermatitis', chapter: 'XII', isValid: true, specificity: 'full' },

  // Chapter XIII: Diseases of the musculoskeletal system (M00-M99)
  { code: 'M54.5', description: 'Low back pain', category: 'Dorsalgia', chapter: 'XIII', isValid: true, specificity: 'full' },
  { code: 'M79.3', description: 'Panniculitis, unspecified', category: 'Other soft tissue disorders', chapter: 'XIII', isValid: true, specificity: 'full' },
  { code: 'M17.11', description: 'Primary osteoarthritis, right knee', category: 'Osteoarthritis of knee', chapter: 'XIII', isValid: true, specificity: 'full' },
  { code: 'M17.12', description: 'Primary osteoarthritis, left knee', category: 'Osteoarthritis of knee', chapter: 'XIII', isValid: true, specificity: 'full' },
  { code: 'M79.604', description: 'Pain in right leg', category: 'Pain in limb', chapter: 'XIII', isValid: true, specificity: 'full' },
  { code: 'M79.605', description: 'Pain in left leg', category: 'Pain in limb', chapter: 'XIII', isValid: true, specificity: 'full' },

  // Chapter XIV: Diseases of the genitourinary system (N00-N99)
  { code: 'N39.0', description: 'Urinary tract infection, site not specified', category: 'Other disorders of urinary system', chapter: 'XIV', isValid: true, specificity: 'full' },
  { code: 'N18.3', description: 'Chronic kidney disease, stage 3 (moderate)', category: 'Chronic kidney disease', chapter: 'XIV', isValid: true, specificity: 'full' },

  // Chapter XVIII: Symptoms, signs and abnormal findings (R00-R99)
  { code: 'R05.9', description: 'Cough, unspecified', category: 'Cough', chapter: 'XVIII', isValid: true, specificity: 'full' },
  { code: 'R06.02', description: 'Shortness of breath', category: 'Abnormalities of breathing', chapter: 'XVIII', isValid: true, specificity: 'full' },
  { code: 'R07.9', description: 'Chest pain, unspecified', category: 'Pain in throat and chest', chapter: 'XVIII', isValid: true, specificity: 'full' },
  { code: 'R10.9', description: 'Unspecified abdominal pain', category: 'Abdominal and pelvic pain', chapter: 'XVIII', isValid: true, specificity: 'full' },
  { code: 'R50.9', description: 'Fever, unspecified', category: 'Fever', chapter: 'XVIII', isValid: true, specificity: 'full' },
  { code: 'R51.9', description: 'Headache, unspecified', category: 'Headache', chapter: 'XVIII', isValid: true, specificity: 'full' },
  { code: 'R53.83', description: 'Other fatigue', category: 'Malaise and fatigue', chapter: 'XVIII', isValid: true, specificity: 'full' },
  { code: 'R73.03', description: 'Prediabetes', category: 'Elevated blood glucose level', chapter: 'XVIII', isValid: true, specificity: 'full' },

  // Chapter XIX: Injury, poisoning (S00-T88)
  { code: 'S72.001A', description: 'Fracture of unspecified part of neck of right femur, initial encounter', category: 'Fracture of femur', chapter: 'XIX', isValid: true, specificity: 'full' },

  // Chapter XXI: Factors influencing health status (Z00-Z99)
  { code: 'Z00.00', description: 'Encounter for general adult medical examination without abnormal findings', category: 'Encounter for examination', chapter: 'XXI', isValid: true, specificity: 'full' },
  { code: 'Z23', description: 'Encounter for immunization', category: 'Encounter for immunization', chapter: 'XXI', isValid: true, specificity: 'full' },
  { code: 'Z87.891', description: 'Personal history of nicotine dependence', category: 'Personal history', chapter: 'XXI', isValid: true, specificity: 'full' },
  { code: 'Z79.4', description: 'Long term (current) use of insulin', category: 'Long term drug therapy', chapter: 'XXI', isValid: true, specificity: 'full' },
  { code: 'Z96.641', description: 'Presence of right artificial hip joint', category: 'Presence of implants', chapter: 'XXI', isValid: true, specificity: 'full' },
];

// ─── CPT Code Database (representative subset) ──────────────────────────────

const CPT_DATABASE: CPTCode[] = [
  // Evaluation & Management (99201-99499)
  { code: '99213', description: 'Office or other outpatient visit, established patient, low complexity', category: 'evaluation-management', rvu: 1.3, globalPeriod: null, modifiers: ['25', '57'], requiresPriorAuth: false, commonDiagnoses: ['I10', 'E11.9', 'E78.5'] },
  { code: '99214', description: 'Office or other outpatient visit, established patient, moderate complexity', category: 'evaluation-management', rvu: 1.92, globalPeriod: null, modifiers: ['25', '57'], requiresPriorAuth: false, commonDiagnoses: ['I10', 'E11.9', 'J45.20'] },
  { code: '99215', description: 'Office or other outpatient visit, established patient, high complexity', category: 'evaluation-management', rvu: 2.80, globalPeriod: null, modifiers: ['25', '57'], requiresPriorAuth: false, commonDiagnoses: ['I50.9', 'J44.1', 'C34.90'] },
  { code: '99202', description: 'Office or other outpatient visit, new patient, straightforward', category: 'evaluation-management', rvu: 0.93, globalPeriod: null, modifiers: ['25'], requiresPriorAuth: false, commonDiagnoses: ['J06.9', 'R05.9'] },
  { code: '99203', description: 'Office or other outpatient visit, new patient, low complexity', category: 'evaluation-management', rvu: 1.6, globalPeriod: null, modifiers: ['25', '57'], requiresPriorAuth: false, commonDiagnoses: ['I10', 'E11.9'] },
  { code: '99204', description: 'Office or other outpatient visit, new patient, moderate complexity', category: 'evaluation-management', rvu: 2.6, globalPeriod: null, modifiers: ['25', '57'], requiresPriorAuth: false, commonDiagnoses: ['E11.65', 'I25.10'] },
  { code: '99205', description: 'Office or other outpatient visit, new patient, high complexity', category: 'evaluation-management', rvu: 3.5, globalPeriod: null, modifiers: ['25', '57'], requiresPriorAuth: false, commonDiagnoses: ['C50.919', 'I50.9'] },
  { code: '99281', description: 'Emergency department visit, self-limited problem', category: 'evaluation-management', rvu: 0.48, globalPeriod: null, modifiers: ['25'], requiresPriorAuth: false, commonDiagnoses: ['J06.9'] },
  { code: '99283', description: 'Emergency department visit, moderate severity', category: 'evaluation-management', rvu: 1.58, globalPeriod: null, modifiers: ['25'], requiresPriorAuth: false, commonDiagnoses: ['R10.9', 'R07.9'] },
  { code: '99285', description: 'Emergency department visit, high severity with significant threat', category: 'evaluation-management', rvu: 3.80, globalPeriod: null, modifiers: ['25', '57'], requiresPriorAuth: false, commonDiagnoses: ['I63.9', 'A41.9'] },
  { code: '99291', description: 'Critical care, first 30-74 minutes', category: 'evaluation-management', rvu: 4.50, globalPeriod: null, modifiers: ['25'], requiresPriorAuth: false, commonDiagnoses: ['A41.9', 'J18.9'] },
  { code: '99386', description: 'Initial comprehensive preventive medicine, 40-64 years', category: 'evaluation-management', rvu: 2.43, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['Z00.00'] },

  // Surgery (10000-69999)
  { code: '27447', description: 'Arthroplasty, knee, condyle and plateau; medial and lateral compartments (total knee replacement)', category: 'surgery', rvu: 20.72, globalPeriod: 90, modifiers: ['LT', 'RT', '50', '59'], requiresPriorAuth: true, commonDiagnoses: ['M17.11', 'M17.12'] },
  { code: '27130', description: 'Arthroplasty, acetabular and proximal femoral prosthetic replacement (total hip replacement)', category: 'surgery', rvu: 20.05, globalPeriod: 90, modifiers: ['LT', 'RT', '50'], requiresPriorAuth: true, commonDiagnoses: ['M16.11', 'S72.001A'] },
  { code: '47562', description: 'Laparoscopic cholecystectomy', category: 'surgery', rvu: 10.07, globalPeriod: 90, modifiers: ['22', '59'], requiresPriorAuth: false, commonDiagnoses: ['K80.20'] },
  { code: '44970', description: 'Laparoscopic appendectomy', category: 'surgery', rvu: 8.17, globalPeriod: 90, modifiers: ['22'], requiresPriorAuth: false, commonDiagnoses: ['K35.80'] },
  { code: '33533', description: 'Coronary artery bypass, single arterial graft (CABG)', category: 'surgery', rvu: 33.75, globalPeriod: 90, modifiers: ['22', '62'], requiresPriorAuth: true, commonDiagnoses: ['I25.10'] },
  { code: '22551', description: 'Arthrodesis, anterior interbody, cervical (spinal fusion)', category: 'surgery', rvu: 19.24, globalPeriod: 90, modifiers: ['22', '59', '62'], requiresPriorAuth: true, commonDiagnoses: ['M54.5'] },
  { code: '19301', description: 'Mastectomy, partial (lumpectomy)', category: 'surgery', rvu: 8.54, globalPeriod: 90, modifiers: ['LT', 'RT', '59'], requiresPriorAuth: false, commonDiagnoses: ['C50.919'] },

  // Radiology (70000-79999)
  { code: '71046', description: 'Radiologic examination, chest; 2 views', category: 'radiology', rvu: 0.31, globalPeriod: null, modifiers: ['26', 'TC'], requiresPriorAuth: false, commonDiagnoses: ['R05.9', 'J18.9'] },
  { code: '72148', description: 'MRI lumbar spine without contrast', category: 'radiology', rvu: 1.52, globalPeriod: null, modifiers: ['26', 'TC'], requiresPriorAuth: true, commonDiagnoses: ['M54.5'] },
  { code: '74177', description: 'CT abdomen and pelvis with contrast', category: 'radiology', rvu: 1.74, globalPeriod: null, modifiers: ['26', 'TC'], requiresPriorAuth: true, commonDiagnoses: ['R10.9'] },
  { code: '77067', description: 'Screening mammography, bilateral', category: 'radiology', rvu: 1.30, globalPeriod: null, modifiers: ['26', 'TC'], requiresPriorAuth: false, commonDiagnoses: ['Z12.31'] },
  { code: '70553', description: 'MRI brain without contrast, then with contrast', category: 'radiology', rvu: 2.04, globalPeriod: null, modifiers: ['26', 'TC'], requiresPriorAuth: true, commonDiagnoses: ['R51.9', 'G43.909'] },

  // Pathology & Laboratory (80000-89999)
  { code: '80053', description: 'Comprehensive metabolic panel', category: 'pathology-lab', rvu: 0.0, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['E11.9', 'I10', 'N18.3'] },
  { code: '85025', description: 'Complete blood count (CBC) with differential', category: 'pathology-lab', rvu: 0.0, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['D64.9', 'R50.9'] },
  { code: '83036', description: 'Hemoglobin A1c', category: 'pathology-lab', rvu: 0.0, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['E11.9', 'E11.65'] },
  { code: '80061', description: 'Lipid panel', category: 'pathology-lab', rvu: 0.0, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['E78.5', 'E78.00'] },
  { code: '81001', description: 'Urinalysis, automated, with microscopy', category: 'pathology-lab', rvu: 0.0, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['N39.0'] },
  { code: '84443', description: 'Thyroid stimulating hormone (TSH)', category: 'pathology-lab', rvu: 0.0, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['E03.9'] },

  // Medicine (90000-99199)
  { code: '90471', description: 'Immunization administration, 1st vaccine', category: 'medicine', rvu: 0.17, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['Z23'] },
  { code: '96372', description: 'Therapeutic injection, subcutaneous or intramuscular', category: 'medicine', rvu: 0.17, globalPeriod: null, modifiers: [], requiresPriorAuth: false, commonDiagnoses: ['M54.5', 'G89.4'] },
  { code: '90837', description: 'Psychotherapy, 60 minutes', category: 'medicine', rvu: 1.65, globalPeriod: null, modifiers: ['95'], requiresPriorAuth: false, commonDiagnoses: ['F32.9', 'F41.1'] },
  { code: '97110', description: 'Therapeutic exercises, each 15 minutes', category: 'medicine', rvu: 0.45, globalPeriod: null, modifiers: ['59', 'GP'], requiresPriorAuth: false, commonDiagnoses: ['M54.5', 'M17.11'] },
  { code: '97140', description: 'Manual therapy techniques, each 15 minutes', category: 'medicine', rvu: 0.43, globalPeriod: null, modifiers: ['59', 'GP'], requiresPriorAuth: false, commonDiagnoses: ['M54.5'] },
  { code: '93000', description: 'Electrocardiogram, routine, 12-lead', category: 'medicine', rvu: 0.17, globalPeriod: null, modifiers: ['26', 'TC'], requiresPriorAuth: false, commonDiagnoses: ['I10', 'R07.9', 'I48.91'] },
];

// ─── Payer Policy Database ───────────────────────────────────────────────────

const PAYER_POLICIES: PayerPolicy[] = [
  {
    payerId: 'BCBS-001',
    payerName: 'Blue Cross Blue Shield Standard',
    policyId: 'POL-BCBS-2024-STD',
    policyName: 'BCBS Standard PPO Plan',
    effectiveDate: '2024-01-01',
    terminationDate: null,
    coveredServices: ['99213', '99214', '99215', '99202', '99203', '99204', '99205', '99281', '99283', '99285', '99291', '99386', '27447', '27130', '47562', '44970', '33533', '22551', '19301', '71046', '72148', '74177', '77067', '70553', '80053', '85025', '83036', '80061', '81001', '84443', '90471', '96372', '90837', '97110', '97140', '93000'],
    excludedServices: [],
    priorAuthRequired: ['27447', '27130', '33533', '22551', '72148', '74177', '70553'],
    frequencyLimits: {
      '77067': { maxUnits: 1, period: 'year' },
      '83036': { maxUnits: 4, period: 'year' },
      '80061': { maxUnits: 2, period: 'year' },
      '90837': { maxUnits: 52, period: 'year' },
      '97110': { maxUnits: 24, period: 'year' },
      '97140': { maxUnits: 24, period: 'year' },
      '99386': { maxUnits: 1, period: 'year' },
    },
    ageLimits: {
      '77067': { minAge: 40 },
      '99386': { minAge: 40, maxAge: 64 },
    },
    genderRestrictions: {
      '77067': ['female'],
      'C61': ['male'],
    },
    medicalNecessityCriteria: {
      '72148': ['Failed conservative treatment for 6+ weeks', 'Progressive neurological deficit', 'Acute radiculopathy with motor weakness'],
      '27447': ['Kellgren-Lawrence grade 3-4 osteoarthritis', 'Failed 3+ months of conservative treatment', 'Significant functional limitation'],
      '27130': ['Significant joint deterioration on imaging', 'Failed conservative treatment 3+ months', 'Severe functional limitation'],
      '33533': ['Left main coronary artery disease >50%', 'Three-vessel disease', 'Failed medical management'],
      '22551': ['Failed conservative treatment for 12+ weeks', 'Progressive neurological deficit', 'Myelopathy on imaging'],
      '74177': ['Acute abdomen with diagnostic uncertainty', 'Trauma evaluation', 'Cancer staging/follow-up'],
      '70553': ['New onset seizures', 'Progressive neurological symptoms', 'Suspected intracranial mass'],
    },
    bundlingEdits: {
      '99213': ['97110', '97140'],
      '99214': ['97110', '97140'],
      '80053': ['80048'],
      '85025': ['85027'],
    },
    maxBenefits: {
      '97110': 3000,
      '97140': 3000,
      '90837': 5000,
    },
    timelyFilingDays: 365,
    copay: {
      'evaluation-management': 30,
      'surgery': 250,
      'radiology': 75,
      'pathology-lab': 0,
      'medicine': 40,
    },
    coinsurance: 0.20,
    deductible: 1500,
  },
  {
    payerId: 'AETNA-001',
    payerName: 'Aetna Choice POS II',
    policyId: 'POL-AETNA-2024-POS',
    policyName: 'Aetna Choice POS II Plan',
    effectiveDate: '2024-01-01',
    terminationDate: null,
    coveredServices: ['99213', '99214', '99215', '99202', '99203', '99204', '99205', '99281', '99283', '99285', '99291', '99386', '27447', '27130', '47562', '44970', '33533', '22551', '19301', '71046', '72148', '74177', '77067', '70553', '80053', '85025', '83036', '80061', '81001', '84443', '90471', '96372', '90837', '97110', '97140', '93000'],
    excludedServices: [],
    priorAuthRequired: ['27447', '27130', '33533', '22551', '72148', '70553'],
    frequencyLimits: {
      '77067': { maxUnits: 1, period: 'year' },
      '83036': { maxUnits: 3, period: 'year' },
      '90837': { maxUnits: 30, period: 'year' },
      '97110': { maxUnits: 20, period: 'year' },
      '97140': { maxUnits: 20, period: 'year' },
    },
    ageLimits: {
      '77067': { minAge: 40 },
    },
    genderRestrictions: {
      '77067': ['female'],
    },
    medicalNecessityCriteria: {
      '72148': ['Failed conservative treatment for 4+ weeks', 'Red flag symptoms present', 'Post-surgical evaluation'],
      '27447': ['Radiographic evidence of severe arthritis', 'Failed non-operative management 6+ months', 'BMI <40 preferred'],
      '27130': ['Significant joint deterioration', 'Failed conservative treatment 6+ months', 'Functional limitation documented'],
      '33533': ['Significant coronary artery disease', 'Angina refractory to medical management', 'High-risk anatomy on catheterization'],
      '22551': ['Failed conservative treatment for 6+ weeks', 'Documented instability or deformity', 'Myelopathy confirmed on imaging'],
      '70553': ['Suspected intracranial pathology', 'New neurological deficit', 'Follow-up for known brain lesion'],
    },
    bundlingEdits: {
      '99213': ['97110'],
      '99214': ['97110', '97140'],
      '80053': ['80048'],
    },
    maxBenefits: {
      '97110': 2500,
      '97140': 2500,
      '90837': 4000,
    },
    timelyFilingDays: 180,
    copay: {
      'evaluation-management': 25,
      'surgery': 500,
      'radiology': 100,
      'pathology-lab': 0,
      'medicine': 35,
    },
    coinsurance: 0.25,
    deductible: 2000,
  },
  {
    payerId: 'MEDICARE-001',
    payerName: 'Medicare Part B',
    policyId: 'POL-MEDICARE-2024-B',
    policyName: 'Medicare Traditional Part B',
    effectiveDate: '2024-01-01',
    terminationDate: null,
    coveredServices: ['99213', '99214', '99215', '99202', '99203', '99204', '99205', '99281', '99283', '99285', '99291', '99386', '27447', '27130', '47562', '44970', '33533', '22551', '19301', '71046', '72148', '74177', '77067', '70553', '80053', '85025', '83036', '80061', '81001', '84443', '90471', '96372', '90837', '97110', '97140', '93000'],
    excludedServices: [],
    priorAuthRequired: ['27447', '27130', '33533', '22551'],
    frequencyLimits: {
      '77067': { maxUnits: 1, period: 'year' },
      '83036': { maxUnits: 4, period: 'year' },
      '80061': { maxUnits: 1, period: 'year' },
      '97110': { maxUnits: 12, period: 'year' },
      '97140': { maxUnits: 12, period: 'year' },
    },
    ageLimits: {
      '77067': { minAge: 40 },
    },
    genderRestrictions: {
      '77067': ['female'],
    },
    medicalNecessityCriteria: {
      '72148': ['Red flag symptoms (cauda equina, progressive deficit)', 'Failed conservative treatment 4-6 weeks', 'Post-operative evaluation'],
      '27447': ['Bone-on-bone arthritis documented', 'Failed conservative treatment', 'Functional limitation with ADL impact'],
      '27130': ['Joint destruction documented', 'Failed conservative treatment', 'Pain impacting daily activities'],
      '33533': ['Significant coronary stenosis on catheterization', 'Angina despite optimal medical therapy', 'Left main or equivalent disease'],
      '22551': ['Instability or deformity documented', 'Failed conservative management 12+ weeks', 'Progressive neurological deficit'],
    },
    bundlingEdits: {
      '99213': ['97110', '97140'],
      '80053': ['80048'],
      '85025': ['85027'],
    },
    maxBenefits: {},
    timelyFilingDays: 365,
    copay: {
      'evaluation-management': 0,
      'surgery': 0,
      'radiology': 0,
      'pathology-lab': 0,
      'medicine': 0,
    },
    coinsurance: 0.20,
    deductible: 240,
  },
];

// ─── NCCI Bundling Edits (National Correct Coding Initiative) ────────────────

interface NCCIEdit {
  columnOne: string;
  columnTwo: string;
  modifierAllowed: boolean;
  reason: string;
}

const NCCI_EDITS: NCCIEdit[] = [
  { columnOne: '99214', columnTwo: '99213', modifierAllowed: false, reason: 'Cannot bill two E/M services same day for same patient' },
  { columnOne: '99215', columnTwo: '99214', modifierAllowed: false, reason: 'Cannot bill two E/M services same day for same patient' },
  { columnOne: '99215', columnTwo: '99213', modifierAllowed: false, reason: 'Cannot bill two E/M services same day for same patient' },
  { columnOne: '80053', columnTwo: '80048', modifierAllowed: false, reason: 'Comprehensive metabolic panel includes basic metabolic panel' },
  { columnOne: '85025', columnTwo: '85027', modifierAllowed: false, reason: 'CBC with diff includes CBC without diff' },
  { columnOne: '99214', columnTwo: '97110', modifierAllowed: true, reason: 'E/M and PT on same day requires modifier 25 on E/M' },
  { columnOne: '99214', columnTwo: '97140', modifierAllowed: true, reason: 'E/M and manual therapy on same day requires modifier 25 on E/M' },
  { columnOne: '99213', columnTwo: '97110', modifierAllowed: true, reason: 'E/M and PT on same day requires modifier 25 on E/M' },
  { columnOne: '97110', columnTwo: '97140', modifierAllowed: true, reason: 'Different PT modalities on same day allowed with modifier 59' },
];

// ─── Lookup Functions ────────────────────────────────────────────────────────

export function lookupICD10(query: string): ICD10Code[] {
  const q = query.toUpperCase().trim();
  return ICD10_DATABASE.filter(code =>
    code.code.toUpperCase().includes(q) ||
    code.description.toUpperCase().includes(q) ||
    code.category.toUpperCase().includes(q)
  );
}

export function getICD10ByCode(code: string): ICD10Code | undefined {
  return ICD10_DATABASE.find(c => c.code.toUpperCase() === code.toUpperCase());
}

export function lookupCPT(query: string): CPTCode[] {
  const q = query.toUpperCase().trim();
  return CPT_DATABASE.filter(code =>
    code.code.includes(q) ||
    code.description.toUpperCase().includes(q) ||
    code.category.includes(q.toLowerCase() as CPTCategory)
  );
}

export function getCPTByCode(code: string): CPTCode | undefined {
  return CPT_DATABASE.find(c => c.code === code);
}

export function getPayerPolicy(payerId: string): PayerPolicy | undefined {
  return PAYER_POLICIES.find(p => p.payerId === payerId);
}

export function getAllPayers(): Array<{ id: string; name: string }> {
  return PAYER_POLICIES.map(p => ({ id: p.payerId, name: p.payerName }));
}

// ─── Validation Functions ────────────────────────────────────────────────────

export function validateICD10Code(code: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const found = getICD10ByCode(code);

  if (!found) {
    errors.push(`ICD-10 code "${code}" not found in database`);
    // Check for partial matches
    const partialMatches = lookupICD10(code);
    if (partialMatches.length > 0) {
      warnings.push(`Did you mean: ${partialMatches.slice(0, 3).map(m => `${m.code} (${m.description})`).join(', ')}?`);
    }
    return { valid: false, errors, warnings };
  }

  if (found.specificity === 'category') {
    warnings.push(`Code ${code} is a category-level code. A more specific code may be required for billing.`);
  }

  if (found.excludes1 && found.excludes1.length > 0) {
    warnings.push(`Excludes1: This code cannot be used with ${found.excludes1.join(', ')}`);
  }

  if (found.useAdditionalCode && found.useAdditionalCode.length > 0) {
    warnings.push(`Use additional code: ${found.useAdditionalCode.join(', ')}`);
  }

  return { valid: true, errors, warnings };
}

export function validateCPTCode(code: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const found = getCPTByCode(code);

  if (!found) {
    errors.push(`CPT code "${code}" not found in database`);
    const partialMatches = lookupCPT(code);
    if (partialMatches.length > 0) {
      warnings.push(`Did you mean: ${partialMatches.slice(0, 3).map(m => `${m.code} (${m.description})`).join(', ')}?`);
    }
    return { valid: false, errors, warnings };
  }

  if (found.requiresPriorAuth) {
    warnings.push(`CPT ${code} typically requires prior authorization`);
  }

  return { valid: true, errors, warnings };
}

export function checkNCCIEdits(codes: string[]): Array<{ code1: string; code2: string; reason: string; modifierAllowed: boolean }> {
  const violations: Array<{ code1: string; code2: string; reason: string; modifierAllowed: boolean }> = [];

  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const edit = NCCI_EDITS.find(e =>
        (e.columnOne === codes[i] && e.columnTwo === codes[j]) ||
        (e.columnOne === codes[j] && e.columnTwo === codes[i])
      );
      if (edit) {
        violations.push({
          code1: codes[i],
          code2: codes[j],
          reason: edit.reason,
          modifierAllowed: edit.modifierAllowed,
        });
      }
    }
  }

  return violations;
}

export function checkDiagnosisProcedureMatch(icdCode: string, cptCode: string): { valid: boolean; reasoning: string } {
  const cpt = getCPTByCode(cptCode);
  if (!cpt) return { valid: false, reasoning: `CPT code ${cptCode} not found` };

  const icd = getICD10ByCode(icdCode);
  if (!icd) return { valid: false, reasoning: `ICD-10 code ${icdCode} not found` };

  if (cpt.commonDiagnoses.includes(icdCode)) {
    return { valid: true, reasoning: `ICD-10 ${icdCode} (${icd.description}) is a recognized diagnosis for CPT ${cptCode} (${cpt.description})` };
  }

  // Check partial matches by chapter
  const cptDiags = cpt.commonDiagnoses.map(d => getICD10ByCode(d)).filter(Boolean);
  const sameChapter = cptDiags.some(d => d && d.chapter === icd.chapter);

  if (sameChapter) {
    return { valid: true, reasoning: `ICD-10 ${icdCode} is in the same disease chapter as commonly linked diagnoses for CPT ${cptCode}. Medical necessity should be documented.` };
  }

  return { valid: false, reasoning: `ICD-10 ${icdCode} (${icd.description}) may not support medical necessity for CPT ${cptCode} (${cpt.description}). Verify clinical documentation.` };
}

export function checkPayerCoverage(
  payerId: string,
  cptCode: string,
  patientAge: number,
  patientGender: 'male' | 'female' | 'other'
): { covered: boolean; requiresPriorAuth: boolean; denialReasons: DenialReason[]; warnings: string[] } {
  const policy = getPayerPolicy(payerId);
  if (!policy) {
    return { covered: false, requiresPriorAuth: false, denialReasons: ['patient-ineligible'], warnings: ['Payer not found in database'] };
  }

  const denialReasons: DenialReason[] = [];
  const warnings: string[] = [];

  // Check if service is covered
  if (policy.excludedServices.includes(cptCode)) {
    denialReasons.push('non-covered-service');
  }

  if (!policy.coveredServices.includes(cptCode)) {
    denialReasons.push('non-covered-service');
    warnings.push(`CPT ${cptCode} is not listed as a covered service under ${policy.payerName}`);
  }

  // Check age limits
  const ageLimit = policy.ageLimits[cptCode];
  if (ageLimit) {
    if (ageLimit.minAge !== undefined && patientAge < ageLimit.minAge) {
      denialReasons.push('age-limit');
      warnings.push(`Patient age ${patientAge} is below minimum age ${ageLimit.minAge} for CPT ${cptCode}`);
    }
    if (ageLimit.maxAge !== undefined && patientAge > ageLimit.maxAge) {
      denialReasons.push('age-limit');
      warnings.push(`Patient age ${patientAge} exceeds maximum age ${ageLimit.maxAge} for CPT ${cptCode}`);
    }
  }

  // Check gender restrictions
  const genderRestriction = policy.genderRestrictions[cptCode];
  if (genderRestriction && !genderRestriction.includes(patientGender)) {
    denialReasons.push('gender-mismatch');
    warnings.push(`CPT ${cptCode} is restricted to ${genderRestriction.join('/')} patients for ${policy.payerName}`);
  }

  // Check prior auth
  const requiresPriorAuth = policy.priorAuthRequired.includes(cptCode);
  if (requiresPriorAuth) {
    warnings.push(`CPT ${cptCode} requires prior authorization under ${policy.payerName}`);
  }

  return {
    covered: denialReasons.length === 0,
    requiresPriorAuth,
    denialReasons: denialReasons.length > 0 ? denialReasons : ['none'],
    warnings,
  };
}

export function checkTimelyFiling(payerId: string, dateOfService: string, dateSubmitted: string): { timely: boolean; daysElapsed: number; daysAllowed: number } {
  const policy = getPayerPolicy(payerId);
  if (!policy) return { timely: false, daysElapsed: 0, daysAllowed: 0 };

  const dos = new Date(dateOfService);
  const submitted = new Date(dateSubmitted);
  const daysElapsed = Math.floor((submitted.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24));

  return {
    timely: daysElapsed <= policy.timelyFilingDays,
    daysElapsed,
    daysAllowed: policy.timelyFilingDays,
  };
}

export function getMedicalNecessityCriteria(payerId: string, cptCode: string): string[] {
  const policy = getPayerPolicy(payerId);
  if (!policy) return [];
  return policy.medicalNecessityCriteria[cptCode] || [];
}

export function calculateAllowedAmount(payerId: string, cptCode: string, chargedAmount: number): { allowedAmount: number; copay: number; coinsurance: number; patientResponsibility: number } {
  const policy = getPayerPolicy(payerId);
  const cpt = getCPTByCode(cptCode);
  if (!policy || !cpt) {
    return { allowedAmount: 0, copay: 0, coinsurance: 0, patientResponsibility: chargedAmount };
  }

  // Simplified fee schedule: RVU * conversion factor ($36.04 CMS 2024)
  const conversionFactor = 36.04;
  const feeScheduleAmount = cpt.rvu > 0 ? cpt.rvu * conversionFactor : chargedAmount;
  const allowedAmount = Math.min(chargedAmount, feeScheduleAmount);
  const copay = policy.copay[cpt.category] || 0;
  const afterCopay = Math.max(0, allowedAmount - copay);
  const coinsuranceAmount = afterCopay * policy.coinsurance;
  const patientResponsibility = copay + coinsuranceAmount;

  return {
    allowedAmount: Math.round(allowedAmount * 100) / 100,
    copay,
    coinsurance: Math.round(coinsuranceAmount * 100) / 100,
    patientResponsibility: Math.round(patientResponsibility * 100) / 100,
  };
}
