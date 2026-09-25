import { describe, it, expect } from 'vitest';
import {
  calculateContrastRatio,
  evaluateWcagCompliance,
  getRelativeLuminance,
} from '../utils/accessibilityUtils';

describe('Accessibility & WCAG 2.1 Compliance Engine', () => {
  it('should compute exact relative luminance for black and white', () => {
    const whiteLum = getRelativeLuminance('#ffffff');
    const blackLum = getRelativeLuminance('#000000');

    expect(whiteLum).toBeCloseTo(1.0, 2);
    expect(blackLum).toBeCloseTo(0.0, 2);
  });

  it('should verify 21:1 contrast ratio for black on white', () => {
    const ratio = calculateContrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21.0, 0);

    const evalResult = evaluateWcagCompliance('#000000', '#ffffff');
    expect(evalResult.passesAA).toBe(true);
    expect(evalResult.passesAAA).toBe(true);
  });

  it('should flag low-contrast color pairs failing WCAG AA (ratio < 4.5:1)', () => {
    // Light gray text (#999999) on white background (#ffffff)
    const evalResult = evaluateWcagCompliance('#999999', '#ffffff');

    expect(evalResult.ratio).toBeLessThan(4.5);
    expect(evalResult.passesAA).toBe(false);
  });

  it('should validate accessible clinical status badge contrasts', () => {
    // Bio-SentinelX clinical dark theme: dark blue background (#0f172a) with high contrast text (#f8fafc)
    const evalResult = evaluateWcagCompliance('#f8fafc', '#0f172a');

    expect(evalResult.ratio).toBeGreaterThan(10.0);
    expect(evalResult.passesAA).toBe(true);
    expect(evalResult.passesAAA).toBe(true);
  });
});
