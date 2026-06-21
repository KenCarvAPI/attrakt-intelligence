/**
 * Context retrieval: read path.
 *
 * `queryContext()` is how every grounding consumer (pulse, advocate briefs,
 * campaign briefs) pulls ONLY what's relevant to the task at hand — instead of
 * injecting the whole profile/knowledge base wholesale. It embeds the caller's
 * intent, ranks candidate chunks by cosine similarity (filtered by domain/recency),
 * and returns a token-bounded grounding block.
 *
 * Pairs with the stable ContextProfile overview (formatContextForPrompt): the
 * profile is the always-injected "who they are" summary; retrieval adds the
 * fast-moving specifics (recent releases, live campaigns, performance).
 */

import type { ContextDomain } from '@prisma/client';
import { prisma } from '../prisma';
import { getEmbeddingProvider } from './embeddings';
import { rankByCosine } from './similarity';
import { estimateTokens } from './chunk';

export interface QueryContextOptions {
  clientId: string;
  /** The task/intent to ground, e.g. a campaign objective. */
  intent: string;
  /** Restrict to these domains (default: all). */
  domains?: ContextDomain[];
  /** Restrict to these item kinds (default: all). */
  kinds?: string[];
  /** Only consider items that occurred within this many days (default: no limit). */
  sinceDays?: number;
  /** Max snippets to return (default 6). */
  k?: number;
  /** Token budget for the assembled grounding block (default 1500). */
  tokenBudget?: number;
  /** Cap on candidate items scanned, newest first (default 300). */
  maxCandidateItems?: number;
}

export interface ContextSnippet {
  text: string;
  score: number;
  domain: ContextDomain;
  kind: string;
  title: string | null;
  url: string | null;
  occurredAt: Date | null;
  itemId: string;
}

export interface ContextQueryResult {
  snippets: ContextSnippet[];
  /** Token-bounded text ready to inject into a prompt; '' when nothing relevant. */
  groundingBlock: string;
  /** True when the embedding provider returned nothing usable (degraded mode). */
  degraded: boolean;
}

/**
 * Retrieve the most relevant context chunks for an intent.
 *
 * MVP ranks in-memory over the chunks of the most-recent matching items (cap via
 * maxCandidateItems). pgvector is the upgrade path (push ranking into SQL); the
 * signature/return shape stay identical so callers never change.
 */
export async function queryContext(options: QueryContextOptions): Promise<ContextQueryResult> {
  const {
    clientId,
    intent,
    domains,
    kinds,
    sinceDays,
    k = 6,
    tokenBudget = 1500,
    maxCandidateItems = 300,
  } = options;

  const occurredAtFilter =
    sinceDays != null ? { gte: new Date(Date.now() - sinceDays * 86_400_000) } : undefined;

  // Bound the candidate set to the newest matching items.
  const items = await prisma.contextItem.findMany({
    where: {
      clientId,
      ...(domains?.length ? { domain: { in: domains } } : {}),
      ...(kinds?.length ? { kind: { in: kinds } } : {}),
      ...(occurredAtFilter ? { occurredAt: occurredAtFilter } : {}),
    },
    orderBy: [{ occurredAt: 'desc' }, { ingestedAt: 'desc' }],
    take: maxCandidateItems,
    select: { id: true, domain: true, kind: true, title: true, url: true, occurredAt: true },
  });
  if (items.length === 0) {
    return { snippets: [], groundingBlock: '', degraded: false };
  }

  const itemById = new Map(items.map((it) => [it.id, it]));
  const chunks = await prisma.contextChunk.findMany({
    where: { clientId, itemId: { in: items.map((it) => it.id) } },
    select: { itemId: true, text: true, embedding: true },
  });

  // Embed the intent. If embeddings are unavailable, degrade to recency-ordered
  // snippets so callers still get *something* grounded rather than nothing.
  let queryVec: number[] | null = null;
  try {
    [queryVec] = await getEmbeddingProvider().embed([intent]);
  } catch {
    queryVec = null;
  }

  let snippets: ContextSnippet[];
  let degraded = false;
  const candidates = chunks.filter((c) => c.embedding && c.embedding.length > 0);

  if (queryVec && candidates.length > 0) {
    const ranked = rankByCosine(
      queryVec,
      candidates.map((c) => ({ value: c, embedding: c.embedding })),
      k
    );
    snippets = ranked.map((r) => toSnippet(r.item.itemId, r.item.text, r.score, itemById));
  } else {
    // Degraded: take the first chunk of the most-recent items.
    degraded = true;
    const seen = new Set<string>();
    snippets = [];
    for (const c of chunks) {
      if (seen.has(c.itemId)) continue;
      seen.add(c.itemId);
      snippets.push(toSnippet(c.itemId, c.text, 0, itemById));
      if (snippets.length >= k) break;
    }
  }

  return { snippets, groundingBlock: buildGroundingBlock(snippets, tokenBudget), degraded };
}

function toSnippet(
  itemId: string,
  text: string,
  score: number,
  itemById: Map<string, { domain: ContextDomain; kind: string; title: string | null; url: string | null; occurredAt: Date | null }>
): ContextSnippet {
  const it = itemById.get(itemId);
  return {
    itemId,
    text,
    score,
    domain: it?.domain ?? 'STRATEGY',
    kind: it?.kind ?? 'document',
    title: it?.title ?? null,
    url: it?.url ?? null,
    occurredAt: it?.occurredAt ?? null,
  };
}

/** Assemble snippets into a labeled, token-bounded grounding block. */
export function buildGroundingBlock(snippets: ContextSnippet[], tokenBudget: number): string {
  if (snippets.length === 0) return '';
  const lines: string[] = ['## RELEVANT CONTEXT (retrieved)'];
  let used = estimateTokens(lines[0]);
  for (const s of snippets) {
    const when = s.occurredAt ? ` · ${s.occurredAt.toISOString().slice(0, 10)}` : '';
    const label = `[${s.domain}/${s.kind}${s.title ? ` · ${s.title}` : ''}${when}]`;
    const entry = `${label}\n${s.text.trim()}`;
    const cost = estimateTokens(entry);
    if (used + cost > tokenBudget) break;
    lines.push('', entry);
    used += cost;
  }
  return lines.length > 1 ? lines.join('\n') : '';
}
