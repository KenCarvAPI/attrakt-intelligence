import { config } from '../config';
import { PlatformClientError } from '../errors';
import { log } from '../logger';
import { retryWithBackoff } from '../utils/retry';

/**
 * Discourse REST API client.
 *
 * Uses standard Discourse API-key + username authentication via the
 * `Api-Key` / `Api-Username` headers. Read-only endpoints on public
 * instances also work anonymously (no key required), which is what the
 * dry-run verification relies on.
 *
 * Docs: https://docs.discourse.org/
 */

export interface DiscourseTopic {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
  replyCount: number;
  categoryId: number | null;
  createdAt: string;
  lastPostedAt: string | null;
  bumpedAt: string | null;
  // Discourse only exposes the OP author id on the topic list via posters,
  // so these are best-effort and filled from the topic detail when needed.
  authorUserId: number | null;
  authorUsername: string | null;
}

export interface DiscoursePost {
  id: number;
  topicId: number;
  topicSlug: string | null;
  postNumber: number;
  userId: number | null;
  username: string;
  name: string | null;
  content: string;
  categoryId: number | null;
  createdAt: string;
  acceptedAnswer: boolean;
}

export interface DiscourseCategory {
  id: number;
  name: string;
  slug: string;
}

export interface DiscourseLinkedAccount {
  platform: 'GITHUB' | 'DISCORD';
  username?: string;
  platformUserId?: string;
}

export interface DiscourseUser {
  id: number;
  username: string;
  name: string | null;
  email?: string | null;
  /** Explicit links to other platforms declared on the Discourse profile. */
  linkedAccounts: DiscourseLinkedAccount[];
}

const USER_AGENT = 'AttraktIntelligence/0.1 (+discourse-ingest)';

class DiscourseClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiUsername?: string;

  constructor(opts: { baseUrl: string; apiKey?: string; apiUsername?: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.apiUsername = opts.apiUsername;
  }

  /**
   * Perform a GET request against the Discourse JSON API.
   * Handles 429 rate limits (honouring Retry-After) and retries transient
   * network / 5xx failures with exponential backoff.
   */
  private async request<T>(path: string): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (this.apiKey && this.apiUsername) {
      headers['Api-Key'] = this.apiKey;
      headers['Api-Username'] = this.apiUsername;
    }

    return retryWithBackoff(
      async () => {
        const response = await fetch(url, { headers });

        // Rate limited: wait the server-advised duration then let retry kick in.
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('Retry-After')) || 0;
          let waitSeconds = retryAfter;
          if (!waitSeconds) {
            const body = (await response.json().catch(() => null)) as
              | { extras?: { wait_seconds?: number } }
              | null;
            waitSeconds = body?.extras?.wait_seconds ?? 5;
          }
          log.warn({ platform: 'DISCOURSE', url, waitSeconds }, 'Discourse rate limit hit');
          await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
          throw new PlatformClientError('Discourse rate limited', 'DISCOURSE', true);
        }

        if (!response.ok) {
          // 5xx is transient (retryable); 4xx is a hard error.
          const retryable = response.status >= 500;
          throw new PlatformClientError(
            `Discourse request failed (${response.status}) for ${path}`,
            'DISCOURSE',
            retryable
          );
        }

        return (await response.json()) as T;
      },
      { maxAttempts: 4, initialDelay: 2000 }
    );
  }

  /**
   * Fetch a page of latest topics (newest activity first).
   * @param page zero-based page index for pagination
   */
  async getLatestTopics(page = 0): Promise<DiscourseTopic[]> {
    const data = await this.request<{
      topic_list?: { topics?: RawTopic[] };
    }>(`/latest.json?page=${page}`);

    return (data.topic_list?.topics ?? []).map(mapTopic);
  }

  /**
   * Fetch a page of the latest posts across the forum.
   * @param before optional post id to paginate backwards from
   */
  async getLatestPosts(before?: number): Promise<DiscoursePost[]> {
    const query = before ? `?before=${before}` : '';
    const data = await this.request<{ latest_posts?: RawPost[] }>(`/posts.json${query}`);
    return (data.latest_posts ?? []).map((p) => mapPost(p, p.category_id ?? null));
  }

  /** Fetch a single topic with its post stream. */
  async getTopic(topicId: number): Promise<{ topic: DiscourseTopic; posts: DiscoursePost[] }> {
    const data = await this.request<RawTopicDetail>(`/t/${topicId}.json`);
    const categoryId = data.category_id ?? null;
    const posts = (data.post_stream?.posts ?? []).map((p) => mapPost(p, categoryId));
    const first = posts[0];
    return {
      topic: {
        id: data.id,
        title: data.title,
        slug: data.slug,
        postsCount: data.posts_count ?? posts.length,
        replyCount: data.reply_count ?? 0,
        categoryId,
        createdAt: data.created_at,
        lastPostedAt: data.last_posted_at ?? null,
        bumpedAt: data.bumped_at ?? null,
        authorUserId: first?.userId ?? null,
        authorUsername: first?.username ?? null,
      },
      posts,
    };
  }

  /** Fetch the category list (used to map category ids to slugs). */
  async getCategories(): Promise<DiscourseCategory[]> {
    const data = await this.request<{
      category_list?: { categories?: Array<{ id: number; name: string; slug: string }> };
    }>(`/categories.json`);
    return (data.category_list?.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    }));
  }

  /** Fetch a user profile, including any explicit cross-platform links. */
  async getUser(username: string): Promise<DiscourseUser | null> {
    try {
      const data = await this.request<{ user?: RawUser }>(
        `/users/${encodeURIComponent(username)}.json`
      );
      if (!data.user) return null;
      return mapUser(data.user);
    } catch (error) {
      if (error instanceof PlatformClientError && !error.retryable) {
        // e.g. 404 for a deleted/anonymous user — not fatal for ingestion.
        log.debug({ username, error: error.message }, 'Discourse user not found');
        return null;
      }
      throw error;
    }
  }
}

