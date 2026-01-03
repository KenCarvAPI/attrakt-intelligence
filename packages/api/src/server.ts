import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { redisConnection } from './queues/connection';
import { jobTypes } from './queues/types';
import { performHealthCheck } from './health';
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
  (jobType) => new Queue(jobType, { connection: redisConnection })
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
}
