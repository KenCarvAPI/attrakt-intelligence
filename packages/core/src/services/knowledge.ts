/**
 * Internal knowledge layer intake.
 *
 * Handles ingestion of client knowledge documents (product docs, brand
 * guidelines, marketing material, leadership interviews, strategy docs, etc.)
 * with basic hygiene: character counts, content-hash dedupe per client, and a
 * sensible cap on stored text.
 *
 * MVP intake is upload + paste only. No synthesis here — that is a later step.
 */

import { createHash } from 'node:crypto';
import type { KnowledgeDocument, KnowledgeSourceType } from '@prisma/client';
import { prisma } from '../prisma';
import { log } from '../logger';

/**
 * Maximum number of characters we persist in `rawText`. Documents larger than
 * this are truncated (with a note) so a single oversized upload cannot blow up
 * the row size. The original length is preserved in `metadata.originalCharCount`.
 */
export const MAX_RAWTEXT_CHARS = 1_000_000;

const TRUNCATION_NOTE = '\n\n[Attrakt knowledge intake: content truncated — original was longer than the stored cap.]';

/** Valid source types, mirrors the Prisma `KnowledgeSourceType` enum. */
export const KNOWLEDGE_SOURCE_TYPES = [
  'product_docs',
  'brand_guidelines',
  'marketing_material',
  'leadership_interview',
  'strategy_doc',
  'website',
  'other',
] as const;

export function isKnowledgeSourceType(value: string): value is KnowledgeSourceType {
  return (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(value);
}

/** Stable content hash used for per-client dedupe. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

export interface IngestKnowledgeInput {
  clientId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  rawText: string;
  metadata?: Record<string, unknown>;
}

export interface IngestKnowledgeResult {
  document: KnowledgeDocument;
  /** True when an identical document already existed for this client. */
  deduped: boolean;
  /** True when stored text was capped below the original length. */
  truncated: boolean;
}

/**
 * Ingest a single knowledge document. Computes the content hash from the
 * original (pre-truncation) text so dedupe is stable, truncates oversized
 * text, records character counts, and skips inserts for duplicate content.
 */
export async function ingestKnowledgeDocument(
  input: IngestKnowledgeInput
): Promise<IngestKnowledgeResult> {
  const original = input.rawText ?? '';
  const originalCharCount = original.length;
  const contentHash = hashContent(original);

  // Dedupe on content hash per client.
  const existing = await prisma.knowledgeDocument.findUnique({
    where: { clientId_contentHash: { clientId: input.clientId, contentHash } },
  });
  if (existing) {
    log.info(
      { clientId: input.clientId, documentId: existing.id, contentHash },
      'Knowledge document already ingested (deduped)'
    );
    return { document: existing, deduped: true, truncated: existing.truncated };
  }

  let rawText = original;
  let truncated = false;
  if (originalCharCount > MAX_RAWTEXT_CHARS) {
    rawText = original.slice(0, MAX_RAWTEXT_CHARS) + TRUNCATION_NOTE;
    truncated = true;
    log.warn(
      { clientId: input.clientId, originalCharCount, cap: MAX_RAWTEXT_CHARS },
      'Knowledge document truncated to cap'
    );
  }

  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    originalCharCount,
  };
  if (truncated) {
    metadata.truncatedAtChars = MAX_RAWTEXT_CHARS;
  }

  const document = await prisma.knowledgeDocument.create({
    data: {
      clientId: input.clientId,
      title: input.title,
      sourceType: input.sourceType,
      rawText,
      charCount: rawText.length,
      contentHash,
      truncated,
      metadata: metadata as object,
    },
  });

  log.info(
    {
      clientId: input.clientId,
      documentId: document.id,
      sourceType: document.sourceType,
      charCount: document.charCount,
      truncated,
    },
    'Knowledge document ingested'
  );

  return { document, deduped: false, truncated };
}

// `resolveClientId` now lives in ./clients (client provisioning + lookup).
