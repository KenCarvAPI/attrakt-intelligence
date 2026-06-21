import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { prisma, resolveIdentity, log, IngestionError, isRetryableError } from '@attrakt/core';
import { calculateBasicSentiment } from '@attrakt/core';
import type { JobData, IngestDiscourseJobData } from '@attrakt/api';
import type { DiscoursePostPayload } from '@attrakt/core';

/**
 * Discourse ingestion worker.
 *
 * Each post (topic OP or reply) becomes a Message plus an Event. The event type
 * encodes the action — topic_created / post_created / solution_accepted — and
 * governance participation is flagged in eventData so scoring and digests can
 * treat it as a distinct signal. Ingestion is idempotent: posts are keyed on the
 * Discourse-native post id, so re-polling the same topic never double-writes.
 */
export function createDiscourseWorker() {
  return createWorker('ingest:discourse', async (job: Job<JobData>) => {
    const data = job.data as IngestDiscourseJobData;
    try {
      switch (data.event) {
        case 'topic':
        case 'post':
          await processPost(data.payload as DiscoursePostPayload, data.clientId);
          break;
        default:
          log.warn({ event: data.event, clientId: data.clientId }, 'Unknown Discourse event');
      }
    } catch (error) {
      const ingestionError =
        error instanceof IngestionError
          ? error
          : new IngestionError(
              `Error processing Discourse event ${data.event}: ${error instanceof Error ? error.message : String(error)}`,
              'DISCOURSE',
              data.event,
              isRetryableError(error),
              error
            );
      log.error(
        { error: ingestionError, event: data.event, clientId: data.clientId, retryable: ingestionError.retryable },
        'Failed to process Discourse event'
      );
      throw ingestionError;
    }
  });
}

function eventTypeFor(payload: DiscoursePostPayload) {
  if (payload.acceptedAnswer) return 'DISCOURSE_SOLUTION_ACCEPTED' as const;
  if (payload.postNumber === 1) return 'DISCOURSE_TOPIC_CREATED' as const;
  return 'DISCOURSE_POST_CREATED' as const;
}

/**
 * Ingest one Discourse post. Returns true when a new Message+Event were written,
 * false when the post was already ingested (idempotent skip) — so callers like
 * the backfill can count actual persists rather than attempts.
 */
export async function processPost(payload: DiscoursePostPayload, clientId: string): Promise<boolean> {
  const logger = log.child({ clientId, platform: 'DISCOURSE', event: 'post' });
  const platformMessageId = `discourse-post-${payload.postId}`;

  // Idempotency: skip if this post was already ingested for this tenant.
  const existing = await prisma.message.findUnique({
    where: { platform_platformMessageId: { platform: 'DISCOURSE', platformMessageId } },
    select: { id: true },
  });
  if (existing) {
    logger.debug({ postId: payload.postId }, 'Discourse post already ingested; skipping');
    return false;
  }

  // Resolve the author. Explicit GitHub/Discord links on the Discourse profile
  // are passed as high-confidence signals (ranked above username matching).
  const { memberId } = await resolveIdentity(
    clientId,
    'DISCOURSE',
    String(payload.userId),
    payload.username,
    {
      displayName: payload.displayName ?? undefined,
      linkedAccounts: payload.linkedAccounts,
    }
  );

  const createdAt = new Date(payload.createdAt);

  await prisma.message.create({
    data: {
      clientId,
      memberId,
      platform: 'DISCOURSE',
      platformMessageId,
      channelId: payload.categorySlug ?? (payload.categoryId != null ? String(payload.categoryId) : null),
      threadId: String(payload.topicId),
      content: payload.content,
      sentiment: calculateBasicSentiment(payload.content),
      metadata: {
        topicId: payload.topicId,
        topicTitle: payload.topicTitle,
        postNumber: payload.postNumber,
        governance: payload.isGovernance,
      },
      createdAt,
    },
  });

  await prisma.event.create({
    data: {
      clientId,
      memberId,
      platform: 'DISCOURSE',
      eventType: eventTypeFor(payload),
      dedupeKey: `discourse-post-${payload.postId}:${eventTypeFor(payload)}`,
      eventData: {
        postId: payload.postId,
        topicId: payload.topicId,
        topicTitle: payload.topicTitle,
        postNumber: payload.postNumber,
        replyCount: payload.replyCount,
        acceptedAnswer: payload.acceptedAnswer,
        categoryId: payload.categoryId,
        categorySlug: payload.categorySlug,
        // Distinct governance signal for scoring/digests.
        governance: payload.isGovernance,
      },
      createdAt,
    },
  });

  logger.debug(
    { postId: payload.postId, topicId: payload.topicId, eventType: eventTypeFor(payload), governance: payload.isGovernance },
    'Discourse post ingested'
  );
  return true;
}
