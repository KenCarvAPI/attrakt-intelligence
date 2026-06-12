/**
 * Tenant service
 *
 * Multi-tenancy is keyed on `Client`. Every ingestion entry point and every
 * scheduler must resolve a concrete `clientId` here rather than assuming a
 * single hardcoded tenant. Platform-specific routing (which Discord guild /
 * GitHub org / Discourse instance belongs to which client) is stored in
 * `PlatformConfig.config`.
 */

import { prisma } from '../prisma';
import type { Client, PlatformConfig, Platform } from '@prisma/client';

/**
 * Normalize a platform handle/identifier for comparison
 * (case-insensitive, strips a leading "@").
 */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

/**
 * Return all clients that have at least one enabled platform configuration.
 * Optionally filter to clients with an enabled config for a specific platform.
 *
 * Schedulers and agents iterate this instead of assuming one tenant.
 */
export async function getActiveClients(platform?: Platform): Promise<Client[]> {
  return prisma.client.findMany({
    where: {
      platformConfigs: {
        some: {
          enabled: true,
          ...(platform ? { platform } : {}),
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Return enabled platform configs for a given platform across all clients.
 */
export async function getEnabledPlatformConfigs(platform: Platform): Promise<PlatformConfig[]> {
  return prisma.platformConfig.findMany({
    where: { platform, enabled: true },
  });
}

/**
 * Resolve the owning `clientId` for an inbound platform event.
 *
 * @param platform The source platform.
 * @param key The platform-specific routing key from the event:
 *   - DISCORD:   guild id           (matched against config.guildId)
 *   - GITHUB:    org / owner login  (matched against config.org)
 *   - TWITTER:   tracked account    (matched against config.trackedAccounts[])
 *   - DISCOURSE: instance base url  (matched against config.baseUrl)
 *
 * Returns the clientId, or `null` if no client is configured for this key.
 * A `null` result means the event must be dropped, not attributed to a
 * default tenant.
 */
export async function resolveClientIdForPlatform(platform: Platform, key: string): Promise<string | null> {
  if (!key) return null;
  const configs = await getEnabledPlatformConfigs(platform);
  const wanted = normalizeKey(key);

  for (const cfg of configs) {
    const c = (cfg.config ?? {}) as Record<string, unknown>;

    switch (platform) {
      case 'DISCORD':
        if (typeof c.guildId === 'string' && c.guildId === key) return cfg.clientId;
        break;
      case 'GITHUB':
        if (typeof c.org === 'string' && normalizeKey(c.org) === wanted) return cfg.clientId;
        break;
      case 'TWITTER': {
        const accounts = Array.isArray(c.trackedAccounts)
          ? (c.trackedAccounts as string[])
          : typeof c.handle === 'string'
            ? [c.handle]
            : [];
        if (accounts.some((a) => normalizeKey(a) === wanted)) return cfg.clientId;
        break;
      }
      case 'DISCOURSE':
        if (typeof c.baseUrl === 'string' && normalizeKey(c.baseUrl) === wanted) return cfg.clientId;
        break;
    }
  }

  return null;
}

/**
 * Twitter accounts to poll, grouped by owning client. The poller iterates this
 * so that each tweet is attributed to the correct tenant.
 */
export async function getTwitterTrackedAccountsByClient(): Promise<Array<{ clientId: string; accounts: string[] }>> {
  const configs = await getEnabledPlatformConfigs('TWITTER');
  return configs
    .map((cfg) => {
      const c = (cfg.config ?? {}) as Record<string, unknown>;
      const accounts = Array.isArray(c.trackedAccounts)
        ? (c.trackedAccounts as string[])
        : typeof c.handle === 'string'
          ? [c.handle]
          : [];
      return { clientId: cfg.clientId, accounts: accounts.map((a) => a.trim()).filter(Boolean) };
    })
    .filter((entry) => entry.accounts.length > 0);
}
