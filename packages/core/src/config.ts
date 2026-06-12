import { z } from 'zod';

const ConfigSchema = z.object({
  // Application
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  defaultClientId: z.string().default('default'),
  port: z.coerce.number().default(3001),
  githubWebhookPort: z.coerce.number().default(3002),

  // Database
  databaseUrl: z.string().url(),

  // Redis
  redisUrl: z.string().url(),

  // Discord
  discordBotToken: z.string().optional(),
  discordClientId: z.string().optional(),
  discordClientSecret: z.string().optional(),

  // GitHub
  githubToken: z.string().optional(),
  githubAppId: z.string().optional(),
  githubPrivateKey: z.string().optional(),
  githubWebhookSecret: z.string().optional(),
  githubClientId: z.string().optional(),
  githubClientSecret: z.string().optional(),

  // Twitter
  twitterBearerToken: z.string().optional(),
  twitterClientId: z.string().optional(),
  twitterClientSecret: z.string().optional(),
  twitterTrackedAccounts: z.string().default(''),
  twitterPollIntervalMs: z.coerce.number().default(900000),

  // Discourse
  discourseBaseUrl: z.string().url().optional(),
  discourseApiKey: z.string().optional(),
  discourseApiUsername: z.string().optional(),
  // Comma-separated category slugs treated as governance categories
  discourseGovernanceCategories: z.string().default(''),
  discoursePollIntervalMs: z.coerce.number().default(900000),
  // When true, the poller logs what would be persisted instead of enqueueing jobs
  discourseDryRun: z.coerce.boolean().default(false),

  // Anthropic (Claude)
  anthropicApiKey: z.string().optional(),

  // Slack
  slackWebhookUrl: z.string().url().optional(),

  // Email (Resend)
  resendApiKey: z.string().optional(),
  resendFromEmail: z.string().email().optional(),
  clientEmail: z.string().email().optional(),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  serviceName: z.string().default('attrakt'),

  // Storage
  storageEndpoint: z.string().url().optional(),
  storageAccessKeyId: z.string().optional(),
  storageSecretAccessKey: z.string().optional(),
  storageBucket: z.string().optional(),
});

type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  try {
    return ConfigSchema.parse({
      nodeEnv: process.env.NODE_ENV,
      defaultClientId: process.env.DEFAULT_CLIENT_ID,
      port: process.env.PORT,
      githubWebhookPort: process.env.GITHUB_WEBHOOK_PORT,
      databaseUrl: process.env.DATABASE_URL,
      redisUrl: process.env.REDIS_URL,
      discordBotToken: process.env.DISCORD_BOT_TOKEN,
      discordClientId: process.env.DISCORD_CLIENT_ID,
      discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
      githubToken: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT,
      githubAppId: process.env.GITHUB_APP_ID,
      githubPrivateKey: process.env.GITHUB_PRIVATE_KEY,
      githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      githubClientId: process.env.GITHUB_CLIENT_ID,
      githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
      twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
      twitterClientId: process.env.TWITTER_CLIENT_ID,
      twitterClientSecret: process.env.TWITTER_CLIENT_SECRET,
      twitterTrackedAccounts: process.env.TWITTER_TRACKED_ACCOUNTS,
      twitterPollIntervalMs: process.env.TWITTER_POLL_INTERVAL_MS,
      discourseBaseUrl: process.env.DISCOURSE_BASE_URL,
      discourseApiKey: process.env.DISCOURSE_API_KEY,
      discourseApiUsername: process.env.DISCOURSE_API_USERNAME,
      discourseGovernanceCategories: process.env.DISCOURSE_GOVERNANCE_CATEGORIES,
      discoursePollIntervalMs: process.env.DISCOURSE_POLL_INTERVAL_MS,
      discourseDryRun: process.env.DISCOURSE_DRY_RUN,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      resendApiKey: process.env.RESEND_API_KEY,
      resendFromEmail: process.env.RESEND_FROM_EMAIL,
      clientEmail: process.env.CLIENT_EMAIL,
      logLevel: process.env.LOG_LEVEL,
      serviceName: process.env.SERVICE_NAME,
      storageEndpoint: process.env.STORAGE_ENDPOINT,
      storageAccessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
      storageSecretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
      storageBucket: process.env.STORAGE_BUCKET,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${missing}`);
    }
    throw error;
  }
}

export const config = loadConfig();
export type { Config };
