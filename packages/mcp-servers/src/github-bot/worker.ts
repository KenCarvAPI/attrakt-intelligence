import { createWorker } from '@attrakt/api';
import { Job } from 'bullmq';
import { prisma, resolveIdentity, log, IngestionError, isRetryableError } from '@attrakt/core';
import type { JobData, IngestGitHubJobData } from '@attrakt/api/src/queues/types';
import type {
  GitHubPushPayload,
  GitHubPullRequestPayload,
  GitHubIssuePayload,
} from '@attrakt/core/src/types/platforms';

/**
 * GitHub ingestion worker
 * Processes GitHub events and stores them in the database
 */
export function createGitHubWorker() {
  return createWorker('ingest:github', async (job: Job<JobData>) => {
    const data = job.data as IngestGitHubJobData;

    try {
      switch (data.event) {
        case 'push': {
          await processPush(data.payload as GitHubPushPayload, data.clientId);
          break;
        }
        case 'pull_request': {
          await processPullRequest(data.payload as any, data.clientId);
          break;
        }
        case 'issues': {
          await processIssue(data.payload as any, data.clientId);
          break;
        }
        case 'issue_comment': {
          await processIssueComment(data.payload as any, data.clientId);
          break;
        }
        case 'star': {
          await processStar(data.payload as any, data.clientId);
          break;
        }
        case 'fork': {
          await processFork(data.payload as any, data.clientId);
          break;
        }
        default:
          log.warn({ event: data.event, clientId: data.clientId }, 'Unknown GitHub event');
      }
    } catch (error) {
      const ingestionError =
        error instanceof IngestionError
          ? error
          : new IngestionError(
              `Error processing GitHub event ${data.event}: ${error instanceof Error ? error.message : String(error)}`,
              'GITHUB',
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
        'Failed to process GitHub event'
      );

      throw ingestionError;
    }
  });
}

async function processPush(payload: GitHubPushPayload, clientId: string) {
  const logger = log.child({ clientId, platform: 'GITHUB', event: 'push' });

  try {
    const pusher = payload.pusher?.name || payload.sender?.login;
    const pusherId = payload.sender?.id;
    const email = payload.pusher?.email || payload.sender?.email;

    if (!pusher || !pusherId) {
      logger.warn({ payload }, 'Push payload missing pusher information');
      return;
    }

    // Use centralized identity resolution
    const { memberId } = await resolveIdentity(clientId, 'GITHUB', pusherId.toString(), pusher, {
      email,
    });

    // Batch create events for commits
    const events = payload.commits.map((commit) => ({
      clientId,
      memberId,
      platform: 'GITHUB' as const,
      eventType: 'PUSH' as const,
      eventData: {
        sha: commit.id,
        message: commit.message,
        url: commit.url,
        repository: payload.repository?.full_name,
        branch: payload.ref?.replace('refs/heads/', ''),
      },
      createdAt: new Date(commit.timestamp || Date.now()),
    }));

    if (events.length > 0) {
      await prisma.event.createMany({
        data: events,
      });
      logger.debug({ memberId, commitCount: events.length }, 'Push events created');
    }
  } catch (error) {
    logger.error({ error, payload: { sender: payload.sender?.login } }, 'Failed to process push');
    throw new IngestionError(
      `Failed to process push: ${error instanceof Error ? error.message : String(error)}`,
      'GITHUB',
      'push',
      true,
      error
    );
  }
}

async function processPullRequest(payload: any, clientId: string) {
  const logger = log.child({ clientId, platform: 'GITHUB', event: 'pull_request' });

  try {
    const pr = payload.pull_request || payload;
    const author = pr.user?.login;
    const authorId = pr.user?.id;

    if (!author || !authorId) {
      logger.warn({ payload }, 'PR payload missing author information');
      return;
    }

    // Use centralized identity resolution
    const { memberId } = await resolveIdentity(clientId, 'GITHUB', authorId.toString(), author);

    const action = payload.action || 'opened';
    let eventType: 'PULL_REQUEST_OPENED' | 'PULL_REQUEST_MERGED' | 'PULL_REQUEST_CLOSED' = 'PULL_REQUEST_OPENED';

    if (action === 'opened') {
      eventType = 'PULL_REQUEST_OPENED';
    } else if (action === 'closed' && pr.merged) {
      eventType = 'PULL_REQUEST_MERGED';
    } else if (action === 'closed') {
      eventType = 'PULL_REQUEST_CLOSED';
    }

    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'GITHUB',
        eventType,
        eventData: {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          repository: payload.repository?.full_name,
          merged: pr.merged || false,
        },
        createdAt: new Date(pr.created_at || Date.now()),
      },
    });

    logger.debug({ memberId, prNumber: pr.number, eventType }, 'PR event created');
  } catch (error) {
    logger.error({ error, payload: { action: payload.action } }, 'Failed to process pull request');
    throw new IngestionError(
      `Failed to process pull request: ${error instanceof Error ? error.message : String(error)}`,
      'GITHUB',
      'pull_request',
      true,
      error
    );
  }
}

