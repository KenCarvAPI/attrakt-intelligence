/**
 * Manual advocate-scoring trigger.
 *
 *   pnpm scoring:run --client <slug> [--date YYYY-MM-DD]
 *
 * Resolves the client by slug, computes scores for the ISO week containing the
 * (optional) date, prints a summary, and exits.
 */
import { prisma, computeAdvocateScores, log } from '@attrakt/core';

interface CliArgs {
  client?: string;
  date?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--client') args.client = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg.startsWith('--client=')) args.client = arg.slice('--client='.length);
    else if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length);
  }
  return args;
}

async function main() {
  const { client: slug, date } = parseArgs(process.argv.slice(2));

  if (!slug) {
    log.error({}, 'Usage: pnpm scoring:run --client <slug> [--date YYYY-MM-DD]');
    process.exitCode = 1;
    return;
  }

  const client = await prisma.client.findUnique({ where: { slug } });
  if (!client) {
    log.error({ slug }, 'No client found with that slug');
    process.exitCode = 1;
    return;
  }

  const referenceDate = date ? new Date(date) : new Date();
  const summary = await computeAdvocateScores(client.id, referenceDate);

  log.info(
    { client: slug, ...summary },
    `Scored ${summary.membersScored} members for ${summary.period}`
  );
  // Human-readable segment breakdown.
  // eslint-disable-next-line no-console
  console.table(summary.segmentCounts);
}

main()
  .catch((error) => {
    log.error({ error }, 'Scoring run failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
