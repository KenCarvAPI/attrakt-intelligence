/**
 * CLI: exclude (opt-out) or re-include a member from scoring, briefs, and digests.
 *
 *   pnpm member:exclude --client gnosis --member <id> [--reason "opt-out"]
 *   pnpm member:exclude --client gnosis --member <id> --unexclude
 *
 * See docs/DATA_HANDLING.md. Scoped by client so one tenant can never toggle
 * another tenant's member.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma, resolveClientId, setMemberExcluded } from '../index';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error('Usage: pnpm member:exclude --client <slug|id> --member <id> [--reason <text>] [--unexclude]');
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      client: { type: 'string' },
      member: { type: 'string' },
      reason: { type: 'string' },
      unexclude: { type: 'boolean', default: false },
    },
  });
  if (!values.client) fail('Missing --client');
  if (!values.member) fail('Missing --member');

  const clientId = await resolveClientId(values.client);
  if (!clientId) fail(`No client found for "${values.client}"`);

  const result = await setMemberExcluded(clientId, values.member, !values.unexclude, values.reason);
  console.log('');
  console.log(result.excluded ? '✓ Member excluded from scoring, briefs, and digests' : '✓ Member re-included');
  console.log(`  member: ${result.id}`);
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
