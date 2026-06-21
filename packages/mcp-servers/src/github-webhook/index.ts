import express from 'express';
import { addJob, resolveClientIdByPlatform, config, log } from '@attrakt/core';
import type { JobData } from '@attrakt/api';
import { verifyGithubSignature } from './verify';

/**
 * Extract the GitHub org/owner login from any webhook payload so it can be
 * mapped to the owning tenant via PlatformConfig (`config.org`).
 */
function extractOrg(payload: any): string | null {
  return (
    payload?.organization?.login ??
    payload?.repository?.owner?.login ??
    (typeof payload?.repository?.full_name === 'string'
      ? payload.repository.full_name.split('/')[0]
      : null)
  );
}

const app = express();
const PORT = config.githubWebhookPort;

// Parse JSON while retaining the raw body bytes for HMAC signature verification.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Webhook endpoint
app.post('/webhooks/github', async (req, res) => {
  const event = req.headers['x-github-event'] as string;
  const delivery = req.headers['x-github-delivery'] as string;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from('');

  // Reject anything that isn't signed with our shared secret.
  if (!config.githubWebhookSecret) {
    log.error({ delivery }, 'GITHUB_WEBHOOK_SECRET is not configured; rejecting webhook');
    return res.status(401).json({ error: 'Webhook secret not configured' });
  }

  if (!verifyGithubSignature(rawBody, signature, config.githubWebhookSecret)) {
    log.warn({ event, delivery }, 'Rejected GitHub webhook: missing or invalid signature');
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  const payload = req.body;

  try {
    // Map the repo's org to its owning tenant; drop events from unconfigured orgs
    // rather than attributing them to a default client.
    const org = extractOrg(payload);
    const clientId = org ? await resolveClientIdByPlatform('GITHUB', { org }) : null;
    if (!clientId) {
      log.warn({ event, delivery, org }, 'No client configured for GitHub org — ignoring webhook');
      return res.status(202).json({ received: true, ignored: 'unconfigured_org', org });
    }

    // Map GitHub events to our event types
    const eventMap: Record<string, string> = {
      push: 'push',
      pull_request: 'pull_request',
      issues: 'issues',
      issue_comment: 'issue_comment',
      star: 'star',
      fork: 'fork',
    };

    const mappedEvent = eventMap[event];
    if (!mappedEvent) {
      log.debug({ event, delivery }, 'Ignoring unsupported GitHub event');
      return res.status(200).send('Event ignored');
    }

    // Queue the event for processing
    await addJob('ingest:github', {
      event: mappedEvent as any,
      payload,
      clientId,
    } as JobData);

    log.info({ event: mappedEvent, delivery, clientId }, 'GitHub webhook received');
    return res.status(200).json({ received: true, delivery, event });
  } catch (error) {
    log.error({ error, event, delivery }, 'Error processing GitHub webhook');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  log.info({ port: PORT }, 'GitHub webhook receiver listening');
});

// Graceful shutdown
process.on('SIGINT', () => {
  process.exit(0);
});
