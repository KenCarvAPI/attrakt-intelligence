import { Queue } from 'bullmq';
import { redisConnection } from './connection';
import { toQueueName, type ComputeMetricsJobData } from './types';
import { config, log } from '@attrakt/core';

/**
 * Schedule metrics computation jobs
 * Runs hourly for all clients
 */
export function scheduleMetricsComputation() {
  const queue = new Queue<ComputeMetricsJobData>(toQueueName('compute:metrics'), {
    connection: redisConnection,
  });

  // Schedule hourly metrics computation
  const scheduleHourly = () => {
    // For each client, schedule metrics computation
    // In MVP, we'll use a default client or fetch from database
    const clientId = config.defaultClientId;

    queue.add(
      'compute:metrics',
      {
        clientId,
        period: 'hour',
      },
      {
        repeat: {
          pattern: '0 * * * *', // Every hour
        },
      }
    );

    // Also schedule daily and weekly metrics
    queue.add(
      'compute:metrics',
      {
        clientId,
        period: 'day',
      },
      {
        repeat: {
          pattern: '0 0 * * *', // Daily at midnight
        },
      }
    );

    queue.add(
      'compute:metrics',
      {
        clientId,
        period: 'week',
      },
      {
        repeat: {
          pattern: '0 0 * * 0', // Weekly on Sunday
        },
      }
    );

    log.info({ clientId }, 'Scheduled metrics computation jobs');
  };

  scheduleHourly();
}
