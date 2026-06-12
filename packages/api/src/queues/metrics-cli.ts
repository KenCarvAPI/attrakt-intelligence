/**
 * Manual metrics computation CLI.
 *
 * Runs the same `computeMetrics()` used by the BullMQ worker, but directly —
 * useful for backfills, debugging, or environments where the queue transport
 * isn't running.
 *
 * Usage:
 *   pnpm --filter @attrakt/api metrics:compute [--client <id>] [--period hour|day|week]
 */
import { computeMetrics } from './metrics-worker';
import { prisma, config, log } from '@attrakt/core';

function parseArgs(argv: string[]): { clientId: string; period: 'hour' | 'day' | 'week' } {
  let clientId = config.defaultClientId;
  let period: 'hour' | 'day' | 'week' = 'hour';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client' && argv[i + 1]) clientId = argv[++i];
    else if (argv[i] === '--period' && argv[i + 1]) {
      const p = argv[++i];
      if (p === 'hour' || p === 'day' || p === 'week') period = p;
      else throw new Error(`Invalid --period "${p}" (expected hour|day|week)`);
    }
  }

  return { clientId, period };
}

async function main() {
  const { clientId, period } = parseArgs(process.argv.slice(2));
  log.info({ clientId, period }, 'Running manual metrics computation');
  const count = await computeMetrics(clientId, period);
  log.info({ clientId, period, count }, 'Manual metrics computation complete');
}

main()
  .catch((error) => {
    log.error({ error }, 'Manual metrics computation failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
