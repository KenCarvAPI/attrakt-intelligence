import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { prisma, resolveIdentity, log, IngestionError, isRetryableError } from '@attrakt/core';
import type { JobData, IngestTwitterJobData } from '@attrakt/api';
import type { TwitterMentionPayload, TwitterFollowerCountPayload } from '@attrakt/core';

/**
 * Twitter ingestion worker
 * Processes Twitter events and stores them in the database
 */
export function createTwitterWorker() {
  return createWorker('ingest:twitter', async (job: Job<JobData>) => {
    const data = job.data as IngestTwitterJobData;

    try {
      switch (data.event) {
        case 'mention': {
          await processMention(data.payload as TwitterMentionPayload, data.clientId);
          break;
        }
        case 'engagement': {
          await processEngagement(data.payload as any, data.clientId);
          break;
        }
        case 'follower_count': {
          await processFollowerCount(data.payload as TwitterFollowerCountPayload, data.clientId);
          break;
        }
        default:
          log.warn({ event: data.event, clientId: data.clientId }, 'Unknown Twitter event');
      }
    } catch (error) {
      const ingestionError =
        error instanceof IngestionError
          ? error
          : new IngestionError(
              `Error processing Twitter event ${data.event}: ${error instanceof Error ? error.message : String(error)}`,
              'TWITTER',
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
        'Failed to process Twitter event'
      );

      throw ingestionError;
    }
  });
}

async function processMention(payload: TwitterMentionPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'TWITTER', event: 'mention' });

  try {
    if (!payload.authorId) {
      logger.warn({ payload }, 'Mention payload missing authorId');
      return;
    }

    // Extract username from text (fallback if not provided directly)
    // Note: This is a limitation - ideally authorId should map to a username
    // For now, we'll use a placeholder and let identity resolution handle it
    const username = payload.text?.split(' ')[0]?.replace('@', '') || 'unknown';

    // Use centralized identity resolution
    // Note: We need the actual username here - this might need to be passed in the payload
    const { memberId } = await resolveIdentity(clientId, 'TWITTER', payload.authorId, username);

    // Store as message
    const message = await prisma.message.create({
      data: {
        clientId,
        memberId,
        platform: 'TWITTER',
        platformMessageId: payload.tweetId,
        content: payload.text,
        metadata: {
          query: payload.query,
          trackedAccount: payload.trackedAccount,
        },
        createdAt: new Date(payload.createdAt),
      },
    });

    logger.debug({ messageId: message.id, tweetId: payload.tweetId }, 'Tweet stored as message');

    // Create mention event
    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'TWITTER',
        eventType: 'MENTION',
        eventData: {
          tweetId: payload.tweetId,
          mentionedAccount: payload.trackedAccount,
        },
        createdAt: new Date(payload.createdAt),
      },
    });

    logger.debug({ memberId, tweetId: payload.tweetId }, 'Mention event created');
  } catch (error) {
    logger.error({ error, payload: { tweetId: payload.tweetId, authorId: payload.authorId } }, 'Failed to process mention');
    throw new IngestionError(
      `Failed to process mention: ${error instanceof Error ? error.message : String(error)}`,
      'TWITTER',
      'mention',
      true,
      error
    );
  }
}

async function processEngagement(payload: any, clientId: string) {
  const logger = log.child({ clientId, platform: 'TWITTER', event: 'engagement' });

  try {
    // Store engagement metrics as events
    // This would typically update existing tweet records
    logger.debug({ payload }, 'Engagement processing not fully implemented');
  } catch (error) {
    logger.error({ error }, 'Failed to process engagement');
    throw new IngestionError(
      `Failed to process engagement: ${error instanceof Error ? error.message : String(error)}`,
      'TWITTER',
      'engagement',
      true,
      error
    );
  }
}

async function processFollowerCount(payload: TwitterFollowerCountPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'TWITTER', event: 'follower_count' });

  try {
    // Store follower count as a metric
    await prisma.metric.create({
      data: {
        clientId,
        metricType: 'MEMBER_COUNT',
        value: payload.followerCount,
        metadata: {
          platform: 'TWITTER',
          username: payload.username,
          followingCount: payload.followingCount,
          tweetCount: payload.tweetCount,
        },
        createdAt: new Date(payload.timestamp),
      },
    });

    logger.debug({ username: payload.username, followerCount: payload.followerCount }, 'Follower count metric stored');
  } catch (error) {
    logger.error({ error, payload: { username: payload.username } }, 'Failed to process follower count');
    throw new IngestionError(
      `Failed to process follower count: ${error instanceof Error ? error.message : String(error)}`,
      'TWITTER',
      'follower_count',
      true,
      error
    );
  }
}