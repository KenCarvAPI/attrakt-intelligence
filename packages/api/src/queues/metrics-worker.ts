import { createWorker } from './workers';
import { Job } from 'bullmq';
import { prisma, log } from '@attrakt/core';
import type { JobData, ComputeMetricsJobData } from './types';

/**
 * Compute and persist the full metric set for a client over a period.
 *
 * Extracted from the worker processor so it can also be invoked directly
 * (e.g. the `metrics:compute` CLI) without going through the BullMQ transport.
 * Computes DAU/WAU/MAU, message volume, response rate, contributor velocity,
 * sentiment aggregates, growth rate, and member count, then writes one
 * `Metric` row per type.
 */
export async function computeMetrics(
  clientId: string,
  period: 'hour' | 'day' | 'week' = 'hour'
): Promise<number> {
  const now = new Date();
  let since: Date;

  switch (period) {
    case 'hour':
      since = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case 'day':
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // DAU (Daily Active Users)
  const dauStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dau = await prisma.member.count({
    where: {
      clientId,
      messages: {
        some: {
          createdAt: { gte: dauStart },
        },
      },
    },
  });

  // WAU (Weekly Active Users)
  const wauStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const wau = await prisma.member.count({
    where: {
      clientId,
      messages: {
        some: {
          createdAt: { gte: wauStart },
        },
      },
    },
  });

  // MAU (Monthly Active Users)
  const mauStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const mau = await prisma.member.count({
    where: {
      clientId,
      messages: {
        some: {
          createdAt: { gte: mauStart },
        },
      },
    },
  });

  // Message volume
  const messageCount = await prisma.message.count({
    where: {
      clientId,
      createdAt: { gte: since },
    },
  });

  // Response rate (messages with replies/reactions)
  const messagesWithReactions = await prisma.event.count({
    where: {
      clientId,
      eventType: 'MESSAGE_REACTION',
      createdAt: { gte: since },
    },
  });

  const responseRate = messageCount > 0 ? (messagesWithReactions / messageCount) * 100 : 0;

  // Contributor velocity (events per active member)
  const activeMembers = await prisma.member.count({
    where: {
      clientId,
      events: {
        some: {
          createdAt: { gte: since },
        },
      },
    },
  });

  const totalEvents = await prisma.event.count({
    where: {
      clientId,
      createdAt: { gte: since },
    },
  });

  const contributorVelocity = activeMembers > 0 ? totalEvents / activeMembers : 0;

  // Sentiment aggregates
  const messages = await prisma.message.findMany({
    where: {
      clientId,
      sentiment: { not: null },
      createdAt: { gte: since },
    },
    select: { sentiment: true },
  });

  const sentimentSum = messages.reduce((sum, m) => sum + (m.sentiment || 0), 0);
  const avgSentiment = messages.length > 0 ? sentimentSum / messages.length : 0;
  const positiveSentiment = messages.filter((m) => (m.sentiment || 0) > 0.2).length;
  const negativeSentiment = messages.filter((m) => (m.sentiment || 0) < -0.2).length;

  // Growth rate
  const joins = await prisma.event.count({
    where: {
      clientId,
      eventType: 'JOIN',
      createdAt: { gte: since },
    },
  });

  const leaves = await prisma.event.count({
    where: {
      clientId,
      eventType: 'LEAVE',
      createdAt: { gte: since },
    },
  });

  const totalMembers = await prisma.member.count({
    where: { clientId },
  });

  const growthRate = totalMembers > 0 ? ((joins - leaves) / totalMembers) * 100 : 0;

  // Store metrics
  const metrics = [
    { type: 'DAU' as const, value: dau },
    { type: 'WAU' as const, value: wau },
    { type: 'MAU' as const, value: mau },
    { type: 'MESSAGE_VOLUME' as const, value: messageCount },
    { type: 'RESPONSE_RATE' as const, value: responseRate },
    { type: 'CONTRIBUTOR_VELOCITY' as const, value: contributorVelocity },
    { type: 'SENTIMENT_AVERAGE' as const, value: avgSentiment },
    { type: 'SENTIMENT_POSITIVE' as const, value: (positiveSentiment / messages.length) * 100 || 0 },
    { type: 'SENTIMENT_NEGATIVE' as const, value: (negativeSentiment / messages.length) * 100 || 0 },
    { type: 'GROWTH_RATE' as const, value: growthRate },
    { type: 'MEMBER_COUNT' as const, value: totalMembers },
  ];

  await Promise.all(
    metrics.map((metric) =>
      prisma.metric.create({
        data: {
          clientId,
          metricType: metric.type,
          value: metric.value,
          metadata: {
            period,
            computedAt: now.toISOString(),
          },
          createdAt: now,
        },
      })
    )
  );

  log.info({ clientId, period, count: metrics.length }, 'Computed metrics');
  return metrics.length;
}

/**
 * Metrics computation worker
 * Computes hourly metrics: DAU/WAU/MAU, message volume, response rates, contributor velocity, sentiment, growth
 */
export function createMetricsWorker() {
  return createWorker('compute:metrics', async (job: Job<JobData>) => {
    const data = job.data as ComputeMetricsJobData;

    try {
      await computeMetrics(data.clientId, data.period);
    } catch (error) {
      log.error({ error, clientId: data.clientId, period: data.period }, 'Error computing metrics');
      throw error;
    }
  });
}
