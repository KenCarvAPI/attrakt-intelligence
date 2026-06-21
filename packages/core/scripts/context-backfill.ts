/**
 * CLI: backfill the Context Engine store from existing data.
 *
 *   pnpm context:backfill                 # all clients
 *   pnpm context:backfill --client gnosis # one client (slug or id)
 *
 * Projects existing KnowledgeDocuments into ContextItem + ContextChunk so they
 * become retrievable via queryContext(). Idempotent (dedupes on content hash),
 * so it is safe to re-run.
 */

// Load env before @attrakt/core validates config.
import 'dotenv/config';

import { parseArgs } from 'node:util';
import { backfillKnowledgeDocuments, resolveClientId, prisma } from '../src/index';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { client: { type: 'string' } },
  });

  let clientId: string | undefined;
  if (values.client) {
    clientId = await resolveClientId(values.client);
    if (!clientId) {
      console.error(`\n✖ Client not found: ${values.client}\n`);
      process.exit(1);
    }
  }

  console.log(`Backfilling context store${clientId ? ` for ${values.client}` : ' for ALL clients'}...`);
  const result = await backfillKnowledgeDocuments(clientId);
  console.log(
    `✓ Done. processed=${result.processed} created=${result.created} deduped=${result.deduped}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
