/**
 * Analytics queries — every function is scoped to a single `clientId`.
 *
 * These are the shared data-access functions behind the analytics MCP server.
 * Keeping them here (rather than inline in the MCP handler) makes tenant
 * isolation testable in one place.
 */

import { prisma } from '../prisma';

type Period = 'hour' | 'day' | 'week' | 'month';

function periodStart(period: Period, lookbackMultiplier = 1): Date {
  const since = new Date();
  switch (period) {
    case 'hour':
      since.setHours(since.getHours() - 24);
      break;
    case 'day':
      since.setDate(since.getDate() - 1 * lookbackMultiplier);
      break;
    case 'week':
      since.setDate(since.getDate() - 7 * lookbackMultiplier);
      break;
    case 'month':
      since.setMonth(since.getMonth() - 1 * lookbackMultiplier);
      break;
  }
  return since;
}

/**
 * Unified member profile. Scoped by clientId so a member belonging to another
 * tenant is never returned, even when its id is known/guessed.
 */
export async function getMemberProfile(clientId: string, memberId: string) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, clientId },
    include: {
      platformIdentities: true,
      _count: { select: { messages: true, events: true } },
    },
  });

  if (!member) {
    throw new Error(`Member ${memberId} not found`);
  }

  const messages = await prisma.message.groupBy({
    by: ['platform'],
    where: { memberId, clientId },
    _count: true,
  });

  const events = await prisma.event.groupBy({
    by: ['platform', 'eventType'],
    where: { memberId, clientId },
    _count: true,
  });

  const sentimentMessages = await prisma.message.findMany({
    where: { memberId, clientId, sentiment: { not: null } },
    select: { sentiment: true },
  });

  const avgSentiment =
    sentimentMessages.length > 0
      ? sentimentMessages.reduce((sum, m) => sum + (m.sentiment || 0), 0) / sentimentMessages.length
      : null;

  return {
    id: member.id,
    displayName: member.displayName,
    email: member.email,
    platformIdentities: member.platformIdentities.map((pi) => ({
      platform: pi.platform,
      username: pi.username,
      displayName: pi.displayName,
    })),
    stats: {
      totalMessages: member._count.messages,
      totalEvents: member._count.events,
      messagesByPlatform: messages.reduce(
        (acc, m) => ({ ...acc, [m.platform]: m._count }),
        {} as Record<string, number>
      ),
      eventsByPlatform: events.reduce(
        (acc, e) => ({
          ...acc,
          [e.platform]: { ...(acc[e.platform] || {}), [e.eventType]: e._count },
        }),
        {} as Record<string, Record<string, number>>
      ),
      averageSentiment: avgSentiment,
    },
    firstSeen: member.firstSeen,
    lastSeen: member.lastSeen,
  };
}

export async function getMetrics(clientId: string, metric: string, period: Period = 'day') {
  const since = periodStart(period, period === 'hour' ? 1 : 30);
  const metrics = await prisma.metric.findMany({
    where: { clientId, metricType: metric as never, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });

  return metrics.map((m) => ({
    value: m.value,
    timestamp: m.createdAt.toISOString(),
    metadata: m.metadata,
  }));
}

export async function getTopContributors(clientId: string, period: Period = 'week', limit = 10) {
  const since = periodStart(period);
  const safeLimit = Math.min(limit, 100);

  const contributors = await prisma.member.findMany({
    where: {
      clientId,
      messages: { some: { createdAt: { gte: since } } },
    },
    include: {
      _count: {
        select: {
          messages: { where: { createdAt: { gte: since } } },
          events: { where: { createdAt: { gte: since } } },
        },
      },
    },
    orderBy: { messages: { _count: 'desc' } },
    take: safeLimit,
  });

  return contributors.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    messageCount: c._count.messages,
    eventCount: c._count.events,
  }));
}

export async function getSentiment(clientId: string, period: Period = 'week', channel?: string) {
  const since = periodStart(period);

  const messages = await prisma.message.findMany({
    where: {
      clientId,
      ...(channel ? { platform: channel as never } : {}),
      sentiment: { not: null },
      createdAt: { gte: since },
    },
    select: { sentiment: true, createdAt: true, platform: true },
    orderBy: { createdAt: 'asc' },
  });

  const dailySentiment = messages.reduce(
    (acc, msg) => {
      const day = msg.createdAt.toISOString().split('T')[0];
      if (!acc[day]) acc[day] = { sum: 0, count: 0 };
      acc[day].sum += msg.sentiment || 0;
      acc[day].count += 1;
      return acc;
    },
    {} as Record<string, { sum: number; count: number }>
  );

  return Object.entries(dailySentiment).map(([day, data]) => ({
    date: day,
    averageSentiment: data.sum / data.count,
    messageCount: data.count,
  }));
}

export async function queryEvents(
  clientId: string,
  filters: { eventType?: string; platform?: string; since?: string; limit?: number } = {}
) {
  const limit = Math.min(filters.limit || 100, 1000);
  const since = filters.since ? new Date(filters.since) : undefined;

  const events = await prisma.event.findMany({
    where: {
      clientId,
      ...(filters.eventType ? { eventType: filters.eventType as never } : {}),
      ...(filters.platform ? { platform: filters.platform as never } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { member: { select: { id: true, displayName: true } } },
  });

  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    platform: e.platform,
    member: e.member ? { id: e.member.id, displayName: e.member.displayName } : null,
    eventData: e.eventData,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function getGrowth(clientId: string, period: Period = 'week') {
  const since = periodStart(period);

  const joins = await prisma.event.count({
    where: { clientId, eventType: 'JOIN', createdAt: { gte: since } },
  });
  const leaves = await prisma.event.count({
    where: { clientId, eventType: 'LEAVE', createdAt: { gte: since } },
  });
  const totalMembers = await prisma.member.count({ where: { clientId } });

  return {
    period,
    joins,
    leaves,
    netGrowth: joins - leaves,
    totalMembers,
    growthRate: totalMembers > 0 ? ((joins - leaves) / totalMembers) * 100 : 0,
  };
}

/** Recent metrics for a client (backs the analytics resource endpoint). */
export async function getRecentMetrics(clientId: string, take = 100) {
  const metrics = await prisma.metric.findMany({
    where: { clientId },
    take,
    orderBy: { createdAt: 'desc' },
  });
  return metrics.map((m) => ({
    type: m.metricType,
    value: m.value,
    timestamp: m.createdAt.toISOString(),
  }));
}
