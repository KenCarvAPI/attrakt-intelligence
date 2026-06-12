import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../prisma';
import { mergeMember } from './identity-resolution';

// Integration test: requires a live database (DATABASE_URL). Skips otherwise so
// `pnpm test` doesn't hard-fail in environments without Postgres.
const hasDb = !!process.env.DATABASE_URL;
const SUFFIX = `merge-test-${Date.now()}`;
let clientId: string;
let sourceId: string;
let targetId: string;

before(async () => {
  if (!hasDb) return;

  const client = await prisma.client.create({
    data: { name: 'Merge Test', slug: `merge-${Date.now()}` },
  });
  clientId = client.id;

  // Source member: 1 identity, 1 message, 1 event
  const source = await prisma.member.create({
    data: {
      clientId,
      displayName: 'Source User',
      email: `source-${SUFFIX}@example.com`,
      platformIdentities: {
        create: {
          platform: 'DISCORD',
          platformUserId: `src-${SUFFIX}`,
          username: 'source_user',
          matchMethod: 'username_exact',
        },
      },
      messages: {
        create: {
          clientId,
          platform: 'DISCORD',
          platformMessageId: `src-msg-${SUFFIX}`,
          content: 'hello from source',
        },
      },
      events: {
        create: {
          clientId,
          platform: 'DISCORD',
          eventType: 'JOIN',
          eventData: {},
        },
      },
    },
  });
  sourceId = source.id;

  // Target member: 1 identity, 1 message, 1 event
  const target = await prisma.member.create({
    data: {
      clientId,
      displayName: 'Target User',
      email: `target-${SUFFIX}@example.com`,
      platformIdentities: {
        create: {
          platform: 'GITHUB',
          platformUserId: `tgt-${SUFFIX}`,
          username: 'target_user',
          matchMethod: 'username_exact',
        },
      },
      messages: {
        create: {
          clientId,
          platform: 'DISCORD',
          platformMessageId: `tgt-msg-${SUFFIX}`,
          content: 'hello from target',
        },
      },
      events: {
        create: {
          clientId,
          platform: 'GITHUB',
          eventType: 'STAR',
          eventData: {},
        },
      },
    },
  });
  targetId = target.id;
});

after(async () => {
  if (!hasDb || !clientId) return;
  // Cascade delete via client removes members/messages/events/identities.
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

test('mergeMember reassigns all rows and leaves no orphans on the source', { skip: !hasDb }, async () => {
  const result = await mergeMember(sourceId, targetId);

  // Reported reassignments
  assert.equal(result.reassigned.platformIdentities, 1);
  assert.equal(result.reassigned.messages, 1);
  assert.equal(result.reassigned.events, 1);

  // No orphans: the source owns nothing after the merge
  assert.equal(await prisma.platformIdentity.count({ where: { memberId: sourceId } }), 0);
  assert.equal(await prisma.message.count({ where: { memberId: sourceId } }), 0);
  assert.equal(await prisma.event.count({ where: { memberId: sourceId } }), 0);

  // Everything landed on the target (1 original + 1 reassigned each)
  assert.equal(await prisma.platformIdentity.count({ where: { memberId: targetId } }), 2);
  assert.equal(await prisma.message.count({ where: { memberId: targetId } }), 2);
  assert.equal(await prisma.event.count({ where: { memberId: targetId } }), 2);

  // Source is soft-deleted and points at the target
  const source = await prisma.member.findUnique({ where: { id: sourceId } });
  assert.ok(source?.deletedAt, 'source.deletedAt should be set');
  assert.equal(source?.mergedIntoId, targetId);
  assert.equal(source?.email, null, 'source email should be freed');

  // Target remains live
  const target = await prisma.member.findUnique({ where: { id: targetId } });
  assert.equal(target?.deletedAt, null);
});

test('mergeMember rejects merging a member into itself', { skip: !hasDb }, async () => {
  await assert.rejects(() => mergeMember(targetId, targetId), /into itself/);
});
