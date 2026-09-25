import { describe, it, expect } from 'vitest';
import {
  quantizeVector,
  dequantizeVector,
  quantizedCosineSimilarity,
  calculateMemorySavings,
} from '../services/vectorQuantizer';

describe('8-Bit Scalar Vector Quantizer', () => {
  it('should compress float32 vectors with high fidelity reconstruction (cosine > 0.99)', () => {
    // Generate 768-dimensional random embedding vector
    const dim = 768;
    const rawVector: number[] = new Array(dim);
    for (let i = 0; i < dim; i++) {
      rawVector[i] = (Math.random() - 0.5) * 2;
    }

    const qv = quantizeVector(rawVector);
    expect(qv.dim).toBe(dim);
    expect(qv.values.length).toBe(dim);

    // Verify all quantized values fall strictly in Int8 range [-128, 127]
    for (const v of qv.values) {
      expect(v).toBeGreaterThanOrEqual(-128);
      expect(v).toBeLessThanOrEqual(127);
    }

    const reconstructed = dequantizeVector(qv);
    expect(reconstructed.length).toBe(dim);

    // Measure cosine similarity between raw and reconstructed
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < dim; i++) {
      dot += rawVector[i] * reconstructed[i];
      normA += rawVector[i] * rawVector[i];
      normB += reconstructed[i] * reconstructed[i];
    }
    const fidelityCosine = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    expect(fidelityCosine).toBeGreaterThan(0.99);
  });

  it('should compute quantized cosine similarity between two vectors', () => {
    const v1 = [0.1, 0.5, 0.9, -0.3];
    const v2 = [0.15, 0.48, 0.88, -0.28];

    const q1 = quantizeVector(v1);
    const q2 = quantizeVector(v2);

    const sim = quantizedCosineSimilarity(q1, q2);
    expect(sim).toBeGreaterThan(0.95);
  });

  it('should confirm ~75% RAM reduction for embedding index', () => {
    const stats = calculateMemorySavings(10000, 768);
    expect(stats.ramReductionPercent).toBeGreaterThan(70);
    expect(stats.compressionRatio).toBeGreaterThan(3.5);
  });
});
