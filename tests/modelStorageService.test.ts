import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveModelCheckpoint,
  listModelCheckpoints,
  promoteToChampion,
  rollbackToVersion,
  getActiveChampionModel,
  clearModelRegistry,
} from '../services/modelStorageService';

describe('Model Checkpoint Versioning & Rollback Service', () => {
  beforeEach(() => {
    clearModelRegistry();
  });

  it('should save checkpoints and auto-assign initial model as champion', async () => {
    const ckpt = await saveModelCheckpoint(
      'xgboost',
      { accuracy: 0.94, f1Score: 0.93, macroAuc: 0.96 },
      '{"trees": []}',
      {
        features: ['temp', 'humidity'],
        label: 'prognosis',
        hyperparameters: { nEstimators: 10 },
        sampleCount: 500,
      }
    );

    expect(ckpt.version).toBe(1);
    expect(ckpt.isChampion).toBe(true);

    const champion = await getActiveChampionModel();
    expect(champion?.checkpointId).toBe(ckpt.checkpointId);
  });

  it('should support champion promotion and historical version rollback', async () => {
    // Save version 1
    const v1 = await saveModelCheckpoint(
      'xgboost',
      { accuracy: 0.91, f1Score: 0.90 },
      'model_v1',
      { features: ['f1'], label: 'target', hyperparameters: {}, sampleCount: 100 }
    );

    // Save version 2
    const v2 = await saveModelCheckpoint(
      'deeplearning',
      { accuracy: 0.95, f1Score: 0.94 },
      'model_v2',
      { features: ['f1'], label: 'target', hyperparameters: {}, sampleCount: 100 },
      true // set as champion
    );

    expect(v2.isChampion).toBe(true);
    let active = await getActiveChampionModel();
    expect(active?.version).toBe(2);

    // Rollback to version 1
    const rolledBack = await rollbackToVersion(1);
    expect(rolledBack?.version).toBe(1);

    active = await getActiveChampionModel();
    expect(active?.version).toBe(1);
  });

  it('should list checkpoints in reverse chronological order', async () => {
    await saveModelCheckpoint('xgboost', { accuracy: 0.8 }, 'm1', { features: [], label: '', hyperparameters: {}, sampleCount: 10 });
    await saveModelCheckpoint('xgboost', { accuracy: 0.9 }, 'm2', { features: [], label: '', hyperparameters: {}, sampleCount: 10 });

    const list = await listModelCheckpoints();
    expect(list.length).toBe(2);
    expect(list[0].version).toBe(2);
    expect(list[1].version).toBe(1);
  });
});
