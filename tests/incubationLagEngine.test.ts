import { describe, it, expect } from 'vitest';
import {
  calculatePearsonR,
  computeDistributedCrossCorrelation,
  analyzeIncubationLag,
} from '../services/incubationLagEngine';

describe('Epidemiological Incubation Time-Lag Engine', () => {
  it('should compute exact Pearson correlation of 1.0 for identical series', () => {
    const s1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s2 = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

    const r = calculatePearsonR(s1, s2);
    expect(r).toBeCloseTo(1.0, 4);
  });

  it('should detect simulated Dengue 7-day incubation lag peak', () => {
    // Generate 35 days of synthetic rainfall shock with peak on day 5
    const days = 35;
    const rainfall: number[] = new Array(days).fill(5);
    rainfall[5] = 120; // heavy rainfall spike on day 5

    // Dengue case spike occurs with a 7-day biological incubation lag (day 12)
    const cases: number[] = new Array(days).fill(2);
    cases[12] = 85;

    const analysis = analyzeIncubationLag('Dengue', rainfall, cases, 14);

    expect(analysis.optimalLagDays).toBe(7);
    expect(analysis.peakCorrelation).toBeGreaterThan(0.7);
    expect(analysis.isClinicallyPlausible).toBe(true);
    expect(analysis.leadTimeDays).toBe(7);
  });

  it('should flag anomalies when lag falls outside WHO incubation windows', () => {
    const days = 30;
    const heat: number[] = new Array(days).fill(25);
    heat[3] = 48; // heat spike on day 3

    // Late cases on day 23 (20 days lag - biologically implausible for acute heatstroke)
    const cases: number[] = new Array(days).fill(1);
    cases[23] = 60;

    const analysis = analyzeIncubationLag('Heat Stroke', heat, cases, 21);

    expect(analysis.isClinicallyPlausible).toBe(false);
  });
});
