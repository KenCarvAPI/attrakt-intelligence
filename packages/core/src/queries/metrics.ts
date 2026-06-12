/**
 * Metrics computation — scoped to a single `clientId`.
 *
 * Extracted from the compute:metrics worker so the same logic runs per tenant
 * and can be exercised by the multi-tenancy isolation tests.
 */

import { prisma } from '../prisma';

export type MetricsPeriod = 'hour' | 'day' | 'week';

/**
 * Compute and persist the standard metric set for one client/period.
 * Returns the metrics that were written (without the metadata) for convenience.
 */
export async function computeMetrics(clientId: string, period: MetricsPeriod) {
  const now = new Date();
  let since: Date;
  switch (period) {
    case 'hour':
      since = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'day':
    default:
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }

  const dauStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const wauStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const mauStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeWindow = (start: Date) =>
    prisma.member.count({ where: { clientId, messages: { some: { createdAt: { gte: start } } } } });

  const dau = await activeWindow(dauStart);
  const wau = await activeWindow(wauStart);
  const mau = await activeWindow(mauStart);

  const messageCount = await prisma.message.count({
    where: { clientId, createdAt: { gte: since } },
  });

  const messagesWithReactions = await prisma.event.count({
    where: { clientId, eventType: 'MESSAGE_REACTION', createdAt: { gte: since } },
  });
  const responseRate = messageCount > 0 ? (messagesWithReactions / messageCount) * 100 : 0;

  const activeMembers = await prisma.member.count({
    where: { clientId, events: { some: { createdAt: { gte: since } } } },
  });
  const totalEvents = await prisma.event.count({
    where: { clientId, createdAt: { gte: since } },
  });
  const contributorVelocity = activeMembers > 0 ? totalEvents / activeMembers : 0;

  const messages = await prisma.message.findMany({
    where: { clientId, sentiment: { not: null }, createdAt: { gte: since } },
    select: { sentiment: true },
  });
  const sentimentSum = messages.reduce((sum, m) => sum + (m.sentiment || 0), 0);
  const avgSentiment = messages.length > 0 ? sentimentSum / messages.length : 0;
  const positiveSentiment = messages.filter((m) => (m.sentiment || 0) > 0.2).length;
  const negativeSentiment = messages.filter((m) => (m.sentiment || 0) < -0.2).length;

  const joins = await prisma.event.count({
    where: { clientId, eventType: 'JOIN', createdAt: { gte: since } },
  });
  const leaves = await prisma.event.count({
    where: { clientId, eventType: 'LEAVE', createdAt: { gte: since } },
  });
  const totalMembers = await prisma.member.count({ where: { clientId } });
  const growthRate = totalMembers > 0 ? ((joins - leaves) / totalMembers) * 100 : 0;

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
          metadata: { period, computedAt: now.toISOString() },
          createdAt: now,
        },
      })
    )
  );

  return metrics;
}
