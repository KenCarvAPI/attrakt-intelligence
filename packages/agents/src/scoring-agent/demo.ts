/**
 * Synthetic end-to-end demonstration of the scoring features.
 *
 * Seeds a throwaway client (slug "gnosis") with two contrasting members — a
 * high-volume spammer and a consistent, multi-platform, frequently-replied-to
 * advocate — then runs the full pipeline against the database:
 *   1. helpfulness evaluation (Claude call stubbed here; no API key in sandbox)
 *   2. advocate-score computation (real maths + persistence)
 *   3. advocate-brief generation (Claude call stubbed; real data gathering)
 *
 * Run with a DATABASE_URL pointing at a disposable Postgres. The Claude calls
 * are injected stubs so the run is deterministic and offline; in production the
 * same code paths call claude-sonnet-4-6.
 */
import { prisma, computeAdvocateScores, toPeriod } from '@attrakt/core';
import { evaluateHelpfulness } from './helpfulness';
import { generateAdvocateBrief } from './briefs';
import type { CompleteFn } from '../claude';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// Stub for helpfulness: a real advocate rates high, a spammer rates low.
const helpfulnessStub: CompleteFn = async (prompt) => {
  if (/advocate/i.test(prompt)) {
    return JSON.stringify({
      score: 88,
      rationale: 'Repeatedly answers newcomer questions and drives constructive technical threads.',
    });
  }
  return JSON.stringify({
    score: 8,
    rationale: 'High volume but almost entirely self-promotion and link drops; rarely helps anyone.',
  });
};

// Stub for the brief: derive a grounded brief from the rendered prompt so the
// output reflects the seeded data (handles, message dates) rather than canned text.
const briefStub: CompleteFn = async (prompt) => {
  const evidence = [...prompt.matchAll(/\[(\d{4}-\d{2}-\d{2}) (\w+)\] (.+)/g)]
    .slice(0, 3)
    .map((m) => ({ date: m[1], example: `On ${m[2]}, ${m[3].slice(0, 80)}` }));
  return JSON.stringify({
    headline: 'Ada is a cross-platform champion who consistently unblocks newcomers.',
    whoTheyAre:
      'Active as @ada across Discord, GitHub, and Twitter. Shows up most days, answering questions and reviewing contributions.',
    activitySummary:
      'Sustained presence across all three platforms over the trailing 90 days, with frequent replies received on her messages.',
    topics: ['onboarding', 'SDK usage', 'governance'],
    evidenceOfAdvocacy: evidence,
    suggestedNextAction:
      'Invite Ada into the community champions program and ask her to co-host an onboarding office-hours session.',
  });
};

