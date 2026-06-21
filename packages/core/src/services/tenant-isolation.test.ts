import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../prisma';
import {
  createClient,
  getActiveClients,
  resolveClientId,
  resolveClientIdByPlatform,
} from './clients';
import { resolveIdentity } from './identity-resolution';

/**
 * Integration tests proving multi-tenant isolation: data for client A is never
 * returned when querying as client B. Requires a live database (DATABASE_URL);
 * skips otherwise so `pnpm test` doesn't hard-fail without Postgres.
 *
 * The scenario deliberately gives both tenants a member with the *same username*
 * ("shared_handle") so that any accidental cross-tenant leak (e.g. an unscoped
 * identity lookup) would show up as a wrong-tenant match.
 */
const hasDb = !!process.env.DATABASE_URL;
const STAMP = Date.now();

let clientAId: string;
let clientBId: string;
let memberAId: string;
let memberBId: string;

const slugA = `iso-a-${STAMP}`;
const slugB = `iso-b-${STAMP}`;

before(async () => {
  if (!hasDb) return;

  // Provision two tenants via the real provisioning path, with platform configs.
  const a = await createClient({
    name: 'Tenant A',
    slug: slugA,
    platformConfigs: [
      { platform: 'DISCORD', config: { guildId: `guild-a-${STAMP}` } },
      { platform: 'GITHUB', config: { org: `org-a-${STAMP}` } },
    ],
  });
  const b = await createClient({
    name: 'Tenant B',
    slug: slugB,
    platformConfigs: [{ platform: 'DISCORD', config: { guildId: `guild-b-${STAMP}` } }],
  });
  clientAId = a.client.id;
  clientBId = b.client.id;

  // Each tenant gets a member with the SAME username but a distinct platform id.
  const makeMember = async (clientId: string, tag: string) =>
    prisma.member.create({
      data: {
        clientId,
        displayName: `Shared Handle (${tag})`,
        platformIdentities: {
          create: {
            platform: 'DISCORD',
            platformUserId: `disc-${tag}-${STAMP}`,
            username: 'shared_handle',
            matchMethod: 'username_exact',
          },
        },
        messages: {
          create: {
            clientId,
            platform: 'DISCORD',
            platformMessageId: `msg-${tag}-${STAMP}`,
            content: `secret message belonging to ${tag}`,
          },
        },
        events: {
          create: { clientId, platform: 'DISCORD', eventType: 'JOIN', eventData: {} },
        },
      },
    });

  memberAId = (await makeMember(clientAId, 'A')).id;
  memberBId = (await makeMember(clientBId, 'B')).id;
});

after(async () => {
  if (!hasDb) return;
  if (clientAId) await prisma.client.delete({ where: { id: clientAId } }).catch(() => {});
  if (clientBId) await prisma.client.delete({ where: { id: clientBId } }).catch(() => {});
  await prisma.$disconnect();
});

test('members are isolated by clientId', { skip: !hasDb }, async () => {
  const aMembers = await prisma.member.findMany({ where: { clientId: clientAId } });
  const bMembers = await prisma.member.findMany({ where: { clientId: clientBId } });

  assert.ok(aMembers.some((m) => m.id === memberAId), 'A should see its own member');
  assert.ok(!aMembers.some((m) => m.id === memberBId), "A must not see B's member");
  assert.ok(bMembers.some((m) => m.id === memberBId), 'B should see its own member');
  assert.ok(!bMembers.some((m) => m.id === memberAId), "B must not see A's member");
});

test('messages and events are isolated by clientId', { skip: !hasDb }, async () => {
  const aMessages = await prisma.message.findMany({ where: { clientId: clientAId } });
  assert.ok(aMessages.length > 0);
  assert.ok(
    aMessages.every((m) => m.content.includes('A')),
    "A's message query must not return B's content"
  );

  const bEventsSeenByA = await prisma.event.count({
    where: { clientId: clientAId, memberId: memberBId },
  });
  assert.equal(bEventsSeenByA, 0, "B's events must never appear under A's clientId");
});

test('identity resolution is scoped per tenant (same username, different members)', { skip: !hasDb }, async () => {
  // A NEW platform identity using the shared username must resolve within the
  // querying tenant only — never link to the other tenant's member.
  const inA = await resolveIdentity(clientAId, 'GITHUB', `gh-a-${STAMP}`, 'shared_handle');
  const inB = await resolveIdentity(clientBId, 'GITHUB', `gh-b-${STAMP}`, 'shared_handle');

  assert.equal(inA.memberId, memberAId, 'resolution in A must land on A member');
  assert.equal(inB.memberId, memberBId, 'resolution in B must land on B member');
  assert.notEqual(inA.memberId, inB.memberId, 'tenants must resolve to different members');

  // And the new GitHub identity must hang off the correct tenant's member.
  const ghIdentityA = await prisma.platformIdentity.findUnique({
    where: { platform_platformUserId: { platform: 'GITHUB', platformUserId: `gh-a-${STAMP}` } },
    include: { member: true },
  });
  assert.equal(ghIdentityA?.member.clientId, clientAId);
});

test('resolveClientIdByPlatform maps a platform key to the owning tenant', { skip: !hasDb }, async () => {
  const a = await resolveClientIdByPlatform('DISCORD', { guildId: `guild-a-${STAMP}` });
  const b = await resolveClientIdByPlatform('DISCORD', { guildId: `guild-b-${STAMP}` });
  const none = await resolveClientIdByPlatform('DISCORD', { guildId: 'nonexistent-guild' });

  assert.equal(a, clientAId);
  assert.equal(b, clientBId);
  assert.equal(none, null, 'unknown guild must resolve to null, never a default tenant');
});

test('getActiveClients excludes deactivated tenants', { skip: !hasDb }, async () => {
  await prisma.client.update({ where: { id: clientBId }, data: { active: false } });
  try {
    const active = await getActiveClients();
    const ids = active.map((c) => c.id);
    assert.ok(ids.includes(clientAId), 'active tenant A should be listed');
    assert.ok(!ids.includes(clientBId), 'deactivated tenant B must be excluded');
  } finally {
    await prisma.client.update({ where: { id: clientBId }, data: { active: true } });
  }
});

test('createClient is idempotent on slug and seeds a ScoringConfig', { skip: !hasDb }, async () => {
  const again = await createClient({ name: 'Tenant A (renamed)', slug: slugA });
  assert.equal(again.created, false, 're-provisioning an existing slug must not create a duplicate');
  assert.equal(again.client.id, clientAId);
  assert.equal(again.client.name, 'Tenant A (renamed)');

  const count = await prisma.client.count({ where: { slug: slugA } });
  assert.equal(count, 1, 'slug must remain unique');

  const scoringConfig = await prisma.scoringConfig.findUnique({ where: { clientId: clientAId } });
  assert.ok(scoringConfig, 'provisioning should seed a default ScoringConfig');

  const resolved = await resolveClientId(slugA);
  assert.equal(resolved, clientAId);
});

test('resolveClientId distinguishes the two tenants by slug and id', { skip: !hasDb }, async () => {
  assert.equal(await resolveClientId(slugA), clientAId);
  assert.equal(await resolveClientId(slugB), clientBId);
  assert.equal(await resolveClientId(clientAId), clientAId);
  assert.equal(await resolveClientId('no-such-slug'), null);
});
