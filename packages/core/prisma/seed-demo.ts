/**
 * Demo seed — `pnpm seed:demo`
 *
 * Generates a realistic, self-contained dataset so the admin dashboard is fully
 * demoable without any live platform or LLM credentials:
 *   - 1 client (Gnosis)
 *   - 200 unified members with platform identities (Discord/GitHub/Twitter/Discourse)
 *   - 90 days of activity (messages + events), incl. Discourse governance posts
 *   - AdvocateScores for the current ISO-week period, with percentile segments
 *   - 3 AdvocateBriefs for the top advocates
 *   - a full ACTIVE ContextProfile with source KnowledgeDocuments
 *   - one CampaignBrief
 *
 * Deterministic: a seeded PRNG makes repeated runs reproducible.
 */
import { createHash } from 'node:crypto';
import {
  PrismaClient,
  Platform,
  EventType,
  type AdvocateSegment,
} from '@prisma/client';
import { assignSegments } from '../src/scoring/segments';
import { toPeriod } from '../src/scoring/period';

const prisma = new PrismaClient();

const CLIENT_SLUG = 'gnosis';
const CLIENT_NAME = 'Gnosis';
const MEMBER_COUNT = 200;
const DAYS = 90;
const PERIOD = toPeriod(new Date());

// --- deterministic PRNG (mulberry32) ---------------------------------------
let _seed = 0x9e3779b9;
function rng(): number {
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T>(a: T[]): T => a[Math.floor(rng() * a.length)];
const chance = (p: number) => rng() < p;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const HANDLE_A = ['satoshi', 'gnosis', 'safe', 'cow', 'circles', 'merkle', 'zk', 'mev', 'frens', 'based', 'degen', 'onchain', 'rollup', 'wei', 'nonce', 'oracle', 'vault', 'block', 'eth', 'gno'];
const HANDLE_B = ['eth', 'gno', 'dev', 'builder', 'maxi', 'xyz', 'lab', 'node', 'guild', 'dao', 'wagmi', 'core', 'prime', '42', 'one'];
const FIRST = ['Ava', 'Leo', 'Mira', 'Kai', 'Nadia', 'Tomas', 'Yuki', 'Priya', 'Diego', 'Hana', 'Sven', 'Aisha', 'Marco', 'Lena', 'Omar', 'Zoe', 'Ravi', 'Elsa', 'Nikolai', 'Fatima'];
const LAST = ['Okafor', 'Lindgren', 'Costa', 'Tanaka', 'Volkov', 'Mensah', 'Rossi', 'Haddad', 'Novak', 'Reyes', 'Schmidt', 'Bianchi', 'Larsson', 'Khan', 'Moreau', 'Silva'];
const handle = () => `${pick(HANDLE_A)}${chance(0.5) ? '.' : '_'}${pick(HANDLE_B)}`;

const GOV_TITLES = [
  'GIP-104: Adjust GNO staking rewards curve',
  'Treasury diversification: allocate to short-dated T-bills',
  'Proposal: fund Safe{Wallet} mobile localisation',
  'Discussion: sunset legacy multisig module v1.3',
  'GIP-108: Onboard two new delegates to the council',
  'RFC: Circles UBI integration grant programme',
  'Increase CoW Protocol solver bonding requirement',
  'Ratify Q3 community working-group budget',
  'GIP-111: Gas refund mechanism for governance voting',
  'Proposal: establish a bug-bounty escalation SLA',
];
const SNIPPETS = [
  'shipped the new module, PR is up for review 🙌',
  'anyone seeing elevated gas on the testnet deploy?',
  'great call on the standup, the roadmap is much clearer now',
  "I'll take the docs refactor this week",
  'the new Safe app onboarding flow is so much smoother',
  'voted on GIP-104, think the curve adjustment is right',
  'can we get another reviewer on the solver bonding PR?',
  'loving the momentum in the community lately 🚀',
  'wrote up my notes from the governance call, link in thread',
  'happy to mentor newcomers on the SDK if anyone wants',
  'found a subtle bug in the nonce handling, issue filed',
  'the delegate election turnout was the highest yet',
  'kudos to the working group for the treasury report',
  'quick question about the multisig threshold defaults',
  'demoed the integration at the meetup, lots of interest',
];

const ALL_PLATFORMS = [Platform.DISCORD, Platform.GITHUB, Platform.TWITTER, Platform.DISCOURSE];
const NON_FORUM = [Platform.DISCORD, Platform.GITHUB, Platform.TWITTER];

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setUTCHours(12, 0, 0, 0);
  dt.setUTCDate(dt.getUTCDate() - d);
  return dt;
}

