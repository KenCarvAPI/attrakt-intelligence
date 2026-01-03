import Redis from 'ioredis';
import { config, log } from '@attrakt/core';

export const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err) => {
  log.error({ error: err }, 'Redis connection error');
});

redisConnection.on('connect', () => {
  log.info({}, 'Redis connected');
});
