/**
 * Bio-SentinelX — HL7 FHIR Release 4 Clinical Resource Serializer
 *
 * Implements standard HL7 FHIR R4 schema serialization for clinical data:
 * - Patient: Demographics and identifiers
 * - Observation: Vital signs, environmental exposures, symptom biomarkers (LOINC coded)
 * - RiskAssessment: Machine learning disease predictions & clinical risk stratification (SNOMED-CT / ICD-10)
 * - Bundle: Interchange collections for hospital EHR integrations (Epic, Cerner, OpenMRS)
 */

export interface FHIRCoding {
  system: string;
  code: string;
  display: string;
}

export interface FHIRCodeableConcept {
  coding: FHIRCoding[];
  text?: string;
}

export interface FHIRQuantity {
  value: number;
  unit: string;
  system: string;
  code: string;
}

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  active: boolean;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
}

export interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status: 'preliminary' | 'final' | 'amended';
  category?: FHIRCodeableConcept[];
  code: FHIRCodeableConcept;
  subject: { reference: string };
  effectiveDateTime: string;
  valueQuantity?: FHIRQuantity;
  valueString?: string;
}

export interface FHIRRiskAssessmentPrediction {
  outcome: FHIRCodeableConcept;
  probabilityDecimal: number;
  qualitativeRisk?: FHIRCodeableConcept;
  rationale?: string;
}

export interface FHIRRiskAssessment {
  resourceType: 'RiskAssessment';
  id: string;
  status: 'preliminary' | 'final';
  subject: { reference: string };
  occurrenceDateTime: string;
  method: FHIRCodeableConcept;
  prediction: FHIRRiskAssessmentPrediction[];
}

export interface FHIRBundleEntry {
  fullUrl: string;
  resource: FHIRPatient | FHIRObservation | FHIRRiskAssessment;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  id: string;
  type: 'collection' | 'transaction' | 'document';
  timestamp: string;
  total: number;
  entry: FHIRBundleEntry[];
}

// ─── LOINC Code Dictionary for Common Epidemiological Vitals ─────────────────
const LOINC_CODES: Record<string, { code: string; display: string; unit: string; unitCode: string }> = {
  temperature: { code: '8310-5', display: 'Body temperature', unit: 'Cel', unitCode: 'Cel' },
  heart_rate: { code: '8867-4', display: 'Heart rate', unit: '/min', unitCode: '/min' },
  systolic_bp: { code: '8480-6', display: 'Systolic blood pressure', unit: 'mm[Hg]', unitCode: 'mm[Hg]' },
  oxygen_sat: { code: '59408-5', display: 'Oxygen saturation in Arterial blood', unit: '%', unitCode: '%' },
  ambient_temp: { code: '60832-3', display: 'Ambient air temperature', unit: 'Cel', unitCode: 'Cel' },
  humidity: { code: '60833-1', display: 'Relative humidity', unit: '%', unitCode: '%' },
};

/**
 * Serializes a clinical patient record into FHIR Patient R4 format.
 */
export function serializePatientToFHIR(patientId: string, gender?: 'male' | 'female' | 'other', birthDate?: string): FHIRPatient {
  return {
    resourceType: 'Patient',
    id: patientId,
    active: true,
    gender,
    birthDate,
  };
}

/**
 * Serializes a numeric biomarker or weather observation to FHIR Observation R4.
 */
export function serializeObservationToFHIR(
  patientId: string,
  metricType: string,
  value: number,
  customUnit?: string
): FHIRObservation {
  const dict = LOINC_CODES[metricType] || {
    code: 'CUSTOM-01',
    display: metricType,
    unit: customUnit || '',
    unitCode: customUnit || '',
  };

  return {
    resourceType: 'Observation',
    id: `obs-${metricType}-${Date.now()}`,
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: dict.code,
          display: dict.display,
        },
      ],
      text: dict.display,
    },
    subject: {
      reference: `Patient/${patientId}`,
    },
    effectiveDateTime: new Date().toISOString(),
    valueQuantity: {
      value: Number(value.toFixed(2)),
      unit: dict.unit,
      system: 'http://unitsofmeasure.org',
      code: dict.unitCode,
    },
  };
}

/**
 * Serializes an in-browser ML disease prediction into FHIR RiskAssessment R4.
 */
export function serializePredictionToRiskAssessment(
  patientId: string,
  diseaseName: string,
  probability: number,
  icd10Code = 'R69',
  algorithm = 'XGBoost Clinical Engine'
): FHIRRiskAssessment {
  const qualitative =
    probability > 0.7 ? 'High Risk' : probability > 0.4 ? 'Moderate Risk' : 'Low Risk';

  return {
    resourceType: 'RiskAssessment',
    id: `risk-${Date.now()}`,
    status: 'final',
    subject: {
      reference: `Patient/${patientId}`,
    },
    occurrenceDateTime: new Date().toISOString(),
    method: {
      coding: [
        {
          system: 'https://bio-sentinelx.org/algorithms',
          code: algorithm.toLowerCase().replace(/\s+/g, '-'),
          display: algorithm,
        },
      ],
      text: algorithm,
    },
    prediction: [
      {
        outcome: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-10',
              code: icd10Code,
              display: diseaseName,
            },
          ],
          text: diseaseName,
        },
        probabilityDecimal: Number(probability.toFixed(4)),
        qualitativeRisk: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability',
              code: qualitative.toLowerCase().replace(/\s+/g, '-'),
              display: qualitative,
            },
          ],
          text: qualitative,
        },
        rationale: `Bio-SentinelX real-time assessment indicates ${qualitative} (${(probability * 100).toFixed(1)}%) for ${diseaseName}.`,
      },
    ],
  };
}

/**
 * Creates an HL7 FHIR Bundle collection for clinical EHR integration.
 */
export function createFHIRBundle(
  resources: Array<FHIRPatient | FHIRObservation | FHIRRiskAssessment>,
  bundleType: 'collection' | 'transaction' = 'collection'
): FHIRBundle {
  return {
    resourceType: 'Bundle',
    id: `bundle-${Date.now()}`,
    type: bundleType,
    timestamp: new Date().toISOString(),
    total: resources.length,
    entry: resources.map(res => ({
      fullUrl: `urn:uuid:${res.id}`,
      resource: res,
    })),
  };
}
