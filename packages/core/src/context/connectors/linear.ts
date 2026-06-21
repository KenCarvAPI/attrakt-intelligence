/**
 * Linear connector (CE-1).
 *
 * Pulls PRODUCT-domain context from Linear — issues (with their project + state)
 * — so outputs can reference roadmap/in-flight product work. Linear is a primary
 * source for "product updates across the org".
 *
 * Config (ContextSource.config): { teamId?: string } to scope to one team.
 * Auth: ctx.credential (vault) or LINEAR_API_KEY. Normalizer is pure + tested;
 * `fetch` issues a GraphQL query (exercised live where egress + key exist).
 */

import type { ContextDomain } from '@prisma/client';
import { log } from '../../logger';
import type { Connector, ConnectorContext, NormalizedItem } from './types';

const DOMAIN: ContextDomain = 'PRODUCT';
const PAGE_SIZE = 100;
const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

export interface LinearIssuePayload {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  updatedAt: string;
  state?: { name?: string | null } | null;
  project?: { name?: string | null } | null;
  labels?: { nodes?: { name: string }[] } | null;
}

/** Map a Linear issue to an `issue` context item. */
export function normalizeLinearIssue(issue: LinearIssuePayload): NormalizedItem {
  return {
    domain: DOMAIN,
    kind: 'issue',
    externalId: `linear:${issue.id}`,
    title: `${issue.identifier} ${issue.title}`,
    url: issue.url,
    text: [issue.title, issue.description ?? ''].filter(Boolean).join('\n\n'),
    occurredAt: issue.updatedAt ? new Date(issue.updatedAt) : undefined,
    structured: {
      identifier: issue.identifier,
      state: issue.state?.name ?? null,
      project: issue.project?.name ?? null,
      labels: issue.labels?.nodes?.map((l) => l.name) ?? [],
    },
  };
}

const ISSUES_QUERY = `
  query Issues($after: String, $filter: IssueFilter) {
    issues(first: ${PAGE_SIZE}, after: $after, filter: $filter, orderBy: updatedAt) {
      nodes { id identifier title description url updatedAt
        state { name } project { name } labels { nodes { name } } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

function resolveApiKey(ctx: ConnectorContext): string | undefined {
  if (typeof ctx.credential === 'string' && ctx.credential) return ctx.credential;
  return process.env.LINEAR_API_KEY || undefined;
}

export const linearConnector: Connector = {
  id: 'linear',
  domain: DOMAIN,
  async fetch(ctx: ConnectorContext): Promise<NormalizedItem[]> {
    const apiKey = resolveApiKey(ctx);
    if (!apiKey) {
      log.warn({ sourceId: ctx.source.id }, 'linear: no API key; skipping');
      return [];
    }

    const teamId = (ctx.source.config as { teamId?: string })?.teamId;
    const filter: Record<string, unknown> = {};
    if (teamId) filter.team = { id: { eq: teamId } };
    if (ctx.since) filter.updatedAt = { gt: ctx.since.toISOString() };

    const items: NormalizedItem[] = [];
    let after: string | null = null;

    // Bound the walk so a first sync of a huge workspace can't run unbounded.
    for (let page = 0; page < 20; page++) {
      const res = await fetch(LINEAR_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query: ISSUES_QUERY, variables: { after, filter } }),
      });
      if (!res.ok) {
        throw new Error(`Linear API error: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as {
        data?: { issues?: { nodes: LinearIssuePayload[]; pageInfo: { hasNextPage: boolean; endCursor: string } } };
        errors?: unknown;
      };
      if (json.errors) throw new Error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);

      const conn = json.data?.issues;
      if (!conn) break;
      for (const node of conn.nodes) items.push(normalizeLinearIssue(node));
      if (!conn.pageInfo.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
    return items;
  },
};
