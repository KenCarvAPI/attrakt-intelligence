/**
 * GitHub ingestion worker entry point
 * Run this separately from the webhook receiver to process queued events
 */

import { createGitHubWorker } from './worker';
import { log } from '@attrakt/core';

log.info({}, 'Starting GitHub ingestion worker');

const worker = createGitHubWorker();

worker.on('completed', (job) => {
  log.debug({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  log.error({ error: err, jobId: job?.id }, 'Job failed');
});

log.info({}, 'GitHub ingestion worker started');

// Graceful shutdown
process.on('SIGINT', async () => {
  log.info({}, 'Shutting down GitHub ingestion worker');
  await worker.close();
  process.exit(0);
});