async function processIssue(payload: any, clientId: string) {
  const logger = log.child({ clientId, platform: 'GITHUB', event: 'issues' });

  try {
    const issue = payload.issue || payload;
    const author = issue.user?.login;
    const authorId = issue.user?.id;

    if (!author || !authorId) {
      logger.warn({ payload }, 'Issue payload missing author information');
      return;
    }

    // Use centralized identity resolution
    const { memberId } = await resolveIdentity(clientId, 'GITHUB', authorId.toString(), author);

    const action = payload.action || 'opened';
    const eventType = action === 'opened' ? 'ISSUE_OPENED' : 'ISSUE_CLOSED';

    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'GITHUB',
        eventType: eventType as any,
        eventData: {
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          repository: payload.repository?.full_name,
          labels: issue.labels?.map((l: any) => (typeof l === 'string' ? l : l.name)),
        },
        createdAt: new Date(issue.created_at || Date.now()),
      },
    });

    logger.debug({ memberId, issueNumber: issue.number, eventType }, 'Issue event created');
  } catch (error) {
    logger.error({ error, payload: { action: payload.action } }, 'Failed to process issue');
    throw new IngestionError(
      `Failed to process issue: ${error instanceof Error ? error.message : String(error)}`,
      'GITHUB',
      'issues',
      true,
      error
    );
  }
}

async function processIssueComment(payload: any, clientId: string) {
  const logger = log.child({ clientId, platform: 'GITHUB', event: 'issue_comment' });

  try {
    const comment = payload.comment || payload;
    const author = comment.user?.login;
    const authorId = comment.user?.id;

    if (!author || !authorId) {
      logger.warn({ payload }, 'Comment payload missing author information');
      return;
    }

    // Use centralized identity resolution
    const { memberId } = await resolveIdentity(clientId, 'GITHUB', authorId.toString(), author);

    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'GITHUB',
        eventType: 'ISSUE_COMMENT',
        eventData: {
          commentId: comment.id,
          body: comment.body,
          url: comment.html_url,
          repository: payload.repository?.full_name,
          issueNumber: payload.issue?.number,
        },
        createdAt: new Date(comment.created_at || Date.now()),
      },
    });

    logger.debug({ memberId, commentId: comment.id }, 'Issue comment event created');
  } catch (error) {
    logger.error({ error }, 'Failed to process issue comment');
    throw new IngestionError(
      `Failed to process issue comment: ${error instanceof Error ? error.message : String(error)}`,
      'GITHUB',
      'issue_comment',
      true,
      error
    );
  }
}

async function processStar(payload: any, clientId: string) {
  const logger = log.child({ clientId, platform: 'GITHUB', event: 'star' });

  try {
    const sender = payload.sender;
    const author = sender?.login;
    const authorId = sender?.id;

    if (!author || !authorId) {
      logger.warn({ payload }, 'Star payload missing sender information');
      return;
    }

    // Use centralized identity resolution
    const { memberId } = await resolveIdentity(clientId, 'GITHUB', authorId.toString(), author);

    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'GITHUB',
        eventType: 'STAR',
        eventData: {
          repository: payload.repository?.full_name,
          action: payload.action, // 'created' or 'deleted'
        },
        createdAt: new Date(payload.repository?.updated_at || Date.now()),
      },
    });

    logger.debug({ memberId, repository: payload.repository?.full_name }, 'Star event created');
  } catch (error) {
    logger.error({ error }, 'Failed to process star');
    throw new IngestionError(
      `Failed to process star: ${error instanceof Error ? error.message : String(error)}`,
      'GITHUB',
      'star',
      true,
      error
    );
  }
}

async function processFork(payload: any, clientId: string) {
  const logger = log.child({ clientId, platform: 'GITHUB', event: 'fork' });

  try {
    const fork = payload.forkee || payload;
    const author = fork.owner?.login;
    const authorId = fork.owner?.id;

    if (!author || !authorId) {
      logger.warn({ payload }, 'Fork payload missing owner information');
      return;
    }

    // Use centralized identity resolution
    const { memberId } = await resolveIdentity(clientId, 'GITHUB', authorId.toString(), author);

    await prisma.event.create({
      data: {
        clientId,
        memberId,
        platform: 'GITHUB',
        eventType: 'FORK',
        eventData: {
          repository: fork.full_name,
          forkedFrom: payload.repository?.full_name,
        },
        createdAt: new Date(fork.created_at || Date.now()),
      },
    });

    logger.debug({ memberId, repository: fork.full_name }, 'Fork event created');
  } catch (error) {
    logger.error({ error }, 'Failed to process fork');
    throw new IngestionError(
      `Failed to process fork: ${error instanceof Error ? error.message : String(error)}`,
      'GITHUB',
      'fork',
      true,
      error
    );
  }
}