interface Spec {
  id?: string;
  displayName: string;
  email: string | null;
  wallet: string | null;
  firstSeen: Date;
  lastSeen: Date;
  platforms: Platform[];
  activeDays: Set<number>;
  msgCount: number;
  eventCount: number;
  govCount: number;
  influenceRaw: number;
  // computed components (0-100)
  c: { activityScore: number; consistencyScore: number; breadthScore: number; influenceScore: number; helpfulnessScore: number };
  composite: number;
  segment: AdvocateSegment;
}

function buildSpec(i: number): Spec {
  const tier = rng();
  let base: number;
  if (tier > 0.93) base = randInt(55, 85);
  else if (tier > 0.75) base = randInt(25, 55);
  else if (tier > 0.45) base = randInt(8, 25);
  else base = randInt(0, 8);

  const activeDays = new Set<number>();
  for (let n = 0; n < base; n++) {
    activeDays.add(chance(0.6) ? randInt(0, Math.floor(DAYS / 2)) : randInt(0, DAYS - 1));
  }

  const platforms: Platform[] = [Platform.DISCORD];
  if (chance(0.55)) platforms.push(Platform.GITHUB);
  if (chance(0.5)) platforms.push(Platform.TWITTER);
  if (chance(0.3 + base / 120)) platforms.push(Platform.DISCOURSE);

  const msgCount = Math.round(base * (1 + rng() * 2.5));
  const eventCount = Math.round(msgCount * (0.3 + rng() * 0.8));
  const govCount = platforms.includes(Platform.DISCOURSE) ? randInt(0, Math.ceil(base / 6)) : 0;
  const influenceRaw = Math.round(msgCount * (0.2 + rng() * 1.4));

  const firstSeenDay = chance(0.25) ? randInt(0, 29) : randInt(30, 175);
  const lastSeenDay = activeDays.size ? Math.min(...activeDays) : firstSeenDay;
  const name = chance(0.45) ? `${pick(FIRST)} ${pick(LAST)}` : handle();

  return {
    displayName: name,
    email: chance(0.4) ? `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${i}@proton.me` : null,
    wallet: chance(0.5) ? `0x${Array.from({ length: 40 }, () => '0123456789abcdef'[randInt(0, 15)]).join('')}` : null,
    firstSeen: daysAgo(firstSeenDay),
    lastSeen: daysAgo(lastSeenDay),
    platforms,
    activeDays,
    msgCount,
    eventCount,
    govCount,
    influenceRaw,
    c: { activityScore: 0, consistencyScore: 0, breadthScore: 0, influenceScore: 0, helpfulnessScore: 0 },
    composite: 0,
    segment: 'LURKER',
  };
}

// Default component weights (mirror ScoringConfig defaults).
const W = { activity: 0.25, consistency: 0.2, breadth: 0.15, influence: 0.3, helpfulness: 0.1 };

