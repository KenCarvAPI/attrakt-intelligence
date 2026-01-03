/**
 * Twitter ingestion worker entry point
 */

import { createTwitterWorker } from './worker';
import { log } from '@attrakt/core';

log.info({}, 'Starting Twitter ingestion worker');

const worker = createTwitterWorker();

worker.on('completed', (job) => {
  log.debug({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  log.error({ error: err, jobId: job?.id }, 'Job failed');
});

log.info({}, 'Twitter ingestion worker started');

process.on('SIGINT', async () => {
  log.info({}, 'Shutting down Twitter ingestion worker');
  await worker.close();
  process.exit(0);
});
