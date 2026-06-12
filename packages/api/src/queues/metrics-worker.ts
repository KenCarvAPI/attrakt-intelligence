import { createWorker } from './workers';
import { Job } from 'bullmq';
import { computeMetrics, log } from '@attrakt/core';
import type { JobData, ComputeMetricsJobData } from './types';

/**
 * Metrics computation worker
 * Computes hourly metrics: DAU/WAU/MAU, message volume, response rates,
 * contributor velocity, sentiment, growth — for a single client per job.
 */
export function createMetricsWorker() {
  return createWorker('compute:metrics', async (job: Job<JobData>) => {
    const data = job.data as ComputeMetricsJobData;

    try {
      await computeMetrics(data.clientId, data.period);
      log.info({ clientId: data.clientId, period: data.period }, 'Computed metrics');
    } catch (error) {
      log.error({ error, clientId: data.clientId, period: data.period }, 'Error computing metrics');
      throw error;
    }
  });
}
