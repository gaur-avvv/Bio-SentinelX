/**
 * Bio-SentinelX — 8-Bit Asymmetric Scalar Vector Quantizer
 *
 * Compresses 768-dimensional Float32 embeddings into Int8 byte arrays:
 * - 75% RAM reduction (4 bytes -> 1 byte per dimension)
 * - Dynamic min/max range mapping
 * - Direct quantized dot-product and cosine distance approximation
 * - Essential for edge devices running in-browser vector search on medical literature
 */

export interface QuantizedVector {
  values: number[]; // Stored as signed 8-bit integers [-128, 127]
  min: number;
  max: number;
  dim: number;
}

/**
 * Quantizes a Float32 vector to 8-bit integer space.
 */
export function quantizeVector(vector: number[]): QuantizedVector {
  const dim = vector.length;
  if (dim === 0) {
    return { values: [], min: 0, max: 0, dim: 0 };
  }

  let min = vector[0];
  let max = vector[0];
  for (let i = 1; i < dim; i++) {
    if (vector[i] < min) min = vector[i];
    if (vector[i] > max) max = vector[i];
  }

  const range = max - min;
  const scale = range === 0 ? 1 : range / 255.0;

  const values: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    const normalized = range === 0 ? 0 : Math.round((vector[i] - min) / scale) - 128;
    values[i] = Math.max(-128, Math.min(127, normalized));
  }

  return {
    values,
    min: Number(min.toFixed(6)),
    max: Number(max.toFixed(6)),
    dim,
  };
}

/**
 * Reconstructs a Float32 approximation from a quantized 8-bit vector.
 */
export function dequantizeVector(qv: QuantizedVector): number[] {
  const { values, min, max, dim } = qv;
  const range = max - min;
  const scale = range === 0 ? 1 : range / 255.0;

  const reconstructed: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    reconstructed[i] = Number((min + (values[i] + 128) * scale).toFixed(6));
  }
  return reconstructed;
}

/**
 * Computes approximate cosine similarity between two quantized vectors.
 */
export function quantizedCosineSimilarity(qv1: QuantizedVector, qv2: QuantizedVector): number {
  if (qv1.dim !== qv2.dim || qv1.dim === 0) return 0;

  const v1 = dequantizeVector(qv1);
  const v2 = dequantizeVector(qv2);

  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < qv1.dim; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  const denom = Math.sqrt(norm1 * norm2);
  if (denom === 0) return 0;
  return Math.max(-1, Math.min(1, dot / denom));
}

/**
 * Calculates compression ratio and bytes saved for an embedding corpus.
 */
export function calculateMemorySavings(vectorCount: number, dimension = 768): {
  rawBytesFloat32: number;
  quantizedBytesInt8: number;
  bytesSaved: number;
  compressionRatio: number;
  ramReductionPercent: number;
} {
  const rawBytesFloat32 = vectorCount * dimension * 4; // 4 bytes per float
  const quantizedBytesInt8 = vectorCount * (dimension * 1 + 8); // 1 byte per int + 8 bytes min/max metadata
  const bytesSaved = rawBytesFloat32 - quantizedBytesInt8;
  const compressionRatio = Number((rawBytesFloat32 / quantizedBytesInt8).toFixed(2));
  const ramReductionPercent = Number(((bytesSaved / rawBytesFloat32) * 100).toFixed(1));

  return {
    rawBytesFloat32,
    quantizedBytesInt8,
    bytesSaved,
    compressionRatio,
    ramReductionPercent,
  };
}
