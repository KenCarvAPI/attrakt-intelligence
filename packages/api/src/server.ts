import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { redisConnection } from './queues/connection';
import { jobTypes, toQueueName } from './queues/types';
import { performHealthCheck } from './health';
import { scheduleMetricsComputation } from './queues/scheduler';
import { createMetricsWorker } from './queues/metrics-worker';
import { config, log } from '@attrakt/core';

const app = express();
const PORT = config.port;

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

// Bull Board setup for queue visualization
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const queues = jobTypes.map(
  (jobType) => new Queue(toQueueName(jobType), { connection: redisConnection })
);

createBullBoard({
  queues: queues.map((queue) => new BullMQAdapter(queue)),
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

export default app;

if (require.main === module) {
  app.listen(PORT, () => {
    log.info({ port: PORT }, 'API server running');
    log.info({ url: `http://localhost:${PORT}/admin/queues` }, 'Queue dashboard available');
  });

  // Bootstrap background processing: schedule recurring metric jobs and start
  // the worker that consumes them. Without this the Metric table is never
  // populated (which is what left the pulse digest's metrics empty).
  scheduleMetricsComputation();
  const metricsWorker = createMetricsWorker();
  log.info({}, 'Metrics scheduler and worker started');

  process.on('SIGINT', async () => {
    log.info({}, 'Shutting down API server');
    await metricsWorker.close();
    process.exit(0);
  });
}
