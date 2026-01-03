import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { processThreatScanJob } from './index';
import type { JobData, AgentThreatScanJobData } from '@attrakt/api/src/queues/types';
import { log } from '@attrakt/core';

/**
 * Threat Detection agent worker
 * Processes scheduled threat scan jobs
 */
export function createThreatWorker() {
  return createWorker('agent:threat-scan', async (job: Job<JobData>) => {
    const data = job.data as AgentThreatScanJobData;

    try {
      await processThreatScanJob(data.clientId, data.platform);
    } catch (error) {
      log.error({ error, clientId: data.clientId, platform: data.platform }, 'Error processing threat scan job');
      throw error;
    }
  });
}
