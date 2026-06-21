import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  prisma,
  resolveIdentity,
  computeAdvocateScores,
  ingestKnowledgeDocument,
  toPeriod,
} from '@attrakt/core';
import { synthesiseContextProfile, activateContextProfile } from './context-agent/index';

/**
 * Critical-path smoke test. Exercises the whole spine end to end:
 *   ingest a fixture event -> resolve identity -> compute a score ->
 *   synthesise + activate a minimal context profile from a fixture document ->
 *   render the members API response shape.
 *
 * Requires a live database (DATABASE_URL); skips otherwise. Runs deterministically
 * with no ANTHROPIC_API_KEY (synthesis uses the deterministic fallback).
 */
const hasDb = !!process.env.DATABASE_URL;
const STAMP = Date.now();
let clientId: string;

before(async () => {
  if (!hasDb) return;
  const client = await prisma.client.create({ data: { name: 'Smoke', slug: `smoke-${STAMP}` } });
  clientId = client.id;
});

after(async () => {
  if (!hasDb || !clientId) return;
  await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
  await prisma.$disconnect();
});

test('critical path: ingest -> identity -> score -> context -> members API shape', { skip: !hasDb }, async () => {
  // 1. Ingest a fixture event: resolve identity (creates the unified member).
  const { memberId } = await resolveIdentity(clientId, 'DISCORD', `disc-${STAMP}`, 'smoke_user', {
    displayName: 'Smoke User',
  });
  assert.ok(memberId, 'identity resolution returns a member id');

  // 2. Persist a message + event (the ingestion write path).
  await prisma.message.create({
    data: {
      clientId, memberId, platform: 'DISCORD',
      platformMessageId: `smoke-msg-${STAMP}`, channelId: '#general',
      content: 'Happy to help — here is how the SDK works.', sentiment: 0.6,
    },
  });
  await prisma.event.create({
    data: { clientId, memberId, platform: 'DISCORD', eventType: 'MENTION', dedupeKey: `smoke-${STAMP}:MENTION`, eventData: {} },
  });

  // 3. Compute advocate scores: the member should be scored for this ISO week.
  const summary = await computeAdvocateScores(clientId);
  assert.ok(summary.membersScored >= 1, 'at least one member scored');
  const score = await prisma.advocateScore.findUnique({
    where: { memberId_period: { memberId, period: toPeriod(new Date()) } },
  });
  assert.ok(score, 'an AdvocateScore row exists for the member');
  assert.ok(score!.segment, 'the score has a segment assigned');

  // 4. Synthesise + activate a minimal context profile from a fixture document.
  await ingestKnowledgeDocument({
    clientId,
    title: 'Product one-pager',
    sourceType: 'product_docs',
    rawText: 'Smoke builds developer tooling for DAOs.\nKey differentiator: reliability.\nAudience: protocol developers on Discord and the governance forum.',
  });
  const synth = await synthesiseContextProfile(clientId);
  assert.ok(synth.profile, 'synthesis produced a profile');
  await activateContextProfile(clientId, synth.profile.version);
  const active = await prisma.contextProfile.findFirst({ where: { clientId, status: 'active' } });
  assert.ok(active, 'an active context profile exists after activation');

  // 5. Render the members API response shape (what the dashboard/list endpoint returns).
  const members = await prisma.member.findMany({
    where: { clientId, deletedAt: null, excluded: false },
    include: {
      platformIdentities: { select: { platform: true, username: true } },
      advocateScores: { orderBy: { period: 'desc' }, take: 1 },
    },
  });
  assert.equal(members.length, 1, 'exactly the one ingested member is returned');
  const row = members[0];
  assert.equal(row.id, memberId);
  assert.ok(row.platformIdentities.length >= 1, 'member has a linked platform identity');
  assert.ok(row.advocateScores[0]?.segment, 'member row carries a composite score + segment');
});