function scoreAll(specs: Spec[]) {
  const maxActivity = Math.max(...specs.map((s) => s.msgCount + s.eventCount), 1);
  const maxInfluence = Math.max(...specs.map((s) => s.influenceRaw), 1);
  const lnMaxA = Math.log(1 + maxActivity);

  for (const s of specs) {
    const activity = 100 * (Math.log(1 + s.msgCount + s.eventCount) / lnMaxA);
    const consistency = (s.activeDays.size / DAYS) * 100;
    const breadth = (s.platforms.length / ALL_PLATFORMS.length) * 100;
    const influence = 100 * (s.influenceRaw / maxInfluence);
    s.c = {
      activityScore: round(activity),
      consistencyScore: round(consistency),
      breadthScore: round(breadth),
      influenceScore: round(influence),
      helpfulnessScore: 0,
    };
    s.composite = round(
      s.c.activityScore * W.activity +
        s.c.consistencyScore * W.consistency +
        s.c.breadthScore * W.breadth +
        s.c.influenceScore * W.influence +
        s.c.helpfulnessScore * W.helpfulness
    );
  }

  // Key by index (DB ids aren't assigned yet, names/timestamps can collide).
  const segments = assignSegments(specs.map((s, i) => ({ memberId: String(i), compositeScore: s.composite })));
  specs.forEach((s, i) => {
    s.segment = segments.get(String(i)) ?? 'LURKER';
  });
}

