/**
 * Campaign brief API.
 *
 * POST /api/campaign-brief — generate a structured campaign brief for a client
 * from a free-text objective, grounded in the active ContextProfile and the
 * client's community advocacy/channel signals.
 */

import { Router } from 'express';
import { z } from 'zod';
import { resolveClientId, log } from '@attrakt/core';
import { generateCampaignBrief } from '@attrakt/agents/src/campaign-agent/index';

export const campaignRouter = Router();

const Schema = z.object({
  client: z.string().min(1), // slug or id
  objective: z.string().min(3),
});

campaignRouter.post('/campaign-brief', async (req, res) => {
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const clientId = await resolveClientId(parsed.data.client);
  if (!clientId) {
    return res.status(404).json({ error: `No client found for "${parsed.data.client}"` });
  }

  try {
    const { brief, usedLLM, hasContext } = await generateCampaignBrief(
      clientId,
      parsed.data.objective
    );
    return res.status(201).json({
      id: brief.id,
      clientId: brief.clientId,
      objective: brief.objective,
      generatedWith: usedLLM ? 'claude' : 'deterministic-fallback',
      runningWithoutContext: !hasContext,
      content: brief.content,
      createdAt: brief.createdAt,
    });
  } catch (error) {
    log.error({ error, client: parsed.data.client }, 'Campaign brief generation failed');
    return res.status(500).json({ error: 'Generation failed' });
  }
});
