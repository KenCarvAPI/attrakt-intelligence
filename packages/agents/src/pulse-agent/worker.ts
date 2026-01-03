import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { processPulseJob } from './index';
import type { JobData, AgentPulseJobData } from '@attrakt/api/src/queues/types';
import { log } from '@attrakt/core';

/**
 * Community Pulse agent worker
 * Processes scheduled digest generation jobs
 */
export function createPulseWorker() {
  return createWorker('agent:pulse', async (job: Job<JobData>) => {
    const data = job.data as AgentPulseJobData;

    try {
      await processPulseJob(data.clientId, data.date);
    } catch (error) {
      log.error({ error, clientId: data.clientId }, 'Error processing pulse job');
      throw error;
    }
  });
}
