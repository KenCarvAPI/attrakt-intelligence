/**
 * Sync runner: drives one connector sync cycle and records observability.
 *
 * Looks up the connector for a ContextSource, opens a ContextSyncRun, fetches +
 * upserts normalized items, then finalizes the run with counts (or the error).
 * The BullMQ `ingest:context` job (api package) calls this; it can also be run
 * directly from a script. Credential vault lookup is a hook (CE-1) — CE-0's two
 * connectors need no credentials.
 */

import type { ContextSource } from '@prisma/client';
import { prisma } from '../prisma';
import { log } from '../logger';
import { getConnector } from './connectors/registry';
import { ensureBuiltinConnectorsRegistered } from './connectors/builtin';
import { upsertContextItem } from './store';

export interface SyncResult {
  syncRunId: string;
  status: 'success' | 'failed';
  itemsIngested: number;
  itemsDeduped: number;
  error?: string;
}

/** Resolve a credential for a source from the vault. CE-0 stub: none needed. */
async function resolveCredential(source: ContextSource): Promise<unknown> {
  if (!source.credentialRef) return undefined;
  // CE-1: look up source.credentialRef in the secret vault.
  return undefined;
}

export async function runSync(sourceId: string, opts: { since?: Date } = {}): Promise<SyncResult> {
  const source = await prisma.contextSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`ContextSource not found: ${sourceId}`);

  ensureBuiltinConnectorsRegistered();
  const connector = getConnector(source.connector);
  if (!connector) throw new Error(`No connector registered for "${source.connector}"`);

  const run = await prisma.contextSyncRun.create({
    data: { sourceId, status: 'running' },
  });

  let itemsIngested = 0;
  let itemsDeduped = 0;
  try {
    const credential = await resolveCredential(source);
    const since = opts.since ?? source.lastSyncedAt ?? undefined;
    const items = await connector.fetch({ clientId: source.clientId, source, credential, since });

    for (const item of items) {
      const res = await upsertContextItem(source.clientId, item, source.id);
      if (res.deduped) itemsDeduped++;
      else itemsIngested++;
    }

    await prisma.$transaction([
      prisma.contextSyncRun.update({
        where: { id: run.id },
        data: { status: 'success', finishedAt: new Date(), itemsIngested, itemsDeduped },
      }),
      prisma.contextSource.update({
        where: { id: source.id },
        data: { status: 'connected', lastSyncedAt: new Date(), lastError: null },
      }),
    ]);

    log.info({ sourceId, connector: source.connector, itemsIngested, itemsDeduped }, 'Context sync succeeded');
    return { syncRunId: run.id, status: 'success', itemsIngested, itemsDeduped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.$transaction([
      prisma.contextSyncRun.update({
        where: { id: run.id },
        data: { status: 'failed', finishedAt: new Date(), itemsIngested, itemsDeduped, error: message },
      }),
      prisma.contextSource.update({
        where: { id: source.id },
        data: { status: 'error', lastError: message },
      }),
    ]);
    log.error({ err, sourceId, connector: source.connector }, 'Context sync failed');
    return { syncRunId: run.id, status: 'failed', itemsIngested, itemsDeduped, error: message };
  }
}
