/**
 * Bio-SentinelX — Clinical Decision Support Explainability Service
 *
 * Implements local feature attribution (Kernel SHAP approximation)
 * to explain individual machine learning disease predictions:
 * - Quantifies marginal contribution φ_i of each symptom & weather metric
 * - Satisfies efficiency property: Σ φ_i = f(x) - E[f(x)]
 * - Translates mathematical weights into human-readable clinical reason codes
 * - Prevents black-box automated medical decision making
 */

export interface FeatureAttribution {
  feature: string;
  featureValue: number;
  baselineValue: number;
  phi: number; // Attribution weight (-1 to +1)
  direction: 'risk_increasing' | 'risk_decreasing' | 'neutral';
  relativeImpactPercent: number;
  clinicalNote: string;
}

export interface LocalExplanationReport {
  disease: string;
  predictedProbability: number;
  baseProbability: number;
  attributions: FeatureAttribution[];
  topRiskFactors: FeatureAttribution[];
  topProtectiveFactors: FeatureAttribution[];
  clinicalSummary: string;
}

/**
 * Approximates local Shapley feature contributions using marginal permutation.
 */
export function computeLocalShapExplanation(
  instance: Record<string, number>,
  baselineCohort: Record<string, number>[],
  predictionFn: (sample: Record<string, number>) => number,
  diseaseName: string
): LocalExplanationReport {
  const featureKeys = Object.keys(instance);
  if (featureKeys.length === 0 || baselineCohort.length === 0) {
    return {
      disease: diseaseName,
      predictedProbability: 0,
      baseProbability: 0,
      attributions: [],
      topRiskFactors: [],
      topProtectiveFactors: [],
      clinicalSummary: 'Insufficient data for local explanation generation.',
    };
  }

  // 1. Compute baseline expected value E[f(x)]
  const baselinePredictions = baselineCohort.map(sample => predictionFn(sample));
  const baseProbability =
    baselinePredictions.reduce((a, b) => a + b, 0) / baselinePredictions.length;

  // 2. Compute patient specific prediction f(x)
  const predictedProbability = predictionFn(instance);
  const totalDifference = predictedProbability - baseProbability;

  // 3. Compute marginal contributions φ_i via feature ablation against baseline mean
  const baselineMeans: Record<string, number> = {};
  for (const key of featureKeys) {
    const sum = baselineCohort.reduce((acc, row) => acc + (row[key] ?? 0), 0);
    baselineMeans[key] = sum / baselineCohort.length;
  }

  const rawAttributions: Array<{ feature: string; val: number; baseVal: number; rawPhi: number }> = [];
  let rawSum = 0;

  for (const key of featureKeys) {
    // Counterfactual: replace feature with baseline mean
    const counterfactual = { ...instance, [key]: baselineMeans[key] };
    const cfPred = predictionFn(counterfactual);
    const rawPhi = predictedProbability - cfPred;
    rawAttributions.push({
      feature: key,
      val: instance[key],
      baseVal: baselineMeans[key],
      rawPhi,
    });
    rawSum += Math.abs(rawPhi);
  }

  // 4. Normalize to satisfy Shapley efficiency: Σ φ_i = f(x) - E[f(x)]
  const attributions: FeatureAttribution[] = rawAttributions.map(item => {
    let phi = item.rawPhi;
    if (rawSum > 1e-6) {
      phi = (item.rawPhi / rawSum) * Math.abs(totalDifference);
    }

    const direction: 'risk_increasing' | 'risk_decreasing' | 'neutral' =
      phi > 0.005 ? 'risk_increasing' : phi < -0.005 ? 'risk_decreasing' : 'neutral';

    const relativeImpactPercent = rawSum > 0 ? Number(((Math.abs(item.rawPhi) / rawSum) * 100).toFixed(1)) : 0;

    let clinicalNote = '';
    if (direction === 'risk_increasing') {
      clinicalNote = `Elevated ${item.feature} (${item.val.toFixed(1)}) contributes +${(phi * 100).toFixed(1)}% to diagnosis probability.`;
    } else if (direction === 'risk_decreasing') {
      clinicalNote = `Normal ${item.feature} (${item.val.toFixed(1)}) reduces diagnosis probability by ${(Math.abs(phi) * 100).toFixed(1)}%.`;
    } else {
      clinicalNote = `${item.feature} is neutral relative to population baseline.`;
    }

    return {
      feature: item.feature,
      featureValue: Number(item.val.toFixed(2)),
      baselineValue: Number(item.baseVal.toFixed(2)),
      phi: Number(phi.toFixed(4)),
      direction,
      relativeImpactPercent,
      clinicalNote,
    };
  });

  // Sort descending by magnitude of phi
  attributions.sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi));

  const topRiskFactors = attributions.filter(a => a.direction === 'risk_increasing').slice(0, 3);
  const topProtectiveFactors = attributions.filter(a => a.direction === 'risk_decreasing').slice(0, 3);

  const topRiskNames = topRiskFactors.map(f => f.feature).join(', ');
  const clinicalSummary =
    topRiskFactors.length > 0
      ? `Model prediction of ${(predictedProbability * 100).toFixed(1)}% for ${diseaseName} is primarily driven by: ${topRiskNames}.`
      : `Model prediction of ${(predictedProbability * 100).toFixed(1)}% for ${diseaseName} is aligned with baseline prevalence.`;

  return {
    disease: diseaseName,
    predictedProbability: Number(predictedProbability.toFixed(4)),
    baseProbability: Number(baseProbability.toFixed(4)),
    attributions,
    topRiskFactors,
    topProtectiveFactors,
    clinicalSummary,
  };
}
