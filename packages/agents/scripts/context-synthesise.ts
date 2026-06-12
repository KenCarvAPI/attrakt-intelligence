/**
 * CLI: synthesise a new draft ContextProfile from a client's knowledge docs.
 *
 *   pnpm context:synthesise --client gnosis
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma, resolveClientId } from '@attrakt/core';
import { synthesiseContextProfile } from '../src/context-agent/index';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error('Usage: pnpm context:synthesise --client <slug|id>');
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({ options: { client: { type: 'string' } } });
  if (!values.client) fail('Missing --client');

  const clientId = await resolveClientId(values.client);
  if (!clientId) fail(`No client found for "${values.client}"`);

  const { profile, documentCount, usedLLM } = await synthesiseContextProfile(clientId);

  console.log('');
  console.log(`✓ Synthesised context profile v${profile.version} (status: ${profile.status})`);
  console.log(`  client:        ${values.client} (${clientId})`);
  console.log(`  fromDocuments: ${documentCount}`);
  console.log(`  engine:        ${usedLLM ? 'Claude (LLM)' : 'deterministic fallback (no ANTHROPIC_API_KEY)'}`);
  console.log(`  profileId:     ${profile.id}`);
  console.log('');
  console.log('Sections:');
  console.log(JSON.stringify(
    {
      products: profile.products,
      brandVoice: profile.brandVoice,
      audience: profile.audience,
      marketingFunction: profile.marketingFunction,
      strategicDirection: profile.strategicDirection,
    },
    null,
    2
  ));
  console.log('');
  console.log(`Activate with: pnpm context:activate --client ${values.client} --version ${profile.version}`);
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
