import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { redisConnection } from './queues/connection';
import { jobTypes, toQueueName } from './queues/types';
import { addJob } from './queues/workers';
import { performHealthCheck } from './health';
import { scheduleMetricsComputation } from './queues/scheduler';
import { createMetricsWorker } from './queues/metrics-worker';
import { knowledgeRouter } from './routes/knowledge';
import { campaignRouter } from './routes/campaign';
import { config, log, prisma } from '@attrakt/core';

const app = express();
const PORT = config.port;

app.use(express.json({ limit: '10mb' }));

// Knowledge intake (paste path) + campaign brief generation
app.use('/api', knowledgeRouter);
app.use('/api', campaignRouter);

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

// Advocate brief endpoints.
//
// GET returns the most recent stored brief for a member; POST enqueues a
// generation job (processed asynchronously by the scoring agent's brief worker,
// which holds the Anthropic client).
async function resolveMember(slug: string, memberId: string) {
  const client = await prisma.client.findUnique({ where: { slug } });
  if (!client) return { error: 'client_not_found' as const };
  const member = await prisma.member.findFirst({
    where: { id: memberId, clientId: client.id },
    select: { id: true },
  });
  if (!member) return { error: 'member_not_found' as const };
  return { clientId: client.id, memberId: member.id };
}

app.get('/clients/:slug/members/:memberId/brief', async (req, res) => {
  try {
    const resolved = await resolveMember(req.params.slug, req.params.memberId);
    if ('error' in resolved) {
      return res.status(404).json({ error: resolved.error });
    }
    const brief = await prisma.advocateBrief.findFirst({
      where: { memberId: resolved.memberId, clientId: resolved.clientId },
      orderBy: { createdAt: 'desc' },
    });
    if (!brief) {
      return res.status(404).json({ error: 'no_brief', message: 'No brief generated yet' });
    }
    return res.json(brief);
  } catch (error) {
    log.error({ error }, 'Failed to fetch advocate brief');
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/clients/:slug/members/:memberId/brief', async (req, res) => {
  try {
    const resolved = await resolveMember(req.params.slug, req.params.memberId);
    if ('error' in resolved) {
      return res.status(404).json({ error: resolved.error });
    }
    const context = typeof req.body?.context === 'string' ? req.body.context : undefined;
    await addJob('generate:brief', {
      clientId: resolved.clientId,
      memberId: resolved.memberId,
      context,
    });
    return res.status(202).json({ status: 'queued' });
  } catch (error) {
    log.error({ error }, 'Failed to enqueue advocate brief');
    return res.status(500).json({ error: 'internal_error' });
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
