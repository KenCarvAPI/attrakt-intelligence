import 'server-only';
// Import the Prisma client from its submodule, not the @attrakt/core barrel —
// the barrel re-exports the Discord/GitHub/Twitter clients, which drag heavy
// node-only deps into the Next bundle.
import { prisma } from '@attrakt/core/src/prisma';
import type { Platform, AdvocateSegment } from '@prisma/client';
import { ALL_PLATFORMS } from './format';

const DAY = 86400000;
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

export async function getClient(slug: string) {
  return prisma.client.findUnique({ where: { slug } });
}

export async function listClients() {
  return prisma.client.findMany({ orderBy: { name: 'asc' } });
}

// --- Overview ---------------------------------------------------------------
export interface HeadlineMetric {
  current: number;
  prior: number;
}

export interface OverviewData {
  activeMembers: HeadlineMetric;
  newMembers: HeadlineMetric;
  messages: HeadlineMetric;
  governance: HeadlineMetric;
  messagesByPlatform: { platform: Platform; count: number }[];
  activitySeries: { date: string; messages: number; events: number }[];
  segments: { segment: AdvocateSegment; count: number }[];
}

async function distinctActiveMembers(clientId: string, from: Date, to: Date): Promise<number> {
  const rows = await prisma.message.findMany({
    where: { clientId, memberId: { not: null }, createdAt: { gte: from, lt: to } },
    distinct: ['memberId'],
    select: { memberId: true },
  });
  return rows.length;
}

export async function getOverview(clientId: string): Promise<OverviewData> {
  const now = new Date();
  const d30 = daysAgo(30);
  const d60 = daysAgo(60);
  const d90 = daysAgo(90);

  const [
    activeCur,
    activePrior,
    newCur,
    newPrior,
    msgCur,
    msgPrior,
    govCur,
    govPrior,
    byPlatform,
    recentMessages,
    recentEvents,
    latestScore,
  ] = await Promise.all([
    distinctActiveMembers(clientId, d30, now),
    distinctActiveMembers(clientId, d60, d30),
    prisma.member.count({ where: { clientId, deletedAt: null, firstSeen: { gte: d30 } } }),
    prisma.member.count({ where: { clientId, deletedAt: null, firstSeen: { gte: d60, lt: d30 } } }),
    prisma.message.count({ where: { clientId, createdAt: { gte: d30 } } }),
    prisma.message.count({ where: { clientId, createdAt: { gte: d60, lt: d30 } } }),
    prisma.message.count({ where: { clientId, platform: 'DISCOURSE', createdAt: { gte: d30 } } }),
    prisma.message.count({ where: { clientId, platform: 'DISCOURSE', createdAt: { gte: d60, lt: d30 } } }),
    prisma.message.groupBy({
      by: ['platform'],
      where: { clientId, createdAt: { gte: d30 } },
      _count: { _all: true },
    }),
    prisma.message.findMany({
      where: { clientId, createdAt: { gte: d90 } },
      select: { createdAt: true },
    }),
    prisma.event.findMany({
      where: { clientId, createdAt: { gte: d90 } },
      select: { createdAt: true },
    }),
    prisma.advocateScore.findFirst({ where: { clientId }, orderBy: { period: 'desc' }, select: { period: true } }),
  ]);

  // 90-day daily buckets.
  const buckets = new Map<string, { messages: number; events: number }>();
  for (let i = 89; i >= 0; i--) {
    const key = daysAgo(i).toISOString().slice(0, 10);
    buckets.set(key, { messages: 0, events: 0 });
  }
  for (const m of recentMessages) {
    const k = m.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(k);
    if (b) b.messages++;
  }
  for (const e of recentEvents) {
    const k = e.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(k);
    if (b) b.events++;
  }
  const activitySeries = [...buckets.entries()].map(([date, v]) => ({ date, ...v }));

  // Segment distribution (latest period).
  let segments: { segment: AdvocateSegment; count: number }[] = [];
  if (latestScore) {
    const grouped = await prisma.advocateScore.groupBy({
      by: ['segment'],
      where: { clientId, period: latestScore.period },
      _count: { _all: true },
    });
    segments = grouped.map((g) => ({ segment: g.segment, count: g._count._all }));
  }

  const messagesByPlatform = ALL_PLATFORMS.map((platform) => ({
    platform,
    count: byPlatform.find((b) => b.platform === platform)?._count._all ?? 0,
  })).filter((p) => p.count > 0);

  return {
    activeMembers: { current: activeCur, prior: activePrior },
    newMembers: { current: newCur, prior: newPrior },
    messages: { current: msgCur, prior: msgPrior },
    governance: { current: govCur, prior: govPrior },
    messagesByPlatform,
    activitySeries,
    segments,
  };
}

// --- Members ----------------------------------------------------------------
export async function listMembers(clientId: string) {
  const members = await prisma.member.findMany({
    where: { clientId, deletedAt: null },
    include: {
      platformIdentities: { select: { platform: true } },
      advocateScores: { orderBy: { period: 'desc' }, take: 1 },
    },
  });

  return members
    .map((m) => {
      const score = m.advocateScores[0] ?? null;
      const platforms = [...new Set(m.platformIdentities.map((p) => p.platform))];
      return {
        id: m.id,
        displayName: m.displayName ?? 'Unknown',
        lastSeen: m.lastSeen,
        composite: score?.compositeScore ?? 0,
        segment: (score?.segment ?? 'LURKER') as AdvocateSegment,
        platforms,
      };
    })
    .sort((a, b) => b.composite - a.composite);
}

export async function getMemberDetail(clientId: string, memberId: string) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, clientId },
    include: {
      platformIdentities: true,
      advocateScores: { orderBy: { period: 'desc' }, take: 1 },
      advocateBriefs: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!member) return null;
  return {
    id: member.id,
    displayName: member.displayName ?? 'Unknown',
    email: member.email,
    walletAddress: member.walletAddress,
    firstSeen: member.firstSeen,
    lastSeen: member.lastSeen,
    identities: member.platformIdentities,
    score: member.advocateScores[0] ?? null,
    brief: member.advocateBriefs[0] ?? null,
  };
}

// --- Context ----------------------------------------------------------------
export async function getContext(clientId: string) {
  const [profile, documents, campaign] = await Promise.all([
    prisma.contextProfile.findFirst({ where: { clientId, status: 'active' }, orderBy: { version: 'desc' } }),
    prisma.knowledgeDocument.findMany({ where: { clientId }, orderBy: { uploadedAt: 'desc' } }),
    prisma.campaignBrief.findFirst({ where: { clientId }, orderBy: { createdAt: 'desc' } }),
  ]);
  return { profile, documents, campaign };
}
