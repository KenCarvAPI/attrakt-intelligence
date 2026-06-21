/**
 * Connector framework for the Context Engine (CE-0).
 *
 * Connectors are built in-house behind one interface. A connector authenticates
 * to a source, pulls records on a cadence, and normalizes each into a
 * NormalizedItem. Shared plumbing (the sync runner, dedupe, chunk+embed, sync-run
 * bookkeeping) lives in `../store` and `../sync`, so adding a source is
 * "implement Connector.fetch()" — not rebuilding ingestion.
 *
 * CE-0 ships the framework plus two zero-credential connectors that prove the
 * pattern over data we already have (manual uploads, community signals). SaaS
 * connectors (GitHub-product, Linear, Notion, GA4, ...) are CE-1+.
 */

import type { ContextDomain, ContextSource } from '@prisma/client';
import type { ContextItemKind } from '../domains';

/** A source record normalized by a connector, ready to upsert into the store. */
export interface NormalizedItem {
  domain: ContextDomain;
  kind: ContextItemKind;
  /** Id in the source system, for supersede/update. Optional for one-off items. */
  externalId?: string;
  title?: string;
  url?: string;
  /** Typed fields specific to the kind (kept small + structured). */
  structured?: Record<string, unknown>;
  /** Narrative text — chunked + embedded for retrieval. */
  text?: string;
  /** When it happened in the source. */
  occurredAt?: Date;
  /** Optional precomputed dedupe hash; the store derives one when omitted. */
  contentHash?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorContext {
  clientId: string;
  source: ContextSource;
  /** Resolved credential (looked up from the vault by source.credentialRef). */
  credential?: unknown;
  /** Only pull records changed since this cursor, when the source supports it. */
  since?: Date;
}

export interface Connector {
  /** Stable connector id, matches ContextSource.connector (e.g. "github_product"). */
  readonly id: string;
  readonly domain: ContextDomain;
  /** Pull + normalize records for one sync cycle. */
  fetch(ctx: ConnectorContext): Promise<NormalizedItem[]>;
}
