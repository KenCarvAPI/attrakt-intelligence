import express from 'express';
import { addJob, resolveClientIdForPlatform, config, log } from '@attrakt/core';
import type { JobData } from '@attrakt/api/src/queues/types';

const app = express();
const PORT = config.githubWebhookPort;

// Middleware to parse JSON
app.use(express.json());

// Webhook endpoint
app.post('/webhooks/github', async (req, res) => {
  const event = req.headers['x-github-event'] as string;
  const delivery = req.headers['x-github-delivery'] as string;
  const payload = req.body;

  try {
    // Route to the owning client via the repo owner / organization login.
    const org = payload?.organization?.login || payload?.repository?.owner?.login || '';
    const clientId = await resolveClientIdForPlatform('GITHUB', org);
    if (!clientId) {
      log.debug({ org, delivery }, 'No client configured for GitHub org; ignoring event');
      return res.status(202).json({ received: true, ignored: 'unconfigured_org' });
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
