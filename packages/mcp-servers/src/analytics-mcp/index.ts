#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { prisma } from '@attrakt/core';

const server = new Server(
  {
    name: 'analytics-mcp',
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
        name: 'analytics_get_member',
        description: 'Get unified member profile across all platforms',
        inputSchema: {
          type: 'object',
          properties: {
            memberId: { type: 'string', description: 'Member ID' },
          },
          required: ['memberId'],
        },
      },
      {
        name: 'analytics_get_metrics',
        description: 'Get time-series metrics for a client',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            metric: {
              type: 'string',
              description: 'Metric type (DAU, WAU, MAU, MESSAGE_VOLUME, etc.)',
            },
            period: { type: 'string', description: 'Time period (hour, day, week, month)', default: 'day' },
          },
          required: ['clientId', 'metric'],
        },
      },
      {
        name: 'analytics_get_top_contributors',
        description: 'Get top contributors for a client',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            period: { type: 'string', description: 'Time period (day, week, month)', default: 'week' },
            limit: { type: 'number', description: 'Number of contributors to return', default: 10 },
          },
          required: ['clientId'],
        },
      },
      {
        name: 'analytics_get_sentiment',
        description: 'Get sentiment analysis over time',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            period: { type: 'string', description: 'Time period (day, week, month)', default: 'week' },
            channel: { type: 'string', description: 'Optional channel/platform filter' },
          },
          required: ['clientId'],
        },
      },
      {
        name: 'analytics_query_events',
        description: 'Query events with filters',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            eventType: { type: 'string', description: 'Event type filter' },
            platform: { type: 'string', description: 'Platform filter (DISCORD, GITHUB, TWITTER)' },
            since: { type: 'string', description: 'ISO date string' },
            limit: { type: 'number', description: 'Maximum number of results', default: 100 },
          },
          required: ['clientId'],
        },
      },
      {
        name: 'analytics_get_growth',
        description: 'Get growth metrics (joins, leaves, net)',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            period: { type: 'string', description: 'Time period (day, week, month)', default: 'week' },
          },
          required: ['clientId'],
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
      case 'analytics_get_member': {
        const memberId = args.memberId as string;

        const member = await prisma.member.findUnique({
          where: { id: memberId },
          include: {
            platformIdentities: true,
            _count: {
              select: {
                messages: true,
                events: true,
              },
            },
          },
        });

        if (!member) {
          throw new Error(`Member ${memberId} not found`);
        }

        // Get aggregated activity
        const messages = await prisma.message.groupBy({
          by: ['platform'],
          where: { memberId },
          _count: true,
        });

        const events = await prisma.event.groupBy({
          by: ['platform', 'eventType'],
          where: { memberId },
          _count: true,
        });

        // Calculate average sentiment
        const sentimentMessages = await prisma.message.findMany({
          where: {
            memberId,
            sentiment: { not: null },
          },
          select: { sentiment: true },
        });

        const avgSentiment =
          sentimentMessages.length > 0
            ? sentimentMessages.reduce((sum, m) => sum + (m.sentiment || 0), 0) / sentimentMessages.length
            : null;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: member.id,
                  displayName: member.displayName,
                  email: member.email,
                  platformIdentities: member.platformIdentities.map((pi) => ({
                    platform: pi.platform,
                    username: pi.username,
                    displayName: pi.displayName,
                  })),
                  stats: {
                    totalMessages: member._count.messages,
                    totalEvents: member._count.events,
                    messagesByPlatform: messages.reduce(
                      (acc, m) => ({ ...acc, [m.platform]: m._count }),
                      {} as Record<string, number>
                    ),
                    eventsByPlatform: events.reduce(
                      (acc, e) => ({
                        ...acc,
                        [e.platform]: {
                          ...(acc[e.platform] || {}),
                          [e.eventType]: e._count,
                        },
                      }),
                      {} as Record<string, Record<string, number>>
                    ),
                    averageSentiment: avgSentiment,
                  },
                  firstSeen: member.firstSeen,
                  lastSeen: member.lastSeen,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'analytics_get_metrics': {
        const clientId = args.clientId as string;
        const metric = args.metric as string;
        const period = (args.period as string) || 'day';

        const since = new Date();
        switch (period) {
          case 'hour':
            since.setHours(since.getHours() - 24);
            break;
          case 'day':
            since.setDate(since.getDate() - 30);
            break;
          case 'week':
            since.setDate(since.getDate() - 12 * 7);
            break;
          case 'month':
            since.setMonth(since.getMonth() - 12);
            break;
        }

        const metrics = await prisma.metric.findMany({
          where: {
            clientId,
            metricType: metric as any,
            createdAt: { gte: since },
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                metrics.map((m) => ({
                  value: m.value,
                  timestamp: m.createdAt.toISOString(),
                  metadata: m.metadata,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'analytics_get_top_contributors': {
        const clientId = args.clientId as string;
        const period = (args.period as string) || 'week';
        const limit = Math.min((args.limit as number) || 10, 100);

        const since = new Date();
        switch (period) {
          case 'day':
            since.setDate(since.getDate() - 1);
            break;
          case 'week':
            since.setDate(since.getDate() - 7);
            break;
          case 'month':
            since.setMonth(since.getMonth() - 1);
            break;
        }

        const contributors = await prisma.member.findMany({
          where: {
            clientId,
            messages: {
              some: {
                createdAt: { gte: since },
              },
            },
          },
          include: {
            _count: {
              select: {
                messages: {
                  where: {
                    createdAt: { gte: since },
                  },
                },
                events: {
                  where: {
                    createdAt: { gte: since },
                  },
                },
              },
            },
          },
          orderBy: {
            messages: {
              _count: 'desc',
            },
          },
          take: limit,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                contributors.map((c) => ({
                  id: c.id,
                  displayName: c.displayName,
                  messageCount: c._count.messages,
                  eventCount: c._count.events,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'analytics_get_sentiment': {
        const clientId = args.clientId as string;
        const period = (args.period as string) || 'week';
        const channel = args.channel as string | undefined;

        const since = new Date();
        switch (period) {
          case 'day':
            since.setDate(since.getDate() - 1);
            break;
          case 'week':
            since.setDate(since.getDate() - 7);
            break;
          case 'month':
            since.setMonth(since.getMonth() - 1);
            break;
        }

        const messages = await prisma.message.findMany({
          where: {
            clientId,
            platform: channel as any,
            sentiment: { not: null },
            createdAt: { gte: since },
          },
          select: {
            sentiment: true,
            createdAt: true,
            platform: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        // Group by day and calculate averages
        const dailySentiment = messages.reduce((acc, msg) => {
          const day = msg.createdAt.toISOString().split('T')[0];
          if (!acc[day]) {
            acc[day] = { sum: 0, count: 0 };
          }
          acc[day].sum += msg.sentiment || 0;
          acc[day].count += 1;
          return acc;
        }, {} as Record<string, { sum: number; count: number }>);

        const result = Object.entries(dailySentiment).map(([day, data]) => ({
          date: day,
          averageSentiment: data.sum / data.count,
          messageCount: data.count,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'analytics_query_events': {
        const clientId = args.clientId as string;
        const eventType = args.eventType as string | undefined;
        const platform = args.platform as string | undefined;
        const since = args.since ? new Date(args.since as string) : undefined;
        const limit = Math.min((args.limit as number) || 100, 1000);

        const events = await prisma.event.findMany({
          where: {
            clientId,
            ...(eventType && { eventType: eventType as any }),
            ...(platform && { platform: platform as any }),
            ...(since && { createdAt: { gte: since } }),
          },
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            member: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                events.map((e) => ({
                  id: e.id,
                  eventType: e.eventType,
                  platform: e.platform,
                  member: e.member ? { id: e.member.id, displayName: e.member.displayName } : null,
                  eventData: e.eventData,
                  createdAt: e.createdAt.toISOString(),
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'analytics_get_growth': {
        const clientId = args.clientId as string;
        const period = (args.period as string) || 'week';

        const since = new Date();
        switch (period) {
          case 'day':
            since.setDate(since.getDate() - 1);
            break;
          case 'week':
            since.setDate(since.getDate() - 7);
            break;
          case 'month':
            since.setMonth(since.getMonth() - 1);
            break;
        }

        const joins = await prisma.event.count({
          where: {
            clientId,
            eventType: 'JOIN',
            createdAt: { gte: since },
          },
        });

        const leaves = await prisma.event.count({
          where: {
            clientId,
            eventType: 'LEAVE',
            createdAt: { gte: since },
          },
        });

        const totalMembers = await prisma.member.count({
          where: {
            clientId,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  period,
                  joins,
                  leaves,
                  netGrowth: joins - leaves,
                  totalMembers,
                  growthRate: totalMembers > 0 ? ((joins - leaves) / totalMembers) * 100 : 0,
                },
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
        uri: 'analytics://client/{clientId}/metrics',
        name: 'Client Metrics',
        description: 'Metrics for a client',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri.startsWith('analytics://client/')) {
    const match = uri.match(/analytics:\/\/client\/([^/]+)\/metrics/);
    if (match) {
      const [, clientId] = match;

      try {
        const metrics = await prisma.metric.findMany({
          where: { clientId },
          take: 100,
          orderBy: { createdAt: 'desc' },
        });

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                metrics.map((m) => ({
                  type: m.metricType,
                  value: m.value,
                  timestamp: m.createdAt.toISOString(),
                })),
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
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Analytics MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in Analytics MCP server:', error);
  process.exit(1);
});
