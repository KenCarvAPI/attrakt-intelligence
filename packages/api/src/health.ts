/**
 * Health check utilities
 */

import { prisma, log } from '@attrakt/core';
import { redisConnection } from './queues/connection';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  checks: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
  };
  timestamp: string;
}

/**
 * Perform health checks
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks = {
    database: 'unhealthy' as 'healthy' | 'unhealthy',
    redis: 'unhealthy' as 'healthy' | 'unhealthy',
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'healthy';
  } catch (error) {
    log.error({ error }, 'Database health check failed');
  }

  // Check Redis
  try {
    await redisConnection.ping();
    checks.redis = 'healthy';
  } catch (error) {
    log.error({ error }, 'Redis health check failed');
  }

  const allHealthy = checks.database === 'healthy' && checks.redis === 'healthy';

  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  };
}
