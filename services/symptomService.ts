import { HealthAlert, WeatherData, LifestyleData } from '../types';
import { appendSymptomEntry, SymptomSeverity } from './memoryService';
import { loadLifestyleData } from './personalizationService';

let _symSeq = 0;
const symptomId = () => `symptom_${Date.now()}_${++_symSeq}`;

const SYMPTOM_HINT = /(i feel|i'm feeling|i am feeling|symptom|pain|cough|fever|breath|wheeze|vomit|diarrh|dizzy|rash|hives|swelling|faint|headache|migraine|chest)/i;

const CRITICAL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /chest\s*(pain|tightness|pressure)/i, label: 'chest pain/tightness' },
  { re: /(shortness of breath|difficulty breathing|can\s*'?t\s*breathe|severe wheez)/i, label: 'breathing difficulty' },
  { re: /(faint(ed|ing)|passed\s*out|loss of consciousness)/i, label: 'fainting' },
  { re: /(seizure|convulsion)/i, label: 'seizure' },
  { re: /(stroke|face droop|slurred speech|one[-\s]?sided weakness|sudden numbness)/i, label: 'stroke-like symptoms' },
  { re: /(coughing up blood|blood in (vomit|stool|urine))/i, label: 'bleeding' },
  { re: /(anaphylaxis|throat swelling|tongue swelling|severe allergic reaction)/i, label: 'severe allergic reaction' },
  { re: /(confus(ed|ion)|disoriented|can\s*'?t\s*stay awake)/i, label: 'confusion' },
];

const WARNING_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /(fever|temperature)\s*(of|:)?\s*([3-4][0-9](\.[0-9])?)/i, label: 'high fever' },
  { re: /(persistent cough|wheez|asthma)/i, label: 'respiratory symptoms' },
  { re: /(vomit|vomiting|diarrh)/i, label: 'GI symptoms' },
  { re: /(rash|hives|itching|swelling)/i, label: 'possible allergy' },
  { re: /(dizzy|dizziness|lightheaded)/i, label: 'dizziness' },
];

function classifySeverity(text: string): { severity: SymptomSeverity | null; label: string | null } {
  for (const p of CRITICAL_PATTERNS) {
    if (p.re.test(text)) return { severity: 'critical', label: p.label };
  }
  for (const p of WARNING_PATTERNS) {
    if (p.re.test(text)) return { severity: 'warning', label: p.label };
  }
  return { severity: null, label: null };
}

function summarizeProfile(lifestyle: LifestyleData | null): string {
  if (!lifestyle) return '';
  const parts: string[] = [];
  if (lifestyle.medicalHistory && lifestyle.medicalHistory !== 'None') parts.push(lifestyle.medicalHistory);
  if (lifestyle.allergies && lifestyle.allergies !== 'None') parts.push(`allergies: ${lifestyle.allergies}`);
  return parts.length ? parts.join('; ') : '';
}

export function maybeCreateSymptomAlertFromText(userText: string, weather?: WeatherData | null): HealthAlert | null {
  const text = userText.trim();
  if (!text) return null;

  // Only consider logging/alerts if message looks symptom-related.
  if (!SYMPTOM_HINT.test(text)) return null;

  const { severity, label } = classifySeverity(text);
  const lifestyle = loadLifestyleData();

  // Always store a symptom entry if it looks like symptoms.
  appendSymptomEntry({
    text,
    city: weather?.city,
    severity: severity ?? 'info',
    tags: label ? [label] : undefined,
  });

  if (!severity) return null;

  const id = symptomId();
  const now = Date.now();
  const profile = summarizeProfile(lifestyle);
  const city = weather?.city ? ` in ${weather.city}` : '';

  const title = severity === 'critical'
    ? `Urgent symptom check: ${label ?? 'serious symptoms'}`
    : `Symptom warning: ${label ?? 'check your symptoms'}`;

  const messageBase = `You reported ${label ?? 'symptoms'}${city}: "${text.slice(0, 140)}".`;
  const message = severity === 'critical'
    ? `${messageBase} This may be serious. Consider seeking urgent medical care or contacting local emergency services if symptoms are severe, worsening, or you feel unsafe.`
    : `${messageBase} Monitor closely. If symptoms worsen, persist, or you have underlying conditions, consider contacting a clinician.`;

  const tipProfile = profile ? `Saved profile note: ${profile}. ` : '';
  const weatherNote = weather ? `Current conditions: ${weather.temp}°C, humidity ${weather.humidity}%, AQI ${weather.rawAqi ?? weather.aqi}.` : '';

  const healthTip = severity === 'critical'
    ? `${tipProfile}${weatherNote} If you have chest pain, severe breathing trouble, confusion, or fainting, treat this as urgent.`.trim()
    : `${tipProfile}${weatherNote} Rest, hydrate, and avoid triggers (smoke/pollution/heat) if relevant.`.trim();

  return {
    id,
    severity,
    category: 'general',
    session: 'realtime',
    title,
    message,
    healthTip,
    emoji: severity === 'critical' ? '🚑' : '🩺',
    factor: 'Symptoms',
    value: label ?? 'User-reported symptoms',
    timestamp: now,
    read: false,
  };
}
