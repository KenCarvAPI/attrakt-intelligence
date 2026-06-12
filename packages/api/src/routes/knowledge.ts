/**
 * Knowledge intake API.
 *
 * MVP paste path: accept raw text (already extracted client-side or pasted by a
 * human) with the same fields as the CLI. No file upload/connectors yet.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  ingestKnowledgeDocument,
  resolveClientId,
  KNOWLEDGE_SOURCE_TYPES,
  log,
} from '@attrakt/core';

export const knowledgeRouter = Router();

const PasteSchema = z.object({
  // Either a client slug or id.
  client: z.string().min(1),
  title: z.string().min(1),
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
  rawText: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

knowledgeRouter.post('/knowledge', async (req, res) => {
  const parsed = PasteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { client, title, sourceType, rawText, metadata } = parsed.data;

  const clientId = await resolveClientId(client);
  if (!clientId) {
    return res.status(404).json({ error: `No client found for "${client}"` });
  }

  try {
    const result = await ingestKnowledgeDocument({
      clientId,
      title,
      sourceType,
      rawText,
      metadata: { ...(metadata ?? {}), source: 'paste' },
    });

    return res.status(result.deduped ? 200 : 201).json({
      deduped: result.deduped,
      truncated: result.truncated,
      document: {
        id: result.document.id,
        clientId: result.document.clientId,
        title: result.document.title,
        sourceType: result.document.sourceType,
        charCount: result.document.charCount,
        contentHash: result.document.contentHash,
        truncated: result.document.truncated,
        uploadedAt: result.document.uploadedAt,
      },
    });
  } catch (error) {
    log.error({ error, client, title }, 'Knowledge paste ingest failed');
    return res.status(500).json({ error: 'Ingest failed' });
  }
});
