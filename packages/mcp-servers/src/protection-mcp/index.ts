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
  flagThreat,
  getThreats,
  updateThreat,
  checkImpersonation,
  generateThreatReport,
  getRecentThreats,
} from '@attrakt/core';

const server = new Server(
  {
    name: 'protection-mcp',
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
        name: 'protection_flag_threat',
        description: 'Flag a threat with severity and evidence',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            platform: { type: 'string', description: 'Platform (DISCORD, GITHUB, TWITTER)' },
            threatType: {
              type: 'string',
              description: 'Threat type (HARASSMENT, IMPERSONATION, SPAM, COORDINATED, FUD, OTHER)',
            },
            severity: { type: 'string', description: 'Severity (LOW, MEDIUM, HIGH, CRITICAL)' },
            content: { type: 'string', description: 'Threat content' },
            evidence: { type: 'object', description: 'Evidence data (JSON)' },
          },
          required: ['clientId', 'platform', 'threatType', 'severity', 'content'],
        },
      },
      {
        name: 'protection_get_threats',
        description: 'Get threats filtered by status, severity, type, and period',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            status: { type: 'string', description: 'Threat status filter' },
            severity: { type: 'string', description: 'Severity filter' },
            threatType: { type: 'string', description: 'Threat type filter' },
            since: { type: 'string', description: 'ISO date string' },
            limit: { type: 'number', description: 'Maximum number of results', default: 100 },
          },
          required: ['clientId'],
        },
      },
      {
        name: 'protection_update_threat',
        description: 'Update threat status and notes (scoped to the owning client)',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID that owns the threat' },
            threatId: { type: 'string', description: 'Threat ID' },
            status: { type: 'string', description: 'New status' },
            notes: { type: 'string', description: 'Notes' },
          },
          required: ['clientId', 'threatId'],
        },
      },
      {
        name: 'protection_collect_evidence',
        description: 'Collect evidence package for threats',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', description: 'Platform' },
            contentIds: { type: 'array', items: { type: 'string' }, description: 'Content IDs to collect' },
          },
          required: ['platform', 'contentIds'],
        },
      },
      {
        name: 'protection_check_impersonation',
        description: 'Check for potential impersonator accounts',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID' },
            username: { type: 'string', description: 'Username to check' },
          },
          required: ['clientId', 'username'],
        },
      },
      {
        name: 'protection_generate_report',
        description: 'Generate formatted report for platform submission (scoped to the owning client)',
        inputSchema: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'Client ID that owns the threat' },
            threatId: { type: 'string', description: 'Threat ID' },
            platform: { type: 'string', description: 'Target platform for report' },
          },
          required: ['clientId', 'threatId'],
        },
      },
    ],
  };
});

// Handle tool calls. Threat reads and writes are scoped by clientId so no
// client can read, mutate, or report another tenant's threats by id.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'protection_flag_threat':
        result = await flagThreat({
          clientId: args.clientId as string,
          platform: args.platform as never,
          threatType: args.threatType as never,
          severity: args.severity as never,
          content: args.content as string,
          evidence: args.evidence,
        });
        break;

      case 'protection_get_threats':
        result = await getThreats(args.clientId as string, {
          status: args.status as never,
          severity: args.severity as never,
          threatType: args.threatType as never,
          since: args.since as string | undefined,
          limit: args.limit as number | undefined,
        });
        break;

      case 'protection_update_threat':
        result = await updateThreat(args.clientId as string, args.threatId as string, {
          status: args.status as never,
          notes: args.notes as string | undefined,
        });
        break;

      case 'protection_collect_evidence':
        // For MVP, return basic evidence structure.
        // In production, this would use Puppeteer for screenshots, archive content, etc.
        result = {
          platform: args.platform,
          contentIds: args.contentIds,
          evidence: {
            screenshots: [],
            archives: [],
            collectedAt: new Date().toISOString(),
            note: 'Evidence collection not yet fully implemented',
          },
        };
        break;

      case 'protection_check_impersonation':
        result = await checkImpersonation(args.clientId as string, args.username as string);
        break;

      case 'protection_generate_report':
        result = await generateThreatReport(
          args.clientId as string,
          args.threatId as string,
          args.platform as string | undefined
        );
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
        uri: 'protection://threats/{clientId}',
        name: 'Threats',
        description: 'List of threats for a client',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri.startsWith('protection://threats/')) {
    const clientId = uri.replace('protection://threats/', '');
    try {
      const threats = await getRecentThreats(clientId);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(threats, null, 2),
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
  console.error('Protection MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in Protection MCP server:', error);
  process.exit(1);
});
