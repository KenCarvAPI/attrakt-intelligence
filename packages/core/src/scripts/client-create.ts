/**
 * CLI: provision a client (tenant) and its platform configuration.
 *
 *   pnpm client:create --name "Gnosis" --slug gnosis \
 *     [--discord-guild <guildId>] [--github-org <org>] [--discourse-url <baseUrl>]
 *
 * Idempotent on --slug: re-running updates the name and upserts platform configs
 * (so you can add credentials/platforms later). Self-serve onboarding is out of
 * scope for MVP; this is the white-glove provisioning path.
 */

// Load env (DATABASE_URL, ...) before @attrakt/core validates config.
import 'dotenv/config';

import { parseArgs } from 'node:util';
import { createClient, prisma, type PlatformConfigInput } from '../index';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error(
    'Usage: pnpm client:create --name "<name>" --slug <slug> ' +
      '[--discord-guild <guildId>] [--github-org <org>] [--discourse-url <baseUrl>]'
  );
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      'discord-guild': { type: 'string' },
      'github-org': { type: 'string' },
      'discourse-url': { type: 'string' },
    },
  });

  if (!values.name) fail('Missing --name');
  if (!values.slug) fail('Missing --slug');
  if (!/^[a-z0-9-]+$/.test(values.slug)) fail('--slug must be lowercase alphanumeric/hyphen');

  const platformConfigs: PlatformConfigInput[] = [];
  if (values['discord-guild']) {
    platformConfigs.push({ platform: 'DISCORD', config: { guildId: values['discord-guild'] } });
  }
  if (values['github-org']) {
    platformConfigs.push({ platform: 'GITHUB', config: { org: values['github-org'] } });
  }
  if (values['discourse-url']) {
    platformConfigs.push({ platform: 'DISCOURSE', config: { baseUrl: values['discourse-url'] } });
  }

  const { client, created } = await createClient({
    name: values.name,
    slug: values.slug,
    platformConfigs,
  });

  console.log('');
  console.log(created ? '✓ Provisioned client' : '↺ Updated existing client');
  console.log(`  id:        ${client.id}`);
  console.log(`  name:      ${client.name}`);
  console.log(`  slug:      ${client.slug}`);
  console.log(`  active:    ${client.active}`);
  if (client.platformConfigs.length) {
    console.log('  platforms:');
    for (const pc of client.platformConfigs) {
      console.log(`    - ${pc.platform}: ${JSON.stringify(pc.config)}`);
    }
  } else {
    console.log('  platforms: (none — add with --discord-guild / --github-org / --discourse-url)');
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
