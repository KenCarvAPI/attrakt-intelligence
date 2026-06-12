/**
 * Community Pulse Agent
 * Generates daily digests with community insights, metrics, and anomalies
 */

import cron from 'node-cron';
import { Anthropic } from '@anthropic-ai/sdk';
import { prisma, config, log } from '@attrakt/core';
import { addJob } from '@attrakt/api';
import type { AgentPulseJobData } from '@attrakt/api/src/queues/types';

if (!config.anthropicApiKey) {
  throw new Error('ANTHROPIC_API_KEY is required');
}

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Generate daily digest for a client
 */
async function generateDailyDigest(clientId: string, date: Date = new Date()) {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date(date);
  today.setHours(0, 0, 0, 0);

  // Fetch metrics
  const metrics = await prisma.metric.findMany({
    where: {
      clientId,
      metricType: {
        in: ['DAU', 'MESSAGE_VOLUME', 'SENTIMENT_AVERAGE', 'GROWTH_RATE', 'MEMBER_COUNT'],
      },
      createdAt: {
        gte: yesterday,
        lt: today,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  });

  // Get previous day's metrics for comparison
  const dayBefore = new Date(yesterday);
  dayBefore.setDate(dayBefore.getDate() - 1);

  const previousMetrics = await prisma.metric.findMany({
    where: {
      clientId,
      metricType: {
        in: ['DAU', 'MESSAGE_VOLUME', 'SENTIMENT_AVERAGE'],
      },
      createdAt: {
        gte: dayBefore,
        lt: yesterday,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  // Get top contributors
  const topContributors = await prisma.member.findMany({
    where: {
      clientId,
      messages: {
        some: {
          createdAt: { gte: yesterday },
        },
      },
    },
    include: {
      _count: {
        select: {
          messages: {
            where: {
              createdAt: { gte: yesterday },
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
    take: 10,
  });

  // Get recent messages for highlights
  const recentMessages = await prisma.message.findMany({
    where: {
      clientId,
      createdAt: { gte: yesterday },
    },
    include: {
      member: {
        select: {
          displayName: true,
          platformIdentities: {
            select: {
              username: true,
              platform: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
  });

  // Detect anomalies
  const anomalies = detectAnomalies(metrics, previousMetrics);

  // Generate digest using Claude
  const digest = await generateDigestWithClaude({
    metrics,
    previousMetrics,
    topContributors,
    recentMessages,
    anomalies,
    date: yesterday,
  });

  // Store digest
  await prisma.metric.create({
    data: {
      clientId,
      metricType: 'MESSAGE_VOLUME', // Using as generic storage type
      value: 0,
      metadata: {
        type: 'daily_digest',
        content: digest,
        date: yesterday.toISOString(),
      },
      createdAt: date,
    },
  });

  // Deliver digest
  await deliverDigest(clientId, digest);

  log.info({ clientId, date: yesterday.toISOString() }, 'Generated daily digest');
}

/**
 * Detect anomalies in metrics
 */
function detectAnomalies(
  currentMetrics: Array<{ metricType: string; value: number; createdAt: Date }>,
  previousMetrics: Array<{ metricType: string; value: number; createdAt: Date }>
): string[] {
  const anomalies: string[] = [];

  // Calculate averages
  const currentAvg: Record<string, number> = {};
  const previousAvg: Record<string, number> = {};

  for (const metric of currentMetrics) {
    if (!currentAvg[metric.metricType]) {
      currentAvg[metric.metricType] = 0;
    }
    currentAvg[metric.metricType] += metric.value;
  }

  for (const metric of previousMetrics) {
    if (!previousAvg[metric.metricType]) {
      previousAvg[metric.metricType] = 0;
    }
    previousAvg[metric.metricType] += metric.value;
  }

  // Check for significant changes (2x standard deviation approximation)
  if (currentAvg['MESSAGE_VOLUME'] && previousAvg['MESSAGE_VOLUME']) {
    const change = Math.abs(
      (currentAvg['MESSAGE_VOLUME'] - previousAvg['MESSAGE_VOLUME']) / previousAvg['MESSAGE_VOLUME']
    );
    if (change > 0.5) {
      // 50% change
      anomalies.push(
        `Message volume ${currentAvg['MESSAGE_VOLUME'] > previousAvg['MESSAGE_VOLUME'] ? 'increased' : 'decreased'} by ${(change * 100).toFixed(0)}%`
      );
    }
  }

  if (currentAvg['SENTIMENT_AVERAGE'] && previousAvg['SENTIMENT_AVERAGE']) {
    const sentimentDrop = currentAvg['SENTIMENT_AVERAGE'] - previousAvg['SENTIMENT_AVERAGE'];
    if (sentimentDrop < -0.2) {
      // 20% sentiment drop
      anomalies.push(`Sentiment dropped significantly (${sentimentDrop.toFixed(2)})`);
    }
  }

  return anomalies;
}

/**
 * Generate digest using Claude
 */
async function generateDigestWithClaude(context: any): Promise<string> {
  const prompt = `Generate a daily community digest for ${context.date.toLocaleDateString()}. 

Key Metrics (vs previous day):
- DAU: ${getLatestMetric(context.metrics, 'DAU')?.value || 'N/A'}
- Message Volume: ${getLatestMetric(context.metrics, 'MESSAGE_VOLUME')?.value || 'N/A'}
- Average Sentiment: ${getLatestMetric(context.metrics, 'SENTIMENT_AVERAGE')?.value?.toFixed(2) || 'N/A'}
- Member Count: ${getLatestMetric(context.metrics, 'MEMBER_COUNT')?.value || 'N/A'}

Top Contributors:
${context.topContributors
  .map((c: any, i: number) => `${i + 1}. ${c.displayName || 'Unknown'} - ${c._count.messages} messages`)
  .join('\n')}

Recent Activity Highlights:
${context.recentMessages
  .slice(0, 5)
  .map((m: any) => `- ${m.member?.displayName || 'Unknown'}: ${m.content.substring(0, 100)}...`)
  .join('\n')}

Anomalies:
${context.anomalies.length > 0 ? context.anomalies.map((a: string) => `- ${a}`).join('\n') : 'None detected'}

Generate a concise, professional daily digest in markdown format with sections:
1. 📊 Key Metrics (with comparison to previous day)
2. 💬 Activity Highlights
3. 👥 Notable Contributors
4. 📈 Trending Topics (infer from messages)
5. ⚠️ Anomalies/Concerns
6. 📋 Suggested Actions

Keep it data-driven, professional, and actionable.`;

  try {
    const message = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch (error) {
    log.error({ error }, 'Error generating digest with Claude, using fallback');
    // Fallback to basic template
    return generateBasicDigest(context);
  }
}

function getLatestMetric(metrics: any[], type: string) {
  return metrics.find((m) => m.metricType === type);
}

function generateBasicDigest(context: any): string {
  return `# Daily Community Digest - ${context.date.toLocaleDateString()}

## Key Metrics
- DAU: ${getLatestMetric(context.metrics, 'DAU')?.value || 'N/A'}
- Message Volume: ${getLatestMetric(context.metrics, 'MESSAGE_VOLUME')?.value || 'N/A'}
- Average Sentiment: ${getLatestMetric(context.metrics, 'SENTIMENT_AVERAGE')?.value?.toFixed(2) || 'N/A'}

## Top Contributors
${context.topContributors.map((c: any, i: number) => `${i + 1}. ${c.displayName || 'Unknown'}`).join('\n')}

## Anomalies
${context.anomalies.length > 0 ? context.anomalies.join('\n') : 'None detected'}
`;
}

/**
 * Deliver digest via Slack and/or email
 */
async function deliverDigest(clientId: string, digest: string) {
  // Slack delivery
  if (config.slackWebhookUrl) {
    try {
      await fetch(config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Daily Community Pulse',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: digest,
              },
            },
          ],
        }),
      });
      log.info({ clientId }, 'Digest delivered to Slack');
    } catch (error) {
      log.error({ error, clientId }, 'Error delivering digest to Slack');
    }
  }

  // Email delivery (Resend)
  if (config.resendApiKey && config.resendFromEmail && config.clientEmail) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.resendApiKey}`,
        },
        body: JSON.stringify({
          from: config.resendFromEmail,
          to: config.clientEmail,
          subject: 'Daily Community Pulse',
          html: digest.replace(/\n/g, '<br>'),
        }),
      });
      log.info({ clientId, to: config.clientEmail }, 'Digest delivered via email');
    } catch (error) {
      log.error({ error, clientId }, 'Error delivering digest via email');
    }
  }
}

// Schedule daily digest at 9am UTC
log.info({}, 'Community Pulse Agent starting');

const clientId = config.defaultClientId;

// Run daily at 9am UTC
cron.schedule('0 9 * * *', async () => {
  log.info({ clientId }, 'Generating daily digest');
  await generateDailyDigest(clientId).catch((error) => {
    log.error({ error, clientId }, 'Failed to generate daily digest');
  });
});

// Also support manual trigger via job queue
async function processPulseJob(clientId: string, date?: string) {
  const digestDate = date ? new Date(date) : new Date();
  await generateDailyDigest(clientId, digestDate);
}

// Export for use in worker
export { processPulseJob, generateDailyDigest };

// Keep process alive
log.info({ schedule: 'daily at 9am UTC' }, 'Community Pulse Agent scheduled');
process.on('SIGINT', () => {
  log.info({}, 'Shutting down Community Pulse Agent');
  process.exit(0);
});
