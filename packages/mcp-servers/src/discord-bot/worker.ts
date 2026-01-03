import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { prisma, resolveIdentity, log, IngestionError, isRetryableError } from '@attrakt/core';
import { calculateBasicSentiment } from '@attrakt/core/src/utils/sentiment';
import type { JobData, IngestDiscordJobData } from '@attrakt/api/src/queues/types';
import type {
  DiscordMessagePayload,
  DiscordMemberPayload,
  DiscordReactionPayload,
} from '@attrakt/core/src/types/platforms';

/**
 * Discord ingestion worker
 * Processes Discord events and stores them in the database
 */
export function createDiscordWorker() {
  return createWorker('ingest:discord', async (job: Job<JobData>) => {
    const data = job.data as IngestDiscordJobData;

    try {
      switch (data.event) {
        case 'messageCreate': {
          await processMessage(data.payload as DiscordMessagePayload, data.clientId);
          break;
        }
        case 'guildMemberAdd': {
          await processMemberJoin(data.payload as DiscordMemberPayload, data.clientId);
          break;
        }
        case 'guildMemberRemove': {
          await processMemberLeave(data.payload as DiscordMemberPayload, data.clientId);
          break;
        }
        case 'messageReactionAdd': {
          await processReaction(data.payload as DiscordReactionPayload, data.clientId);
          break;
        }
        default:
          log.warn({ event: data.event, clientId: data.clientId }, 'Unknown Discord event');
      }
    } catch (error) {
      const ingestionError =
        error instanceof IngestionError
          ? error
          : new IngestionError(
              `Error processing Discord event ${data.event}: ${error instanceof Error ? error.message : String(error)}`,
              'DISCORD',
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
        'Failed to process Discord event'
      );

      throw ingestionError;
    }
  });
}

async function processMessage(payload: DiscordMessagePayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'DISCORD', event: 'messageCreate' });

  try {
    // Resolve identity using centralized service
    const { memberId } = await resolveIdentity(clientId, 'DISCORD', payload.authorId, payload.authorUsername, {
      displayName: payload.authorDisplayName || undefined,
    });

    // Update last seen
    await prisma.member.update({
      where: { id: memberId },
      data: { lastSeen: new Date() },
    });

    // Calculate sentiment
    const sentiment = calculateBasicSentiment(payload.content);

    // Store message
    const message = await prisma.message.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCORD',
        platformMessageId: payload.id,
        channelId: payload.channelId,
        content: payload.content,
        rawContent: payload,
        sentiment,
        metadata: {
          embeds: payload.embeds,
          attachments: payload.attachments,
        },
        createdAt: new Date(payload.timestamp),
      },
    });

    logger.debug({ messageId: message.id }, 'Message stored');

    // Extract mentions and links for events (batch create)
    const mentionMatches = payload.content.match(/<@!?(\d+)>/g) || [];
    const linkMatches = payload.content.match(/https?:\/\/[^\s]+/g) || [];

    const events = [
      ...mentionMatches.map((mention) => {
        const mentionedUserId = mention.match(/\d+/)?.[0];
        return mentionedUserId
          ? {
              clientId,
              memberId,
              platform: 'DISCORD' as const,
              eventType: 'MENTION' as const,
              eventData: {
                mentionedUserId,
                messageId: payload.id,
                channelId: payload.channelId,
              },
              createdAt: new Date(payload.timestamp),
            }
          : null;
      }),
      ...linkMatches.map((link) => ({
        clientId,
        memberId,
        platform: 'DISCORD' as const,
        eventType: 'LINK_CLICK' as const,
        eventData: {
          url: link,
          messageId: payload.id,
        },
        createdAt: new Date(payload.timestamp),
      })),
    ].filter((e): e is NonNullable<typeof e> => e !== null);

    if (events.length > 0) {
      await prisma.event.createMany({
        data: events,
      });
      logger.debug({ eventCount: events.length }, 'Events created');
    }
  } catch (error) {
    logger.error({ error, payload: { id: payload.id, authorId: payload.authorId } }, 'Failed to process message');
    throw new IngestionError(
      `Failed to process Discord message: ${error instanceof Error ? error.message : String(error)}`,
      'DISCORD',
      'messageCreate',
      true,
      error
    );
  }
}

