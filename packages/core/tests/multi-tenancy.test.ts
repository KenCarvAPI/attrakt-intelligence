/**
 * Multi-tenant isolation tests.
 *
 * Proves that data belonging to one client (tenant) is never returned, mutated,
 * or reported when querying as another client — across every query path used by
 * the api, agents, and mcp-servers packages (all of which now route through the
 * shared, client-scoped query functions in @attrakt/core).
 */

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
// Import from source submodules (not the package barrel) so the test doesn't
// pull in the platform client SDKs that the barrel also re-exports.
import { prisma } from '../src/prisma';
import { resolveIdentity } from '../src/services/identity-resolution';
import { resolveClientIdForPlatform, getActiveClients } from '../src/services/tenant';
import {
  getMemberProfile,
  getMetrics,
  getTopContributors,
  getSentiment,
  queryEvents,
  getGrowth,
} from '../src/queries/analytics';
import { computeMetrics } from '../src/queries/metrics';
import { getThreats, updateThreat, generateThreatReport } from '../src/queries/protection';
import { searchDiscordMessages } from '../src/queries/discord';
import { gatherDigestData, getMessagesForThreatScan } from '../src/queries/pulse';

const GUILD_A = 'guild-aaa-111';
const GUILD_B = 'guild-bbb-222';

interface SeededClient {
  id: string;
  memberIds: string[];
  threatId: string;
}

async function cleanDatabase() {
  await prisma.message.deleteMany();
  await prisma.event.deleteMany();
  await prisma.platformIdentity.deleteMany();
  await prisma.threat.deleteMany();
  await prisma.metric.deleteMany();
  await prisma.member.deleteMany();
  await prisma.platformConfig.deleteMany();
  await prisma.client.deleteMany();
}

async function createClient(slug: string, name: string, guildId: string, githubOrg: string) {
  const client = await prisma.client.create({ data: { name, slug } });
  await prisma.platformConfig.create({
    data: { clientId: client.id, platform: 'DISCORD', enabled: true, config: { guildId }, credentials: {} },
  });
  await prisma.platformConfig.create({
    data: { clientId: client.id, platform: 'GITHUB', enabled: true, config: { org: githubOrg }, credentials: {} },
  });
  return client.id;
}

// Pairwise-distinct usernames so the identity resolver's fuzzy matcher
// (Levenshtein < 2) treats each as a separate member rather than collapsing them.
const NAMES = ['apple', 'bridge', 'cosmos', 'delta', 'engine', 'falcon', 'garnet', 'harbor'];

async function seedClient(clientId: string, prefix: string, memberCount: number): Promise<SeededClient> {
  const now = new Date();
  const memberIds: string[] = [];

  for (let i = 0; i < memberCount; i++) {
    // resolveIdentity exercises the per-tenant identity layer.
    const { memberId } = await resolveIdentity(clientId, 'DISCORD', `${prefix}-user-${i}`, `${prefix}_${NAMES[i]}`);
    memberIds.push(memberId);

    await prisma.message.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCORD',
        platformMessageId: `${prefix}-msg-${i}`,
        channelId: 'general',
        content: `hello from ${prefix} message ${i} — community is great`,
        sentiment: 0.5,
        createdAt: now,
      },
    });

    await prisma.event.create({
      data: { clientId, memberId, platform: 'DISCORD', eventType: 'JOIN', eventData: {}, createdAt: now },
    });
    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCORD',
        eventType: 'MESSAGE_REACTION',
        eventData: {},
        createdAt: now,
      },
    });
  }

  await prisma.metric.create({
    data: { clientId, metricType: 'DAU', value: memberCount, createdAt: now },
  });

  const threat = await prisma.threat.create({
    data: {
      clientId,
      platform: 'DISCORD',
      threatType: 'SPAM',
      severity: 'LOW',
      content: `threat content owned by ${prefix}`,
      status: 'DETECTED',
    },
  });

  return { id: clientId, memberIds, threatId: threat.id };
}

