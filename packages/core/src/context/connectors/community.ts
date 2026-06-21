/**
 * Community connector (CE-1) — the deferred CE-0 projection.
 *
 * Projects the community/ecosystem signals the platform already ingests
 * (Messages across Discord/GitHub/Twitter/Discourse) into the context store as
 * COMMUNITY-domain items, so retrieval can surface what the community is actually
 * saying when grounding outputs. This reads our OWN database, not an external
 * API — no credentials needed.
 *
 * Config (ContextSource.config): { sinceDays?: number; limit?: number;
 * governanceOnly?: boolean }. Bounded by default so a first sync of a busy
 * community can't embed everything at once.
 */

import type { ContextDomain, Message } from '@prisma/client';
import { prisma } from '../../prisma';
import type { Connector, ConnectorContext, NormalizedItem } from './types';

const DOMAIN: ContextDomain = 'COMMUNITY';
const DEFAULT_SINCE_DAYS = 30;
const DEFAULT_LIMIT = 500;

/** A Message shape sufficient for normalization (subset of the Prisma model). */
export type CommunityMessage = Pick<
  Message,
  'id' | 'platform' | 'channelId' | 'content' | 'sentiment' | 'metadata' | 'createdAt'
>;

function isGovernance(metadata: unknown): boolean {
  return Boolean((metadata as { governance?: boolean })?.governance);
}

/** Map an ingested community Message to a `community_signal` context item. */
export function normalizeCommunityMessage(msg: CommunityMessage): NormalizedItem {
  const governance = isGovernance(msg.metadata);
  return {
    domain: DOMAIN,
    kind: 'community_signal',
    externalId: `msg:${msg.id}`,
    title: `${msg.platform}${governance ? ' · governance' : ''}`,
    text: msg.content,
    occurredAt: msg.createdAt,
    structured: {
      platform: msg.platform,
      channelId: msg.channelId,
      sentiment: msg.sentiment,
      governance,
    },
  };
}

export const communityConnector: Connector = {
  id: 'community',
  domain: DOMAIN,
  async fetch(ctx: ConnectorContext): Promise<NormalizedItem[]> {
    const config = (ctx.source.config ?? {}) as {
      sinceDays?: number;
      limit?: number;
      governanceOnly?: boolean;
    };
    const sinceDays = config.sinceDays ?? DEFAULT_SINCE_DAYS;
    const limit = Math.min(config.limit ?? DEFAULT_LIMIT, 2000);
    const since = ctx.since ?? new Date(Date.now() - sinceDays * 86_400_000);

    const messages = await prisma.message.findMany({
      where: {
        clientId: ctx.clientId,
        createdAt: { gte: since },
        // Skip empty content so we don't embed noise.
        content: { not: '' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        platform: true,
        channelId: true,
        content: true,
        sentiment: true,
        metadata: true,
        createdAt: true,
      },
    });

    const filtered = config.governanceOnly ? messages.filter((m) => isGovernance(m.metadata)) : messages;
    return filtered.map(normalizeCommunityMessage);
  },
};
