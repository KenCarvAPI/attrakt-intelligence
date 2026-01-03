#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { prisma, config, log } from '@attrakt/core';

// Discord client for MCP server (separate instance from bot)
// MCP servers run as separate processes, so they need their own client instance
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

await discordClient.login(config.discordBotToken!);

const server = new Server(
  {
    name: 'discord-mcp',
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
        name: 'discord_read_messages',
        description: 'Read messages from a Discord channel',
        inputSchema: {
          type: 'object',
          properties: {
            channelId: { type: 'string', description: 'Discord channel ID' },
            limit: { type: 'number', description: 'Number of messages to fetch (max 100)', default: 50 },
            before: { type: 'string', description: 'Message ID to fetch messages before' },
            after: { type: 'string', description: 'Message ID to fetch messages after' },
          },
          required: ['channelId'],
        },
      },
      {
        name: 'discord_get_member',
        description: 'Get member information from a Discord guild',
        inputSchema: {
          type: 'object',
          properties: {
            guildId: { type: 'string', description: 'Discord guild ID' },
            userId: { type: 'string', description: 'Discord user ID' },
          },
          required: ['guildId', 'userId'],
        },
      },
      {
        name: 'discord_list_channels',
        description: 'List all channels in a Discord guild',
        inputSchema: {
          type: 'object',
          properties: {
            guildId: { type: 'string', description: 'Discord guild ID' },
          },
          required: ['guildId'],
        },
      },
      {
        name: 'discord_get_guild_stats',
        description: 'Get statistics for a Discord guild',
        inputSchema: {
          type: 'object',
          properties: {
            guildId: { type: 'string', description: 'Discord guild ID' },
          },
          required: ['guildId'],
        },
      },
      {
        name: 'discord_search_messages',
        description: 'Search messages in a Discord guild',
        inputSchema: {
          type: 'object',
          properties: {
            guildId: { type: 'string', description: 'Discord guild ID' },
            query: { type: 'string', description: 'Search query' },
            authorId: { type: 'string', description: 'Filter by author user ID' },
            channelId: { type: 'string', description: 'Filter by channel ID' },
            limit: { type: 'number', description: 'Maximum number of results', default: 25 },
          },
          required: ['guildId', 'query'],
        },
      },
      {
        name: 'discord_send_message',
        description: 'Send a message to a Discord channel (requires approval)',
        inputSchema: {
          type: 'object',
          properties: {
            channelId: { type: 'string', description: 'Discord channel ID' },
            content: { type: 'string', description: 'Message content' },
          },
          required: ['channelId', 'content'],
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
      case 'discord_read_messages': {
        const channelId = args.channelId as string;
        const limit = Math.min((args.limit as number) || 50, 100);
        const before = args.before as string | undefined;
        const after = args.after as string | undefined;

        const channel = await discordClient.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          throw new Error(`Channel ${channelId} not found or not a text channel`);
        }

        const messages = await channel.messages.fetch({
          limit,
          before,
          after,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                Array.from(messages.values()).map((msg) => ({
                  id: msg.id,
                  content: msg.content,
                  author: {
                    id: msg.author.id,
                    username: msg.author.username,
                    displayName: msg.author.displayName,
                  },
                  channelId: msg.channelId,
                  createdAt: msg.createdAt.toISOString(),
                  editedAt: msg.editedAt?.toISOString(),
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'discord_get_member': {
        const guildId = args.guildId as string;
        const userId = args.userId as string;

        const guild = await discordClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: member.id,
                  username: member.user.username,
                  displayName: member.displayName,
                  joinedAt: member.joinedAt?.toISOString(),
                  roles: member.roles.cache.map((role) => ({
                    id: role.id,
                    name: role.name,
                  })),
                  avatar: member.user.displayAvatarURL(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'discord_list_channels': {
        const guildId = args.guildId as string;
        const guild = await discordClient.guilds.fetch(guildId);
        const channels = await guild.channels.fetch();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                Array.from(channels.values())
                  .filter((ch) => ch.isTextBased())
                  .map((ch) => ({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                    parentId: ch.parentId,
                  })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'discord_get_guild_stats': {
        const guildId = args.guildId as string;
        const guild = await discordClient.guilds.fetch(guildId);
        await guild.members.fetch(); // Fetch all members

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: guild.id,
                  name: guild.name,
                  memberCount: guild.memberCount,
                  onlineCount: guild.members.cache.filter((m) => m.presence?.status === 'online').size,
                  channelCount: guild.channels.cache.size,
                  boostLevel: guild.premiumTier,
                  createdAt: guild.createdAt.toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'discord_search_messages': {
        const guildId = args.guildId as string;
        const query = args.query as string;
        const authorId = args.authorId as string | undefined;
        const channelId = args.channelId as string | undefined;
        const limit = Math.min((args.limit as number) || 25, 100);

        // Search in database for messages matching query
        const messages = await prisma.message.findMany({
          where: {
            platform: 'DISCORD',
            content: {
              contains: query,
              mode: 'insensitive',
            },
            ...(authorId && {
              member: {
                platformIdentities: {
                  some: {
                    platform: 'DISCORD',
                    platformUserId: authorId,
                  },
                },
              },
            }),
            ...(channelId && { channelId }),
          },
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            member: {
              include: {
                platformIdentities: {
                  where: {
                    platform: 'DISCORD',
                  },
                },
              },
            },
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                messages.map((msg) => ({
                  id: msg.id,
                  content: msg.content,
                  channelId: msg.channelId,
                  createdAt: msg.createdAt.toISOString(),
                  author: msg.member?.platformIdentities[0]?.username,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'discord_send_message': {
        // NOTE: Message sending is currently disabled for safety
        // In production, this should:
        // 1. Add message to an approval queue (database table or BullMQ queue)
        // 2. Require admin approval via dashboard or API
        // 3. Only send after approval is granted
        // 4. Log all sent messages for audit trail
        // For MVP, we return a queued status but don't actually send
        const channelId = args.channelId as string;
        const content = args.content as string;

        log.info({ channelId, contentLength: content.length }, 'Discord send_message requested (not implemented - requires approval queue)');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'queued_for_approval',
                  channelId,
                  content,
                  message: 'Message sending requires approval queue implementation. This feature is not yet available.',
                  note: 'To implement: Create approval queue table, add admin approval endpoint, implement message sending after approval.',
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
        uri: 'discord://guild/{guildId}/members',
        name: 'Discord Guild Members',
        description: 'List of members in a Discord guild',
        mimeType: 'application/json',
      },
      {
        uri: 'discord://guild/{guildId}/channels',
        name: 'Discord Guild Channels',
        description: 'List of channels in a Discord guild',
        mimeType: 'application/json',
      },
      {
        uri: 'discord://guild/{guildId}/stats',
        name: 'Discord Guild Stats',
        description: 'Statistics for a Discord guild',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri.startsWith('discord://guild/')) {
    const parts = uri.replace('discord://guild/', '').split('/');
    const guildId = parts[0];
    const resource = parts[1];

    try {
      const guild = await discordClient.guilds.fetch(guildId);

      if (resource === 'members') {
        await guild.members.fetch();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                Array.from(guild.members.cache.values()).map((member) => ({
                  id: member.id,
                  username: member.user.username,
                  displayName: member.displayName,
                  joinedAt: member.joinedAt?.toISOString(),
                })),
                null,
                2
              ),
            },
          ],
        };
      } else if (resource === 'channels') {
        const channels = await guild.channels.fetch();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                Array.from(channels.values())
                  .filter((ch) => ch.isTextBased())
                  .map((ch) => ({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                  })),
                null,
                2
              ),
            },
          ],
        };
      } else if (resource === 'stats') {
        await guild.members.fetch();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  id: guild.id,
                  name: guild.name,
                  memberCount: guild.memberCount,
                  onlineCount: guild.members.cache.filter((m) => m.presence?.status === 'online').size,
                },
                null,
                2
              ),
            },
          ],
        };
      }
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
  console.error('Discord MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in Discord MCP server:', error);
  process.exit(1);
});
