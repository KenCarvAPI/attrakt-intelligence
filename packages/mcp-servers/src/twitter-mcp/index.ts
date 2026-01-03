#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getTwitterClient, log } from '@attrakt/core';

const twitterClient = getTwitterClient().readOnly;

const server = new Server(
  {
    name: 'twitter-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'twitter_search_mentions',
        description: 'Search for mentions of a Twitter account',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (e.g., @username)' },
            since: { type: 'string', description: 'ISO date string to search since' },
            maxResults: { type: 'number', description: 'Maximum number of results', default: 10 },
          },
          required: ['query'],
        },
      },
      {
        name: 'twitter_get_user',
        description: 'Get Twitter user information',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'Twitter username (without @)' },
          },
          required: ['username'],
        },
      },
      {
        name: 'twitter_get_engagement',
        description: 'Get engagement metrics for tweets',
        inputSchema: {
          type: 'object',
          properties: {
            tweetIds: { type: 'array', items: { type: 'string' }, description: 'Array of tweet IDs' },
          },
          required: ['tweetIds'],
        },
      },
      {
        name: 'twitter_get_followers_sample',
        description: 'Get a sample of followers for a Twitter account',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'Twitter username (without @)' },
            count: { type: 'number', description: 'Number of followers to return', default: 10 },
          },
          required: ['username'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'twitter_search_mentions': {
        const query = args.query as string;
        const since = args.since as string | undefined;
        const maxResults = Math.min((args.maxResults as number) || 10, 100);

        const tweets = await twitterClient.v2.search({
          query,
          start_time: since,
          max_results: maxResults,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                (tweets.data?.data || []).map((tweet) => ({
                  id: tweet.id,
                  text: tweet.text,
                  authorId: tweet.author_id,
                  createdAt: tweet.created_at,
                  publicMetrics: tweet.public_metrics,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'twitter_get_user': {
        const username = (args.username as string).replace('@', '');
        const user = await twitterClient.v2.userByUsername(username, {
          'user.fields': ['public_metrics', 'description', 'created_at'],
        });

        // Get recent tweets
        const tweets = await twitterClient.v2.userTimeline(user.data.id, {
          max_results: 10,
          'tweet.fields': ['created_at', 'public_metrics'],
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: user.data.id,
                  username: user.data.username,
                  name: user.data.name,
                  description: user.data.description,
                  followerCount: user.data.public_metrics?.followers_count,
                  followingCount: user.data.public_metrics?.following_count,
                  tweetCount: user.data.public_metrics?.tweet_count,
                  createdAt: user.data.created_at,
                  recentTweets: (tweets.data?.data || []).map((tweet) => ({
                    id: tweet.id,
                    text: tweet.text,
                    createdAt: tweet.created_at,
                    metrics: tweet.public_metrics,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'twitter_get_engagement': {
        const tweetIds = args.tweetIds as string[];
        const tweets = await twitterClient.v2.tweets(tweetIds, {
          'tweet.fields': ['public_metrics', 'created_at'],
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                (tweets.data?.data || []).map((tweet) => ({
                  id: tweet.id,
                  likes: tweet.public_metrics?.like_count,
                  retweets: tweet.public_metrics?.retweet_count,
                  replies: tweet.public_metrics?.reply_count,
                  quotes: tweet.public_metrics?.quote_count,
                  impressions: tweet.public_metrics?.impression_count,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'twitter_get_followers_sample': {
        const username = (args.username as string).replace('@', '');
        const count = Math.min((args.count as number) || 10, 100);

        const user = await twitterClient.v2.userByUsername(username);
        const followers = await twitterClient.v2.followers(user.data.id, {
          max_results: count,
          'user.fields': ['description', 'public_metrics'],
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                (followers.data?.data || []).map((follower) => ({
                  id: follower.id,
                  username: follower.username,
                  name: follower.name,
                  description: follower.description,
                  followerCount: follower.public_metrics?.followers_count,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

// List resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'twitter://user/{username}',
        name: 'Twitter User',
        description: 'Twitter user profile and information',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri.startsWith('twitter://user/')) {
    const username = uri.replace('twitter://user/', '').replace('@', '');
    try {
      const user = await twitterClient.v2.userByUsername(username, {
        'user.fields': ['public_metrics', 'description'],
      });

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                id: user.data.id,
                username: user.data.username,
                name: user.data.name,
                followerCount: user.data.public_metrics?.followers_count,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to fetch resource: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Twitter MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in Twitter MCP server:', error);
  process.exit(1);
});
