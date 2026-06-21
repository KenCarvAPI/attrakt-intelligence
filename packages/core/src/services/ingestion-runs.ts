/**
 * Ingestion run tracking.
 *
 * Every live poll cycle and backfill records an IngestionRun, giving the
 * dashboard status page a truthful "last successful run / items ingested /
 * error count per platform" and making backfills resumable via a cursor.
 */

import type { IngestionRun, Platform } from '@prisma/client';
import { prisma } from '../prisma';

export type IngestionMode = 'live' | 'backfill';

export async function startIngestionRun(
  clientId: string,
  platform: Platform,
  mode: IngestionMode,
  cursor?: unknown
): Promise<IngestionRun> {
  return prisma.ingestionRun.create({
    data: { clientId, platform, mode, status: 'running', cursor: (cursor ?? undefined) as object },
  });
}

export async function updateIngestionRun(
  runId: string,
  data: { itemsIngested?: number; errorCount?: number; cursor?: unknown }
): Promise<void> {
  await prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      itemsIngested: data.itemsIngested,
      errorCount: data.errorCount,
      cursor: data.cursor === undefined ? undefined : (data.cursor as object),
    },
  });
}

export async function finishIngestionRun(
  runId: string,
  result: { status: 'success' | 'failed'; itemsIngested?: number; errorCount?: number; cursor?: unknown; error?: string }
): Promise<void> {
  await prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      status: result.status,
      itemsIngested: result.itemsIngested,
      errorCount: result.errorCount,
      cursor: result.cursor === undefined ? undefined : (result.cursor as object),
      error: result.error,
      finishedAt: new Date(),
    },
  });
}

export interface PlatformIngestionStatus {
  platform: Platform;
  lastRun: IngestionRun | null;
  lastSuccess: IngestionRun | null;
}

/** Per-platform ingestion status for a client (latest run + latest success). */
export async function getIngestionStatus(clientId: string): Promise<PlatformIngestionStatus[]> {
  const platforms: Platform[] = ['DISCORD', 'GITHUB', 'DISCOURSE', 'TWITTER'];
  const out: PlatformIngestionStatus[] = [];
  for (const platform of platforms) {
    const [lastRun, lastSuccess] = await Promise.all([
      prisma.ingestionRun.findFirst({ where: { clientId, platform }, orderBy: { startedAt: 'desc' } }),
      prisma.ingestionRun.findFirst({
        where: { clientId, platform, status: 'success' },
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    out.push({ platform, lastRun, lastSuccess });
  }
  return out;
}
