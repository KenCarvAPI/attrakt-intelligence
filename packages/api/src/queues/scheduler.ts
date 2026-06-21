import { Queue } from 'bullmq';
import { redisConnection } from './connection';
import { toQueueName, type ComputeMetricsJobData } from './types';
import { getActiveClients, log } from '@attrakt/core';

/**
 * Schedule recurring metrics computation for every active client.
 *
 * Iterates active tenants rather than assuming a single hardcoded client, and
 * gives each (client, period) its own repeatable-job key so the schedules don't
 * collide in Redis. Safe to call repeatedly: BullMQ upserts repeatables by key.
 */
export async function scheduleMetricsComputation() {
  const queue = new Queue<ComputeMetricsJobData>(toQueueName('compute:metrics'), {
    connection: redisConnection,
  });

  const periods: Array<{ period: 'hour' | 'day' | 'week'; pattern: string }> = [
    { period: 'hour', pattern: '0 * * * *' }, // Every hour
    { period: 'day', pattern: '0 0 * * *' }, // Daily at midnight
    { period: 'week', pattern: '0 0 * * 0' }, // Weekly on Sunday
  ];

  const clients = await getActiveClients();
  if (clients.length === 0) {
    log.warn({}, 'No active clients — no metrics jobs scheduled');
    return;
  }

  for (const client of clients) {
    for (const { period, pattern } of periods) {
      await queue.add(
        'compute:metrics',
        { clientId: client.id, period },
        {
          repeat: { pattern },
          // Distinct key per (client, period) so repeatables don't overwrite each other.
          jobId: `metrics-${client.id}-${period}`,
        }
      );
    }
  }

  log.info({ clientCount: clients.length }, 'Scheduled metrics computation for active clients');
}
