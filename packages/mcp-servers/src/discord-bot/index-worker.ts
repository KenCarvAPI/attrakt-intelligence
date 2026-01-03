/**
 * Discord ingestion worker entry point
 * Run this separately from the Discord bot to process queued events
 */

import { createDiscordWorker } from './worker';
import { log } from '@attrakt/core';

log.info({}, 'Starting Discord ingestion worker');

const worker = createDiscordWorker();

worker.on('completed', (job) => {
  log.debug({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  log.error({ error: err, jobId: job?.id }, 'Job failed');
});

log.info({}, 'Discord ingestion worker started');

// Graceful shutdown
process.on('SIGINT', async () => {
  log.info({}, 'Shutting down Discord ingestion worker');
  await worker.close();
  process.exit(0);
});
