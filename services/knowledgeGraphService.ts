/**
 * Bio-SentinelX — Environmental Health Knowledge Graph Service
 *
 * In-browser knowledge graph mapping causal relationships between
 * environmental conditions and health outcomes. Replaces the need for
 * Neo4j/NetworkX by running entirely client-side.
 *
 * Architecture:
 *   - Nodes: Environmental factors, health conditions, symptoms, interventions
 *   - Edges: Causal links with strength, directionality, and evidence
 *   - Query: Traverse graph to explain "Why" in health reports
 *   - Persist: localStorage with LRU pruning
 *
 * Example chains:
 *   High Humidity → Mold Growth → Asthma Trigger
 *   Heavy Rainfall → Stagnant Water → Mosquito Breeding → Dengue Risk
 *   Air Pollution (PM2.5) → Airway Inflammation → COPD Exacerbation
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type NodeType =
  | 'environmental_factor'
  | 'health_condition'
  | 'symptom'
  | 'intervention'
  | 'pathogen'
  | 'vector'
  | 'syndrome';

export type EdgeType =
  | 'causes'
  | 'triggers'
  | 'increases_risk'
  | 'decreases_risk'
  | 'prevents'
  | 'treats'
  | 'indicates'
  | 'breeds'
  | 'transmits'
  | 'exacerbates'
  | 'correlates';

export interface KGNode {
  id: string;
  label: string;
  type: NodeType;
  properties: Record<string, string | number>;
  tags: string[];
}

export interface KGEdge {
  id: string;
  source: string;  // Node ID
  target: string;  // Node ID
  type: EdgeType;
  strength: number; // 0-1 (0 = weak association, 1 = strong causal)
  evidence: string;
  bidirectional: boolean;
}

export interface CausalChain {
  nodes: KGNode[];
  edges: KGEdge[];
  explanation: string;
  totalStrength: number;
}

export interface KGQueryResult {
  chains: CausalChain[];
  relatedNodes: KGNode[];
  summary: string;
}

export interface KnowledgeGraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  avgChainLength: number;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const NODES_KEY = 'biosentinel_kg_nodes';
const EDGES_KEY = 'biosentinel_kg_edges';

function loadNodes(): KGNode[] {
  try { return JSON.parse(localStorage.getItem(NODES_KEY) || '[]'); }
  catch { return []; }
}

function saveNodes(nodes: KGNode[]): void {
  try { localStorage.setItem(NODES_KEY, JSON.stringify(nodes)); }
  catch { /* quota */ }
}

function loadEdges(): KGEdge[] {
  try { return JSON.parse(localStorage.getItem(EDGES_KEY) || '[]'); }
  catch { return []; }
}

function saveEdges(edges: KGEdge[]): void {
  try { localStorage.setItem(EDGES_KEY, JSON.stringify(edges)); }
  catch { /* quota */ }
}

// ─── Initialization: Built-in Environmental Health Knowledge ────────────────

