/**
 * Community Pulse Agent.
 *
 * Generates a WEEKLY ecosystem health report per client, grounded in the
 * client's active ContextProfile (see ./weekly.ts for the report logic). This
 * supersedes the previous daily digest: the weekly report is the inbox-worthy
 * artefact, with metric movements, notable advocates, governance highlights,
 * risks, and strategy-grounded recommended actions.
 */

import cron from 'node-cron';
import { log, getActiveClients } from '@attrakt/core';
import { generateWeeklyDigest } from './weekly';

export * from './weekly';

/** Manual/queue entry point: generate the weekly digest for one client. */
export async function processPulseJob(clientId: string, date?: string): Promise<void> {
  const referenceDate = date ? new Date(date) : new Date();
  await generateWeeklyDigest(clientId, { referenceDate });
}

// Run only when started as a long-lived process (not when imported by the
// worker or a CLI). Weekly on Monday 09:00 UTC, reporting the week just closed.
if (require.main === module) {
  log.info({}, 'Community Pulse Agent starting (weekly schedule)');

  cron.schedule('0 9 * * 1', async () => {
    const clients = await getActiveClients();
    log.info({ clientCount: clients.length }, 'Generating weekly digests for active clients');
    for (const client of clients) {
      await generateWeeklyDigest(client.id).catch((error) => {
        log.error({ error, clientId: client.id }, 'Failed to generate weekly digest');
      });
    }
  });

  log.info({ schedule: 'weekly on Monday 09:00 UTC' }, 'Community Pulse Agent scheduled');
  process.on('SIGINT', () => {
    log.info({}, 'Shutting down Community Pulse Agent');
    process.exit(0);
  });
}
