/**
 * Client (tenant) provisioning and lookup.
 *
 * Multi-tenancy is real: every worker, scheduler, and ingestion boundary scopes
 * by clientId. This module is the single place that
 *   - provisions a client and its PlatformConfig rows (`createClient`),
 *   - lists the tenants that background processing should iterate (`getActiveClients`),
 *   - maps a platform-native key (Discord guild, GitHub org, Discourse base URL)
 *     back to the owning client at the ingestion boundary
 *     (`resolveClientIdByPlatform`).
 *
 * Self-serve onboarding is out of scope for MVP; provisioning is CLI/white-glove.
 */

import type { Client, Platform, PlatformConfig } from '@prisma/client';
import { prisma } from '../prisma';
import { log } from '../logger';

export interface PlatformConfigInput {
  platform: Platform;
  /** Platform-specific configuration (e.g. { guildId }, { org }, { baseUrl }). */
  config: Record<string, unknown>;
  /** Encrypted-at-rest credentials. Empty for MVP CLI provisioning. */
  credentials?: Record<string, unknown>;
  enabled?: boolean;
}

export interface CreateClientInput {
  name: string;
  slug: string;
  platformConfigs?: PlatformConfigInput[];
}

export interface CreateClientResult {
  client: Client & { platformConfigs: PlatformConfig[] };
  /** False when a client with this slug already existed (upserted). */
  created: boolean;
}

/**
 * Provision a client and its platform configuration in one transaction.
 *
 * Idempotent on `slug`: re-running upserts the PlatformConfig rows (unique on
 * clientId+platform) rather than failing, so credentials can be added later via
 * the same command. Also seeds a default ScoringConfig so scoring works
 * immediately after onboarding.
 */
export async function createClient(input: CreateClientInput): Promise<CreateClientResult> {
  const existing = await prisma.client.findUnique({ where: { slug: input.slug } });

  const client = await prisma.$transaction(async (tx) => {
    const c = existing
      ? await tx.client.update({
          where: { id: existing.id },
          data: { name: input.name, active: true },
        })
      : await tx.client.create({
          data: { name: input.name, slug: input.slug, active: true },
        });

    for (const pc of input.platformConfigs ?? []) {
      await tx.platformConfig.upsert({
        where: { clientId_platform: { clientId: c.id, platform: pc.platform } },
        create: {
          clientId: c.id,
          platform: pc.platform,
          enabled: pc.enabled ?? true,
          config: (pc.config ?? {}) as object,
          credentials: (pc.credentials ?? {}) as object,
        },
        update: {
          enabled: pc.enabled ?? true,
          config: (pc.config ?? {}) as object,
          ...(pc.credentials ? { credentials: pc.credentials as object } : {}),
        },
      });
    }

    // Seed a default ScoringConfig (sensible weights live as column defaults).
    await tx.scoringConfig.upsert({
      where: { clientId: c.id },
      create: { clientId: c.id },
      update: {},
    });

    return tx.client.findUniqueOrThrow({
      where: { id: c.id },
      include: { platformConfigs: true },
    });
  });

  log.info(
    { clientId: client.id, slug: client.slug, platforms: client.platformConfigs.map((p) => p.platform) },
    existing ? 'Updated existing client' : 'Provisioned new client'
  );

  return { client, created: !existing };
}

/**
 * List the clients background processing should run for. Workers and schedulers
 * call this instead of assuming a single hardcoded tenant.
 */
export async function getActiveClients(): Promise<Client[]> {
  return prisma.client.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
}

/**
 * Resolve a client reference that may be either a slug or a cuid id.
 * Returns the client id, or null if no match.
 */
export async function resolveClientId(ref: string): Promise<string | null> {
  const bySlug = await prisma.client.findUnique({ where: { slug: ref } });
  if (bySlug) return bySlug.id;
  const byId = await prisma.client.findUnique({ where: { id: ref } });
  return byId?.id ?? null;
}

/**
 * Map a platform-native key back to the owning client at the ingestion boundary
 * (e.g. a Discord guildId, a GitHub org, a Discourse base URL). Matches every
 * `match` entry against the PlatformConfig `config` JSON of an enabled config
 * for that platform. Returns null when no tenant owns the key — callers should
 * drop the event rather than fall back to a default tenant, so one client's
 * activity is never attributed to another.
 *
 * N is the number of configured tenants for a platform (small for MVP), so a
 * findMany + in-memory match is sufficient; callers cache hot lookups.
 */
export async function resolveClientIdByPlatform(
  platform: Platform,
  match: Record<string, string>
): Promise<string | null> {
  const configs = await prisma.platformConfig.findMany({ where: { platform, enabled: true } });
  for (const pc of configs) {
    const cfg = (pc.config ?? {}) as Record<string, unknown>;
    const allMatch = Object.entries(match).every(([key, value]) => {
      const actual = cfg[key];
      return typeof actual === 'string' && actual.toLowerCase() === value.toLowerCase();
    });
    if (allMatch) return pc.clientId;
  }
  return null;
}
