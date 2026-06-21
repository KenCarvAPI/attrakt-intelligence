/**
 * Context store: write path.
 *
 * Normalizes connector output into the structured, queryable store —
 * ContextItem (typed record) + ContextChunk (embedded retrieval units). Dedupes
 * per (client, contentHash) so re-syncs are idempotent. This is the single place
 * that turns "some text from a source" into something retrievable.
 */

import { createHash } from 'node:crypto';
import type { ContextDomain, ContextItem, KnowledgeDocument, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { log } from '../logger';
import { chunkText, estimateTokens } from './chunk';
import { getEmbeddingProvider } from './embeddings';
import { sourceTypeToDomain } from './domains';
import type { NormalizedItem } from './connectors/types';

/** Stable content hash for dedupe. Built from the fields that define identity. */
export function itemContentHash(parts: {
  kind: string;
  externalId?: string;
  title?: string;
  text?: string;
  structured?: Record<string, unknown>;
}): string {
  const basis = JSON.stringify({
    kind: parts.kind,
    externalId: parts.externalId ?? null,
    title: parts.title ?? null,
    text: parts.text ?? null,
    structured: parts.structured ?? null,
  });
  return createHash('sha256').update(basis).digest('hex');
}

export interface UpsertResult {
  item: ContextItem;
  deduped: boolean;
  chunksCreated: number;
}

/**
 * Upsert one normalized item and (re)build its chunks + embeddings. Idempotent:
 * an identical item (same contentHash) is skipped. Embedding failures degrade —
 * the item is still stored, just without chunks (logged), so a transient
 * embeddings outage never drops source data.
 */
export async function upsertContextItem(
  clientId: string,
  input: NormalizedItem,
  sourceId?: string
): Promise<UpsertResult> {
  const contentHash =
    input.contentHash ??
    itemContentHash({
      kind: input.kind,
      externalId: input.externalId,
      title: input.title,
      text: input.text,
      structured: input.structured,
    });

  const existing = await prisma.contextItem.findUnique({
    where: { clientId_contentHash: { clientId, contentHash } },
  });
  if (existing) {
    return { item: existing, deduped: true, chunksCreated: 0 };
  }

  const item = await prisma.contextItem.create({
    data: {
      clientId,
      sourceId: sourceId ?? null,
      domain: input.domain,
      kind: input.kind,
      externalId: input.externalId ?? null,
      title: input.title ?? null,
      url: input.url ?? null,
      structured: (input.structured ?? {}) as Prisma.InputJsonValue,
      text: input.text ?? null,
      occurredAt: input.occurredAt ?? null,
      contentHash,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  const chunksCreated = await embedAndStoreChunks(clientId, item.id, input.text ?? '');
  return { item, deduped: false, chunksCreated };
}

/** Chunk + embed text and persist ContextChunk rows. Returns count created. */
async function embedAndStoreChunks(
  clientId: string,
  itemId: string,
  text: string
): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  let embeddings: number[][] = [];
  try {
    embeddings = await getEmbeddingProvider().embed(chunks);
  } catch (err) {
    log.error({ err, clientId, itemId }, 'Context Engine: embedding failed; storing item without chunks');
    return 0;
  }

  await prisma.contextChunk.createMany({
    data: chunks.map((text, i) => ({
      clientId,
      itemId,
      ordinal: i,
      text,
      embedding: embeddings[i] ?? [],
      tokenCount: estimateTokens(text),
    })),
  });
  return chunks.length;
}

/**
 * Project a manual KnowledgeDocument into the context store as a `document`
 * item, so manual uploads flow through the same retrieval path as connectors.
 * Idempotent via content hash.
 */
export async function projectKnowledgeDocument(doc: KnowledgeDocument): Promise<UpsertResult> {
  const domain: ContextDomain = sourceTypeToDomain(doc.sourceType);
  return upsertContextItem(doc.clientId, {
    domain,
    kind: 'document',
    externalId: `knowledge:${doc.id}`,
    title: doc.title,
    text: doc.rawText,
    occurredAt: doc.uploadedAt,
    structured: { sourceType: doc.sourceType },
    metadata: { knowledgeDocumentId: doc.id },
  });
}

/**
 * Backfill: project every existing KnowledgeDocument for a client (or all
 * clients) into the context store. Safe to re-run.
 */
export async function backfillKnowledgeDocuments(
  clientId?: string
): Promise<{ processed: number; created: number; deduped: number }> {
  const docs = await prisma.knowledgeDocument.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { uploadedAt: 'asc' },
  });
  let created = 0;
  let deduped = 0;
  for (const doc of docs) {
    const res = await projectKnowledgeDocument(doc);
    if (res.deduped) deduped++;
    else created++;
  }
  log.info({ clientId: clientId ?? 'ALL', processed: docs.length, created, deduped }, 'Context backfill complete');
  return { processed: docs.length, created, deduped };
}
