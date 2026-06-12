/**
 * Discourse ingestion worker entry point
 */

import { createDiscourseWorker } from './worker';
import { log } from '@attrakt/core';

log.info({}, 'Starting Discourse ingestion worker');

const worker = createDiscourseWorker();

worker.on('completed', (job) => {
  log.debug({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  log.error({ error: err, jobId: job?.id }, 'Job failed');
});

log.info({}, 'Discourse ingestion worker started');

process.on('SIGINT', async () => {
  log.info({}, 'Shutting down Discourse ingestion worker');
  await worker.close();
  process.exit(0);
});
