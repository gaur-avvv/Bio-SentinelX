import { LifestyleData, WeatherData, HealthAlert } from '../types';
import { getRecentSymptoms, SymptomEntry } from './memoryService';

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function loadLifestyleData(): LifestyleData | null {
  try {
    return safeJsonParse<LifestyleData>(localStorage.getItem('biosentinel_lifestyle_data'));
  } catch {
    return null;
  }
}

function normalizeProfileBits(lifestyle: LifestyleData | null): string[] {
  if (!lifestyle) return [];
  const bits: string[] = [];
  if (lifestyle.age) bits.push(`Age: ${lifestyle.age}`);
  if (lifestyle.gender) bits.push(`Gender: ${lifestyle.gender}`);
  if (lifestyle.medicalHistory && lifestyle.medicalHistory !== 'None') bits.push(`Medical history: ${lifestyle.medicalHistory}`);
  if (lifestyle.allergies && lifestyle.allergies !== 'None') bits.push(`Allergies: ${lifestyle.allergies}`);
  if (lifestyle.lifestyle) bits.push(`Lifestyle: ${lifestyle.lifestyle}`);
  return bits;
}

function symptomLabel(e: SymptomEntry): string {
  const t = e.text.toLowerCase();
  if (/shortness of breath|difficulty breathing|wheez/.test(t)) return 'breathing symptoms';
  if (/chest pain|tightness/.test(t)) return 'chest symptoms';
  if (/fever|temperature/.test(t)) return 'fever';
  if (/cough/.test(t)) return 'cough';
  if (/headache|migraine/.test(t)) return 'headache';
  if (/rash|hives|swelling/.test(t)) return 'allergic reaction';
  return 'symptoms';
}

export function buildAIUserContext(weather?: WeatherData | null): string {
  const lifestyle = loadLifestyleData();
  const symptoms = getRecentSymptoms(3);

  const parts: string[] = [];
  const profileBits = normalizeProfileBits(lifestyle);
  if (profileBits.length) parts.push(`Saved profile: ${profileBits.join(' | ')}`);

  if (symptoms.length) {
    const top = symptoms[0];
    parts.push(`Recent user-reported ${symptomLabel(top)}: ${top.text.slice(0, 120)}`);
  }

  if (weather?.city) parts.push(`Current city: ${weather.city}`);

  return parts.join(' / ').trim();
}

function hasRespiratoryHistory(lifestyle: LifestyleData | null): boolean {
  const mh = (lifestyle?.medicalHistory ?? '').toLowerCase();
  return /asthma|copd|bronch|lung|respir/.test(mh);
}

function hasAllergyHistory(lifestyle: LifestyleData | null): boolean {
  const a = (lifestyle?.allergies ?? '').toLowerCase();
  const mh = (lifestyle?.medicalHistory ?? '').toLowerCase();
  return a !== 'none' && a.trim().length > 0 || /allerg/.test(mh);
}

/**
 * Light, deterministic personalization for weather alerts.
 * Works even when AI enrichment is disabled.
 */
export function personalizeAlertsInPlace(alerts: HealthAlert[], weather?: WeatherData | null): void {
  const lifestyle = loadLifestyleData();
  const recent = getRecentSymptoms(2);
  const recentText = recent[0]?.text?.toLowerCase() ?? '';

  for (const a of alerts) {
    // Don't re-personalize symptom alerts themselves.
    if (a.id.startsWith('symptom_') || a.factor.toLowerCase().includes('symptom')) continue;

    const extra: string[] = [];

    if (a.category === 'airQuality' && hasRespiratoryHistory(lifestyle)) {
      extra.push('Your saved respiratory history may increase sensitivity today.');
    }
    if (a.category === 'pollen' && hasAllergyHistory(lifestyle)) {
      extra.push('Your saved allergy history suggests higher reaction risk.');
    }
    if ((a.category === 'humidity' || a.category === 'heatIndex' || a.category === 'temperature') && hasRespiratoryHistory(lifestyle)) {
      extra.push('Breathing symptoms can worsen in these conditions.');
    }

    if (recentText && (a.category === 'airQuality' || a.category === 'humidity') && /wheez|breath|cough|chest/.test(recentText)) {
      extra.push('You recently reported breathing-related symptoms — take extra caution outdoors.');
    }

    if (extra.length) {
      a.message = `${a.message} ${extra.join(' ')}`.trim();
      a.healthTip = `${extra[0]} ${a.healthTip}`.trim();
    }
  }
}