async function main() {
  console.log('🌱 Seeding demo dataset (client: %s, period: %s)…', CLIENT_NAME, PERIOD);

  const existing = await prisma.client.findUnique({ where: { slug: CLIENT_SLUG } });
  if (existing) {
    await prisma.client.delete({ where: { id: existing.id } });
    console.log('  • removed previous demo client');
  }

  const client = await prisma.client.create({ data: { name: CLIENT_NAME, slug: CLIENT_SLUG } });
  await prisma.scoringConfig.create({ data: { clientId: client.id } });

  const specs = Array.from({ length: MEMBER_COUNT }, (_, i) => buildSpec(i));
  scoreAll(specs);

  // Members + identities
  for (const s of specs) {
    const member = await prisma.member.create({
      data: {
        clientId: client.id,
        displayName: s.displayName,
        email: s.email,
        walletAddress: s.wallet,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        platformIdentities: {
          create: s.platforms.map((p, idx) => {
            const method =
              idx === 0 ? 'explicit' : pick(['email', 'username_exact', 'username_fuzzy', 'wallet']);
            const confidence =
              method === 'explicit' ? 1.0 :
              method === 'email' || method === 'wallet' ? round(0.9 + rng() * 0.1, 2) :
              method === 'username_exact' ? round(0.85 + rng() * 0.1, 2) :
              round(0.6 + rng() * 0.2, 2);
            return {
              platform: p,
              platformUserId: `${p.toLowerCase()}-${randInt(100000, 999999)}-${idx}-${s.displayName.length}`,
              username: handle(),
              displayName: s.displayName,
              matchMethod: method,
              matchConfidence: confidence,
            };
          }),
        },
      },
    });
    s.id = member.id;
  }
  console.log('  • %d members created', specs.length);

  // Activity + AdvocateScores
  const messages: any[] = [];
  const events: any[] = [];
  const scores: any[] = [];
  let govSeq = 0;

  for (const s of specs) {
    const otherPlatforms = s.platforms.filter((p) => NON_FORUM.includes(p));
    let emittedEvents = 0;
    for (const day of s.activeDays) {
      const perDay = randInt(1, 3);
      for (let k = 0; k < perDay; k++) {
        const ts = daysAgo(day);
        ts.setUTCHours(randInt(0, 23), randInt(0, 59), 0, 0);
        const platform = pick(otherPlatforms.length ? otherPlatforms : [Platform.DISCORD]);
        messages.push({
          clientId: client.id,
          memberId: s.id,
          platform,
          platformMessageId: `${platform.toLowerCase()}-m-${s.id}-${day}-${k}`,
          channelId: platform === Platform.GITHUB ? 'gnosis/safe-contracts' : pick(['#general', '#dev', '#governance', '#support']),
          content: pick(SNIPPETS),
          sentiment: round(-0.2 + rng() * 1.0, 2),
          createdAt: ts,
        });
        if (emittedEvents < s.eventCount && chance(0.6)) {
          events.push({ clientId: client.id, memberId: s.id, platform, eventType: EventType.MESSAGE_REACTION, eventData: {}, createdAt: ts });
          emittedEvents++;
        }
      }
    }
    // governance on Discourse
    for (let g = 0; g < s.govCount; g++) {
      const day = randInt(0, DAYS - 1);
      const ts = daysAgo(day);
      ts.setUTCHours(randInt(8, 20), randInt(0, 59), 0, 0);
      const title = GOV_TITLES[govSeq++ % GOV_TITLES.length];
      messages.push({
        clientId: client.id,
        memberId: s.id,
        platform: Platform.DISCOURSE,
        platformMessageId: `discourse-${s.id}-${g}`,
        channelId: 'governance',
        threadId: `t-${govSeq}`,
        content: `${title} — ${pick(SNIPPETS)}`,
        sentiment: round(0.1 + rng() * 0.5, 2),
        metadata: { title, flagged: chance(0.5) },
        createdAt: ts,
      });
      events.push({
        clientId: client.id,
        memberId: s.id,
        platform: Platform.DISCOURSE,
        eventType: pick([EventType.GOVERNANCE_POST, EventType.GOVERNANCE_VOTE, EventType.GOVERNANCE_PROPOSAL]),
        eventData: { title, flagged: chance(0.6) },
        createdAt: ts,
      });
    }

    scores.push({
      memberId: s.id,
      clientId: client.id,
      period: PERIOD,
      compositeScore: s.composite,
      activityScore: s.c.activityScore,
      consistencyScore: s.c.consistencyScore,
      breadthScore: s.c.breadthScore,
      influenceScore: s.c.influenceScore,
      helpfulnessScore: s.c.helpfulnessScore,
      segment: s.segment,
    });
  }

  const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunk(messages, 1000)) await prisma.message.createMany({ data: c, skipDuplicates: true });
  for (const c of chunk(events, 1000)) await prisma.event.createMany({ data: c });
  for (const c of chunk(scores, 1000)) await prisma.advocateScore.createMany({ data: c });
  console.log('  • %d messages, %d events, %d scores created', messages.length, events.length, scores.length);

  // Advocate briefs for the top 3
  const top = [...specs].sort((a, b) => b.composite - a.composite).slice(0, 3);
  for (const s of top) {
    await prisma.advocateBrief.create({
      data: {
        clientId: client.id,
        memberId: s.id!,
        model: 'deterministic-fallback',
        promptVersion: 'seed.v1',
        contextProfileUsed: true,
        brief: advocateBrief(s),
      },
    });
  }
  console.log('  • 3 advocate briefs created');

  // Knowledge documents
  const docs = knowledgeDocs();
  for (const d of docs) {
    await prisma.knowledgeDocument.create({
      data: {
        clientId: client.id,
        title: d.title,
        sourceType: d.sourceType as any,
        rawText: d.rawText,
        charCount: d.rawText.length,
        contentHash: createHash('sha256').update(d.rawText.trim()).digest('hex'),
        uploadedAt: daysAgo(d.ageDays),
      },
    });
  }

  // Active context profile
  const profile = await prisma.contextProfile.create({
    data: {
      clientId: client.id,
      version: 3,
      status: 'active',
      products: contextSections().products as object,
      brandVoice: contextSections().brandVoice as object,
      audience: contextSections().audience as object,
      marketingFunction: contextSections().marketingFunction as object,
      strategicDirection: contextSections().strategicDirection as object,
    },
  });
  console.log('  • context profile v%d + %d knowledge documents created', profile.version, docs.length);

  // Campaign brief
  await prisma.campaignBrief.create({
    data: {
      clientId: client.id,
      objective: 'Grow active delegate participation ahead of the Q3 governance season',
      content: campaignBrief(profile.version) as object,
    },
  });
  console.log('  • 1 campaign brief created');

  console.log('✅ Demo seed complete →  http://localhost:3000/%s', CLIENT_SLUG);
}

