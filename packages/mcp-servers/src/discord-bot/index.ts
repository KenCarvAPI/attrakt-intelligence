import { GatewayIntentBits, Events, Message, GuildMember } from 'discord.js';
import { addJob, getDiscordClient, config, log } from '@attrakt/core';
import type { JobData } from '@attrakt/api/src/queues/types';
import type { DiscordMessagePayload, DiscordMemberPayload, DiscordReactionPayload } from '@attrakt/core/src/types/platforms';

const client = getDiscordClient();

// Event: Message created
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  // Extract client ID from guild (for multi-tenant support)
  // In MVP, we'll use a simple mapping or config
  const clientId = config.defaultClientId;

  const payload: DiscordMessagePayload = {
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    authorId: message.author.id,
    authorUsername: message.author.username,
    authorDisplayName: message.author.displayName,
    content: message.content,
    embeds: message.embeds.map((e) => ({
      title: e.title || undefined,
      description: e.description || undefined,
      url: e.url || undefined,
    })),
    attachments: message.attachments.map((a) => ({
      url: a.url,
      filename: a.name,
    })),
    timestamp: message.createdTimestamp,
    editedTimestamp: message.editedTimestamp || null,
  };

  await addJob('ingest:discord', {
    event: 'messageCreate',
    payload,
    clientId,
  } as JobData);
});

// Event: Guild member added
client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
  const clientId = config.defaultClientId;

  const payload: DiscordMemberPayload = {
    userId: member.id,
    username: member.user.username,
    displayName: member.displayName || undefined,
    guildId: member.guild.id,
    joinedTimestamp: member.joinedTimestamp?.getTime(),
  };

  await addJob('ingest:discord', {
    event: 'guildMemberAdd',
    payload,
    clientId,
  } as JobData);
});

// Event: Guild member removed
client.on(Events.GuildMemberRemove, async (member: GuildMember) => {
  const clientId = config.defaultClientId;

  const payload: DiscordMemberPayload = {
    userId: member.id,
    username: member.user.username,
    guildId: member.guild.id,
    leftTimestamp: Date.now(),
  };

  await addJob('ingest:discord', {
    event: 'guildMemberRemove',
    payload,
    clientId,
  } as JobData);
});

// Event: Message reaction added
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  const clientId = config.defaultClientId;

  const payload: DiscordReactionPayload = {
    messageId: reaction.message.id,
    channelId: reaction.message.channelId,
    guildId: reaction.message.guildId || null,
    userId: user.id,
    emoji: reaction.emoji.toString(),
    timestamp: Date.now(),
  };

  await addJob('ingest:discord', {
    event: 'messageReactionAdd',
    payload,
    clientId,
  } as JobData);
});

client.once(Events.ClientReady, () => {
  log.info({ botTag: client.user?.tag }, 'Discord bot ready');
});

client.login(config.discordBotToken!).catch((error) => {
  log.error({ error }, 'Failed to login to Discord');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  client.destroy();
  process.exit(0);
});
