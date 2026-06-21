/**
 * Discourse polling service.
 *
 * Mirrors twitter-polling: on an interval it fetches new topics/posts from each
 * active client's Discourse forum and enqueues `ingest:discourse` jobs (the
 * worker dedupes on the native post id, so re-polling is safe).
 *
 * Also supports a DRY-RUN mode for verification against a public instance, which
 * fetches and logs exactly what WOULD be persisted without touching the database
 * or the queue:
 *
 *   pnpm discourse-polling --dry-run --base-url https://meta.discourse.org --limit 3
 */

import { parseArgs } from 'node:util';
import {
  addJob,
  createDiscourseClient,
  stripHtml,
  prisma,
  config,
  log,
  type DiscourseClient,
  type DiscourseTopic,
} from '@attrakt/core';
import type { JobData } from '@attrakt/api/src/queues/types';
import type { DiscoursePostPayload } from '@attrakt/core/src/types/platforms';

function governanceSlugs(): Set<string> {
  return new Set(
    config.discourseGovernanceCategories
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Turn a topic's posts into ingestion payloads, resolving category slug,
 * governance flag, and the author's explicitly-linked external accounts (a
 * high-confidence identity signal). User profiles are cached per run.
 */
async function buildTopicPayloads(
  dc: DiscourseClient,
  topic: DiscourseTopic,
  categoryById: Map<number, string>,
  govSlugs: Set<string>,
  userCache: Map<string, DiscoursePostPayload['linkedAccounts']>
): Promise<DiscoursePostPayload[]> {
  const { posts } = await dc.getTopicWithPosts(topic.id);
  const categorySlug = topic.category_id != null ? categoryById.get(topic.category_id) ?? null : null;
  const isGovernance = categorySlug ? govSlugs.has(categorySlug.toLowerCase()) : false;

  const payloads: DiscoursePostPayload[] = [];
  for (const post of posts) {
    // Resolve linked accounts from the author profile (cached, best-effort).
    let linkedAccounts = userCache.get(post.username);
    if (linkedAccounts === undefined) {
      const profile = await dc.getUser(post.username);
      linkedAccounts = profile?.linkedAccounts ?? [];
      userCache.set(post.username, linkedAccounts);
    }

    payloads.push({
      baseUrl: dc.baseUrl,
      postId: post.id,
      topicId: topic.id,
      topicTitle: topic.title,
      postNumber: post.post_number,
      userId: post.user_id,
      username: post.username,
      displayName: post.name ?? post.display_username ?? null,
      content: stripHtml(post.cooked ?? post.raw ?? ''),
      createdAt: post.created_at,
      replyCount: post.reply_count ?? 0,
      acceptedAnswer: Boolean(post.accepted_answer),
      categoryId: topic.category_id,
      categorySlug,
      isGovernance,
      linkedAccounts,
    });
  }
  return payloads;
}

async function categorySlugMap(dc: DiscourseClient): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    for (const c of await dc.getCategories()) map.set(c.id, c.slug);
  } catch (error) {
    log.warn({ error }, 'Failed to load Discourse categories; governance flagging may be incomplete');
  }
  return map;
}

/** Live poll: enqueue ingestion jobs for one client's forum. */
async function pollClient(clientId: string, dc: DiscourseClient, sinceMs: number) {
  const govSlugs = governanceSlugs();
  const categoryById = await categorySlugMap(dc);
  const userCache = new Map<string, DiscoursePostPayload['linkedAccounts']>();
  const cutoff = Date.now() - sinceMs;

  const topics = await dc.getLatestTopics(0);
  let enqueued = 0;
  for (const topic of topics) {
    // Only process topics with activity since the last poll window.
    const lastActivity = new Date(topic.last_posted_at ?? topic.created_at).getTime();
    if (lastActivity < cutoff) continue;

    const payloads = await buildTopicPayloads(dc, topic, categoryById, govSlugs, userCache);
    for (const payload of payloads) {
      await addJob('ingest:discourse', {
        event: payload.postNumber === 1 ? 'topic' : 'post',
        payload,
        clientId,
      } as JobData);
      enqueued++;
    }
  }
  log.info({ clientId, baseUrl: dc.baseUrl, topics: topics.length, enqueued }, 'Discourse poll complete');
}

