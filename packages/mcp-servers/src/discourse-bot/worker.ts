import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { prisma, resolveIdentity, log, IngestionError, isRetryableError } from '@attrakt/core';
import type { JobData, IngestDiscourseJobData } from '@attrakt/api/src/queues/types';
import type {
  DiscourseTopicCreatedPayload,
  DiscoursePostCreatedPayload,
  DiscourseSolutionAcceptedPayload,
} from '@attrakt/core/src/types/platforms';

/**
 * Discourse ingestion worker
 * Processes Discourse forum events (topics, posts, accepted solutions) and
 * stores them as Messages / Events in the database.
 */
export function createDiscourseWorker() {
  return createWorker('ingest:discourse', async (job: Job<JobData>) => {
    const data = job.data as IngestDiscourseJobData;

    try {
      switch (data.event) {
        case 'topic_created': {
          await processTopicCreated(data.payload as DiscourseTopicCreatedPayload, data.clientId);
          break;
        }
        case 'post_created': {
          await processPostCreated(data.payload as DiscoursePostCreatedPayload, data.clientId);
          break;
        }
        case 'solution_accepted': {
          await processSolutionAccepted(
            data.payload as DiscourseSolutionAcceptedPayload,
            data.clientId
          );
          break;
        }
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
        {
          error: ingestionError,
          event: data.event,
          clientId: data.clientId,
          retryable: ingestionError.retryable,
        },
        'Failed to process Discourse event'
      );

      throw ingestionError;
    }
  });
}

async function processTopicCreated(payload: DiscourseTopicCreatedPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'DISCOURSE', event: 'topic_created' });

  try {
    const { memberId } = await resolveIdentity(
      clientId,
      'DISCOURSE',
      payload.authorUserId,
      payload.authorUsername,
      { displayName: payload.authorDisplayName, linkedAccounts: payload.linkedAccounts }
    );

    // The opening post of a topic is stored as a message.
    const message = await prisma.message.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCOURSE',
        platformMessageId: `topic:${payload.topicId}`,
        channelId: payload.categorySlug ?? String(payload.categoryId ?? ''),
        threadId: payload.topicId,
        content: `${payload.title}\n\n${payload.content}`.trim(),
        metadata: {
          kind: 'topic',
          title: payload.title,
          slug: payload.slug,
          url: payload.url,
          categoryId: payload.categoryId,
          category: payload.categorySlug,
          governance: payload.governance,
        },
        createdAt: new Date(payload.createdAt),
      },
    });

    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCOURSE',
        eventType: 'TOPIC_CREATED',
        eventData: {
          topicId: payload.topicId,
          title: payload.title,
          url: payload.url,
          categoryId: payload.categoryId,
          category: payload.categorySlug,
          governance: payload.governance,
        },
        createdAt: new Date(payload.createdAt),
      },
    });

    logger.debug(
      { messageId: message.id, topicId: payload.topicId, governance: payload.governance },
      'Topic stored as message + event'
    );
  } catch (error) {
    logger.error({ error, topicId: payload.topicId }, 'Failed to process topic');
    throw new IngestionError(
      `Failed to process topic: ${error instanceof Error ? error.message : String(error)}`,
      'DISCOURSE',
      'topic_created',
      true,
      error
    );
  }
}

async function processPostCreated(payload: DiscoursePostCreatedPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'DISCOURSE', event: 'post_created' });

  try {
    const { memberId } = await resolveIdentity(
      clientId,
      'DISCOURSE',
      payload.authorUserId,
      payload.authorUsername,
      { displayName: payload.authorDisplayName, linkedAccounts: payload.linkedAccounts }
    );

    const message = await prisma.message.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCOURSE',
        platformMessageId: `post:${payload.postId}`,
        channelId: payload.categorySlug ?? String(payload.categoryId ?? ''),
        threadId: payload.topicId,
        content: payload.content,
        metadata: {
          kind: 'post',
          topicId: payload.topicId,
          topicSlug: payload.topicSlug,
          postNumber: payload.postNumber,
          url: payload.url,
          categoryId: payload.categoryId,
          category: payload.categorySlug,
          governance: payload.governance,
        },
        createdAt: new Date(payload.createdAt),
      },
    });

    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCOURSE',
        eventType: 'POST_CREATED',
        eventData: {
          postId: payload.postId,
          topicId: payload.topicId,
          postNumber: payload.postNumber,
          url: payload.url,
          categoryId: payload.categoryId,
          category: payload.categorySlug,
          governance: payload.governance,
        },
        createdAt: new Date(payload.createdAt),
      },
    });

    logger.debug(
      { messageId: message.id, postId: payload.postId, governance: payload.governance },
      'Post stored as message + event'
    );
  } catch (error) {
    logger.error({ error, postId: payload.postId }, 'Failed to process post');
    throw new IngestionError(
      `Failed to process post: ${error instanceof Error ? error.message : String(error)}`,
      'DISCOURSE',
      'post_created',
      true,
      error
    );
  }
}

async function processSolutionAccepted(
  payload: DiscourseSolutionAcceptedPayload,
  clientId: string
) {
  const logger = log.child({ clientId, platform: 'DISCOURSE', event: 'solution_accepted' });

  try {
    const { memberId } = await resolveIdentity(
      clientId,
      'DISCOURSE',
      payload.authorUserId,
      payload.authorUsername,
      { displayName: payload.authorDisplayName, linkedAccounts: payload.linkedAccounts }
    );

    // An accepted solution is a quality signal, recorded as an event only.
    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCOURSE',
        eventType: 'SOLUTION_ACCEPTED',
        eventData: {
          postId: payload.postId,
          topicId: payload.topicId,
          postNumber: payload.postNumber,
          url: payload.url,
          categoryId: payload.categoryId,
          category: payload.categorySlug,
          governance: payload.governance,
        },
        createdAt: new Date(payload.createdAt),
      },
    });

    logger.debug(
      { postId: payload.postId, memberId, governance: payload.governance },
      'Solution accepted event created'
    );
  } catch (error) {
    logger.error({ error, postId: payload.postId }, 'Failed to process accepted solution');
    throw new IngestionError(
      `Failed to process accepted solution: ${error instanceof Error ? error.message : String(error)}`,
      'DISCOURSE',
      'solution_accepted',
      true,
      error
    );
  }
}
