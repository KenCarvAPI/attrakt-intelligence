import { addJob, getDiscourseClient, config, log } from '@attrakt/core';
import type { DiscourseUser } from '@attrakt/core/src/clients/discourse';
import type { JobData } from '@attrakt/api/src/queues/types';
import type {
  DiscourseAuthorContext,
  DiscourseTopicCreatedPayload,
  DiscoursePostCreatedPayload,
  DiscourseSolutionAcceptedPayload,
} from '@attrakt/core/src/types/platforms';

const client = getDiscourseClient();
const baseUrl = (config.discourseBaseUrl ?? '').replace(/\/$/, '');
const dryRun = config.discourseDryRun;

// Category slugs configured as governance categories.
const governanceCategories = new Set(
  config.discourseGovernanceCategories
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

// id -> slug, refreshed on each poll cycle.
let categorySlugById = new Map<number, string>();

// High-water mark: only items created after this are ingested. In dry-run we
// start at the epoch so a single poll surfaces everything currently visible.
let sinceMs = dryRun ? 0 : Date.now() - config.discoursePollIntervalMs;

/**
 * Emit an ingest job, or — in dry-run mode — log exactly what would be
 * persisted without touching Redis or the database.
 */
async function emit(
  event: 'topic_created' | 'post_created' | 'solution_accepted',
  payload: DiscourseTopicCreatedPayload | DiscoursePostCreatedPayload | DiscourseSolutionAcceptedPayload
) {
  if (dryRun) {
    log.info({ event, payload }, '[dry-run] would persist Discourse event');
    return;
  }
  await addJob('ingest:discourse', {
    event,
    payload,
    clientId: config.defaultClientId,
  } as JobData);
}

async function refreshCategories() {
  try {
    const categories = await client.getCategories();
    categorySlugById = new Map(categories.map((c) => [c.id, c.slug]));
  } catch (error) {
    log.warn({ error }, 'Failed to refresh Discourse categories');
  }
}

// Cache user profiles for the duration of a poll cycle to limit API calls.
const userCache = new Map<string, DiscourseUser | null>();

async function getUserCached(username: string): Promise<DiscourseUser | null> {
  if (userCache.has(username)) {
    return userCache.get(username) ?? null;
  }
  const user = await client.getUser(username).catch((error) => {
    log.debug({ username, error }, 'Failed to fetch Discourse user');
    return null;
  });
  userCache.set(username, user);
  return user;
}

async function buildAuthorContext(
  username: string,
  userId: number | null,
  categoryId: number | null
): Promise<DiscourseAuthorContext> {
  const user = await getUserCached(username);
  const categorySlug = categoryId != null ? categorySlugById.get(categoryId) ?? null : null;

  return {
    authorUserId: String(user?.id ?? userId ?? username),
    authorUsername: username,
    authorDisplayName: user?.name ?? undefined,
    linkedAccounts: user?.linkedAccounts,
    categoryId,
    categorySlug,
    governance: categorySlug != null && governanceCategories.has(categorySlug),
  };
}

function topicUrl(slug: string, topicId: number): string {
  return `${baseUrl}/t/${slug}/${topicId}`;
}

function postUrl(topicSlug: string | null, topicId: number, postNumber: number): string {
  return `${baseUrl}/t/${topicSlug ?? 'topic'}/${topicId}/${postNumber}`;
}

/**
 * Poll latest topics and posts and ingest anything created since the last run.
 */
async function poll() {
  try {
    await refreshCategories();
    userCache.clear();
    let maxSeen = sinceMs;
    const bump = (iso: string) => {
      const t = new Date(iso).getTime();
      if (t > maxSeen) maxSeen = t;
    };

    // --- New topics (and accepted solutions within them) ---
    const topics = await client.getLatestTopics(0);
    for (const topic of topics) {
      if (new Date(topic.createdAt).getTime() <= sinceMs) continue;

      const { topic: detail, posts } = await client.getTopic(topic.id);
      const op = posts.find((p) => p.postNumber === 1) ?? posts[0];
      if (!op) continue;

      const ctx = await buildAuthorContext(op.username, op.userId, detail.categoryId);
      bump(detail.createdAt);

      await emit('topic_created', {
        ...ctx,
        topicId: String(detail.id),
        title: detail.title,
        slug: detail.slug,
        content: op.content,
        url: topicUrl(detail.slug, detail.id),
        createdAt: detail.createdAt,
      } satisfies DiscourseTopicCreatedPayload);

      // Accepted solutions are a quality signal worth recording.
      for (const post of posts) {
        if (!post.acceptedAnswer) continue;
        if (new Date(post.createdAt).getTime() <= sinceMs) continue;
        const solverCtx = await buildAuthorContext(post.username, post.userId, detail.categoryId);
        bump(post.createdAt);
        await emit('solution_accepted', {
          ...solverCtx,
          postId: String(post.id),
          topicId: String(detail.id),
          topicSlug: detail.slug,
          postNumber: post.postNumber,
          url: postUrl(detail.slug, detail.id, post.postNumber),
          createdAt: post.createdAt,
        } satisfies DiscourseSolutionAcceptedPayload);
      }
    }

    // --- New replies across the forum (skip OPs, already handled above) ---
    const posts = await client.getLatestPosts();
    for (const post of posts) {
      if (post.postNumber === 1) continue;
      if (new Date(post.createdAt).getTime() <= sinceMs) continue;

      const ctx = await buildAuthorContext(post.username, post.userId, post.categoryId);
      bump(post.createdAt);

      await emit('post_created', {
        ...ctx,
        postId: String(post.id),
        topicId: String(post.topicId),
        topicSlug: post.topicSlug,
        postNumber: post.postNumber,
        content: post.content,
        url: postUrl(post.topicSlug, post.topicId, post.postNumber),
        createdAt: post.createdAt,
      } satisfies DiscoursePostCreatedPayload);
    }

    sinceMs = maxSeen;
    log.info({ topics: topics.length, posts: posts.length, dryRun }, 'Discourse poll complete');
  } catch (error) {
    log.error({ error }, 'Error in Discourse poll');
  }
}

log.info(
  {
    baseUrl,
    pollIntervalMinutes: config.discoursePollIntervalMs / 1000 / 60,
    governanceCategories: [...governanceCategories],
    dryRun,
  },
  'Starting Discourse polling service'
);

// Initial poll, then on the configured interval.
poll();
const interval = setInterval(poll, config.discoursePollIntervalMs);

process.on('SIGINT', () => {
  log.info({}, 'Shutting down Discourse polling service');
  clearInterval(interval);
  process.exit(0);
});
