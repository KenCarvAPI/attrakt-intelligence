/**
 * Discord DB queries — scoped to a single `clientId`.
 * Backs the discord MCP server's database-backed search.
 */

import { prisma } from '../prisma';

export async function searchDiscordMessages(
  clientId: string,
  params: { query: string; authorId?: string; channelId?: string; limit?: number }
) {
  const limit = Math.min(params.limit || 25, 100);

  const messages = await prisma.message.findMany({
    where: {
      clientId,
      platform: 'DISCORD',
      content: { contains: params.query, mode: 'insensitive' },
      ...(params.authorId
        ? {
            member: {
              clientId,
              platformIdentities: {
                some: { platform: 'DISCORD', platformUserId: params.authorId },
              },
            },
          }
        : {}),
      ...(params.channelId ? { channelId: params.channelId } : {}),
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      member: {
        include: { platformIdentities: { where: { platform: 'DISCORD' } } },
      },
    },
  });

  return messages.map((msg) => ({
    id: msg.id,
    content: msg.content,
    channelId: msg.channelId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.member?.platformIdentities[0]?.username,
  }));
}
