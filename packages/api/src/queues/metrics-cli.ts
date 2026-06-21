/**
 * Manual metrics computation CLI.
 *
 * Runs the same `computeMetrics()` used by the BullMQ worker, but directly —
 * useful for backfills, debugging, or environments where the queue transport
 * isn't running.
 *
 * Usage:
 *   pnpm --filter @attrakt/api metrics:compute [--client <slug|id>] [--period hour|day|week]
 *
 * With no --client, computes for every active client (multi-tenant). With
 * --client, scopes to that one tenant.
 */
import { computeMetrics } from './metrics-worker';
import { prisma, log, getActiveClients, resolveClientId } from '@attrakt/core';

function parseArgs(argv: string[]): { client?: string; period: 'hour' | 'day' | 'week' } {
  let client: string | undefined;
  let period: 'hour' | 'day' | 'week' = 'hour';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client' && argv[i + 1]) client = argv[++i];
    else if (argv[i] === '--period' && argv[i + 1]) {
      const p = argv[++i];
      if (p === 'hour' || p === 'day' || p === 'week') period = p;
      else throw new Error(`Invalid --period "${p}" (expected hour|day|week)`);
    }
  }

  return { client, period };
}

async function main() {
  const { client, period } = parseArgs(process.argv.slice(2));

  let clientIds: string[];
  if (client) {
    const id = await resolveClientId(client);
    if (!id) throw new Error(`No client found for "${client}" (tried slug then id)`);
    clientIds = [id];
  } else {
    clientIds = (await getActiveClients()).map((c) => c.id);
    if (clientIds.length === 0) {
      log.warn({}, 'No active clients to compute metrics for');
      return;
    }
  }

  for (const clientId of clientIds) {
    log.info({ clientId, period }, 'Running manual metrics computation');
    const count = await computeMetrics(clientId, period);
    log.info({ clientId, period, count }, 'Manual metrics computation complete');
  }
}

main()
  .catch((error) => {
    log.error({ error }, 'Manual metrics computation failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
