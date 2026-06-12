import { PrismaClient, Platform, EventType, MetricType } from '@prisma/client';

const prisma = new PrismaClient();

// --- Time helpers (everything relative to the start of today, UTC) ----------
const base = new Date();
base.setUTCHours(0, 0, 0, 0);

/** A timestamp `daysAgo` days before today at the given UTC hour. */
function dayAt(daysAgo: number, hour = 12): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  console.log('Seeding database...');

  // Keep the original lightweight test client.
  await prisma.client.upsert({
    where: { slug: 'test-client' },
    update: {},
    create: { name: 'Test Client', slug: 'test-client' },
  });

  await seedGnosisDemo();

  console.log('Seeding complete.');
}

/**
 * A rich demo dataset for the `gnosis` client, used by the weekly health
 * report. Tells a deliberate story: reach is growing, but day-to-day core
 * engagement is softening and unanswered governance questions are rising.
 */
async function seedGnosisDemo() {
  // Reset prior demo data so the seed is idempotent.
  const existing = await prisma.client.findUnique({ where: { slug: 'gnosis' } });
  if (existing) {
    await prisma.client.delete({ where: { id: existing.id } });
  }

  const client = await prisma.client.create({
    data: {
      name: 'Gnosis',
      slug: 'gnosis',
      contextProfile: {
        create: {
          mission:
            'Steward the Gnosis ecosystem and grow credibly-neutral, community-led governance.',
          strategicPriorities: [
            'Grow governance participation',
            'Strengthen the contributor pipeline',
            'Improve responsiveness in community support',
          ],
          audience: 'GNO holders, DAO delegates, and ecosystem builders',
          tone: 'Direct, technical, and candid',
        },
      },
    },
  });
  console.log('Created Gnosis client:', client.id);

  // --- Members --------------------------------------------------------------
  const memberSpecs = [
    { key: 'mehdi', name: 'Mehdi', github: 'mehdi-gh' },
    { key: 'auryn', name: 'Auryn', github: 'auryn-gh' },
    { key: 'stefan', name: 'Stefan', github: 'stefan-gh' },
    { key: 'friederike', name: 'Friederike' },
    { key: 'martin', name: 'Martin' },
    { key: 'tabby', name: 'Tabby' },
    { key: 'nimrod', name: 'Nimrod' },
    { key: 'philippe', name: 'Philippe' },
  ];

  const members: Record<string, string> = {};
  for (const [i, spec] of memberSpecs.entries()) {
    const identities: Array<{
      platform: Platform;
      platformUserId: string;
      username: string;
      matchMethod: string;
      matchConfidence: number;
    }> = [
      {
        platform: Platform.DISCOURSE,
        platformUserId: `dc-${spec.key}`,
        username: spec.key,
        matchMethod: 'username_exact',
        matchConfidence: 1.0,
      },
    ];
    if (spec.github) {
      identities.push({
        platform: Platform.GITHUB,
        platformUserId: `gh-${1000 + i}`,
        username: spec.github,
        matchMethod: 'explicit',
        matchConfidence: 0.95,
      });
    }

    const member = await prisma.member.create({
      data: {
        clientId: client.id,
        displayName: spec.name,
        firstSeen: dayAt(60),
        platformIdentities: { create: identities },
      },
    });
    members[spec.key] = member.id;
  }

  // --- Daily metrics: previous week (days 14..8) vs this week (days 7..1) ----
  const metricRows: Array<{ metricType: MetricType; value: number; createdAt: Date }> = [];
  const pushMetric = (type: MetricType, value: number, daysAgo: number) =>
    metricRows.push({ metricType: type, value, createdAt: dayAt(daysAgo) });

  // DAU: softening this week (avg ~119 -> ~109).
  const dauPrev = [120, 118, 122, 119, 121, 117, 120];
  const dauThis = [115, 112, 110, 108, 109, 106, 104];
  // Message volume: rising (conversation up).
  const volPrev = [80, 75, 82, 78, 81, 77, 79];
  const volThis = [95, 98, 102, 99, 101, 97, 104];
  // Sentiment: slipping (~0.42 -> ~0.30).
  const sentPrev = [0.44, 0.41, 0.43, 0.4, 0.45, 0.42, 0.41];
  const sentThis = [0.33, 0.31, 0.29, 0.3, 0.28, 0.32, 0.3];

  for (let i = 0; i < 7; i++) {
    const prevDay = 14 - i; // 14..8
    const thisDay = 7 - i; // 7..1
    pushMetric(MetricType.DAU, dauPrev[i], prevDay);
    pushMetric(MetricType.DAU, dauThis[i], thisDay);
    pushMetric(MetricType.MESSAGE_VOLUME, volPrev[i], prevDay);
    pushMetric(MetricType.MESSAGE_VOLUME, volThis[i], thisDay);
    pushMetric(MetricType.SENTIMENT_AVERAGE, sentPrev[i], prevDay);
    pushMetric(MetricType.SENTIMENT_AVERAGE, sentThis[i], thisDay);
  }
  // Weekly-anchored metrics (latest value per week wins).
  pushMetric(MetricType.WAU, 820, 8);
  pushMetric(MetricType.WAU, 871, 1);
  pushMetric(MetricType.MEMBER_COUNT, 5400, 8);
  pushMetric(MetricType.MEMBER_COUNT, 5630, 1);

  await prisma.metric.createMany({
    data: metricRows.map((m) => ({ ...m, clientId: client.id })),
  });

  // --- Messages: fewer distinct active members/day this week ----------------
  // Previous week: 6 active members/day; this week: 4 -> falling active days.
  const prevActive: Array<[string, number]> = [
    ['mehdi', 2], ['auryn', 2], ['stefan', 3], ['friederike', 1], ['tabby', 2], ['martin', 2],
  ];
  const thisActive: Array<[string, number]> = [
    ['mehdi', 4], ['auryn', 3], ['stefan', 3], ['friederike', 2],
  ];

  const messageRows: Array<{
    memberId: string;
    platformMessageId: string;
    content: string;
    createdAt: Date;
  }> = [];
  let msgSeq = 0;
  const emitMessages = (active: Array<[string, number]>, dayRange: number[]) => {
    for (const daysAgo of dayRange) {
      for (const [key, count] of active) {
        for (let n = 0; n < count; n++) {
          messageRows.push({
            memberId: members[key],
            platformMessageId: `gn-msg-${msgSeq++}`,
            content: `Forum discussion contribution from ${key} (day -${daysAgo}, #${n + 1}).`,
            createdAt: dayAt(daysAgo, 9 + (n % 8)),
          });
        }
      }
    }
  };
  emitMessages(prevActive, [14, 13, 12, 11, 10, 9, 8]);
  emitMessages(thisActive, [7, 6, 5, 4, 3, 2, 1]);

  await prisma.message.createMany({
    data: messageRows.map((m) => ({
      ...m,
      clientId: client.id,
      platform: Platform.DISCOURSE,
      channelId: 'governance',
    })),
  });

  // --- Governance events (Discourse) ---------------------------------------
  const forum = 'https://forum.gnosis.io';
  const gov = (extra: Record<string, unknown>) => ({ governance: true, category: 'governance', ...extra });

  type Ev = {
    memberKey: string;
    eventType: EventType;
    eventData: Record<string, unknown>;
    daysAgo: number;
  };
  const events: Ev[] = [
    // Previous week: one governance topic, answered (keeps prior unanswered low).
    {
      memberKey: 'mehdi', eventType: EventType.TOPIC_CREATED, daysAgo: 11,
      eventData: gov({ topicId: '117', title: 'GIP-117: Update RPC rate limits', url: `${forum}/t/gip-117/117` }),
    },
    {
      memberKey: 'tabby', eventType: EventType.SOLUTION_ACCEPTED, daysAgo: 10,
      eventData: gov({ topicId: '117', title: 'GIP-117: Update RPC rate limits', url: `${forum}/t/gip-117/117/4` }),
    },
    // This week: three new governance topics; only GIP-119 gets resolved.
    {
      memberKey: 'mehdi', eventType: EventType.TOPIC_CREATED, daysAgo: 6,
      eventData: gov({ topicId: '118', title: 'GIP-118: Adjust GNO staking rewards', url: `${forum}/t/gip-118/118` }),
    },
    {
      memberKey: 'mehdi', eventType: EventType.TOPIC_CREATED, daysAgo: 5,
      eventData: gov({ topicId: '119', title: 'GIP-119: Treasury diversification mandate', url: `${forum}/t/gip-119/119` }),
    },
    {
      memberKey: 'stefan', eventType: EventType.POST_CREATED, daysAgo: 4,
      eventData: gov({ topicId: '119', postNumber: 3, url: `${forum}/t/gip-119/119/3` }),
    },
    {
      memberKey: 'auryn', eventType: EventType.SOLUTION_ACCEPTED, daysAgo: 3,
      eventData: gov({ topicId: '119', title: 'GIP-119: Treasury diversification mandate', url: `${forum}/t/gip-119/119/5` }),
    },
    {
      memberKey: 'friederike', eventType: EventType.TOPIC_CREATED, daysAgo: 2,
      eventData: gov({ topicId: '120', title: 'GIP-120: Delegate incentive pilot', url: `${forum}/t/gip-120/120` }),
    },
    // A couple of GitHub contributions for contributor-pipeline signal.
    {
      memberKey: 'auryn', eventType: EventType.PULL_REQUEST_MERGED, daysAgo: 4,
      eventData: { repo: 'gnosis/safe-contracts', number: 412 },
    },
    {
      memberKey: 'stefan', eventType: EventType.PULL_REQUEST_MERGED, daysAgo: 2,
      eventData: { repo: 'gnosis/zodiac', number: 88 },
    },
  ];

  await prisma.event.createMany({
    data: events.map((e) => ({
      clientId: client.id,
      memberId: members[e.memberKey],
      platform: e.eventType === EventType.PULL_REQUEST_MERGED ? Platform.GITHUB : Platform.DISCOURSE,
      eventType: e.eventType,
      eventData: e.eventData,
      createdAt: dayAt(e.daysAgo, 14),
    })),
  });

  console.log(
    `Seeded ${memberSpecs.length} members, ${metricRows.length} metrics, ${messageRows.length} messages, ${events.length} events.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
