/**
 * Bio-SentinelX — Epidemiological Incubation Time-Lag Cross-Correlation Engine
 *
 * Models biologically grounded latency between environmental shocks
 * (e.g. heavy precipitation, extreme humidity, heatwaves) and symptomatic case spikes.
 *
 * Evaluates Pearson cross-correlation across temporal lag shifts:
 *   r(τ) = Cov(X_t, Y_{t+τ}) / (σ_X * σ_Y)
 */

export interface DiseaseIncubationProfile {
  disease: string;
  minIncubationDays: number;
  maxIncubationDays: number;
  medianDays: number;
  primaryVectorOrTrigger: string;
}

export const KNOWN_INCUBATION_PROFILES: Record<string, DiseaseIncubationProfile> = {
  dengue: {
    disease: 'Dengue',
    minIncubationDays: 4,
    maxIncubationDays: 10,
    medianDays: 7,
    primaryVectorOrTrigger: 'Aedes mosquito proliferation post-rainfall',
  },
  malaria: {
    disease: 'Malaria',
    minIncubationDays: 7,
    maxIncubationDays: 21,
    medianDays: 12,
    primaryVectorOrTrigger: 'Anopheles breeding post-monsoon',
  },
  influenza: {
    disease: 'Influenza',
    minIncubationDays: 1,
    maxIncubationDays: 4,
    medianDays: 2,
    primaryVectorOrTrigger: 'Cold & dry air droplet transmission',
  },
  cholera: {
    disease: 'Cholera',
    minIncubationDays: 1,
    maxIncubationDays: 5,
    medianDays: 2,
    primaryVectorOrTrigger: 'Waterborne contamination post-flood',
  },
  heatstroke: {
    disease: 'Heat Stroke',
    minIncubationDays: 0,
    maxIncubationDays: 1,
    medianDays: 0,
    primaryVectorOrTrigger: 'Extreme wet-bulb temperature threshold',
  },
};

export interface LagCorrelationPoint {
  lagDays: number;
  r: number;
  pValueApprox: number;
  isPeak: boolean;
}

export interface IncubationLagAnalysisResult {
  disease: string;
  optimalLagDays: number;
  peakCorrelation: number;
  isClinicallyPlausible: boolean;
  lagSpectrum: LagCorrelationPoint[];
  leadTimeDays: number;
  summary: string;
}

/**
 * Computes Pearson correlation coefficient between two numeric arrays.
 */
export function calculatePearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return 0;
  return Math.max(-1, Math.min(1, num / denom));
}

/**
 * Computes distributed cross-correlation spectrum across [0, maxLagDays].
 */
export function computeDistributedCrossCorrelation(
  environmentalSeries: number[],
  caseSeries: number[],
  maxLagDays: number = 21
): LagCorrelationPoint[] {
  const points: LagCorrelationPoint[] = [];
  const n = Math.min(environmentalSeries.length, caseSeries.length);

  for (let lag = 0; lag <= maxLagDays; lag++) {
    if (n - lag < 4) break;

    const xSlice = environmentalSeries.slice(0, n - lag);
    const ySlice = caseSeries.slice(lag, n);

    const r = calculatePearsonR(xSlice, ySlice);
    const df = n - lag - 2;
    // t-statistic approximation for p-value: t = r * sqrt(df / (1 - r^2))
    const tStat = Math.abs(r) * Math.sqrt(Math.max(1, df) / Math.max(1e-6, 1 - r * r));
    const pValueApprox = Number((2 * Math.exp(-0.717 * tStat - 0.416 * tStat * tStat)).toFixed(4));

    points.push({
      lagDays: lag,
      r: Number(r.toFixed(4)),
      pValueApprox: Math.min(1, Math.max(0, pValueApprox)),
      isPeak: false,
    });
  }

  // Identify peak positive correlation
  let maxR = -Infinity;
  let peakIdx = -1;
  points.forEach((pt, idx) => {
    if (pt.r > maxR) {
      maxR = pt.r;
      peakIdx = idx;
    }
  });

  if (peakIdx >= 0 && points[peakIdx].r > 0) {
    points[peakIdx].isPeak = true;
  }

  return points;
}

/**
 * Analyzes empirical time lag against known pathogen incubation periods.
 */
export function analyzeIncubationLag(
  diseaseName: string,
  environmentalSeries: number[],
  caseSeries: number[],
  maxLagDays: number = 21
): IncubationLagAnalysisResult {
  const key = diseaseName.toLowerCase().replace(/[^a-z]/g, '');
  const profile = KNOWN_INCUBATION_PROFILES[key] || {
    disease: diseaseName,
    minIncubationDays: 1,
    maxIncubationDays: 14,
    medianDays: 7,
    primaryVectorOrTrigger: 'Environmental pathogen exposure',
  };

  const spectrum = computeDistributedCrossCorrelation(environmentalSeries, caseSeries, maxLagDays);
  const peakPoint = spectrum.find(p => p.isPeak) || spectrum[0] || { lagDays: 0, r: 0 };

  const isClinicallyPlausible =
    peakPoint.lagDays >= profile.minIncubationDays && peakPoint.lagDays <= profile.maxIncubationDays;

  return {
    disease: profile.disease,
    optimalLagDays: peakPoint.lagDays,
    peakCorrelation: peakPoint.r,
    isClinicallyPlausible,
    lagSpectrum: spectrum,
    leadTimeDays: Math.max(0, peakPoint.lagDays),
    summary: `Peak correlation of r=${peakPoint.r} observed at ${peakPoint.lagDays}-day lag. ${
      isClinicallyPlausible
        ? `Consonant with clinical incubation window (${profile.minIncubationDays}-${profile.maxIncubationDays}d).`
        : `Deviates from standard biological window (${profile.minIncubationDays}-${profile.maxIncubationDays}d); assess secondary transmission vectors.`
    }`,
  };
}
