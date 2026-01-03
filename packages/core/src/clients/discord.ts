import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../config';
import { PlatformClientError } from '../errors';
import { log } from '../logger';

let discordClient: Client | null = null;

export function getDiscordClient(): Client {
  if (discordClient) {
    return discordClient;
  }

  try {
    if (!config.discordBotToken) {
      throw new PlatformClientError('DISCORD_BOT_TOKEN is required', 'DISCORD', false);
    }

    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    log.info({ platform: 'DISCORD' }, 'Discord client initialized');
    return discordClient;
  } catch (error) {
    log.error({ error, platform: 'DISCORD' }, 'Failed to initialize Discord client');
    throw error;
  }
}