const BUILTIN_NODES: KGNode[] = [
  // Environmental factors
  { id: 'high_humidity', label: 'High Humidity (>80%)', type: 'environmental_factor', properties: { threshold: 80, unit: '%' }, tags: ['moisture', 'climate'] },
  { id: 'low_humidity', label: 'Low Humidity (<30%)', type: 'environmental_factor', properties: { threshold: 30, unit: '%' }, tags: ['dry', 'climate'] },
  { id: 'high_temperature', label: 'High Temperature (>35°C)', type: 'environmental_factor', properties: { threshold: 35, unit: '°C' }, tags: ['heat', 'climate'] },
  { id: 'low_temperature', label: 'Low Temperature (<10°C)', type: 'environmental_factor', properties: { threshold: 10, unit: '°C' }, tags: ['cold', 'climate'] },
  { id: 'heavy_rainfall', label: 'Heavy Rainfall (>50mm)', type: 'environmental_factor', properties: { threshold: 50, unit: 'mm' }, tags: ['rain', 'flood'] },
  { id: 'high_pm25', label: 'High PM2.5 (>55 µg/m³)', type: 'environmental_factor', properties: { threshold: 55, unit: 'µg/m³' }, tags: ['pollution', 'air'] },
  { id: 'high_aqi', label: 'High AQI (>150)', type: 'environmental_factor', properties: { threshold: 150 }, tags: ['pollution', 'air'] },
  { id: 'high_uv', label: 'High UV Index (>8)', type: 'environmental_factor', properties: { threshold: 8 }, tags: ['radiation', 'solar'] },
  { id: 'stagnant_water', label: 'Stagnant Water', type: 'environmental_factor', properties: {}, tags: ['water', 'breeding'] },
  { id: 'poor_sanitation', label: 'Poor Sanitation', type: 'environmental_factor', properties: {}, tags: ['hygiene', 'water'] },
  { id: 'high_pollen', label: 'High Pollen Count', type: 'environmental_factor', properties: { threshold: 50, unit: 'grains/m³' }, tags: ['allergen', 'biological'] },
  { id: 'monsoon_season', label: 'Monsoon Season', type: 'environmental_factor', properties: {}, tags: ['seasonal', 'india'] },

  // Intermediate factors
  { id: 'mold_growth', label: 'Mold Growth', type: 'pathogen', properties: {}, tags: ['fungal', 'indoor'] },
  { id: 'mosquito_breeding', label: 'Mosquito Breeding', type: 'vector', properties: {}, tags: ['vector', 'insect'] },
  { id: 'water_contamination', label: 'Water Contamination', type: 'environmental_factor', properties: {}, tags: ['water', 'pathogen'] },
  { id: 'airway_inflammation', label: 'Airway Inflammation', type: 'symptom', properties: {}, tags: ['respiratory'] },
  { id: 'dehydration', label: 'Dehydration', type: 'symptom', properties: {}, tags: ['heat', 'fluid'] },
  { id: 'immune_suppression', label: 'Immune Suppression', type: 'symptom', properties: {}, tags: ['immune'] },
  { id: 'skin_damage', label: 'UV Skin Damage', type: 'symptom', properties: {}, tags: ['dermatological'] },

  // Health conditions
  { id: 'asthma', label: 'Asthma Exacerbation', type: 'health_condition', properties: { icd10: 'J45' }, tags: ['respiratory', 'chronic'] },
  { id: 'copd', label: 'COPD Exacerbation', type: 'health_condition', properties: { icd10: 'J44' }, tags: ['respiratory', 'chronic'] },
  { id: 'dengue', label: 'Dengue Fever', type: 'health_condition', properties: { icd10: 'A90' }, tags: ['vector-borne', 'tropical'] },
  { id: 'malaria', label: 'Malaria', type: 'health_condition', properties: { icd10: 'B50' }, tags: ['vector-borne', 'tropical'] },
  { id: 'cholera', label: 'Cholera', type: 'health_condition', properties: { icd10: 'A00' }, tags: ['waterborne', 'diarrheal'] },
  { id: 'heat_stroke', label: 'Heat Stroke', type: 'health_condition', properties: { icd10: 'T67.0' }, tags: ['heat', 'emergency'] },
  { id: 'hypothermia', label: 'Hypothermia', type: 'health_condition', properties: { icd10: 'T68' }, tags: ['cold', 'emergency'] },
  { id: 'allergic_rhinitis', label: 'Allergic Rhinitis', type: 'health_condition', properties: { icd10: 'J30' }, tags: ['allergy', 'pollen'] },
  { id: 'skin_cancer', label: 'Skin Cancer Risk', type: 'health_condition', properties: { icd10: 'C44' }, tags: ['dermatological', 'chronic'] },
  { id: 'diarrheal_disease', label: 'Acute Diarrheal Disease', type: 'health_condition', properties: { icd10: 'A09' }, tags: ['waterborne', 'gi'] },
  { id: 'leptospirosis', label: 'Leptospirosis', type: 'health_condition', properties: { icd10: 'A27' }, tags: ['waterborne', 'flood'] },
  { id: 'hepatitis_a', label: 'Hepatitis A', type: 'health_condition', properties: { icd10: 'B15' }, tags: ['waterborne', 'liver'] },

  // Interventions
  { id: 'n95_mask', label: 'N95 Mask Usage', type: 'intervention', properties: {}, tags: ['respiratory', 'protective'] },
  { id: 'hydration', label: 'Adequate Hydration', type: 'intervention', properties: {}, tags: ['heat', 'preventive'] },
  { id: 'mosquito_net', label: 'Mosquito Net / Repellent', type: 'intervention', properties: {}, tags: ['vector', 'preventive'] },
  { id: 'water_purification', label: 'Water Purification', type: 'intervention', properties: {}, tags: ['waterborne', 'preventive'] },
  { id: 'sunscreen', label: 'Sunscreen (SPF 30+)', type: 'intervention', properties: {}, tags: ['uv', 'preventive'] },
  { id: 'antihistamine', label: 'Antihistamine', type: 'intervention', properties: {}, tags: ['allergy', 'treatment'] },

  // IDSP Syndromes
  { id: 'syn_awd', label: 'Acute Watery Diarrhea', type: 'syndrome', properties: { idsp: 'AWD' }, tags: ['idsp', 'surveillance'] },
  { id: 'syn_afi', label: 'Acute Febrile Illness', type: 'syndrome', properties: { idsp: 'AFI' }, tags: ['idsp', 'surveillance'] },
  { id: 'syn_ari', label: 'Acute Respiratory Infection', type: 'syndrome', properties: { idsp: 'ARI' }, tags: ['idsp', 'surveillance'] },
];

