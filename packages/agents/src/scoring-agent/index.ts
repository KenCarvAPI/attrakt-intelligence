/**
 * Advocate scoring agent.
 *
 * Thin orchestration around the scoring maths in @attrakt/core. Computes
 * advocate scores for a client (one ISO-week period at a time), schedules the
 * weekly run, and is also driven directly by the `scoring:run` CLI.
 */
import { Queue } from 'bullmq';
import { computeAdvocateScores, log } from '@attrakt/core';
import { redisConnection } from '@attrakt/api';
import type { ComputeScoringJobData } from '@attrakt/api/src/queues/types';

/**
 * Compute and persist advocate scores for a client. `referenceDate` selects the
 * ISO week to score and defaults to now.
 */
export async function processScoringJob(clientId: string, referenceDate?: string) {
  const date = referenceDate ? new Date(referenceDate) : new Date();
  return computeAdvocateScores(clientId, date);
}

/**
 * Schedule the weekly scoring run. Runs Mondays at 02:00 UTC, which scores the
 * week that just closed.
 */
export function scheduleWeeklyScoring(clientId: string) {
  const queue = new Queue<ComputeScoringJobData>('compute:scoring', {
    connection: redisConnection,
  });

  queue.add(
    'compute:scoring',
    { clientId },
    {
      repeat: {
        pattern: '0 2 * * 1', // Mondays at 02:00 UTC
      },
    }
  );

  log.info({ clientId }, 'Scheduled weekly advocate scoring');
}
