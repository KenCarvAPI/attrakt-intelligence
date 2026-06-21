/**
 * Seed synthetic community ingestion data (members, identities, messages,
 * events) for a client, so advocacy/channel signals have something to work on.
 *
 *   pnpm --filter @attrakt/core exec tsx scripts/seed-community.ts --client helios
 *
 * Idempotent-ish: clears the client's existing members/messages/events first.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma, resolveClientId } from '../src/index';

interface SeedMember {
  displayName: string;
  platform: 'DISCORD' | 'GITHUB' | 'TWITTER';
  username: string;
  channelId: string;
  messages: string[];
  sentiment: number;
  events: number;
}

const SEED: SeedMember[] = [
  {
    displayName: 'dev_remy',
    platform: 'GITHUB',
    username: 'remy-eth',
    channelId: 'helios/sdk',
    sentiment: 0.6,
    events: 12,
    messages: [
      'Integrated the Helios Payments API in an afternoon, gas abstraction just works.',
      'Opened a PR adding a TypeScript example for stablecoin payouts.',
      'The multi-chain settlement docs are the clearest I have seen for stablecoins.',
      'Filed an issue about EURe settlement edge cases, devrel responded fast.',
    ],
  },
  {
    displayName: 'mira.defi',
    platform: 'TWITTER',
    username: 'mira_defi',
    channelId: 'conversation/helios',
    sentiment: 0.5,
    events: 9,
    messages: [
      'Helios is basically Stripe for stablecoins, shipped a payments flow with zero gas headaches.',
      'Told three founder friends to stop building payments in-house and just use Helios.',
      'The compliance tooling at the API layer is underrated for DeFi teams.',
    ],
  },
  {
    displayName: 'protocol_sam',
    platform: 'DISCORD',
    username: 'protocol_sam',
    channelId: 'builders',
    sentiment: 0.3,
    events: 7,
    messages: [
      'Anyone using Helios payouts for marketplace settlement? Batching looks solid.',
      'Switched our payouts to Helios, retries saved us a ton of ops pain.',
      'Would love a hosted checkout component for stablecoin payments.',
    ],
  },
  {
    displayName: 'gasless_gabe',
    platform: 'DISCORD',
    username: 'gasless_gabe',
    channelId: 'builders',
    sentiment: 0.4,
    events: 4,
    messages: [
      'Gas abstraction is the killer feature, my users never see a native token.',
      'Helios uptime has been perfect for our payments since launch.',
    ],
  },
  {
    displayName: 'lena_builds',
    platform: 'GITHUB',
    username: 'lena-builds',
    channelId: 'helios/examples',
    sentiment: 0.2,
    events: 3,
    messages: [
      'Submitted a sample app using the Helios Payments API for a hackathon.',
      'Settlement proofs on-chain are great for our audit trail.',
    ],
  },
  {
    displayName: 'quiet_quinn',
    platform: 'TWITTER',
    username: 'quiet_quinn',
    channelId: 'conversation/helios',
    sentiment: 0.0,
    events: 1,
    messages: ['Trying out Helios for a side project, stablecoin rails look promising.'],
  },
];

async function main() {
  const { values } = parseArgs({ options: { client: { type: 'string' } } });
  if (!values.client) {
    console.error('Usage: tsx scripts/seed-community.ts --client <slug|id>');
    process.exit(1);
  }
  const clientId = await resolveClientId(values.client);
  if (!clientId) {
    console.error(`No client found for "${values.client}"`);
    process.exit(1);
  }

  // Clear prior seeded data for a clean run.
  await prisma.message.deleteMany({ where: { clientId } });
  await prisma.event.deleteMany({ where: { clientId } });
  await prisma.member.deleteMany({ where: { clientId } });

  let msgSeq = 0;
  for (const m of SEED) {
    const member = await prisma.member.create({
      data: {
        clientId,
        displayName: m.displayName,
        platformIdentities: {
          create: {
            platform: m.platform,
            platformUserId: `${m.platform}-${m.username}`,
            username: m.username,
          },
        },
      },
    });

    for (const content of m.messages) {
      await prisma.message.create({
        data: {
          clientId,
          memberId: member.id,
          platform: m.platform,
          platformMessageId: `seed-${clientId}-${msgSeq++}`,
          channelId: m.channelId,
          content,
          sentiment: m.sentiment,
        },
      });
    }

    for (let i = 0; i < m.events; i++) {
      await prisma.event.create({
        data: {
          clientId,
          memberId: member.id,
          platform: m.platform,
          eventType: m.platform === 'GITHUB' ? 'PULL_REQUEST_OPENED' : 'MESSAGE_REACTION',
        },
      });
    }
  }

  const counts = {
    members: await prisma.member.count({ where: { clientId } }),
    messages: await prisma.message.count({ where: { clientId } }),
    events: await prisma.event.count({ where: { clientId } }),
  };
  console.log(`Seeded community data for ${values.client}:`, counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
