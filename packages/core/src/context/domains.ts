/**
 * Domain mapping helpers for the Context Engine.
 *
 * The five ContextDomains organize everything a client connects. This module maps
 * the existing manual-knowledge source types onto domains, and defines the item
 * `kind` vocabulary connectors normalize into.
 */

import type { ContextDomain, KnowledgeSourceType } from '@prisma/client';

/** The item `kind` vocabulary (stored as a string on ContextItem.kind). */
export const CONTEXT_ITEM_KINDS = [
  'document', // strategy/brand/marketing docs, leadership interviews, pages
  'release', // product release / changelog entry
  'issue', // product issue / roadmap item (Linear, GitHub, Jira)
  'campaign', // marketing campaign / content-calendar entry
  'metric_snapshot', // a point/rollup of quantitative performance data
  'research', // user research finding, survey result
  'community_signal', // external community/ecosystem signal
] as const;
export type ContextItemKind = (typeof CONTEXT_ITEM_KINDS)[number];

/** Map a manual KnowledgeSourceType to the domain it belongs to. */
export function sourceTypeToDomain(sourceType: KnowledgeSourceType): ContextDomain {
  switch (sourceType) {
    case 'product_docs':
      return 'PRODUCT';
    case 'marketing_material':
      return 'MARKETING_OPS';
    case 'brand_guidelines':
    case 'leadership_interview':
    case 'strategy_doc':
    case 'website':
    case 'other':
    default:
      return 'STRATEGY';
  }
}