async function seed() {
  await prisma.client.deleteMany({ where: { slug: 'gnosis' } });
  const client = await prisma.client.create({ data: { name: 'Gnosis', slug: 'gnosis' } });

  // --- Advocate: consistent, multi-platform, helpful, replied-to ---
  const ada = await prisma.member.create({
    data: {
      clientId: client.id,
      displayName: 'Ada (advocate)',
      platformIdentities: {
        create: [
          { platform: 'DISCORD', platformUserId: 'd-ada', username: 'ada' },
          { platform: 'GITHUB', platformUserId: 'g-ada', username: 'ada-dev' },
          { platform: 'TWITTER', platformUserId: 't-ada', username: 'ada_eth' },
        ],
      },
    },
  });

  const platforms = ['DISCORD', 'GITHUB', 'TWITTER'] as const;
  const helpfulLines = [
    'Welcome! For that error, set DATABASE_URL and re-run the migration — happy to walk through it.',
    'Great question — the SDK retries 429s automatically, you do not need your own backoff.',
    'I reviewed your PR, left two small comments. Solid work, this unblocks the indexer.',
    'For governance, the proposal threshold is 1%. Here is the relevant docs link and a summary.',
    'If anyone is stuck on local setup, drop your error here and I will take a look.',
  ];
  // ~45 distinct active days across the trailing window, several in the current week.
  for (let d = 0; d < 45; d++) {
    await prisma.message.create({
      data: {
        clientId: client.id,
        memberId: ada.id,
        platform: platforms[d % 3],
        platformMessageId: `ada-msg-${d}`,
        content: helpfulLines[d % helpfulLines.length],
        createdAt: daysAgo(d),
      },
    });
    await prisma.event.create({
      data: {
        clientId: client.id,
        memberId: ada.id,
        platform: platforms[d % 3],
        eventType: d % 2 === 0 ? 'ISSUE_COMMENT' : 'MESSAGE_REACTION',
        createdAt: daysAgo(d),
      },
    });
  }

  // A replier whose messages thread onto Ada's recent (current-week) messages → influence.
  const replier = await prisma.member.create({
    data: { clientId: client.id, displayName: 'Newcomer', platformIdentities: { create: [{ platform: 'DISCORD', platformUserId: 'd-new', username: 'newbie' }] } },
  });
  for (let d = 0; d < 6; d++) {
    await prisma.message.create({
      data: {
        clientId: client.id,
        memberId: replier.id,
        platform: 'DISCORD',
        platformMessageId: `reply-${d}`,
        threadId: `ada-msg-${d}`, // replies to Ada's recent messages
        content: 'Thank you, that fixed it!',
        createdAt: daysAgo(d),
      },
    });
  }

  // --- Spammer: huge volume, one platform, bursty, no replies received ---
  const sammy = await prisma.member.create({
    data: {
      clientId: client.id,
      displayName: 'Sammy (spammer)',
      platformIdentities: { create: [{ platform: 'DISCORD', platformUserId: 'd-sam', username: 'sammy' }] },
    },
  });
  for (let i = 0; i < 200; i++) {
    await prisma.message.create({
      data: {
        clientId: client.id,
        memberId: sammy.id,
        platform: 'DISCORD',
        platformMessageId: `sam-msg-${i}`,
        content: 'GM!! check out my new token launch 🚀🚀 link in bio',
        createdAt: daysAgo(i % 2), // all within the last 2 days
      },
    });
  }

  return { client, ada, sammy };
}

async function main() {
  const { client, ada } = await seed();
  const period = toPeriod();

  console.log(`\n=== Seeded client "gnosis" — scoring period ${period} ===\n`);

  // 1. Helpfulness (Claude stubbed)
  const help = await evaluateHelpfulness(client.id, {
    complete: helpfulnessStub,
    minMessages: 3,
    delayMs: 0,
  });
  console.log('Helpfulness:', JSON.stringify(help));

  // 2. Scoring (real maths, reads cached helpfulness)
  const summary = await computeAdvocateScores(client.id);
  console.log('Scoring   :', JSON.stringify(summary));

  // Show the resulting scores.
  const scores = await prisma.advocateScore.findMany({
    where: { clientId: client.id, period },
    include: { member: { select: { displayName: true } } },
    orderBy: { compositeScore: 'desc' },
  });
  console.log('\n--- AdvocateScore rows ---');
  for (const s of scores) {
    console.log(
      `${(s.member.displayName ?? s.memberId).padEnd(18)} composite=${s.compositeScore.toFixed(1).padStart(5)} ` +
        `[${s.segment.padEnd(8)}] activity=${s.activityScore.toFixed(0)} consistency=${s.consistencyScore.toFixed(0)} ` +
        `breadth=${s.breadthScore.toFixed(0)} influence=${s.influenceScore.toFixed(0)} helpfulness=${s.helpfulnessScore.toFixed(0)}`
    );
  }

  // 3. Advocate brief for Ada (Claude stubbed; real data gathering + persistence)
  const { content, record } = await generateAdvocateBrief(client.id, ada.id, { complete: briefStub });
  console.log(`\n--- Generated AdvocateBrief (id=${record?.id}) ---`);
  console.log(JSON.stringify(content, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