// --- content ---------------------------------------------------------------
function advocateBrief(s: Spec) {
  const plats = s.platforms.map((p) => p[0] + p.slice(1).toLowerCase()).join(', ');
  return {
    headline: `${s.displayName} — ${s.segment.toLowerCase()} advocate scoring ${s.composite.toFixed(0)}/100`,
    whoTheyAre: `${s.displayName} is a ${s.segment.toLowerCase()}-tier contributor active across ${plats}, with consistently high-signal participation and strong downstream engagement.`,
    activitySummary: `Activity ${s.c.activityScore}, consistency ${s.c.consistencyScore}, breadth ${s.c.breadthScore}, influence ${s.c.influenceScore} (period ${PERIOD}).`,
    topics: ['governance', 'safe sdk', 'treasury', 'delegates'].slice(0, randInt(2, 4)),
    evidenceOfAdvocacy: [
      { date: daysAgo(randInt(2, 10)).toISOString().slice(0, 10), example: pick(SNIPPETS) },
      { date: daysAgo(randInt(11, 30)).toISOString().slice(0, 10), example: pick(SNIPPETS) },
    ],
    suggestedNextAction:
      s.segment === 'CHAMPION' || s.segment === 'ADVOCATE'
        ? 'Invite to the contributor council and feature their work in the weekly digest.'
        : 'Send a personal thank-you and surface an on-ramp into governance.',
  };
}

function contextSections() {
  return {
    products: {
      whatTheyAre: 'Decentralised infrastructure for Ethereum: Safe (smart-account custody), CoW Protocol (intent-based, MEV-protected trading), Circles (community currency), and Gnosis Chain.',
      whoTheyServe: 'Builders, DAOs, and power users who need credibly neutral, user-owned infrastructure.',
      keyDifferentiators: ['Audit-grade smart-account standard (Safe)', 'MEV protection via solver competition (CoW)', 'Credible neutrality and user ownership'],
      confidence: { level: 'high', note: 'Strongly corroborated across whitepaper, docs and blog sources.' },
    },
    brandVoice: {
      tone: 'Measured, technical, substance-over-hype. Professional rather than meme-heavy.',
      vocabulary: ['credible neutrality', 'user-owned', 'intent-based', 'smart accounts'],
      thingsTheyNeverSay: ['Avoid price/number-go-up talk', "Don't overpromise or hype"],
      confidence: { level: 'medium', note: 'Distilled from high-engagement posts; refine with editorial feedback.' },
    },
    audience: {
      icps: ['Protocol & dApp developers', 'DAO governance participants & delegates', 'Security-minded power users'],
      communities: ['Discord #dev and #governance', 'Discourse governance forum', 'Crypto-Twitter builders'],
      whereTheyLiveOnline: ['Discord', 'Discourse forum', 'Twitter/X'],
      confidence: { level: 'high', note: 'Synthesised from ingestion data and marketing sources.' },
    },
    marketingFunction: {
      teamShape: 'Lean community + DevRel team working with contributor working groups.',
      channelsInUse: ['Discord', 'Twitter/X', 'Discourse forum', 'Developer newsletter'],
      currentCampaigns: ['Safe{Core} SDK adoption', 'Delegate onboarding for Q3 governance'],
      confidence: { level: 'medium', note: 'Based on 2 marketing/leadership source(s).' },
    },
    strategicDirection: {
      leadershipPriorities: ['Grow active delegate participation', 'Deepen the Safe tooling contributor funnel', 'Improve treasury transparency and reporting cadence'],
      positioning: 'The credibly neutral, user-owned infrastructure layer for Ethereum.',
      upcomingBets: ['Account-abstraction tooling expansion', 'Q3 governance season with several high-impact GIPs'],
      confidence: { level: 'high', note: 'leadership_interview and strategy_doc treated as authoritative for this section.' },
    },
  };
}

