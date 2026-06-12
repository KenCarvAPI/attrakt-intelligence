import { Worker, Queue, Job } from 'bullmq';
import { redisConnection } from './connection';
import { type JobData } from './types';

/**
 * Create workers for each job type
 * Workers will be implemented in respective packages (ingestion workers, agent workers)
 */
export function createWorker(jobType: string, processor: (job: Job<JobData>) => Promise<void>) {
  return new Worker<JobData>(jobType, processor, {
    connection: redisConnection,
    concurrency: 5,
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 24 * 3600, // Keep failed jobs for 24 hours
    },
  });
}

/**
 * Helper to create a queue for a job type
 */
export function createQueue(jobType: string) {
  return new Queue(jobType, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 24 * 3600,
      },
    },
  });
}

/**
 * Helper to add a job to a queue
 */
export async function addJob(jobType: string, data: JobData, options?: { delay?: number; priority?: number }) {
  const queue = createQueue(jobType);
  return queue.add(jobType, data, options);
}
