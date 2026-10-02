import { describe, it, expect } from 'vitest';
import {
  serializePatientToFHIR,
  serializeObservationToFHIR,
  serializePredictionToRiskAssessment,
  createFHIRBundle,
} from '../services/fhirService';

describe('HL7 FHIR R4 Serializer', () => {
  it('should serialize patient demographics to valid FHIR Patient resource', () => {
    const patient = serializePatientToFHIR('pt-101', 'male', '1985-06-15');

    expect(patient.resourceType).toBe('Patient');
    expect(patient.id).toBe('pt-101');
    expect(patient.gender).toBe('male');
    expect(patient.birthDate).toBe('1985-06-15');
    expect(patient.active).toBe(true);
  });

  it('should serialize clinical vitals with standard LOINC coding', () => {
    const obs = serializeObservationToFHIR('pt-101', 'temperature', 38.6);

    expect(obs.resourceType).toBe('Observation');
    expect(obs.status).toBe('final');
    expect(obs.subject.reference).toBe('Patient/pt-101');
    expect(obs.code.coding[0].system).toBe('http://loinc.org');
    expect(obs.code.coding[0].code).toBe('8310-5');
    expect(obs.valueQuantity?.value).toBe(38.6);
    expect(obs.valueQuantity?.unit).toBe('Cel');
  });

  it('should serialize ML disease prediction to FHIR RiskAssessment', () => {
    const risk = serializePredictionToRiskAssessment('pt-101', 'Dengue', 0.84, 'A90');

    expect(risk.resourceType).toBe('RiskAssessment');
    expect(risk.subject.reference).toBe('Patient/pt-101');
    expect(risk.prediction[0].probabilityDecimal).toBe(0.84);
    expect(risk.prediction[0].outcome.coding[0].code).toBe('A90');
    expect(risk.prediction[0].qualitativeRisk?.text).toBe('High Risk');
  });

  it('should bundle multiple clinical resources into an interchange FHIR Bundle', () => {
    const patient = serializePatientToFHIR('pt-202');
    const obs = serializeObservationToFHIR('pt-202', 'heart_rate', 110);
    const risk = serializePredictionToRiskAssessment('pt-202', 'Influenza', 0.65, 'J10');

    const bundle = createFHIRBundle([patient, obs, risk]);

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.total).toBe(3);
    expect(bundle.entry.length).toBe(3);
    expect(bundle.entry[0].resource.resourceType).toBe('Patient');
  });
});