async function processMemberJoin(payload: DiscordMemberPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'DISCORD', event: 'guildMemberAdd' });

  try {
    // Resolve identity
    const { memberId } = await resolveIdentity(clientId, 'DISCORD', payload.userId, payload.username, {
      displayName: payload.displayName,
    });

    // Update first seen if this is a new member
    if (payload.joinedTimestamp) {
      await prisma.member.update({
        where: { id: memberId },
        data: {
          firstSeen: new Date(Math.min(new Date(payload.joinedTimestamp).getTime(), Date.now())),
          lastSeen: new Date(),
        },
      });
    }

    // Create join event
    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'DISCORD',
        eventType: 'JOIN',
        eventData: {
          guildId: payload.guildId,
          joinedTimestamp: payload.joinedTimestamp,
        },
        createdAt: new Date(payload.joinedTimestamp || Date.now()),
      },
    });

    logger.debug({ memberId, userId: payload.userId }, 'Member join processed');
  } catch (error) {
    logger.error({ error, payload: { userId: payload.userId } }, 'Failed to process member join');
    throw new IngestionError(
      `Failed to process member join: ${error instanceof Error ? error.message : String(error)}`,
      'DISCORD',
      'guildMemberAdd',
      true,
      error
    );
  }
}

async function processMemberLeave(payload: DiscordMemberPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'DISCORD', event: 'guildMemberRemove' });

  try {
    // Find member by platform identity
    const identity = await prisma.platformIdentity.findUnique({
      where: {
        platform_platformUserId: {
          platform: 'DISCORD',
          platformUserId: payload.userId,
        },
      },
    });

    if (identity) {
      await prisma.event.create({
        data: {
          clientId,
          memberId: identity.memberId,
          platform: 'DISCORD',
          eventType: 'LEAVE',
          eventData: {
            guildId: payload.guildId,
            leftTimestamp: payload.leftTimestamp,
          },
          createdAt: new Date(payload.leftTimestamp || Date.now()),
        },
      });

      logger.debug({ memberId: identity.memberId, userId: payload.userId }, 'Member leave processed');
    } else {
      logger.warn({ userId: payload.userId }, 'Member not found for leave event');
    }
  } catch (error) {
    logger.error({ error, payload: { userId: payload.userId } }, 'Failed to process member leave');
    throw new IngestionError(
      `Failed to process member leave: ${error instanceof Error ? error.message : String(error)}`,
      'DISCORD',
      'guildMemberRemove',
      false, // Don't retry if member not found
      error
    );
  }
}

async function processReaction(payload: DiscordReactionPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'DISCORD', event: 'messageReactionAdd' });

  try {
    // Find member by platform identity
    const identity = await prisma.platformIdentity.findUnique({
      where: {
        platform_platformUserId: {
          platform: 'DISCORD',
          platformUserId: payload.userId,
        },
      },
    });

    if (identity) {
      await prisma.event.create({
        data: {
          clientId,
          memberId: identity.memberId,
          platform: 'DISCORD',
          eventType: 'MESSAGE_REACTION',
          eventData: {
            messageId: payload.messageId,
            channelId: payload.channelId,
            emoji: payload.emoji,
          },
          createdAt: new Date(payload.timestamp),
        },
      });

      logger.debug({ memberId: identity.memberId, messageId: payload.messageId }, 'Reaction processed');
    } else {
      logger.warn({ userId: payload.userId }, 'Member not found for reaction event');
    }
  } catch (error) {
    logger.error({ error, payload: { userId: payload.userId } }, 'Failed to process reaction');
    throw new IngestionError(
      `Failed to process reaction: ${error instanceof Error ? error.message : String(error)}`,
      'DISCORD',
      'messageReactionAdd',
      false,
      error
    );
  }
}