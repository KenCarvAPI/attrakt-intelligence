#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getMemberProfile,
  getMetrics,
  getTopContributors,
  getSentiment,
  queryEvents,
  getGrowth,
  getRecentMetrics,
} from '@attrakt/core';

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
        description: 'Get unified member profile across all platforms (scoped to a client)',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            memberId: { type: 'string', description: 'Member ID' },
          },
          required: ['clientId', 'memberId'],
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

// Handle tool calls. Every tool is scoped by an explicit clientId so the
// analytics surface can never return another tenant's data.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'analytics_get_member':
        result = await getMemberProfile(args.clientId as string, args.memberId as string);
        break;
      case 'analytics_get_metrics':
        result = await getMetrics(args.clientId as string, args.metric as string, args.period as never);
        break;
      case 'analytics_get_top_contributors':
        result = await getTopContributors(
          args.clientId as string,
          args.period as never,
          (args.limit as number) || 10
        );
        break;
      case 'analytics_get_sentiment':
        result = await getSentiment(args.clientId as string, args.period as never, args.channel as string | undefined);
        break;
      case 'analytics_query_events':
        result = await queryEvents(args.clientId as string, {
          eventType: args.eventType as string | undefined,
          platform: args.platform as string | undefined,
          since: args.since as string | undefined,
          limit: args.limit as number | undefined,
        });
        break;
      case 'analytics_get_growth':
        result = await getGrowth(args.clientId as string, args.period as never);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
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
        const metrics = await getRecentMetrics(clientId);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(metrics, null, 2),
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
