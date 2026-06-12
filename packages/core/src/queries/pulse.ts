/**
 * Data gathering for the Community Pulse agent — scoped to a single `clientId`.
 * The agent layer turns this into a Claude-generated digest; the DB reads live
 * here so tenant isolation is enforced and testable.
 */

import { prisma } from '../prisma';

export interface DigestData {
  metrics: Array<{ metricType: string; value: number; createdAt: Date }>;
  previousMetrics: Array<{ metricType: string; value: number; createdAt: Date }>;
  topContributors: Array<{ id: string; displayName: string | null; _count: { messages: number } }>;
  recentMessages: Array<{ content: string; member: { displayName: string | null } | null }>;
  date: Date;
}

export async function gatherDigestData(clientId: string, date: Date = new Date()): Promise<DigestData> {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date(date);
  today.setHours(0, 0, 0, 0);

  const dayBefore = new Date(yesterday);
  dayBefore.setDate(dayBefore.getDate() - 1);

  const metrics = await prisma.metric.findMany({
    where: {
      clientId,
      metricType: { in: ['DAU', 'MESSAGE_VOLUME', 'SENTIMENT_AVERAGE', 'GROWTH_RATE', 'MEMBER_COUNT'] },
      createdAt: { gte: yesterday, lt: today },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const previousMetrics = await prisma.metric.findMany({
    where: {
      clientId,
      metricType: { in: ['DAU', 'MESSAGE_VOLUME', 'SENTIMENT_AVERAGE'] },
      createdAt: { gte: dayBefore, lt: yesterday },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const topContributors = await prisma.member.findMany({
    where: { clientId, messages: { some: { createdAt: { gte: yesterday } } } },
    include: {
      _count: { select: { messages: { where: { createdAt: { gte: yesterday } } } } },
    },
    orderBy: { messages: { _count: 'desc' } },
    take: 10,
  });

  const recentMessages = await prisma.message.findMany({
    where: { clientId, createdAt: { gte: yesterday } },
    include: {
      member: {
        select: {
          displayName: true,
          platformIdentities: { select: { username: true, platform: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return { metrics, previousMetrics, topContributors, recentMessages, date: yesterday };
}

/**
 * Recent messages for the threat-detection agent — scoped to a single client
 * (and optionally one platform).
 */
export async function getMessagesForThreatScan(
  clientId: string,
  platform?: 'DISCORD' | 'GITHUB' | 'TWITTER' | 'DISCOURSE',
  sinceMs = 15 * 60 * 1000
) {
  const since = new Date(Date.now() - sinceMs);
  return prisma.message.findMany({
    where: {
      clientId,
      ...(platform ? { platform } : {}),
      createdAt: { gte: since },
    },
    include: { member: { include: { platformIdentities: true } } },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
}
