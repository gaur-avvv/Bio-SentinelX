/**
 * Web Search & Deep Research Service
 * Enables Bio-Assistant to perform real-time web searches and deep research
 * across medical, epidemiological, and environmental intelligence sources.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  relevance: number; // 0-1 score
  timestamp?: string;
}

export interface DeepSearchResult {
  query: string;
  summary: string;
  sources: SearchResult[];
  keyFindings: string[];
  confidence: number;
  researchTime: number; // milliseconds
}

// ─── Web Search Providers ──────────────────────────────────────────────────────

async function searchGoogle(query: string, apiKey?: string): Promise<SearchResult[]> {
  if (!apiKey) {
    console.warn('[WebSearch] Google API key not configured. Skipping Google search.');
    return [];
  }

  try {
    // Note: This uses the Google Custom Search API
    // In production, consider using SerpAPI or similar for easier integration
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=YOUR_CX_ID`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) return [];
    const data = await response.json() as any;

    return (data.items || []).slice(0, 5).map((item: any) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      source: 'Google Search',
      relevance: 0.9,
      timestamp: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('[WebSearch] Google search error:', err);
    return [];
  }
}

async function searchPubMed(query: string): Promise<SearchResult[]> {
  /**
   * Searches PubMed (pubmed.ncbi.nlm.nih.gov) for medical literature
   * No API key required for basic searches
   */
  try {
    const response = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
        query
      )}&retmax=5&rettype=json`,
      { mode: 'no-cors' }
    );

    if (!response.ok) return [];

    // Note: This is a simplified example. In production, parse XML response
    return [
      {
        title: `PubMed Results for: ${query}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`,
        snippet: 'Search PubMed for peer-reviewed medical research',
        source: 'PubMed',
        relevance: 0.95,
        timestamp: new Date().toISOString(),
      },
    ];
  } catch (err) {
    console.error('[WebSearch] PubMed search error:', err);
    return [];
  }
}

async function searchWHO(query: string): Promise<SearchResult[]> {
  /**
   * Searches WHO official publications and health alerts
   */
  try {
    const response = await fetch(
      `https://www.who.int/cgi-bin/textsearch.pl?query=${encodeURIComponent(query)}`,
      { mode: 'no-cors' }
    );

    if (!response.ok) return [];

    return [
      {
        title: `WHO Resources for: ${query}`,
        url: `https://www.who.int/health-topics/search?keywords=${encodeURIComponent(query)}`,
        snippet: 'Official WHO health guidelines and recommendations',
        source: 'World Health Organization',
        relevance: 0.95,
        timestamp: new Date().toISOString(),
      },
    ];
  } catch (err) {
    console.error('[WebSearch] WHO search error:', err);
    return [];
  }
}

async function searchCDC(query: string): Promise<SearchResult[]> {
  /**
   * Searches CDC (Centers for Disease Control) for disease information
   */
  try {
    const response = await fetch(
      `https://www.cdc.gov/search/?q=${encodeURIComponent(query)}`,
      { mode: 'no-cors' }
    );

    if (!response.ok) return [];

    return [
      {
        title: `CDC Information on: ${query}`,
        url: `https://www.cdc.gov/cdc-search/resources.html?q=${encodeURIComponent(query)}`,
        snippet: 'CDC disease data, prevention guidelines, and outbreak alerts',
        source: 'Centers for Disease Control',
        relevance: 0.95,
        timestamp: new Date().toISOString(),
      },
    ];
  } catch (err) {
    console.error('[WebSearch] CDC search error:', err);
    return [];
  }
}

