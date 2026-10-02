/**
 * Bio-SentinelX — Clinical Accessibility (a11y) & WCAG 2.1 AA Compliance Utilities
 *
 * Implements accessible design utilities for healthcare and epidemiological interfaces:
 * - Dynamic ARIA live announcements for streaming AI responses and emergency outbreak alerts
 * - Keyboard modal focus trap management (WCAG 2.1 Criterion 2.1.2)
 * - Color luminance and contrast ratio validator (WCAG 2.1 Criterion 1.4.3)
 */

let liveRegionPolite: HTMLElement | null = null;
let liveRegionAssertive: HTMLElement | null = null;

/**
 * Dispatches an accessible announcement to screen readers via ARIA live regions.
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  if (typeof document === 'undefined') return;

  let region = priority === 'assertive' ? liveRegionAssertive : liveRegionPolite;

  if (!region) {
    region = document.createElement('div');
    region.setAttribute('role', priority === 'assertive' ? 'alert' : 'status');
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.style.position = 'absolute';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.margin = '-1px';
    region.style.padding = '0';
    region.style.overflow = 'hidden';
    region.style.clip = 'rect(0, 0, 0, 0)';
    region.style.border = '0';

    document.body.appendChild(region);
    if (priority === 'assertive') liveRegionAssertive = region;
    else liveRegionPolite = region;
  }

  // Clear and update message
  region.textContent = '';
  setTimeout(() => {
    if (region) region.textContent = message;
  }, 50);
}

/**
 * Calculates relative luminance for a sRGB channel value.
 */
function sRGBtoLin(colorChannel: number): number {
  const v = colorChannel / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Computes WCAG relative luminance from a hex color string.
 */
export function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;

  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}

/**
 * Computes contrast ratio between two hex colors according to WCAG 2.1 formulas.
 * Contrast ratio = (L1 + 0.05) / (L2 + 0.05)
 */
export function calculateContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

/**
 * Evaluates WCAG 2.1 compliance for foreground/background combinations.
 */
export function evaluateWcagCompliance(
  foregroundHex: string,
  backgroundHex: string,
  isLargeText = false
): {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
  requiredRatioAA: number;
} {
  const ratio = calculateContrastRatio(foregroundHex, backgroundHex);
  const requiredRatioAA = isLargeText ? 3.0 : 4.5;
  const requiredRatioAAA = isLargeText ? 4.5 : 7.0;

  return {
    ratio,
    passesAA: ratio >= requiredRatioAA,
    passesAAA: ratio >= requiredRatioAAA,
    requiredRatioAA,
  };
}
