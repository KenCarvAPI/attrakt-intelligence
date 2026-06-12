/**
 * CLI: activate a ContextProfile version (archives the previous active one).
 *
 *   pnpm context:activate --client gnosis --version 1
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma, resolveClientId } from '@attrakt/core';
import { activateContextProfile } from '../src/context-agent/index';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error('Usage: pnpm context:activate --client <slug|id> --version <n>');
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: { client: { type: 'string' }, version: { type: 'string' } },
  });
  if (!values.client) fail('Missing --client');
  if (!values.version) fail('Missing --version');
  const version = Number(values.version);
  if (!Number.isInteger(version)) fail(`--version must be an integer (got "${values.version}")`);

  const clientId = await resolveClientId(values.client);
  if (!clientId) fail(`No client found for "${values.client}"`);

  const profile = await activateContextProfile(clientId, version);

  console.log('');
  console.log(`✓ Activated context profile v${profile.version} (status: ${profile.status})`);
  console.log(`  client:    ${values.client} (${clientId})`);
  console.log(`  profileId: ${profile.id}`);
  console.log('  Any previously active profile for this client has been archived.');
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