let A: SeededClient;
let B: SeededClient;

const A_COUNT = 3;
const B_COUNT = 5;

beforeAll(async () => {
  await cleanDatabase();
  const aId = await createClient('client-a', 'Client A', GUILD_A, 'org-a');
  const bId = await createClient('client-b', 'Client B', GUILD_B, 'org-b');
  A = await seedClient(aId, 'a', A_COUNT);
  B = await seedClient(bId, 'b', B_COUNT);
}, 60000);

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('tenant routing (services/tenant)', () => {
  it('resolves the owning client from a Discord guild id', async () => {
    expect(await resolveClientIdForPlatform('DISCORD', GUILD_A)).toBe(A.id);
    expect(await resolveClientIdForPlatform('DISCORD', GUILD_B)).toBe(B.id);
  });

  it('resolves the owning client from a GitHub org (case-insensitive)', async () => {
    expect(await resolveClientIdForPlatform('GITHUB', 'ORG-A')).toBe(A.id);
    expect(await resolveClientIdForPlatform('GITHUB', 'org-b')).toBe(B.id);
  });

  it('returns null for an unconfigured routing key (no default tenant)', async () => {
    expect(await resolveClientIdForPlatform('DISCORD', 'guild-unknown')).toBeNull();
  });

  it('lists every active client', async () => {
    const ids = (await getActiveClients()).map((c) => c.id);
    expect(ids).toContain(A.id);
    expect(ids).toContain(B.id);
  });
});

describe('analytics queries are tenant scoped', () => {
  it('getMemberProfile returns own member but rejects another tenant member by id', async () => {
    const own = await getMemberProfile(A.id, A.memberIds[0]);
    expect(own.id).toBe(A.memberIds[0]);

    // B's member id is valid, but must not be readable as client A.
    await expect(getMemberProfile(A.id, B.memberIds[0])).rejects.toThrow(/not found/i);
  });

  it('getMetrics only returns the querying client metrics', async () => {
    const aMetrics = await getMetrics(A.id, 'DAU', 'day');
    const bMetrics = await getMetrics(B.id, 'DAU', 'day');
    expect(aMetrics.map((m) => m.value)).toEqual([A_COUNT]);
    expect(bMetrics.map((m) => m.value)).toEqual([B_COUNT]);
  });

  it('getTopContributors only returns own members', async () => {
    const top = await getTopContributors(A.id, 'week', 100);
    expect(top).toHaveLength(A_COUNT);
    expect(top.every((c) => A.memberIds.includes(c.id))).toBe(true);
    expect(top.some((c) => B.memberIds.includes(c.id))).toBe(false);
  });

  it('queryEvents never returns another tenant events', async () => {
    const events = await queryEvents(A.id, { limit: 1000 });
    expect(events).toHaveLength(A_COUNT * 2); // JOIN + REACTION per member
    expect(events.every((e) => e.member && A.memberIds.includes(e.member.id))).toBe(true);
  });

  it('getSentiment aggregates only own messages', async () => {
    const sentiment = await getSentiment(A.id, 'week');
    const totalMessages = sentiment.reduce((sum, d) => sum + d.messageCount, 0);
    expect(totalMessages).toBe(A_COUNT);
  });

  it('getGrowth counts only own joins/members', async () => {
    const growth = await getGrowth(A.id, 'week');
    expect(growth.joins).toBe(A_COUNT);
    expect(growth.totalMembers).toBe(A_COUNT);
  });
});

describe('metrics computation is tenant scoped (api worker path)', () => {
  it('computeMetrics counts only the querying client', async () => {
    const metrics = await computeMetrics(A.id, 'day');
    const byType = Object.fromEntries(metrics.map((m) => [m.type, m.value]));
    expect(byType.MEMBER_COUNT).toBe(A_COUNT);
    expect(byType.MESSAGE_VOLUME).toBe(A_COUNT);
    expect(byType.DAU).toBe(A_COUNT);

    const metricsB = await computeMetrics(B.id, 'day');
    const byTypeB = Object.fromEntries(metricsB.map((m) => [m.type, m.value]));
    expect(byTypeB.MEMBER_COUNT).toBe(B_COUNT);
  });
});

