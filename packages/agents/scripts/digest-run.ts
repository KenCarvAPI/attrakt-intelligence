/**
 * CLI: generate the weekly ecosystem health digest for a client.
 *
 *   pnpm digest:run --client gnosis [--date YYYY-MM-DD] [--no-deliver] [--print]
 *
 * Persists the digest (structured JSON + Markdown) on the WeeklyDigest model and,
 * unless --no-deliver is passed, emails it via Resend (when configured). Use
 * --print to echo the rendered Markdown to stdout.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma, resolveClientId } from '@attrakt/core';
import { generateWeeklyDigest } from '../src/pulse-agent/weekly';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error('Usage: pnpm digest:run --client <slug|id> [--date YYYY-MM-DD] [--no-deliver] [--print]');
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      client: { type: 'string' },
      date: { type: 'string' },
      'no-deliver': { type: 'boolean', default: false },
      print: { type: 'boolean', default: false },
    },
  });
  if (!values.client) fail('Missing --client');

  const clientId = await resolveClientId(values.client);
  if (!clientId) fail(`No client found for "${values.client}"`);

  const { content, markdown } = await generateWeeklyDigest(clientId, {
    referenceDate: values.date ? new Date(values.date) : undefined,
    deliver: !values['no-deliver'],
  });

  console.log('');
  console.log(`✓ Generated weekly digest for ${values.client} — ${content.period}`);
  console.log(`  engine:  ${content.generatedWith === 'claude' ? 'Claude (LLM)' : 'deterministic fallback (no ANTHROPIC_API_KEY)'}`);
  console.log(`  context: ${content.runningWithoutContext ? 'none (ungrounded)' : `ContextProfile v${content.contextProfileVersion}`}`);
  console.log('');

  if (values.print) {
    console.log('────────────────────────────────────────────────────────');
    console.log(markdown);
    console.log('────────────────────────────────────────────────────────');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
