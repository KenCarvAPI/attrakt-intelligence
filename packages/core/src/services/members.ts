/**
 * Member helpers shared across scoring, briefs, and digests.
 *
 * `SCORABLE_MEMBER_WHERE` is the single definition of "a member we should
 * include in advocacy outputs": not merged away (deletedAt null) and not opted
 * out (excluded false). Every scoring/brief/digest query spreads it so an
 * exclusion takes effect everywhere consistently. See docs/DATA_HANDLING.md.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { log } from '../logger';

/** Where-clause fragment selecting members eligible for advocacy outputs. */
export const SCORABLE_MEMBER_WHERE = { deletedAt: null, excluded: false } as const;

/** Member relation-filter form (for nested `member: { ... }` filters). */
export const SCORABLE_MEMBER_RELATION: Prisma.MemberWhereInput = { deletedAt: null, excluded: false };

/**
 * Exclude (or re-include) a member from scoring, briefs, and digests. Used for
 * data-handling opt-outs. Scoped by clientId so one tenant can never toggle
 * another tenant's member.
 */
export async function setMemberExcluded(
  clientId: string,
  memberId: string,
  excluded: boolean,
  reason?: string
): Promise<{ id: string; excluded: boolean }> {
  const member = await prisma.member.findFirst({ where: { id: memberId, clientId } });
  if (!member) throw new Error(`Member ${memberId} not found for client ${clientId}`);

  const updated = await prisma.member.update({
    where: { id: member.id },
    data: { excluded, excludedReason: excluded ? reason ?? 'opt-out' : null },
  });
  log.info({ clientId, memberId, excluded }, excluded ? 'Member excluded from outputs' : 'Member re-included');
  return { id: updated.id, excluded: updated.excluded };
}
