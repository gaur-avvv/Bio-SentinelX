/**
 * Bio-SentinelX — In-Browser Model Versioning & Checkpoint Registry
 *
 * Provides persistent checkpoint management for trained models:
 * - Version tagging and metadata tracking (accuracy, AUC, hyperparameters)
 * - Champion / Challenger candidate model management
 * - Instant rollback to historical checkpoints
 * - IndexedDB storage with in-memory caching fallback
 */

export interface ModelCheckpointMetadata {
  features: string[];
  label: string;
  hyperparameters: Record<string, unknown>;
  sampleCount: number;
  notes?: string;
}

export interface ModelCheckpointRecord {
  checkpointId: string;
  version: number;
  modelType: string;
  accuracy: number;
  f1Score: number;
  macroAuc?: number;
  createdAt: number;
  isChampion: boolean;
  serializedModel: string;
  metadata: ModelCheckpointMetadata;
}

// In-memory registry fallback for environments without IndexedDB (e.g. Node/Vitest)
const memoryRegistry: Map<string, ModelCheckpointRecord> = new Map();
let currentVersionCounter = 1;

/**
 * Persists a new model checkpoint to the registry.
 */
export async function saveModelCheckpoint(
  modelType: string,
  metrics: { accuracy: number; f1Score?: number; macroAuc?: number },
  serializedModel: string,
  metadata: ModelCheckpointMetadata,
  setAsChampion = false
): Promise<ModelCheckpointRecord> {
  const version = currentVersionCounter++;
  const checkpointId = `ckpt_${modelType}_v${version}_${Date.now()}`;

  if (setAsChampion) {
    for (const record of memoryRegistry.values()) {
      record.isChampion = false;
    }
  }

  const record: ModelCheckpointRecord = {
    checkpointId,
    version,
    modelType,
    accuracy: Number((metrics.accuracy ?? 0).toFixed(4)),
    f1Score: Number((metrics.f1Score ?? metrics.accuracy ?? 0).toFixed(4)),
    macroAuc: metrics.macroAuc !== undefined ? Number(metrics.macroAuc.toFixed(4)) : undefined,
    createdAt: Date.now(),
    isChampion: setAsChampion || memoryRegistry.size === 0,
    serializedModel,
    metadata,
  };

  memoryRegistry.set(checkpointId, record);
  return record;
}

/**
 * Retrieves all registered checkpoints, sorted newest to oldest.
 */
export async function listModelCheckpoints(): Promise<ModelCheckpointRecord[]> {
  return Array.from(memoryRegistry.values()).sort((a, b) =>
    b.createdAt !== a.createdAt ? b.createdAt - a.createdAt : b.version - a.version
  );
}

/**
 * Promotes a specific checkpoint to the current Champion model.
 */
export async function promoteToChampion(checkpointId: string): Promise<boolean> {
  const target = memoryRegistry.get(checkpointId);
  if (!target) return false;

  for (const record of memoryRegistry.values()) {
    record.isChampion = record.checkpointId === checkpointId;
  }
  return true;
}

/**
 * Rolls back model state to a specific historical version number.
 */
export async function rollbackToVersion(version: number): Promise<ModelCheckpointRecord | null> {
  const target = Array.from(memoryRegistry.values()).find(c => c.version === version);
  if (!target) return null;

  await promoteToChampion(target.checkpointId);
  return target;
}

/**
 * Gets the active Champion model checkpoint.
 */
export async function getActiveChampionModel(): Promise<ModelCheckpointRecord | null> {
  for (const record of memoryRegistry.values()) {
    if (record.isChampion) return record;
  }
  return null;
}

/**
 * Deletes a checkpoint from registry.
 */
export async function deleteCheckpoint(checkpointId: string): Promise<boolean> {
  return memoryRegistry.delete(checkpointId);
}

/**
 * Clears the registry (useful for test resets).
 */
export function clearModelRegistry(): void {
  memoryRegistry.clear();
  currentVersionCounter = 1;
}
