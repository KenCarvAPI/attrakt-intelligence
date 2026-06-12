import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { processScoringJob } from './index';
import type { JobData, ComputeScoringJobData } from '@attrakt/api/src/queues/types';
import { log } from '@attrakt/core';

/**
 * Advocate scoring worker.
 * Processes weekly (or manually triggered) score-computation jobs per client.
 */
export function createScoringWorker() {
  return createWorker('compute:scoring', async (job: Job<JobData>) => {
    const data = job.data as ComputeScoringJobData;

    try {
      await processScoringJob(data.clientId, data.referenceDate);
    } catch (error) {
      log.error({ error, clientId: data.clientId }, 'Error processing scoring job');
      throw error;
    }
  });
}
