import { Queue } from 'bullmq';
import { redisConnection } from './connection';
import type { ComputeMetricsJobData } from './types';
import { getActiveClients, log } from '@attrakt/core';

/**
 * Schedule metrics computation jobs.
 *
 * Runs hourly/daily/weekly for *every active client* rather than a single
 * hardcoded tenant. Repeatable jobs are keyed by clientId+period so each
 * client gets its own independent schedule.
 */
export async function scheduleMetricsComputation() {
  const queue = new Queue<ComputeMetricsJobData>('compute:metrics', {
    connection: redisConnection,
  });

  const clients = await getActiveClients();

  if (clients.length === 0) {
    log.warn({}, 'No active clients found; no metrics computation scheduled');
    return;
  }

  const schedules: Array<{ period: ComputeMetricsJobData['period']; pattern: string }> = [
    { period: 'hour', pattern: '0 * * * *' }, // Every hour
    { period: 'day', pattern: '0 0 * * *' }, // Daily at midnight
    { period: 'week', pattern: '0 0 * * 0' }, // Weekly on Sunday
  ];

  for (const client of clients) {
    for (const { period, pattern } of schedules) {
      await queue.add(
        'compute:metrics',
        { clientId: client.id, period },
        {
          // Distinct job id per client+period so schedules don't collide.
          jobId: `compute:metrics:${client.id}:${period}`,
          repeat: { pattern },
        }
      );
    }
  }

  log.info({ clientCount: clients.length }, 'Scheduled metrics computation jobs for active clients');
}
