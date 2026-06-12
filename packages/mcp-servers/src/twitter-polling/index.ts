import { addJob, getTwitterClient, getTwitterTrackedAccountsByClient, config, log } from '@attrakt/core';
import type { JobData } from '@attrakt/api/src/queues/types';

const twitterClient = getTwitterClient().readOnly;

/**
 * Poll for mentions of tracked accounts
 */
async function pollMentions() {
  try {
    // Each client configures its own tracked accounts; attribute tweets to the
    // owning client rather than a single global tenant.
    const byClient = await getTwitterTrackedAccountsByClient();

    if (byClient.length === 0) {
      log.debug({}, 'No Twitter accounts tracked for any client');
      return;
    }

    for (const { clientId, accounts } of byClient) {
      for (const account of accounts) {
        try {
          // Search for mentions in the last 15 minutes
          const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const query = `@${account.trim()}`;

          const tweets = await twitterClient.v2.search({
            query,
            start_time: since,
            max_results: 100,
          });

          for (const tweet of tweets.data?.data || []) {
            await addJob('ingest:twitter', {
              event: 'mention',
              payload: {
                tweetId: tweet.id,
                text: tweet.text,
                authorId: tweet.author_id || '',
                createdAt: tweet.created_at,
                query,
                trackedAccount: account,
              },
              clientId,
            } as JobData);
          }

          log.info({ clientId, account, count: tweets.data?.data?.length || 0 }, 'Found mentions');
        } catch (error) {
          log.error({ error, clientId, account }, 'Error polling mentions');
        }
      }
    }
  } catch (error) {
    log.error({ error }, 'Error in pollMentions');
  }
}

/**
 * Poll for engagement metrics on tracked tweets
 */
async function pollEngagement() {
  try {
    // This would typically track specific tweet IDs from the database
    // For MVP, we'll skip this or implement a basic version
    log.debug({}, 'Engagement polling not yet implemented');
  } catch (error) {
    log.error({ error }, 'Error in pollEngagement');
  }
}

/**
 * Poll for follower counts (daily)
 */
async function pollFollowerCounts() {
  try {
    const byClient = await getTwitterTrackedAccountsByClient();

    for (const { clientId, accounts } of byClient) {
      for (const account of accounts) {
        try {
          const user = await twitterClient.v2.userByUsername(account.trim(), {
            'user.fields': ['public_metrics'],
          });

          if (user.data) {
            await addJob('ingest:twitter', {
              event: 'follower_count',
              payload: {
                username: account.trim(),
                userId: user.data.id,
                followerCount: user.data.public_metrics?.followers_count || 0,
                followingCount: user.data.public_metrics?.following_count || 0,
                tweetCount: user.data.public_metrics?.tweet_count || 0,
                timestamp: Date.now(),
              },
              clientId,
            } as JobData);

            log.debug(
              { clientId, account, followerCount: user.data.public_metrics?.followers_count },
              'Follower count polled'
            );
          }
        } catch (error) {
          log.error({ error, clientId, account }, 'Error polling follower count');
        }
      }
    }
  } catch (error) {
    log.error({ error }, 'Error in pollFollowerCounts');
  }
}

// Start polling
log.info({ pollIntervalMinutes: config.twitterPollIntervalMs / 1000 / 60 }, 'Starting Twitter polling service');

// Poll mentions every 15 minutes (or configured interval)
setInterval(pollMentions, config.twitterPollIntervalMs);

// Poll follower counts daily (at midnight UTC)
const now = new Date();
const tomorrow = new Date(now);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
tomorrow.setUTCHours(0, 0, 0, 0);
const msUntilMidnight = tomorrow.getTime() - now.getTime();

setTimeout(() => {
  pollFollowerCounts();
  // Then poll daily
  setInterval(pollFollowerCounts, 24 * 60 * 60 * 1000);
}, msUntilMidnight);

// Initial poll
pollMentions();

// Graceful shutdown
process.on('SIGINT', () => {
  log.info({}, 'Shutting down Twitter polling service');
  process.exit(0);
});
