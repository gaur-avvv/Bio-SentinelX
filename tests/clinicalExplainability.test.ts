import { describe, it, expect } from 'vitest';
import { computeLocalShapExplanation } from '../services/clinicalExplainabilityService';

describe('Clinical Explainability & Feature Attribution Engine', () => {
  it('should identify primary clinical risk drivers with proportional Shapley weights', () => {
    // Simulated patient with high fever and nausea
    const patient = {
      body_temp: 39.5,
      nausea: 1,
      joint_pain: 0,
      humidity: 0.85,
    };

    // Baseline population
    const baseline = [
      { body_temp: 37.0, nausea: 0, joint_pain: 0, humidity: 0.60 },
      { body_temp: 36.8, nausea: 0, joint_pain: 0, humidity: 0.55 },
      { body_temp: 37.1, nausea: 0, joint_pain: 1, humidity: 0.65 },
    ];

    // Dummy predictor where temp > 38 and nausea > 0 increase Dengue risk
    const predictor = (sample: Record<string, number>) => {
      let risk = 0.1;
      if (sample.body_temp > 38.0) risk += 0.5;
      if (sample.nausea === 1) risk += 0.3;
      return Math.min(1.0, risk);
    };

    const explanation = computeLocalShapExplanation(patient, baseline, predictor, 'Dengue');

    expect(explanation.disease).toBe('Dengue');
    expect(explanation.predictedProbability).toBeGreaterThan(0.8);
    expect(explanation.topRiskFactors.length).toBeGreaterThan(0);

    const topFeature = explanation.topRiskFactors[0];
    expect(['body_temp', 'nausea']).toContain(topFeature.feature);
    expect(topFeature.direction).toBe('risk_increasing');
    expect(explanation.clinicalSummary).toContain(topFeature.feature);
  });

  it('should generate empty attributions gracefully when dataset is empty', () => {
    const explanation = computeLocalShapExplanation({}, [], () => 0.5, 'Influenza');
    expect(explanation.attributions.length).toBe(0);
    expect(explanation.clinicalSummary).toContain('Insufficient data');
  });
});
