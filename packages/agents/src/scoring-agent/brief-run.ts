/**
 * Manual advocate-brief generator.
 *
 *   pnpm brief:generate --client <slug> --member <memberId>
 *
 * Resolves the client by slug, generates a brief for the member, persists it,
 * and prints the full brief as JSON.
 */
import { prisma, log, config } from '@attrakt/core';
import { generateAdvocateBrief } from './briefs';

interface CliArgs {
  client?: string;
  member?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--client') args.client = argv[++i];
    else if (arg === '--member') args.member = argv[++i];
    else if (arg.startsWith('--client=')) args.client = arg.slice('--client='.length);
    else if (arg.startsWith('--member=')) args.member = arg.slice('--member='.length);
  }
  return args;
}

async function main() {
  const { client: slug, member: memberId } = parseArgs(process.argv.slice(2));

  if (!slug || !memberId) {
    log.error({}, 'Usage: pnpm brief:generate --client <slug> --member <memberId>');
    process.exitCode = 1;
    return;
  }
  if (!config.anthropicApiKey) {
    log.error({}, 'ANTHROPIC_API_KEY is required to generate briefs');
    process.exitCode = 1;
    return;
  }

  const client = await prisma.client.findUnique({ where: { slug } });
  if (!client) {
    log.error({ slug }, 'No client found with that slug');
    process.exitCode = 1;
    return;
  }

  const { content } = await generateAdvocateBrief(client.id, memberId);

  // Print the full brief for inspection.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(content, null, 2));
}

main()
  .catch((error) => {
    log.error({ error }, 'Brief generation failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