describe('protection queries/mutations are tenant scoped (mcp path)', () => {
  it('getThreats returns only own threats', async () => {
    const aThreats = await getThreats(A.id);
    expect(aThreats).toHaveLength(1);
    expect(aThreats[0].content).toContain('owned by a');
  });

  it('cannot update another tenant threat by id', async () => {
    await expect(updateThreat(A.id, B.threatId, { status: 'RESOLVED' })).rejects.toThrow(/not found/i);

    // B's threat must be untouched.
    const bThreat = await prisma.threat.findUnique({ where: { id: B.threatId } });
    expect(bThreat?.status).toBe('DETECTED');
  });

  it('can update own threat', async () => {
    const updated = await updateThreat(A.id, A.threatId, { status: 'REVIEWING', notes: 'looking into it' });
    expect(updated.status).toBe('REVIEWING');
  });

  it('cannot generate a report for another tenant threat by id', async () => {
    await expect(generateThreatReport(A.id, B.threatId)).rejects.toThrow(/not found/i);
    const ownReport = await generateThreatReport(A.id, A.threatId);
    expect(ownReport.threatId).toBe(A.threatId);
  });
});

describe('discord message search is tenant scoped (mcp path)', () => {
  it('only returns the querying client messages', async () => {
    const results = await searchDiscordMessages(A.id, { query: 'community', limit: 100 });
    expect(results).toHaveLength(A_COUNT);
    expect(results.every((m) => m.author?.startsWith('a_'))).toBe(true);
    expect(results.some((m) => m.author?.startsWith('b_'))).toBe(false);
  });
});

describe('agent data gathering is tenant scoped (agents path)', () => {
  it('gatherDigestData only includes own contributors/messages', async () => {
    const digest = await gatherDigestData(A.id, new Date());
    expect(digest.topContributors.every((c) => A.memberIds.includes(c.id))).toBe(true);
    expect(digest.recentMessages.every((m) => m.content.includes('from a'))).toBe(true);
    expect(digest.recentMessages.some((m) => m.content.includes('from b'))).toBe(false);
  });

  it('getMessagesForThreatScan only returns own messages', async () => {
    const messages = await getMessagesForThreatScan(A.id);
    expect(messages).toHaveLength(A_COUNT);
    expect(messages.every((m) => m.clientId === A.id)).toBe(true);
  });
});

describe('identity resolution is tenant scoped (ingestion path)', () => {
  it('the same external account maps to distinct members per client', async () => {
    const sharedExternalId = 'shared-discord-id-999';

    const inA = await resolveIdentity(A.id, 'DISCORD', sharedExternalId, 'sharedhandle');
    const inB = await resolveIdentity(B.id, 'DISCORD', sharedExternalId, 'sharedhandle');

    expect(inA.memberId).not.toBe(inB.memberId);

    const memberA = await prisma.member.findUnique({ where: { id: inA.memberId } });
    const memberB = await prisma.member.findUnique({ where: { id: inB.memberId } });
    expect(memberA?.clientId).toBe(A.id);
    expect(memberB?.clientId).toBe(B.id);

    // Re-resolving within the same tenant is idempotent.
    const inAgain = await resolveIdentity(A.id, 'DISCORD', sharedExternalId, 'sharedhandle');
    expect(inAgain.memberId).toBe(inA.memberId);

    // The stored identity rows carry the correct tenant scope.
    const identityA = await prisma.platformIdentity.findUnique({
      where: {
        clientId_platform_platformUserId: { clientId: A.id, platform: 'DISCORD', platformUserId: sharedExternalId },
      },
    });
    expect(identityA?.clientId).toBe(A.id);
  });
});
