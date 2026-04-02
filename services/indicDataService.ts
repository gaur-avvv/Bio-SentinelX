/**
 * Bio-SentinelX — Indian Context Data Acquisition Service (Phase 1)
 *
 * Manages datasets and data pipelines for the Indian healthcare context:
 *   - IndicLLMSuite / Sangraha (251B tokens across 22 languages)
 *   - DISPLACE-M (Bhashini) field conversations
 *   - EpiClim district-wise outbreak + climate data
 *   - IDSP weekly syndromic reports (11 epidemic-prone syndromes)
 *
 * All processing runs client-side; raw patient data never leaves the device.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type IndicLanguage =
  | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu' | 'kn' | 'ml'
  | 'pa' | 'or' | 'as' | 'ur' | 'bho' | 'mag' | 'mai'
  | 'sa' | 'ne' | 'sd' | 'kok' | 'doi' | 'mni' | 'en';

export const INDIC_LANGUAGE_LABELS: Record<IndicLanguage, string> = {
  hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
  mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam',
  pa: 'Punjabi', or: 'Odia', as: 'Assamese', ur: 'Urdu',
  bho: 'Bhojpuri', mag: 'Magahi', mai: 'Maithili',
  sa: 'Sanskrit', ne: 'Nepali', sd: 'Sindhi',
  kok: 'Konkani', doi: 'Dogri', mni: 'Manipuri', en: 'English',
};

export interface IndicDataSource {
  id: string;
  name: string;
  category: 'language' | 'field_conversation' | 'outbreak' | 'clinical';
  description: string;
  languages: IndicLanguage[];
  url: string;
  tokenCount?: string;
  coverage?: string;
}

export interface IDSPSyndrome {
  id: string;
  name: string;
  icd10Codes: string[];
  keywords: string[];
  hindiKeywords: string[];
  severity: 'low' | 'moderate' | 'high' | 'critical';
}

export interface EpiClimRecord {
  district: string;
  state: string;
  week: number;
  year: number;
  syndrome: string;
  caseCount: number;
  temperature: number;
  precipitation: number;
  humidity: number;
  lai: number; // Leaf Area Index
}

export interface FieldConversation {
  id: string;
  text: string;
  language: IndicLanguage;
  district: string;
  state: string;
  timestamp: number;
  extractedSyndromes: string[];
  icd10Codes: string[];
  confidence: number;
}

export interface IndicDataStats {
  totalConversations: number;
  totalSyndromes: number;
  languageCoverage: Record<string, number>;
  districtsCovered: number;
  lastUpdated: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const INDIC_DATA_SOURCES: IndicDataSource[] = [
  {
    id: 'indicllmsuite',
    name: 'IndicLLMSuite / Sangraha',
    category: 'language',
    description: '251B tokens across 22 scheduled Indian languages. Includes IndicAlign instruction-response pairs for medical domain fine-tuning.',
    languages: ['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur'],
    url: 'https://huggingface.co/datasets/ai4bharat/sangraha',
    tokenCount: '251B',
    coverage: '22 languages',
  },
  {
    id: 'displace_m',
    name: 'DISPLACE-M (Bhashini)',
    category: 'field_conversation',
    description: 'Real-world frontline health conversations recorded in rural India. Captures informal speech patterns in Hindi, Bhojpuri, and Magahi dialects.',
    languages: ['hi', 'bho', 'mag'],
    url: 'https://bhashini.gov.in/ulca/model/explore-models',
    coverage: 'Rural health conversations',
  },
  {
    id: 'epiclim',
    name: 'EpiClim',
    category: 'outbreak',
    description: 'District-wise weekly epidemiological reports from 2009-present, merging IDSP data with climate variables (LAI, Temperature, Precipitation).',
    languages: ['en', 'hi'],
    url: 'https://idsp.mohfw.gov.in',
    coverage: '2009-present, all districts',
  },
  {
    id: 'idsp',
    name: 'IDSP Weekly Reports',
    category: 'clinical',
    description: 'Mandatory weekly reporting from all 36 States/UTs covering 11 epidemic-prone syndromes under Integrated Disease Surveillance Programme.',
    languages: ['en', 'hi'],
    url: 'https://idsp.mohfw.gov.in/index4.php?lang=1&level=0&linkid=406&lid=3689',
    coverage: '36 States/UTs, 11 syndromes',
  },
];

/**
 * 11 IDSP/WHO Integrated Disease Surveillance syndromes
 * mapped to ICD-10 codes and Hindi keywords for extraction.
 */
