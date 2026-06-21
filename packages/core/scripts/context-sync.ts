/**
 * CLI: run a Context Engine connector sync for one source.
 *
 *   pnpm context:sync --source <contextSourceId>
 *
 * Looks up the ContextSource, runs its connector, upserts normalized items into
 * the store (chunk + embed), and records a ContextSyncRun. Idempotent.
 */

// Load env before @attrakt/core validates config.
import 'dotenv/config';

import { parseArgs } from 'node:util';
import { runSync, prisma } from '../src/index';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { source: { type: 'string' } } });
  if (!values.source) {
    console.error('\n✖ --source <contextSourceId> is required\n');
    process.exit(1);
  }

  console.log(`Syncing context source ${values.source}...`);
  const result = await runSync(values.source);
  if (result.status === 'success') {
    console.log(`✓ ingested=${result.itemsIngested} deduped=${result.itemsDeduped}`);
  } else {
    console.error(`✖ sync failed: ${result.error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
