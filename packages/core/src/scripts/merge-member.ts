/**
 * Manual member-merge CLI.
 *
 * Usage:
 *   pnpm --filter @attrakt/core member:merge --source <id> --target <id>
 *
 * Reassigns the source member's identities, messages, and events to the target
 * and soft-deletes the source. See mergeMember() in the identity-resolution
 * service for the transactional details.
 */
import { prisma } from '../prisma';
import { mergeMember } from '../services/identity-resolution';
import { log } from '../logger';

function parseArgs(argv: string[]): { source: string; target: string } {
  let source: string | undefined;
  let target: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) source = argv[++i];
    else if (argv[i] === '--target' && argv[i + 1]) target = argv[++i];
  }

  if (!source || !target) {
    throw new Error('Usage: member:merge --source <id> --target <id>');
  }
  return { source, target };
}

async function main() {
  const { source, target } = parseArgs(process.argv.slice(2));
  log.info({ source, target }, 'Merging member');
  const result = await mergeMember(source, target);
  log.info(
    {
      ...result.reassigned,
      sourceId: result.sourceId,
      targetId: result.targetId,
    },
    'Member merge complete'
  );
  // Human-readable summary
  console.log(
    `Merged ${source} → ${target}: reassigned ${result.reassigned.platformIdentities} identities, ` +
      `${result.reassigned.messages} messages, ${result.reassigned.events} events. Source soft-deleted.`
  );
}

main()
  .catch((error) => {
    log.error({ error: error instanceof Error ? error.message : String(error) }, 'Member merge failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