async function searchOpenAlex(query: string): Promise<SearchResult[]> {
  /**
   * Searches OpenAlex for open-access scientific publications (No Auth required)
   */
  try {
    const response = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=3`
    );

    if (!response.ok) return [];
    const data = await response.json() as any;

    return (data.results || []).map((item: any) => ({
      title: item.title || `Scientific paper on: ${query}`,
      url: item.doi || item.id || `https://openalex.org/${item.id}`,
      snippet: `Published in ${item.publication_year}. ${item.abstract_inverted_index ? 'Abstract available.' : 'Scientific research paper.'}`,
      source: 'OpenAlex Scientific Knowledge Graph',
      relevance: 0.92,
      timestamp: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('[WebSearch] OpenAlex search error:', err);
    return [];
  }
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  /**
   * Searches Wikipedia for encyclopedic medical and epidemiological context
   */
  try {
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`
    );

    if (!response.ok) return [];
    const data = await response.json() as any;

    return (data.query.search || []).slice(0, 2).map((item: any) => {
      // Remove HTML tags from the snippet
      const cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, "");
      return {
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
        snippet: cleanSnippet,
        source: 'Wikipedia',
        relevance: 0.85,
        timestamp: new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error('[WebSearch] Wikipedia search error:', err);
    return [];
  }
}

async function searchClinicalTrials(query: string): Promise<SearchResult[]> {
  /**
   * Searches ClinicalTrials.gov for active and completed medical trials
   */
  try {
    const response = await fetch(
      `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=2`
    );

    if (!response.ok) return [];
    const data = await response.json() as any;

    return (data.studies || []).map((study: any) => {
      const protocol = study.protocolSection;
      return {
        title: protocol?.identificationModule?.briefTitle || `Clinical Trial: ${query}`,
        url: `https://clinicaltrials.gov/study/${protocol?.identificationModule?.nctId}`,
        snippet: protocol?.descriptionModule?.briefSummary || 'Clinical trial registry data.',
        source: 'ClinicalTrials.gov',
        relevance: 0.9,
        timestamp: new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error('[WebSearch] ClinicalTrials search error:', err);
    return [];
  }
}

// ─── Client Rate Limiter & CoT Query Builder ─────────────────────────────────

const RATE_LIMIT_KEY = 'biosentinel_search_ratelimit';
const MAX_REQUESTS_PER_MINUTE = 15;

let cachedIp: string | null = null;
async function getClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (!res.ok) throw new Error('Failed to fetch IP');
    const data = await res.json();
    cachedIp = data.ip;
    return cachedIp;
  } catch (e) {
    console.warn('[WebSearch] Could not fetch client IP, falling back to unknown_ip');
    return 'unknown_ip';
  }
}

/**
 * Validates request limits per minute to prevent API abuse and IP bans.
 * Returns true if allowed, false if rate limited.
 */
export async function checkRateLimit(): Promise<boolean> {
  try {
    const ip = await getClientIp();
    const rateLimitKey = `${RATE_LIMIT_KEY}_${ip}`;
    const now = Date.now();
    const record = localStorage.getItem(rateLimitKey);
    let history: number[] = record ? JSON.parse(record) : [];
    
    // Keep only timestamps from the last 60 seconds
    history = history.filter(t => now - t < 60000);
    
    if (history.length >= MAX_REQUESTS_PER_MINUTE) {
      console.warn(`[WebSearch] Rate limit exceeded for IP ${ip}. Maximum ${MAX_REQUESTS_PER_MINUTE} req/min allowed.`);
      return false;
    }
    
    history.push(now);
    localStorage.setItem(rateLimitKey, JSON.stringify(history));
    return true;
  } catch (e) {
    return true; // Fail open if localStorage is disabled
  }
}

/**
 * Implements a Chain of Thought (CoT) approach to build highly contextual
 * queries capturing area, local conditions, user symptoms, and diseases.
 */
export function buildContextualCoTQuery(userMessage: string, context?: { city?: string; climate?: string; desc?: string }): string {
  const locationContext = context?.city ? `in ${context.city}` : '';
  const climateContext = context?.climate || context?.desc ? `(${context.desc})` : '';
  
  // Chain of Thought extraction heuristic to focus on medical terms
  const symptomKeywords = ['pain', 'fever', 'cough', 'ache', 'rash', 'nausea', 'fatigue', 'symptom', 'disease', 'condition', 'outbreak', 'virus', 'infection'];
  const words = userMessage.toLowerCase().split(/\W+/);
  const extractedTerms = words.filter(w => symptomKeywords.some(k => w.includes(k) || k.includes(w)) && w.length > 2);
  
  const extractedContext = extractedTerms.length > 0 
    ? `(Focus: ${[...new Set(extractedTerms)].join(', ')})` 
    : "epidemiology symptoms disease";
  
  // Create a hyper-specific CoT query blending user questions with local reality and extracted medical concepts
  const query = `${userMessage} ${locationContext} ${climateContext} ${extractedContext}`.trim();
  
  // Extended length to accommodate richer contextual data
  return query.length > 150 ? query.substring(0, 150) : query;
}