export const IDSP_SYNDROMES: IDSPSyndrome[] = [
  {
    id: 'awd',
    name: 'Acute Watery Diarrhea',
    icd10Codes: ['A00', 'A09', 'K52.9'],
    keywords: ['diarrhea', 'watery stool', 'loose motion', 'dehydration', 'cholera'],
    hindiKeywords: ['दस्त', 'पतले दस्त', 'उल्टी दस्त', 'लूज मोशन', 'पानी जैसा मल'],
    severity: 'high',
  },
  {
    id: 'abd',
    name: 'Acute Bloody Diarrhea (Dysentery)',
    icd10Codes: ['A03', 'A06.0', 'A09'],
    keywords: ['bloody stool', 'dysentery', 'blood in stool', 'mucus stool'],
    hindiKeywords: ['खूनी दस्त', 'पेचिश', 'खून आना मल में'],
    severity: 'high',
  },
  {
    id: 'afi',
    name: 'Acute Febrile Illness',
    icd10Codes: ['R50.9', 'A90', 'A91', 'B50', 'B54'],
    keywords: ['fever', 'high temperature', 'chills', 'rigor', 'malaria', 'dengue'],
    hindiKeywords: ['बुखार', 'तेज बुखार', 'ठंड लगना', 'कंपकंपी', 'मलेरिया', 'डेंगू'],
    severity: 'moderate',
  },
  {
    id: 'ari',
    name: 'Acute Respiratory Infection',
    icd10Codes: ['J06', 'J18', 'J22', 'J20'],
    keywords: ['cough', 'cold', 'pneumonia', 'breathing difficulty', 'sore throat'],
    hindiKeywords: ['खांसी', 'जुकाम', 'निमोनिया', 'सांस लेने में तकलीफ', 'गले में खराश'],
    severity: 'moderate',
  },
  {
    id: 'meningitis',
    name: 'Meningitis / Encephalitis',
    icd10Codes: ['G03', 'A87', 'B05.1'],
    keywords: ['neck stiffness', 'headache', 'altered consciousness', 'meningitis'],
    hindiKeywords: ['गर्दन अकड़ना', 'सिरदर्द', 'बेहोशी', 'मेनिनजाइटिस'],
    severity: 'critical',
  },
  {
    id: 'measles',
    name: 'Measles',
    icd10Codes: ['B05'],
    keywords: ['rash', 'fever with rash', 'measles', 'koplik spots'],
    hindiKeywords: ['खसरा', 'दाने', 'बुखार के साथ दाने'],
    severity: 'high',
  },
  {
    id: 'jaundice',
    name: 'Acute Jaundice Syndrome',
    icd10Codes: ['R17', 'B15', 'B16', 'B17'],
    keywords: ['yellow eyes', 'jaundice', 'hepatitis', 'yellow skin', 'dark urine'],
    hindiKeywords: ['पीलिया', 'आंखें पीली', 'हेपेटाइटिस', 'गहरा पेशाब'],
    severity: 'high',
  },
  {
    id: 'afp',
    name: 'Acute Flaccid Paralysis',
    icd10Codes: ['G82.0', 'A80'],
    keywords: ['paralysis', 'limb weakness', 'polio', 'cannot walk'],
    hindiKeywords: ['लकवा', 'हाथ पैर में कमजोरी', 'पोलियो', 'चल नहीं सकता'],
    severity: 'critical',
  },
  {
    id: 'snakebite',
    name: 'Snake Bite',
    icd10Codes: ['T63.0', 'W59'],
    keywords: ['snake bite', 'venom', 'swelling', 'fang marks'],
    hindiKeywords: ['सांप का काटना', 'जहर', 'सूजन'],
    severity: 'critical',
  },
  {
    id: 'dogbite',
    name: 'Dog Bite / Rabies',
    icd10Codes: ['T14.1', 'A82', 'W54'],
    keywords: ['dog bite', 'rabies', 'animal bite', 'hydrophobia'],
    hindiKeywords: ['कुत्ते का काटना', 'रेबीज', 'जानवर का काटना', 'पानी से डर'],
    severity: 'high',
  },
  {
    id: 'uf',
    name: 'Unusual Fever Cluster',
    icd10Codes: ['R50.9', 'U07.1'],
    keywords: ['cluster', 'outbreak', 'unusual', 'unknown fever', 'epidemic'],
    hindiKeywords: ['अज्ञात बुखार', 'महामारी', 'क्लस्टर', 'फैलाव'],
    severity: 'critical',
  },
];

// ─── Storage Keys ───────────────────────────────────────────────────────────

const CONVERSATIONS_KEY = 'biosentinel_indic_conversations';
const EPICLIM_KEY = 'biosentinel_epiclim_data';

// ─── Storage Helpers ────────────────────────────────────────────────────────

function loadConversations(): FieldConversation[] {
  try { return JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || '[]'); }
  catch { return []; }
}

function saveConversations(data: FieldConversation[]): void {
  const trimmed = data.slice(-500);
  try { localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(trimmed)); }
  catch { /* quota */ }
}

function loadEpiClimData(): EpiClimRecord[] {
  try { return JSON.parse(localStorage.getItem(EPICLIM_KEY) || '[]'); }
  catch { return []; }
}