// --- Raw Discourse response shapes (partial) -------------------------------

interface RawPoster {
  user_id: number;
  description: string;
}

interface RawTopic {
  id: number;
  title: string;
  slug: string;
  posts_count?: number;
  reply_count?: number;
  category_id?: number | null;
  created_at: string;
  last_posted_at?: string | null;
  bumped_at?: string | null;
  posters?: RawPoster[];
}

interface RawPost {
  id: number;
  topic_id: number;
  topic_slug?: string | null;
  post_number: number;
  user_id?: number | null;
  username: string;
  name?: string | null;
  cooked?: string;
  raw?: string;
  category_id?: number | null;
  created_at: string;
  accepted_answer?: boolean;
}

interface RawTopicDetail {
  id: number;
  title: string;
  slug: string;
  posts_count?: number;
  reply_count?: number;
  category_id?: number | null;
  created_at: string;
  last_posted_at?: string | null;
  bumped_at?: string | null;
  post_stream?: { posts?: RawPost[] };
}

interface RawUser {
  id: number;
  username: string;
  name?: string | null;
  email?: string | null;
  website?: string | null;
  bio_raw?: string | null;
  user_fields?: Record<string, string | null> | null;
  associated_accounts?: Array<{ name?: string; description?: string }> | null;
}

// --- Mappers ----------------------------------------------------------------

function mapTopic(t: RawTopic): DiscourseTopic {
  // The original poster is the first entry in `posters` with the relevant flag;
  // fall back to the first poster id.
  const op = t.posters?.[0];
  return {
    id: t.id,
    title: t.title,
    slug: t.slug,
    postsCount: t.posts_count ?? 0,
    replyCount: t.reply_count ?? 0,
    categoryId: t.category_id ?? null,
    createdAt: t.created_at,
    lastPostedAt: t.last_posted_at ?? null,
    bumpedAt: t.bumped_at ?? null,
    authorUserId: op?.user_id ?? null,
    authorUsername: null,
  };
}

function mapPost(p: RawPost, categoryId: number | null): DiscoursePost {
  return {
    id: p.id,
    topicId: p.topic_id,
    topicSlug: p.topic_slug ?? null,
    postNumber: p.post_number,
    userId: p.user_id ?? null,
    username: p.username,
    name: p.name ?? null,
    content: p.raw ?? stripHtml(p.cooked ?? ''),
    categoryId: p.category_id ?? categoryId,
    createdAt: p.created_at,
    acceptedAnswer: Boolean(p.accepted_answer),
  };
}

function mapUser(u: RawUser): DiscourseUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name ?? null,
    email: u.email ?? null,
    linkedAccounts: extractLinkedAccounts(u),
  };
}

/**
 * Pull explicit GitHub / Discord links from a Discourse profile.
 * Sources, in order of reliability:
 *  1. `associated_accounts` (OAuth-connected accounts)
 *  2. custom `user_fields` values
 *  3. free-text `website` / `bio_raw`
 */
export function extractLinkedAccounts(u: RawUser): DiscourseLinkedAccount[] {
  const accounts: DiscourseLinkedAccount[] = [];
  const seen = new Set<string>();

  const add = (platform: 'GITHUB' | 'DISCORD', username?: string, platformUserId?: string) => {
    const handle = username?.trim().replace(/^@/, '');
    if (!handle && !platformUserId) return;
    const key = `${platform}:${(handle ?? platformUserId ?? '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    accounts.push({ platform, username: handle, platformUserId });
  };

  for (const acct of u.associated_accounts ?? []) {
    const name = acct.name?.toLowerCase();
    if (name === 'github') add('GITHUB', acct.description);
    else if (name === 'discord') add('DISCORD', acct.description);
  }

  const freeText = [
    u.website ?? '',
    u.bio_raw ?? '',
    ...Object.values(u.user_fields ?? {}).map((v) => v ?? ''),
  ].join('\n');

  const githubMatch = freeText.match(/github\.com\/([A-Za-z0-9-]+)/i);
  if (githubMatch) add('GITHUB', githubMatch[1]);

  const discordMatch = freeText.match(/discord(?:app)?\.com\/users\/(\d+)/i);
  if (discordMatch) add('DISCORD', undefined, discordMatch[1]);

  return accounts;
}

/** Minimal HTML-to-text for Discourse `cooked` post bodies. */
function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let discourseClient: DiscourseClient | null = null;

export function getDiscourseClient(): DiscourseClient {
  if (discourseClient) {
    return discourseClient;
  }

  if (!config.discourseBaseUrl) {
    throw new PlatformClientError('DISCOURSE_BASE_URL is required', 'DISCOURSE', false);
  }

  discourseClient = new DiscourseClient({
    baseUrl: config.discourseBaseUrl,
    apiKey: config.discourseApiKey,
    apiUsername: config.discourseApiUsername,
  });

  log.info({ platform: 'DISCOURSE', baseUrl: config.discourseBaseUrl }, 'Discourse client initialized');
  return discourseClient;
}

export type { DiscourseClient };
