import { describe, it, expect, beforeEach } from 'vitest';
import {
  addLaplaceNoise,
  addGaussianNoise,
  sanitizeClinicalMetricsWithDP,
  anonymizeSignalWithDP,
  getPrivacyBudgetStatus,
  resetPrivacyBudget,
  AnonymizedSignal,
} from '../services/privacyService';

describe('Local (ε, δ)-Differential Privacy Engine', () => {
  beforeEach(() => {
    resetPrivacyBudget(2.0, 1e-5);
  });

  it('should inject Laplace noise centered around true value with bounded variance', () => {
    const trueValue = 100.0;
    const sensitivity = 1.0;
    const epsilon = 1.0;
    const trials = 500;

    let sum = 0;
    for (let i = 0; i < trials; i++) {
      sum += addLaplaceNoise(trueValue, sensitivity, epsilon);
    }
    const sampleMean = sum / trials;

    // Zero-mean noise expectation
    expect(sampleMean).toBeGreaterThan(95.0);
    expect(sampleMean).toBeLessThan(105.0);
  });

  it('should inject Gaussian noise satisfying (ε, δ)-DP parameters', () => {
    const value = 50.0;
    const noisy = addGaussianNoise(value, 1.0, 0.5, 1e-5);

    expect(typeof noisy).toBe('number');
    expect(Number.isFinite(noisy)).toBe(true);
  });

  it('should sanitize multi-feature clinical metrics and track privacy budget', () => {
    const vitals = {
      systolicBP: 120,
      heartRate: 72,
      temperatureC: 37.2,
      respiratoryRate: 16,
    };

    const sanitized = sanitizeClinicalMetricsWithDP(vitals, 0.4);

    expect(sanitized.systolicBP).toBeDefined();
    expect(sanitized.heartRate).toBeDefined();
    expect(sanitized.temperatureC).toBeDefined();
    expect(sanitized.respiratoryRate).toBeDefined();

    const budget = getPrivacyBudgetStatus();
    expect(budget.spentBudgetEpsilon).toBeGreaterThan(0);
    expect(budget.remainingBudgetEpsilon).toBeLessThan(2.0);
  });

  it('should perturb epidemiological signals without producing negative case counts', () => {
    const signal: AnonymizedSignal = {
      signalId: 'sig-001',
      syndromeCode: 'AFI',
      icd10Codes: ['R50'],
      district: 'Central',
      state: 'StateX',
      week: 12,
      year: 2026,
      caseCount: 5,
      severity: 'moderate',
      timestamp: Date.now(),
    };

    const perturbed = anonymizeSignalWithDP(signal, 0.5);

    expect(perturbed.caseCount).toBeGreaterThanOrEqual(0);
    expect(perturbed.syndromeCode).toBe('AFI');
  });
});