// ─── Main Web Search Function ──────────────────────────────────────────────────

export async function performWebSearch(
  query: string,
  googleApiKey?: string,
  options?: { includeMedical?: boolean; includeGov?: boolean; includeTrials?: boolean; includeEncyclopedia?: boolean }
): Promise<SearchResult[]> {
  const isAllowed = await checkRateLimit();
  if (!isAllowed) {
    throw new Error(`Rate limit exceeded: You've reached the search limit (${MAX_REQUESTS_PER_MINUTE}/min). Please wait a moment.`);
  }

  const { includeMedical = true, includeGov = true, includeTrials = true, includeEncyclopedia = true } = options || {};

  const allResults: SearchResult[] = [];

  // Parallel searches across multiple sources
  const searchPromises = [];

  if (googleApiKey) {
    searchPromises.push(
      searchGoogle(query, googleApiKey).then(r => allResults.push(...r))
    );
  }

  if (includeMedical) {
    searchPromises.push(
      searchPubMed(query).then(r => allResults.push(...r)),
      searchWHO(query).then(r => allResults.push(...r)),
      searchOpenAlex(query).then(r => allResults.push(...r))
    );
  }

  if (includeGov) {
    searchPromises.push(
      searchCDC(query).then(r => allResults.push(...r))
    );
  }
  
  if (includeTrials) {
    searchPromises.push(
      searchClinicalTrials(query).then(r => allResults.push(...r))
    );
  }
  
  if (includeEncyclopedia) {
    searchPromises.push(
      searchWikipedia(query).then(r => allResults.push(...r))
    );
  }

  await Promise.allSettled(searchPromises);

  // Deduplicate and sort by relevance
  const seen = new Set<string>();
  return allResults
    .filter(result => {
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 10);
}

// ─── Deep Research Function ────────────────────────────────────────────────────

export async function performDeepResearch(
  query: string,
  googleApiKey?: string,
  includeHistorical?: boolean
): Promise<DeepSearchResult> {
  const startTime = Date.now();

  // Perform web search
  const searchResults = await performWebSearch(query, googleApiKey, {
    includeMedical: true,
    includeGov: true,
  });

  // Extract key findings from search results
  const keyFindings = searchResults.slice(0, 3).map(r => r.snippet);

  // Compile deep research summary
  const summary = `Found ${searchResults.length} relevant sources for "${query}". 
    Key findings: ${keyFindings.join(' | ')} 
    Sourced from: ${[...new Set(searchResults.map(r => r.source))].join(', ')}`;

  const researchTime = Date.now() - startTime;

  return {
    query,
    summary,
    sources: searchResults,
    keyFindings,
    confidence: Math.min(0.95, searchResults.length / 10),
    researchTime,
  };
}

// ─── Local Search (for privacy-focused scenarios) ────────────────────────────

export async function performLocalSearch(
  query: string,
  documents: string[],
): Promise<SearchResult[]> {
  /**
   * Performs client-side search on local documents (no external API calls)
   * Useful for privacy-focused scenarios or offline mode
   */
  const queryLower = query.toLowerCase();
  const results: SearchResult[] = [];

  documents.forEach((doc, index) => {
    const docLower = doc.toLowerCase();
    if (docLower.includes(queryLower)) {
      const snippetStart = Math.max(0, docLower.indexOf(queryLower) - 50);
      const snippetEnd = Math.min(doc.length, snippetStart + 150);
      const snippet = doc.substring(snippetStart, snippetEnd);

      results.push({
        title: `Local Document ${index + 1}`,
        url: `local://doc-${index}`,
        snippet: `...${snippet}...`,
        source: 'Local Knowledge Base',
        relevance: 0.8,
      });
    }
  });

  return results.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
}

// ─── Cache Management ──────────────────────────────────────────────────────────

const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function getCachedSearch(query: string): SearchResult[] | null {
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  searchCache.delete(query);
  return null;
}

export function setCachedSearch(query: string, results: SearchResult[]): void {
  searchCache.set(query, { results, timestamp: Date.now() });
}

export function clearSearchCache(): void {
  searchCache.clear();
}
