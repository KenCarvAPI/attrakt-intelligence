/**
 * Discourse REST API client.
 *
 * Discourse base URL and credentials vary per client (a tenant points at their
 * own forum), so unlike the singleton Discord/GitHub/Twitter clients this is a
 * small factory: `createDiscourseClient({ baseUrl, apiKey, apiUsername })`.
 *
 * Auth follows the standard Discourse scheme: `Api-Key` + `Api-Username`
 * headers. Read endpoints (`/latest.json`, `/t/{id}.json`, `/categories.json`,
 * `/u/{name}.json`) are public on most forums, so the client also works without
 * credentials for dry-run verification against a public instance.
 *
 * Pagination and 429 rate-limit handling mirror the other platform clients
 * (retryWithBackoff with exponential backoff; Discourse returns a
 * `Retry-After`-style wait on 429 which we honour).
 */

import { PlatformClientError } from '../errors';
import { log } from '../logger';
import { retryWithBackoff } from '../utils/retry';

export interface DiscourseClientOptions {
  baseUrl: string;
  apiKey?: string;
  apiUsername?: string;
  /** Max attempts for transient failures (429/5xx). */
  maxAttempts?: number;
}

/** A topic as returned in `/latest.json`'s `topic_list.topics`. */
export interface DiscourseTopic {
  id: number;
  title: string;
  slug: string;
  posts_count: number;
  reply_count: number;
  created_at: string;
  last_posted_at: string | null;
  category_id: number | null;
  posters?: Array<{ user_id: number; description: string }>;
}

/** A post as returned in `/t/{id}.json`'s `post_stream.posts`. */
export interface DiscoursePost {
  id: number;
  topic_id: number;
  post_number: number;
  user_id: number;
  username: string;
  name?: string | null;
  display_username?: string | null;
  created_at: string;
  cooked: string; // rendered HTML
  raw?: string;
  reply_count: number;
  reply_to_post_number?: number | null;
  accepted_answer?: boolean; // present when "solved" plugin marks a solution
  category_id?: number | null;
}

export interface DiscourseCategory {
  id: number;
  name: string;
  slug: string;
}

/** A user profile, including any explicitly linked external accounts. */
export interface DiscourseUser {
  id: number;
  username: string;
  name: string | null;
  /** Filled by extractLinkedAccounts() from associated_accounts / user_fields / bio. */
  linkedAccounts: Array<{ platform: 'GITHUB' | 'DISCORD'; username: string }>;
}

export interface DiscourseClient {
  baseUrl: string;
  getLatestTopics(page?: number): Promise<DiscourseTopic[]>;
  getTopicWithPosts(topicId: number): Promise<{ topic: DiscourseTopic; posts: DiscoursePost[] }>;
  getCategories(): Promise<DiscourseCategory[]>;
  getUser(username: string): Promise<DiscourseUser | null>;
}

/** Strip HTML tags from Discourse's `cooked` field to get plain text content. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best-effort extraction of explicit GitHub/Discord links from a user profile.
 * Discourse exposes external identities in a few places depending on plugins:
 *   - `user.associated_accounts` (OAuth providers: github, discord),
 *   - `user.user_fields` (custom fields a forum may label "GitHub"/"Discord"),
 *   - free text in `user.bio_raw` / `user.website` (github.com/<u>, discord handle).
 * Anything found here is treated as a HIGH-confidence identity signal.
 */
