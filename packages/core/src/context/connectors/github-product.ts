/**
 * GitHub product connector (CE-1).
 *
 * Extracts PRODUCT-domain context — releases (changelog) and merged pull
 * requests (completed work) — for a set of repos. This is distinct from the
 * community GitHub ingestion (which tracks contributor *activity*): here we
 * capture *what the product did* so campaign/advocate outputs can reference real,
 * recent shipping.
 *
 * Config (ContextSource.config): { repos: string[] } where each repo is
 * "owner/name". Auth uses the shared GitHub client (GITHUB_TOKEN / App).
 *
 * Normalizers are pure and exported for unit testing; `fetch` wires them to the
 * GitHub API and is exercised live in deployments with egress + credentials.
 */

import type { ContextDomain } from '@prisma/client';
import { getGitHubClient } from '../../clients/github';
import { log } from '../../logger';
import type { Connector, ConnectorContext, NormalizedItem } from './types';

const DOMAIN: ContextDomain = 'PRODUCT';
const PER_REPO_LIMIT = 50;

export interface GitHubReleasePayload {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  author?: { login?: string } | null;
}

export interface GitHubPullPayload {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  user?: { login?: string } | null;
  labels?: ({ name?: string } | string)[];
}

function labelNames(labels: GitHubPullPayload['labels']): string[] {
  return (labels ?? [])
    .map((l) => (typeof l === 'string' ? l : l?.name))
    .filter((n): n is string => Boolean(n));
}

/** Map a GitHub release to a `release` context item. */
export function normalizeGitHubRelease(repo: string, r: GitHubReleasePayload): NormalizedItem {
  const title = r.name?.trim() || r.tag_name;
  return {
    domain: DOMAIN,
    kind: 'release',
    externalId: `gh:release:${repo}:${r.id}`,
    title: `${repo} ${title}`,
    url: r.html_url,
    text: [title, r.body ?? ''].filter(Boolean).join('\n\n'),
    occurredAt: r.published_at ? new Date(r.published_at) : undefined,
    structured: { repo, tag: r.tag_name, author: r.author?.login ?? null },
  };
}

/** Map a merged GitHub PR to an `issue` (completed work item) context item. */
export function normalizeGitHubPull(repo: string, pr: GitHubPullPayload): NormalizedItem {
  return {
    domain: DOMAIN,
    kind: 'issue',
    externalId: `gh:pr:${repo}:${pr.number}`,
    title: `${repo}#${pr.number} ${pr.title}`,
    url: pr.html_url,
    text: [pr.title, pr.body ?? ''].filter(Boolean).join('\n\n'),
    occurredAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
    structured: {
      repo,
      number: pr.number,
      author: pr.user?.login ?? null,
      labels: labelNames(pr.labels),
      type: 'pull_request',
    },
  };
}

function parseRepos(config: unknown): string[] {
  const repos = (config as { repos?: unknown })?.repos;
  if (!Array.isArray(repos)) return [];
  return repos.filter((r): r is string => typeof r === 'string' && r.includes('/'));
}

export const githubProductConnector: Connector = {
  id: 'github_product',
  domain: DOMAIN,
  async fetch(ctx: ConnectorContext): Promise<NormalizedItem[]> {
    const repos = parseRepos(ctx.source.config);
    if (repos.length === 0) {
      log.warn({ sourceId: ctx.source.id }, 'github_product: no repos configured');
      return [];
    }

    const gh = getGitHubClient();
    const since = ctx.since?.getTime() ?? 0;
    const items: NormalizedItem[] = [];

    for (const repo of repos) {
      const [owner, name] = repo.split('/');
      try {
        const releases = await gh.rest.repos.listReleases({ owner, repo: name, per_page: PER_REPO_LIMIT });
        for (const r of releases.data as unknown as GitHubReleasePayload[]) {
          const at = r.published_at ? new Date(r.published_at).getTime() : 0;
          if (at >= since) items.push(normalizeGitHubRelease(repo, r));
        }

        const pulls = await gh.rest.pulls.list({
          owner,
          repo: name,
          state: 'closed',
          sort: 'updated',
          direction: 'desc',
          per_page: PER_REPO_LIMIT,
        });
        for (const pr of pulls.data as unknown as GitHubPullPayload[]) {
          if (!pr.merged_at) continue;
          if (new Date(pr.merged_at).getTime() >= since) items.push(normalizeGitHubPull(repo, pr));
        }
      } catch (err) {
        log.error({ err, repo, sourceId: ctx.source.id }, 'github_product: repo fetch failed');
      }
    }
    return items;
  },
};