function saveEpiClimData(data: EpiClimRecord[]): void {
  const trimmed = data.slice(-2000);
  try { localStorage.setItem(EPICLIM_KEY, JSON.stringify(trimmed)); }
  catch { /* quota */ }
}

// ─── Syndromic Extraction Engine ────────────────────────────────────────────

/**
 * Extract IDSP syndromes from informal text (Hindi, Hinglish, English).
 * Maps informal descriptions to WHO surveillance signals and ICD-10 codes.
 * Runs entirely on-device — no cloud dependency.
 */
export function extractSyndromes(text: string): {
  syndromes: IDSPSyndrome[];
  icd10Codes: string[];
  confidence: number;
} {
  const normalizedText = text.toLowerCase().trim();
  const matched: IDSPSyndrome[] = [];
  const allCodes: string[] = [];

  for (const syndrome of IDSP_SYNDROMES) {
    const allKeywords = [...syndrome.keywords, ...syndrome.hindiKeywords];
    const matchCount = allKeywords.filter(kw =>
      normalizedText.includes(kw.toLowerCase())
    ).length;

    if (matchCount > 0) {
      matched.push(syndrome);
      allCodes.push(...syndrome.icd10Codes);
    }
  }

  // De-duplicate ICD-10 codes
  const uniqueCodes = [...new Set(allCodes)];

  // Confidence based on keyword match density
  const totalKeywords = matched.reduce(
    (sum, s) => sum + s.keywords.length + s.hindiKeywords.length, 0
  );
  const confidence = matched.length > 0
    ? Math.min(0.95, 0.3 + (matched.length * 0.15) + (totalKeywords > 5 ? 0.1 : 0))
    : 0;

  return { syndromes: matched, icd10Codes: uniqueCodes, confidence };
}

/**
 * Process a field health worker conversation.
 * Extracts syndromes and ICD-10 codes, then stores the structured result.
 */
export function processFieldConversation(
  text: string,
  language: IndicLanguage,
  district: string,
  state: string,
): FieldConversation {
  const { syndromes, icd10Codes, confidence } = extractSyndromes(text);

  const conversation: FieldConversation = {
    id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    language,
    district,
    state,
    timestamp: Date.now(),
    extractedSyndromes: syndromes.map(s => s.name),
    icd10Codes,
    confidence,
  };

  const conversations = loadConversations();
  conversations.push(conversation);
  saveConversations(conversations);

  return conversation;
}

// ─── EpiClim Data Integration ───────────────────────────────────────────────

/**
 * Add EpiClim district-level weekly surveillance data.
 */
export function addEpiClimRecord(record: EpiClimRecord): void {
  const data = loadEpiClimData();
  data.push(record);
  saveEpiClimData(data);
}

/**
 * Bulk import EpiClim data from CSV-like array.
 */
export function bulkImportEpiClim(records: EpiClimRecord[]): number {
  const data = loadEpiClimData();
  data.push(...records);
  saveEpiClimData(data);
  return records.length;
}

/**
 * Get EpiClim data for a specific district.
 */
export function getDistrictEpiClimData(
  district: string,
  weeks?: number
): EpiClimRecord[] {
  const data = loadEpiClimData();
  const filtered = data.filter(r =>
    r.district.toLowerCase() === district.toLowerCase()
  );
  if (weeks) {
    const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
    return filtered.filter(r => {
      const recordDate = new Date(r.year, 0, 1 + (r.week - 1) * 7).getTime();
      return recordDate >= cutoff;
    });
  }
  return filtered;
}

// ─── Statistics ─────────────────────────────────────────────────────────────

/**
 * Get overall Indic data statistics.
 */
export function getIndicDataStats(): IndicDataStats {
  const conversations = loadConversations();
  const languageCoverage: Record<string, number> = {};
  const districts = new Set<string>();

  for (const c of conversations) {
    languageCoverage[c.language] = (languageCoverage[c.language] || 0) + 1;
    districts.add(c.district);
  }

  const syndromeSet = new Set<string>();
  for (const c of conversations) {
    for (const s of c.extractedSyndromes) syndromeSet.add(s);
  }

  return {
    totalConversations: conversations.length,
    totalSyndromes: syndromeSet.size,
    languageCoverage,
    districtsCovered: districts.size,
    lastUpdated: conversations.length > 0
      ? Math.max(...conversations.map(c => c.timestamp))
      : 0,
  };
}

/**
 * Get all processed field conversations.
 */
export function getFieldConversations(): FieldConversation[] {
  return loadConversations().sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Remove a field conversation.
 */
export function removeFieldConversation(id: string): void {
  const data = loadConversations().filter(c => c.id !== id);
  saveConversations(data);
}

/**
 * Clear all Indic data.
 */
export function clearIndicData(): void {
  localStorage.removeItem(CONVERSATIONS_KEY);
  localStorage.removeItem(EPICLIM_KEY);
}