export function extractLinkedAccounts(user: any): DiscourseUser['linkedAccounts'] {
  const found = new Map<string, { platform: 'GITHUB' | 'DISCORD'; username: string }>();
  const add = (platform: 'GITHUB' | 'DISCORD', username?: string | null) => {
    const u = (username ?? '').trim().replace(/^@/, '');
    if (u) found.set(`${platform}:${u.toLowerCase()}`, { platform, username: u });
  };

  for (const acc of user?.associated_accounts ?? []) {
    const name = (acc?.provider_name ?? acc?.name ?? '').toLowerCase();
    if (name.includes('github')) add('GITHUB', acc?.description ?? acc?.username);
    if (name.includes('discord')) add('DISCORD', acc?.description ?? acc?.username);
  }

  for (const [, value] of Object.entries(user?.user_fields ?? {})) {
    if (typeof value !== 'string') continue;
    const gh = value.match(/github\.com\/([A-Za-z0-9_-]+)/i);
    if (gh) add('GITHUB', gh[1]);
  }

  const bio: string = user?.bio_raw ?? '';
  const ghBio = bio.match(/github\.com\/([A-Za-z0-9_-]+)/i);
  if (ghBio) add('GITHUB', ghBio[1]);
  const website: string = user?.website ?? '';
  const ghSite = website.match(/github\.com\/([A-Za-z0-9_-]+)/i);
  if (ghSite) add('GITHUB', ghSite[1]);

  return [...found.values()];
}

export function createDiscourseClient(options: DiscourseClientOptions): DiscourseClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  if (!baseUrl) {
    throw new PlatformClientError('Discourse baseUrl is required', 'DISCOURSE', false);
  }
  const maxAttempts = options.maxAttempts ?? 4;

  async function request<T>(path: string): Promise<T> {
    return retryWithBackoff(
      async () => {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (options.apiKey && options.apiUsername) {
          headers['Api-Key'] = options.apiKey;
          headers['Api-Username'] = options.apiUsername;
        }

        const res = await fetch(`${baseUrl}${path}`, { headers });

        // Honour rate limits: Discourse returns 429 with a wait hint.
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('Retry-After') ?? '5');
          log.warn({ path, retryAfter }, 'Discourse rate limited (429); backing off');
          await new Promise((r) => setTimeout(r, (Number.isFinite(retryAfter) ? retryAfter : 5) * 1000));
          throw new PlatformClientError('Discourse rate limited', 'DISCOURSE', true);
        }

        if (!res.ok) {
          const retryable = res.status >= 500;
          throw new PlatformClientError(
            `Discourse request failed ${res.status} for ${path}`,
            'DISCOURSE',
            retryable
          );
        }

        return (await res.json()) as T;
      },
      { maxAttempts }
    );
  }

  return {
    baseUrl,

    async getLatestTopics(page = 0): Promise<DiscourseTopic[]> {
      const data = await request<{ topic_list?: { topics?: DiscourseTopic[] } }>(
        `/latest.json?page=${page}`
      );
      return data.topic_list?.topics ?? [];
    },

    async getTopicWithPosts(topicId: number) {
      const data = await request<any>(`/t/${topicId}.json`);
      const topic: DiscourseTopic = {
        id: data.id,
        title: data.title,
        slug: data.slug,
        posts_count: data.posts_count,
        reply_count: data.reply_count ?? 0,
        created_at: data.created_at,
        last_posted_at: data.last_posted_at ?? null,
        category_id: data.category_id ?? null,
      };
      const posts: DiscoursePost[] = (data.post_stream?.posts ?? []).map((p: any) => ({
        ...p,
        category_id: data.category_id ?? null,
      }));
      return { topic, posts };
    },

    async getCategories(): Promise<DiscourseCategory[]> {
      const data = await request<{ category_list?: { categories?: DiscourseCategory[] } }>(
        `/categories.json`
      );
      return data.category_list?.categories ?? [];
    },

    async getUser(username: string): Promise<DiscourseUser | null> {
      try {
        const data = await request<{ user?: any }>(`/u/${encodeURIComponent(username)}.json`);
        if (!data.user) return null;
        return {
          id: data.user.id,
          username: data.user.username,
          name: data.user.name ?? null,
          linkedAccounts: extractLinkedAccounts(data.user),
        };
      } catch (error) {
        log.warn({ error, username }, 'Failed to fetch Discourse user profile');
        return null;
      }
    },
  };
}
