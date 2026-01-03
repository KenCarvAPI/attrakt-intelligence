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
        description: 'Update threat status and notes',
        inputSchema: {
          type: 'object',
          properties: {
            threatId: { type: 'string', description: 'Threat ID' },
            status: { type: 'string', description: 'New status' },
            notes: { type: 'string', description: 'Notes' },
          },
          required: ['threatId'],
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
        description: 'Generate formatted report for platform submission',
        inputSchema: {
          type: 'object',
          properties: {
            threatId: { type: 'string', description: 'Threat ID' },
            platform: { type: 'string', description: 'Target platform for report' },
          },
          required: ['threatId'],
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
      case 'protection_flag_threat': {
        const threat = await prisma.threat.create({
          data: {
            clientId: args.clientId as string,
            platform: args.platform as any,
            threatType: args.threatType as any,
            severity: args.severity as any,
            content: args.content as string,
            evidence: (args.evidence as any) || {},
            status: 'DETECTED',
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: threat.id,
                  status: threat.status,
                  severity: threat.severity,
                  createdAt: threat.createdAt.toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'protection_get_threats': {
        const threats = await prisma.threat.findMany({
          where: {
            clientId: args.clientId as string,
            ...(args.status && { status: args.status as any }),
            ...(args.severity && { severity: args.severity as any }),
            ...(args.threatType && { threatType: args.threatType as any }),
            ...(args.since && { createdAt: { gte: new Date(args.since as string) } }),
          },
          take: Math.min((args.limit as number) || 100, 1000),
          orderBy: {
            createdAt: 'desc',
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                threats.map((t) => ({
                  id: t.id,
                  platform: t.platform,
                  threatType: t.threatType,
                  severity: t.severity,
                  status: t.status,
                  content: t.content.substring(0, 200),
                  createdAt: t.createdAt.toISOString(),
                  resolvedAt: t.resolvedAt?.toISOString(),
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'protection_update_threat': {
        const updateData: any = {};
        if (args.status) updateData.status = args.status as any;
        if (args.notes) updateData.notes = args.notes as string;
        if (args.status === 'RESOLVED') updateData.resolvedAt = new Date();

        const threat = await prisma.threat.update({
          where: { id: args.threatId as string },
          data: updateData,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: threat.id,
                  status: threat.status,
                  notes: threat.notes,
                  updatedAt: threat.updatedAt.toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'protection_collect_evidence': {
        // For MVP, return basic evidence structure
        // In production, this would use Puppeteer for screenshots, archive content, etc.
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  platform: args.platform,
                  contentIds: args.contentIds,
                  evidence: {
                    screenshots: [],
                    archives: [],
                    collectedAt: new Date().toISOString(),
                    note: 'Evidence collection not yet fully implemented',
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'protection_check_impersonation': {
        const username = (args.username as string).toLowerCase().replace('@', '');

        // Check for similar usernames in platform identities
        const identities = await prisma.platformIdentity.findMany({
          where: {
            member: {
              clientId: args.clientId as string,
            },
            username: {
              contains: username,
              mode: 'insensitive',
            },
          },
          include: {
            member: true,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  username,
                  potentialImpersonators: identities
                    .filter((i) => i.username.toLowerCase() !== username)
                    .map((i) => ({
                      platform: i.platform,
                      username: i.username,
                      memberId: i.memberId,
                    })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'protection_generate_report': {
        const threat = await prisma.threat.findUnique({
          where: { id: args.threatId as string },
        });

        if (!threat) {
          throw new Error(`Threat ${args.threatId} not found`);
        }

        const platform = (args.platform as string) || threat.platform;

        // Generate platform-specific report format
        let report: string;
        if (platform === 'TWITTER') {
          report = `Twitter Abuse Report\n\nType: ${threat.threatType}\nSeverity: ${threat.severity}\n\nContent:\n${threat.content}\n\nEvidence: ${JSON.stringify(threat.evidence, null, 2)}`;
        } else if (platform === 'DISCORD') {
          report = `Discord Trust & Safety Report\n\nType: ${threat.threatType}\nSeverity: ${threat.severity}\n\nContent:\n${threat.content}\n\nEvidence: ${JSON.stringify(threat.evidence, null, 2)}`;
        } else {
          report = `Report for ${platform}\n\nType: ${threat.threatType}\nSeverity: ${threat.severity}\n\nContent:\n${threat.content}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  threatId: threat.id,
                  platform,
                  report,
                  generatedAt: new Date().toISOString(),
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
      const threats = await prisma.threat.findMany({
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
              threats.map((t) => ({
                id: t.id,
                type: t.threatType,
                severity: t.severity,
                status: t.status,
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
