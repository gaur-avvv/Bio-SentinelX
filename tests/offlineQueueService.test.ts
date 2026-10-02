import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueOfflinePayload,
  getPendingOutboxItems,
  flushOutboxQueue,
  getOutboxStatus,
  calculateBackoffMs,
  clearOutboxQueue,
} from '../services/offlineQueueService';

describe('Resilient Offline Outbox Queue', () => {
  beforeEach(() => {
    clearOutboxQueue();
  });

  it('should enqueue offline payloads and track pending status', () => {
    const item = enqueueOfflinePayload('/api/outbreaks/report', {
      district: 'Kalyan',
      disease: 'Dengue',
      cases: 4,
    });

    expect(item.status).toBe('pending');
    expect(item.endpoint).toBe('/api/outbreaks/report');

    const status = getOutboxStatus();
    expect(status.total).toBe(1);
    expect(status.pending).toBe(1);
  });

  it('should calculate exponential backoff with jitter bounded by 60 seconds', () => {
    const delay0 = calculateBackoffMs(0);
    const delay3 = calculateBackoffMs(3);
    const delay10 = calculateBackoffMs(10);

    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay3).toBeGreaterThanOrEqual(8000);
    expect(delay10).toBe(60000); // capped at 60s
  });

  it('should successfully flush pending queue items when online', async () => {
    enqueueOfflinePayload('/api/sync', { item: 1 });
    enqueueOfflinePayload('/api/sync', { item: 2 });

    const result = await flushOutboxQueue(async () => true);

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
    expect(getPendingOutboxItems().length).toBe(0);
  });

  it('should increment retries and transition to dead letter upon persistent failures', async () => {
    const item = enqueueOfflinePayload('/api/failing', { attempts: 0 });

    // Simulate 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      // Fast forward retry timer
      item.nextRetryAt = Date.now() - 1000;
      await flushOutboxQueue(async () => false);
    }

    const status = getOutboxStatus();
    expect(status.deadLetter).toBe(1);
  });
});
