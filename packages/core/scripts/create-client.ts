/**
 * Client provisioning CLI.
 *
 * Creates (or updates) a `Client` and its per-platform `PlatformConfig` rows.
 * This is the MVP onboarding path — no UI, just the CLI.
 *
 * Usage:
 *   pnpm client:create --name "Gnosis" --slug gnosis \
 *     --discord-guild 123456789012345678 \
 *     --github-org gnosis \
 *     --discourse-url https://forum.gnosis.io \
 *     --twitter gnosisdao,gnosischain
 *
 * Only --name and --slug are required. Any platform flag that is provided
 * creates an enabled PlatformConfig for that platform; routing keys
 * (guild id / org / base url / tracked accounts) are stored in config JSON.
 */

import { PrismaClient, type Platform, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface ParsedArgs {
  name?: string;
  slug?: string;
  discordGuild?: string;
  githubOrg?: string;
  discourseUrl?: string;
  twitter?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flagMap: Record<string, keyof ParsedArgs> = {
    '--name': 'name',
    '--slug': 'slug',
    '--discord-guild': 'discordGuild',
    '--github-org': 'githubOrg',
    '--discourse-url': 'discourseUrl',
    '--twitter': 'twitter',
  };

  const parsed: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key = arg;
    let inlineValue: string | undefined;

    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1) {
      key = arg.slice(0, eq);
      inlineValue = arg.slice(eq + 1);
    }

    const field = flagMap[key];
    if (!field) continue;

    const value = inlineValue ?? argv[++i];
    if (value === undefined) {
      throw new Error(`Missing value for ${key}`);
    }
    parsed[field] = value;
  }
  return parsed;
}

interface PlatformConfigInput {
  platform: Platform;
  config: Prisma.InputJsonValue;
}

function buildPlatformConfigs(args: ParsedArgs): PlatformConfigInput[] {
  const configs: PlatformConfigInput[] = [];

  if (args.discordGuild) {
    configs.push({ platform: 'DISCORD', config: { guildId: args.discordGuild } });
  }
  if (args.githubOrg) {
    configs.push({ platform: 'GITHUB', config: { org: args.githubOrg } });
  }
  if (args.discourseUrl) {
    configs.push({ platform: 'DISCOURSE', config: { baseUrl: args.discourseUrl } });
  }
  if (args.twitter) {
    const trackedAccounts = args.twitter
      .split(',')
      .map((a) => a.trim().replace(/^@/, ''))
      .filter(Boolean);
    if (trackedAccounts.length > 0) {
      configs.push({ platform: 'TWITTER', config: { trackedAccounts } });
    }
  }

  return configs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name || !args.slug) {
    console.error('Error: --name and --slug are required.\n');
    console.error(
      'Usage: pnpm client:create --name "Gnosis" --slug gnosis ' +
        '[--discord-guild <id>] [--github-org <org>] [--discourse-url <url>] [--twitter <a,b>]'
    );
    process.exit(1);
  }

  const platformConfigs = buildPlatformConfigs(args);

  const client = await prisma.client.upsert({
    where: { slug: args.slug },
    update: { name: args.name },
    create: { name: args.name, slug: args.slug },
  });

  for (const pc of platformConfigs) {
    await prisma.platformConfig.upsert({
      where: { clientId_platform: { clientId: client.id, platform: pc.platform } },
      update: { enabled: true, config: pc.config },
      create: {
        clientId: client.id,
        platform: pc.platform,
        enabled: true,
        config: pc.config,
        credentials: {},
      },
    });
  }

  console.log(`✓ Client "${client.name}" (slug: ${client.slug}) ready — id: ${client.id}`);
  if (platformConfigs.length > 0) {
    for (const pc of platformConfigs) {
      console.log(`  • ${pc.platform}: ${JSON.stringify(pc.config)}`);
    }
  } else {
    console.log('  (no platform configs provided — add them later by re-running with platform flags)');
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