const BUILTIN_EDGES: KGEdge[] = [
  // Humidity chains
  { id: 'e1', source: 'high_humidity', target: 'mold_growth', type: 'causes', strength: 0.85, evidence: 'Mold thrives above 60% RH; rapid growth above 80%', bidirectional: false },
  { id: 'e2', source: 'mold_growth', target: 'asthma', type: 'triggers', strength: 0.8, evidence: 'Mold spores are potent asthma triggers via IgE-mediated response', bidirectional: false },
  { id: 'e3', source: 'high_humidity', target: 'mosquito_breeding', type: 'increases_risk', strength: 0.7, evidence: 'Humid environments provide optimal mosquito egg-laying conditions', bidirectional: false },
  { id: 'e4', source: 'low_humidity', target: 'airway_inflammation', type: 'causes', strength: 0.7, evidence: 'Dry air desiccates airway mucosa, impairing mucociliary clearance', bidirectional: false },

  // Rainfall chains
  { id: 'e5', source: 'heavy_rainfall', target: 'stagnant_water', type: 'causes', strength: 0.9, evidence: 'Urban flooding creates stagnant water pools in drains and low areas', bidirectional: false },
  { id: 'e6', source: 'stagnant_water', target: 'mosquito_breeding', type: 'causes', strength: 0.95, evidence: 'Aedes aegypti breeds in clean stagnant water; 7-day larval cycle', bidirectional: false },
  { id: 'e7', source: 'heavy_rainfall', target: 'water_contamination', type: 'causes', strength: 0.85, evidence: 'Floods contaminate drinking water with sewage and pathogens', bidirectional: false },
  { id: 'e8', source: 'water_contamination', target: 'cholera', type: 'increases_risk', strength: 0.9, evidence: 'Vibrio cholerae spreads through contaminated water supply', bidirectional: false },
  { id: 'e9', source: 'water_contamination', target: 'diarrheal_disease', type: 'causes', strength: 0.85, evidence: 'Contaminated water is primary route for acute diarrheal diseases', bidirectional: false },
  { id: 'e10', source: 'water_contamination', target: 'hepatitis_a', type: 'increases_risk', strength: 0.75, evidence: 'HAV transmitted via fecal-oral route through contaminated water', bidirectional: false },

  // Vector-borne chains
  { id: 'e11', source: 'mosquito_breeding', target: 'dengue', type: 'transmits', strength: 0.85, evidence: 'Aedes aegypti is primary dengue vector; peaks 2-3 weeks after rainfall', bidirectional: false },
  { id: 'e12', source: 'mosquito_breeding', target: 'malaria', type: 'transmits', strength: 0.8, evidence: 'Anopheles mosquitoes transmit Plasmodium parasites', bidirectional: false },

  // Temperature chains
  { id: 'e13', source: 'high_temperature', target: 'dehydration', type: 'causes', strength: 0.85, evidence: 'Excessive sweating in >35°C causes rapid fluid/electrolyte loss', bidirectional: false },
  { id: 'e14', source: 'dehydration', target: 'heat_stroke', type: 'increases_risk', strength: 0.9, evidence: 'Dehydration impairs thermoregulation leading to heat stroke', bidirectional: false },
  { id: 'e15', source: 'low_temperature', target: 'hypothermia', type: 'increases_risk', strength: 0.85, evidence: 'Prolonged cold exposure drops core body temperature below 35°C', bidirectional: false },
  { id: 'e16', source: 'low_temperature', target: 'immune_suppression', type: 'causes', strength: 0.6, evidence: 'Cold stress suppresses mucosal immune defenses', bidirectional: false },

  // Air quality chains
  { id: 'e17', source: 'high_pm25', target: 'airway_inflammation', type: 'causes', strength: 0.9, evidence: 'PM2.5 penetrates alveoli causing oxidative stress and inflammation', bidirectional: false },
  { id: 'e18', source: 'airway_inflammation', target: 'asthma', type: 'exacerbates', strength: 0.85, evidence: 'Chronic airway inflammation lowers asthma trigger threshold', bidirectional: false },
  { id: 'e19', source: 'airway_inflammation', target: 'copd', type: 'exacerbates', strength: 0.8, evidence: 'Inflammation accelerates COPD decline and acute exacerbations', bidirectional: false },
  { id: 'e20', source: 'high_aqi', target: 'airway_inflammation', type: 'causes', strength: 0.85, evidence: 'Multiple pollutants at high AQI compound airway damage', bidirectional: false },

  // UV chains
  { id: 'e21', source: 'high_uv', target: 'skin_damage', type: 'causes', strength: 0.9, evidence: 'UVB causes direct DNA damage; UVA causes oxidative skin damage', bidirectional: false },
  { id: 'e22', source: 'skin_damage', target: 'skin_cancer', type: 'increases_risk', strength: 0.75, evidence: 'Cumulative UV exposure is primary risk factor for skin cancer', bidirectional: false },
  { id: 'e23', source: 'high_uv', target: 'immune_suppression', type: 'causes', strength: 0.5, evidence: 'UV radiation suppresses cutaneous immune responses', bidirectional: false },

  // Pollen chains
  { id: 'e24', source: 'high_pollen', target: 'allergic_rhinitis', type: 'triggers', strength: 0.9, evidence: 'Pollen grains trigger IgE-mediated histamine release in sensitized individuals', bidirectional: false },
  { id: 'e25', source: 'high_pollen', target: 'asthma', type: 'triggers', strength: 0.75, evidence: 'Pollen can trigger bronchospasm in allergic asthma patients', bidirectional: false },

  // Monsoon compound chain
  { id: 'e26', source: 'monsoon_season', target: 'heavy_rainfall', type: 'causes', strength: 0.95, evidence: 'Indian monsoon brings 75% of annual rainfall June-September', bidirectional: false },
  { id: 'e27', source: 'monsoon_season', target: 'high_humidity', type: 'causes', strength: 0.9, evidence: 'Monsoon humidity regularly exceeds 85% in most Indian cities', bidirectional: false },
  { id: 'e28', source: 'heavy_rainfall', target: 'leptospirosis', type: 'increases_risk', strength: 0.7, evidence: 'Flood water contact transmits Leptospira bacteria through skin', bidirectional: false },

  // Interventions
  { id: 'e29', source: 'n95_mask', target: 'airway_inflammation', type: 'prevents', strength: 0.85, evidence: 'N95 filters >95% of PM2.5 particles', bidirectional: false },
  { id: 'e30', source: 'hydration', target: 'dehydration', type: 'prevents', strength: 0.9, evidence: 'Adequate fluid intake maintains thermoregulation', bidirectional: false },
  { id: 'e31', source: 'mosquito_net', target: 'dengue', type: 'decreases_risk', strength: 0.7, evidence: 'Insecticide-treated nets reduce mosquito bites by 70-90%', bidirectional: false },
  { id: 'e32', source: 'water_purification', target: 'cholera', type: 'prevents', strength: 0.95, evidence: 'Boiling/chlorination eliminates Vibrio cholerae', bidirectional: false },
  { id: 'e33', source: 'sunscreen', target: 'skin_damage', type: 'prevents', strength: 0.8, evidence: 'SPF 30+ blocks 97% of UVB radiation', bidirectional: false },
  { id: 'e34', source: 'antihistamine', target: 'allergic_rhinitis', type: 'treats', strength: 0.8, evidence: 'H1 antagonists block histamine-mediated allergic symptoms', bidirectional: false },

  // Syndrome links
  { id: 'e35', source: 'diarrheal_disease', target: 'syn_awd', type: 'indicates', strength: 0.9, evidence: 'AWD is IDSP sentinel syndrome for diarrheal outbreaks', bidirectional: false },
  { id: 'e36', source: 'dengue', target: 'syn_afi', type: 'indicates', strength: 0.85, evidence: 'Dengue presents as acute febrile illness in IDSP classification', bidirectional: false },
  { id: 'e37', source: 'asthma', target: 'syn_ari', type: 'indicates', strength: 0.7, evidence: 'Asthma exacerbations classified under ARI in syndromic surveillance', bidirectional: false },

  // Sanitation chain
  { id: 'e38', source: 'poor_sanitation', target: 'water_contamination', type: 'causes', strength: 0.9, evidence: 'Open defecation and inadequate sewage contaminate water sources', bidirectional: false },
  { id: 'e39', source: 'water_purification', target: 'diarrheal_disease', type: 'prevents', strength: 0.85, evidence: 'Safe drinking water prevents 90% of waterborne diarrheal disease', bidirectional: false },
];

