/**
 * Manual trigger for the weekly ecosystem health report.
 *
 *   pnpm digest:run --client gnosis
 *
 * Flags:
 *   --client <slug>   client slug to generate for (required)
 *   --date <iso>      reference date; report covers the 7 days ending here
 *   --dry-run         generate + print, but do not persist or email
 *   --no-email        persist, but skip email delivery
 *   --html <path>     also write the rendered HTML email to a file
 */

import { writeFileSync } from 'node:fs';
import { prisma, log } from '@attrakt/core';
import { generateWeeklyReport } from './weekly-report';

interface CliArgs {
  client?: string;
  date?: string;
  dryRun: boolean;
  noEmail: boolean;
  html?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, noEmail: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--client') args.client = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-email') args.noEmail = true;
    else if (a === '--html') args.html = argv[++i];
    else if (a.startsWith('--client=')) args.client = a.split('=')[1];
    else if (a.startsWith('--date=')) args.date = a.split('=')[1];
    else if (a.startsWith('--html=')) args.html = a.split('=')[1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Allow the slug to also come from an env var, since some `pnpm` setups
  // swallow unknown flags before they reach the script.
  const slug = args.client ?? process.env.DIGEST_CLIENT;

  if (!slug) {
    console.error('Usage: pnpm digest:run --client <slug> [--date <iso>] [--dry-run] [--no-email] [--html <path>]');
    process.exit(1);
  }

  const client = await prisma.client.findUnique({ where: { slug } });
  if (!client) {
    console.error(`No client found with slug "${slug}".`);
    process.exit(1);
  }

  const { markdown, html } = await generateWeeklyReport(client.id, {
    date: args.date ? new Date(args.date) : undefined,
    dryRun: args.dryRun,
    noEmail: args.noEmail,
  });

  if (args.html) {
    writeFileSync(args.html, html, 'utf8');
    log.info({ path: args.html }, 'Wrote rendered HTML email');
  }

  // The rendered report is the deliverable — print it to stdout.
  console.log('\n' + '='.repeat(72) + '\n');
  console.log(markdown);
  console.log('\n' + '='.repeat(72) + '\n');
}

main()
  .catch((error) => {
    log.error({ error }, 'digest:run failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
