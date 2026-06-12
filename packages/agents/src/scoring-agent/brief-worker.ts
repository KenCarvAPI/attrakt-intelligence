import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { generateAdvocateBrief } from './briefs';
import type { JobData, GenerateBriefJobData } from '@attrakt/api/src/queues/types';
import { log } from '@attrakt/core';

/**
 * Advocate brief worker.
 * Generates and persists a member brief in response to a queued request
 * (e.g. enqueued by the API endpoint).
 */
export function createBriefWorker() {
  return createWorker('generate:brief', async (job: Job<JobData>) => {
    const data = job.data as GenerateBriefJobData;

    try {
      await generateAdvocateBrief(data.clientId, data.memberId, { context: data.context });
    } catch (error) {
      log.error({ error, clientId: data.clientId, memberId: data.memberId }, 'Error generating brief');
      throw error;
    }
  });
}
