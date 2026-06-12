/**
 * CLI: generate a campaign brief for a client + objective.
 *
 *   pnpm campaign:brief --client gnosis --objective "drive awareness of the new payments product among DeFi developers"
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma, resolveClientId } from '@attrakt/core';
import { generateCampaignBrief } from '../src/campaign-agent/index';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error('Usage: pnpm campaign:brief --client <slug|id> --objective "<text>"');
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: { client: { type: 'string' }, objective: { type: 'string' } },
  });
  if (!values.client) fail('Missing --client');
  if (!values.objective) fail('Missing --objective');

  const clientId = await resolveClientId(values.client);
  if (!clientId) fail(`No client found for "${values.client}"`);

  const { brief, usedLLM, hasContext } = await generateCampaignBrief(clientId, values.objective);

  console.log('');
  console.log('✓ Generated campaign brief');
  console.log(`  briefId:  ${brief.id}`);
  console.log(`  client:   ${values.client} (${clientId})`);
  console.log(`  engine:   ${usedLLM ? 'Claude (LLM)' : 'deterministic fallback (no ANTHROPIC_API_KEY)'}`);
  console.log(`  context:  ${hasContext ? 'grounded in active ContextProfile' : 'NO active profile — running without context'}`);
  console.log('');
  console.log(JSON.stringify(brief.content, null, 2));
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