function knowledgeDocs() {
  return [
    { title: 'Gnosis Ecosystem Overview (Whitepaper)', sourceType: 'product_docs', ageDays: 120, rawText: '- Safe is the standard for smart-account custody\n- CoW Protocol offers MEV-protected, intent-based trading\n- Circles is a community currency / UBI network\n- Gnosis Chain is an EVM L1 secured by GNO\n- The throughline is credible neutrality and user-owned infrastructure' },
    { title: 'GIP-104: Adjust GNO staking rewards curve', sourceType: 'strategy_doc', ageDays: 34, rawText: '- Proposal to adjust the staking rewards curve\n- Balances validator incentives against circulating supply\n- We will plan a turnout drive for the vote\n- Positioning: sustainable, credibly neutral staking economics' },
    { title: 'Q2 Community Working-Group Report', sourceType: 'leadership_interview', ageDays: 40, rawText: '- Leadership priority: grow active delegate participation\n- Deepen the contributor funnel around Safe tooling\n- Improve treasury transparency and reporting cadence\n- Next: launch delegate office hours in Q3' },
    { title: 'Brand & Voice Guidelines', sourceType: 'brand_guidelines', ageDays: 75, rawText: '- Tone: measured, technical, substance over hype\n- Never talk about token price or number-go-up\n- Avoid hype language and overpromising\n- Vocabulary: credible neutrality, user-owned, intent-based' },
    { title: 'Safe{Core} SDK launch retrospective', sourceType: 'marketing_material', ageDays: 60, rawText: '- Channels in use: Twitter, Discord, developer newsletter\n- Campaign: drive Safe{Core} SDK adoption\n- ICPs: protocol and dApp developers\n- They live online on Discord and Twitter' },
    { title: 'Community sentiment thread (Twitter)', sourceType: 'website', ageDays: 7, rawText: '- High-engagement thread celebrating contributor milestones\n- Audience responded well to the new Safe onboarding flow\n- Builders active on Twitter/X and the Discourse forum' },
  ];
}

function campaignBrief(version: number) {
  return {
    objective: 'Grow active delegate participation ahead of the Q3 governance season',
    positioning: 'The credibly neutral, user-owned infrastructure layer for Ethereum.',
    audienceFit: 'Targets governance-literate contributors already active in Discord and the Discourse forum.',
    segments: [
      { name: 'DISCOURSE community', where: 'DISCOURSE', rationale: 'Governance-active members concentrate on the forum' },
      { name: 'DISCORD community', where: 'DISCORD', rationale: 'Largest day-to-day contributor surface' },
    ],
    advocates: [
      { name: 'satoshi.builder', platform: 'DISCOURSE', score: 88, why: 'Composite 88/100, vocal on governance, treasury.' },
      { name: 'Mira Tanaka', platform: 'GITHUB', score: 81, why: 'Composite 81/100, vocal on safe sdk, delegates.' },
      { name: 'gno_maxi', platform: 'DISCORD', score: 77, why: 'Composite 77/100, vocal on governance, delegates.' },
    ],
    channels: [
      { channel: 'DISCOURSE:governance', priority: 'high', rationale: 'Primary governance surface' },
      { channel: 'DISCORD:#governance', priority: 'medium', rationale: 'Active discussion channel' },
      { channel: 'TWITTER', priority: 'medium', rationale: 'Broad reach for turnout drives' },
    ],
    messageAngles: [
      { angle: 'Pain-led', copy: 'Your technical judgement belongs in governance — delegation is how it scales.', voiceCheck: 'Tone: measured, technical, substance over hype.' },
      { angle: 'Proof-led', copy: 'Credible neutrality depends on broad, accountable participation.', voiceCheck: 'Leads with principle, not hype.' },
      { angle: 'Community-led', copy: 'Delegate office hours, proposal templates, gas-refunded voting — low-friction on-ramps.', voiceCheck: 'Activates real advocates; concrete and practical.' },
    ],
    generatedWith: 'deterministic-fallback',
    contextProfileVersion: version,
    runningWithoutContext: false,
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