// ─── Initialization ─────────────────────────────────────────────────────────

/**
 * Initialize the knowledge graph with built-in environmental health knowledge.
 * Only adds nodes/edges that don't already exist.
 */
export function initializeKnowledgeGraph(): void {
  const existingNodes = loadNodes();
  const existingEdges = loadEdges();

  const existingNodeIds = new Set(existingNodes.map(n => n.id));
  const existingEdgeIds = new Set(existingEdges.map(e => e.id));

  const newNodes = BUILTIN_NODES.filter(n => !existingNodeIds.has(n.id));
  const newEdges = BUILTIN_EDGES.filter(e => !existingEdgeIds.has(e.id));

  if (newNodes.length > 0) saveNodes([...existingNodes, ...newNodes]);
  if (newEdges.length > 0) saveEdges([...existingEdges, ...newEdges]);
}

// ─── Node & Edge Management ─────────────────────────────────────────────────

export function addNode(node: Omit<KGNode, 'id'>): KGNode {
  const newNode: KGNode = {
    ...node,
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  const nodes = loadNodes();
  nodes.push(newNode);
  saveNodes(nodes);
  return newNode;
}

export function addEdge(edge: Omit<KGEdge, 'id'>): KGEdge {
  const newEdge: KGEdge = {
    ...edge,
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  const edges = loadEdges();
  edges.push(newEdge);
  saveEdges(edges);
  return newEdge;
}

export function getNodes(): KGNode[] { return loadNodes(); }
export function getEdges(): KGEdge[] { return loadEdges(); }

export function getNodeById(id: string): KGNode | undefined {
  return loadNodes().find(n => n.id === id);
}

export function removeNode(id: string): void {
  saveNodes(loadNodes().filter(n => n.id !== id));
  saveEdges(loadEdges().filter(e => e.source !== id && e.target !== id));
}

export function removeEdge(id: string): void {
  saveEdges(loadEdges().filter(e => e.id !== id));
}

// ─── Graph Queries ──────────────────────────────────────────────────────────

/**
 * Find all causal chains from a source factor to health outcomes.
 * BFS traversal with max depth to prevent infinite loops.
 */
export function findCausalChains(
  sourceId: string,
  maxDepth: number = 4
): CausalChain[] {
  const nodes = loadNodes();
  const edges = loadEdges();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const chains: CausalChain[] = [];

  // BFS to find all paths from source to health conditions
  interface QueueItem { path: string[]; edgePath: KGEdge[] }
  const queue: QueueItem[] = [{ path: [sourceId], edgePath: [] }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const lastNode = current.path[current.path.length - 1];

    if (current.path.length > maxDepth) continue;

    // Find outgoing edges
    const outgoing = edges.filter(e => e.source === lastNode);

    for (const edge of outgoing) {
      if (current.path.includes(edge.target)) continue; // Avoid cycles

      const targetNode = nodeMap.get(edge.target);
      if (!targetNode) continue;

      const newPath = [...current.path, edge.target];
      const newEdgePath = [...current.edgePath, edge];

      // If we reached a health condition or syndrome, record the chain
      if (targetNode.type === 'health_condition' || targetNode.type === 'syndrome') {
        const chainNodes = newPath
          .map(id => nodeMap.get(id))
          .filter((n): n is KGNode => !!n);

        const totalStrength = newEdgePath.reduce((prod, e) => prod * e.strength, 1);

        const explanation = newEdgePath.map((e, i) => {
          const src = nodeMap.get(e.source);
          const tgt = nodeMap.get(e.target);
          return `${src?.label || e.source} ${e.type.replace('_', ' ')} ${tgt?.label || e.target}`;
        }).join(' → ');

        chains.push({
          nodes: chainNodes,
          edges: newEdgePath,
          explanation,
          totalStrength: Math.round(totalStrength * 100) / 100,
        });
      }

      // Continue BFS
      const visitKey = `${lastNode}->${edge.target}`;
      if (!visited.has(visitKey)) {
        visited.add(visitKey);
        queue.push({ path: newPath, edgePath: newEdgePath });
      }
    }
  }

  return chains.sort((a, b) => b.totalStrength - a.totalStrength);
}

/**
 * Query the knowledge graph for a specific environmental condition.
 * Returns causal chains, related nodes, and a natural language summary.
 */
export function queryKnowledgeGraph(
  conditionQuery: string
): KGQueryResult {
  const nodes = loadNodes();
  const queryLower = conditionQuery.toLowerCase();

  // Find matching source nodes
  const matchingNodes = nodes.filter(n =>
    n.label.toLowerCase().includes(queryLower) ||
    n.tags.some(t => t.toLowerCase().includes(queryLower))
  );

  if (matchingNodes.length === 0) {
    return { chains: [], relatedNodes: [], summary: 'No matching environmental factors found in the knowledge graph.' };
  }

  // Find all causal chains from matching nodes
  const allChains: CausalChain[] = [];
  for (const node of matchingNodes) {
    allChains.push(...findCausalChains(node.id));
  }

  // Collect all related nodes
  const relatedNodeIds = new Set<string>();
  for (const chain of allChains) {
    for (const node of chain.nodes) relatedNodeIds.add(node.id);
  }
  const relatedNodes = nodes.filter(n => relatedNodeIds.has(n.id));

  // Generate summary
  const healthConditions = relatedNodes.filter(n => n.type === 'health_condition');
  const interventions = findInterventions(healthConditions.map(n => n.id));

  const summary = allChains.length > 0
    ? `Found ${allChains.length} causal pathway(s) linking "${conditionQuery}" to ${healthConditions.length} health condition(s): ${healthConditions.map(n => n.label).join(', ')}. ${interventions.length > 0 ? `Recommended interventions: ${interventions.map(n => n.label).join(', ')}.` : ''}`
    : `No causal pathways found for "${conditionQuery}".`;

  return { chains: allChains, relatedNodes, summary };
}

/**
 * Find intervention nodes that prevent/treat the given health conditions.
 */
function findInterventions(conditionIds: string[]): KGNode[] {
  const edges = loadEdges();
  const nodes = loadNodes();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const interventionIds = new Set<string>();
  for (const edge of edges) {
    if ((edge.type === 'prevents' || edge.type === 'treats' || edge.type === 'decreases_risk') &&
        conditionIds.includes(edge.target)) {
      interventionIds.add(edge.source);
    }
  }

  return Array.from(interventionIds)
    .map(id => nodeMap.get(id))
    .filter((n): n is KGNode => !!n && n.type === 'intervention');
}

/**
 * Get health impact analysis for current weather conditions.
 * Maps active environmental factors to their health consequences via the KG.
 */
export function analyzeEnvironmentalImpact(conditions: {
  temperature?: number;
  humidity?: number;
  aqi?: number;
  pm25?: number;
  uvIndex?: number;
  precipitation?: number;
  pollenCount?: number;
}): KGQueryResult {
  const activeFactors: string[] = [];

  if (conditions.humidity !== undefined && conditions.humidity > 80) activeFactors.push('high_humidity');
  if (conditions.humidity !== undefined && conditions.humidity < 30) activeFactors.push('low_humidity');
  if (conditions.temperature !== undefined && conditions.temperature > 35) activeFactors.push('high_temperature');
  if (conditions.temperature !== undefined && conditions.temperature < 10) activeFactors.push('low_temperature');
  if (conditions.aqi !== undefined && conditions.aqi > 150) activeFactors.push('high_aqi');
  if (conditions.pm25 !== undefined && conditions.pm25 > 55) activeFactors.push('high_pm25');
  if (conditions.uvIndex !== undefined && conditions.uvIndex > 8) activeFactors.push('high_uv');
  if (conditions.precipitation !== undefined && conditions.precipitation > 50) activeFactors.push('heavy_rainfall');
  if (conditions.pollenCount !== undefined && conditions.pollenCount > 50) activeFactors.push('high_pollen');

  if (activeFactors.length === 0) {
    return { chains: [], relatedNodes: [], summary: 'Current conditions are within normal parameters. No elevated health risks detected by the knowledge graph.' };
  }

  const allChains: CausalChain[] = [];
  for (const factor of activeFactors) {
    allChains.push(...findCausalChains(factor));
  }

  const relatedNodeIds = new Set<string>();
  for (const chain of allChains) {
    for (const node of chain.nodes) relatedNodeIds.add(node.id);
  }

  const nodes = loadNodes();
  const relatedNodes = nodes.filter(n => relatedNodeIds.has(n.id));
  const healthConditions = relatedNodes.filter(n => n.type === 'health_condition');
  const interventionNodes = findInterventions(healthConditions.map(n => n.id));

  const factorLabels = activeFactors.map(f => {
    const node = nodes.find(n => n.id === f);
    return node?.label || f;
  });

  const summary = `Active environmental risk factors: ${factorLabels.join(', ')}. ` +
    `These conditions link to ${healthConditions.length} health risk(s) through ${allChains.length} causal pathway(s). ` +
    (interventionNodes.length > 0
      ? `Priority interventions: ${interventionNodes.map(n => n.label).join(', ')}.`
      : '');

  return { chains: allChains, relatedNodes, summary };
}

// ─── Statistics ─────────────────────────────────────────────────────────────

export function getKnowledgeGraphStats(): KnowledgeGraphStats {
  const nodes = loadNodes();
  const edges = loadEdges();

  const nodesByType: Record<string, number> = {};
  for (const n of nodes) { nodesByType[n.type] = (nodesByType[n.type] || 0) + 1; }

  const edgesByType: Record<string, number> = {};
  for (const e of edges) { edgesByType[e.type] = (edgesByType[e.type] || 0) + 1; }

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodesByType,
    edgesByType,
    avgChainLength: 0, // Computed on demand
  };
}

/**
 * Clear all knowledge graph data (resets to empty).
 */
export function clearKnowledgeGraph(): void {
  localStorage.removeItem(NODES_KEY);
  localStorage.removeItem(EDGES_KEY);
}