/** Poll every active client that has an enabled Discourse platform config. */
async function pollAllClients() {
  const configs = await prisma.platformConfig.findMany({
    where: { platform: 'DISCOURSE', enabled: true, client: { active: true } },
  });
  if (configs.length === 0) {
    log.debug({}, 'No active clients with Discourse configured');
    return;
  }
  for (const pc of configs) {
    try {
      const cfg = (pc.config ?? {}) as Record<string, string>;
      const creds = (pc.credentials ?? {}) as Record<string, string>;
      if (!cfg.baseUrl) {
        log.warn({ clientId: pc.clientId }, 'Discourse config missing baseUrl; skipping');
        continue;
      }
      const dc = createDiscourseClient({
        baseUrl: cfg.baseUrl,
        apiKey: creds.apiKey ?? config.discourseApiKey,
        apiUsername: creds.apiUsername ?? config.discourseApiUsername,
      });
      await pollClient(pc.clientId, dc, config.discoursePollIntervalMs * 2);
    } catch (error) {
      log.error({ error, clientId: pc.clientId }, 'Error polling Discourse for client');
    }
  }
}

/**
 * Dry run: fetch from a public instance and log what would be persisted, without
 * writing to the database or the queue. Used to verify the pipeline end-to-end.
 */
async function dryRun(baseUrl: string, limit: number) {
  const dc = createDiscourseClient({ baseUrl });
  const govSlugs = governanceSlugs();
  const categoryById = await categorySlugMap(dc);
  const userCache = new Map<string, DiscoursePostPayload['linkedAccounts']>();

  log.info({ baseUrl, limit, governanceCategories: [...govSlugs] }, '[DRY RUN] Discourse — fetching latest topics');
  const topics = (await dc.getLatestTopics(0)).slice(0, limit);

  let topicCount = 0;
  let postCount = 0;
  let govCount = 0;
  let linkCount = 0;

  for (const topic of topics) {
    const payloads = await buildTopicPayloads(dc, topic, categoryById, govSlugs, userCache);
    topicCount++;
    const slug = payloads[0]?.categorySlug ?? '(uncategorised)';
    // eslint-disable-next-line no-console
    console.log(
      `\n▶ TOPIC #${topic.id} "${topic.title}" [category: ${slug}${payloads[0]?.isGovernance ? ' • GOVERNANCE' : ''}] — ${payloads.length} posts`
    );
    for (const p of payloads) {
      postCount++;
      if (p.isGovernance) govCount++;
      const linked = (p.linkedAccounts ?? []).map((l) => `${l.platform}:${l.username}`).join(', ');
      if (linked) linkCount++;
      const eventType = p.acceptedAnswer
        ? 'DISCOURSE_SOLUTION_ACCEPTED'
        : p.postNumber === 1
          ? 'DISCOURSE_TOPIC_CREATED'
          : 'DISCOURSE_POST_CREATED';
      // eslint-disable-next-line no-console
      console.log(
        `   • post #${p.postId} by @${p.username} → Message + Event(${eventType})` +
          `${linked ? ` [linked: ${linked}]` : ''}` +
          `\n     "${p.content.slice(0, 100).replace(/\s+/g, ' ')}${p.content.length > 100 ? '…' : ''}"`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n[DRY RUN] Would persist ${postCount} Messages + ${postCount} Events across ${topicCount} topics ` +
      `(${govCount} governance posts, ${linkCount} posts with explicit linked accounts). Nothing was written.`
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'base-url': { type: 'string' },
      limit: { type: 'string' },
    },
  });

  if (values['dry-run']) {
    const baseUrl = values['base-url'] ?? 'https://meta.discourse.org';
    const limit = values.limit ? Number(values.limit) : 3;
    await dryRun(baseUrl, limit);
    await prisma.$disconnect();
    return;
  }

  // Live mode: poll immediately, then on the configured interval.
  log.info({ pollIntervalMinutes: config.discoursePollIntervalMs / 60000 }, 'Starting Discourse polling service');
  await pollAllClients();
  setInterval(() => {
    pollAllClients().catch((error) => log.error({ error }, 'Discourse poll cycle failed'));
  }, config.discoursePollIntervalMs);

  process.on('SIGINT', () => {
    log.info({}, 'Shutting down Discourse polling service');
    process.exit(0);
  });
}

main().catch((error) => {
  log.error({ error }, 'Discourse polling service failed to start');
  process.exit(1);
});
