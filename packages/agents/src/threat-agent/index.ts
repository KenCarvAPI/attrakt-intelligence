/**
 * Threat Detection Agent
 * Scans messages every 15 minutes for threats using Claude
 */

import cron from 'node-cron';
import { Anthropic } from '@anthropic-ai/sdk';
import { prisma, config, log, getActiveClients } from '@attrakt/core';
import { addJob } from '@attrakt/api';
import type { AgentThreatScanJobData } from '@attrakt/api/src/queues/types';

if (!config.anthropicApiKey) {
  throw new Error('ANTHROPIC_API_KEY is required');
}

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Scan for threats in recent messages
 */
async function scanForThreats(clientId: string, platform?: 'DISCORD' | 'GITHUB' | 'TWITTER') {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  // Fetch recent messages
  const messages = await prisma.message.findMany({
    where: {
      clientId,
      ...(platform && { platform }),
      createdAt: { gte: fifteenMinutesAgo },
    },
    include: {
      member: {
        include: {
          platformIdentities: true,
        },
      },
    },
    take: 100,
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (messages.length === 0) {
    return;
  }

  // Analyze messages in batches using Claude
  for (const message of messages) {
    try {
      const threatAnalysis = await analyzeThreat(message.content, {
        author: message.member?.displayName || 'Unknown',
        platform: message.platform,
        messageId: message.id,
      });

      if (threatAnalysis.isThreat) {
        // Flag threat
        await prisma.threat.create({
          data: {
            clientId,
            platform: message.platform,
            threatType: threatAnalysis.threatType as any,
            severity: threatAnalysis.severity as any,
            content: message.content,
            evidence: {
              messageId: message.id,
              authorId: message.memberId,
              platform: message.platform,
              analysis: threatAnalysis.reason,
            },
            status: 'DETECTED',
          },
        });

        // Alert if high/critical severity
        if (threatAnalysis.severity === 'HIGH' || threatAnalysis.severity === 'CRITICAL') {
          await sendAlert(clientId, {
            severity: threatAnalysis.severity,
            threatType: threatAnalysis.threatType,
            content: message.content.substring(0, 200),
            platform: message.platform,
          });
        }

        log.warn(
          {
            threatType: threatAnalysis.threatType,
            severity: threatAnalysis.severity,
            messageId: message.id,
            clientId,
            platform,
          },
          'Threat detected'
        );
      }
    } catch (error) {
      log.error({ error, messageId: message.id, clientId, platform }, 'Error analyzing message for threats');
    }
  }
}

/**
 * Analyze message content for threats using Claude
 */
async function analyzeThreat(
  content: string,
  context: { author: string; platform: string; messageId: string }
): Promise<{
  isThreat: boolean;
  threatType?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason?: string;
}> {
  const prompt = `Analyze the following message for potential threats. Consider:

1. Harassment: personal attacks, slurs, threats of violence, targeted abuse
2. Impersonation: claims to be official account, similar username patterns
3. Spam: repeated messages, suspicious links, promotional content
4. Coordinated: unusual volume from new accounts, same message patterns
5. FUD: spreading fear/uncertainty/doubt with negative sentiment

Message content: "${content}"
Author: ${context.author}
Platform: ${context.platform}

Respond in JSON format:
{
  "isThreat": boolean,
  "threatType": "HARASSMENT" | "IMPERSONATION" | "SPAM" | "COORDINATED" | "FUD" | "OTHER" | null,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null,
  "reason": "brief explanation"
}

Be conservative - only flag clear threats. Avoid false positives.`;

  try {
    const message = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const analysis = JSON.parse(responseText);

    return {
      isThreat: analysis.isThreat || false,
      threatType: analysis.threatType,
      severity: analysis.severity,
      reason: analysis.reason,
    };
  } catch (error) {
    log.error({ error }, 'Error analyzing threat with Claude, using fallback');
    // Fallback: basic keyword detection
    return basicThreatDetection(content);
  }
}

/**
 * Basic keyword-based threat detection (fallback)
 */
function basicThreatDetection(content: string): {
  isThreat: boolean;
  threatType?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason?: string;
} {
  const lowerContent = content.toLowerCase();

  const harassmentKeywords = ['kill', 'die', 'hate you', 'fuck you', 'stupid', 'idiot'];
  const spamKeywords = ['click here', 'free money', 'limited offer', 'act now'];

  if (harassmentKeywords.some((kw) => lowerContent.includes(kw))) {
    return {
      isThreat: true,
      threatType: 'HARASSMENT',
      severity: 'MEDIUM',
      reason: 'Contains harassment keywords',
    };
  }

  if (spamKeywords.some((kw) => lowerContent.includes(kw))) {
    return {
      isThreat: true,
      threatType: 'SPAM',
      severity: 'LOW',
      reason: 'Contains spam keywords',
    };
  }

  return { isThreat: false };
}

/**
 * Send alert for high/critical threats
 */
async function sendAlert(
  clientId: string,
  threat: {
    severity: string;
    threatType: string;
    content: string;
    platform: string;
  }
) {
  // Slack alert
  if (config.slackWebhookUrl) {
    try {
      await fetch(config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 ${threat.severity} Threat Detected`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Severity:* ${threat.severity}\n*Type:* ${threat.threatType}\n*Platform:* ${threat.platform}\n*Content:* ${threat.content}`,
              },
            },
          ],
        }),
      });
      log.info({ clientId, severity: threat.severity, threatType: threat.threatType }, 'Alert sent to Slack');
    } catch (error) {
      log.error({ error, clientId }, 'Error sending Slack alert');
    }
  }

  // Email alert (optional)
  if (config.resendApiKey && config.resendFromEmail && config.clientEmail) {
    try {
      const emailContent = `
🚨 ${threat.severity} Threat Detected

Severity: ${threat.severity}
Type: ${threat.threatType}
Platform: ${threat.platform}
Content: ${threat.content}

Please review this threat in your Attrakt dashboard and take appropriate action.
      `.trim();

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.resendApiKey}`,
        },
        body: JSON.stringify({
          from: config.resendFromEmail,
          to: config.clientEmail,
          subject: `🚨 ${threat.severity} Threat Detected: ${threat.threatType}`,
          html: emailContent.replace(/\n/g, '<br>'),
          text: emailContent,
        }),
      });
      log.info({ clientId, severity: threat.severity, threatType: threat.threatType, to: config.clientEmail }, 'Alert sent via email');
    } catch (error) {
      log.error({ error, clientId }, 'Error sending email alert');
    }
  }
}

// Process threat scan job
async function processThreatScanJob(clientId: string, platform?: 'DISCORD' | 'GITHUB' | 'TWITTER') {
  await scanForThreats(clientId, platform);
}

// Schedule threat scans every 15 minutes
log.info({}, 'Threat Detection Agent starting');

// Run every 15 minutes, scanning each active client (multi-tenant).
cron.schedule('*/15 * * * *', async () => {
  const clients = await getActiveClients();
  log.info({ clientCount: clients.length }, 'Running threat scan for active clients');
  for (const client of clients) {
    await scanForThreats(client.id).catch((error) => {
      log.error({ error, clientId: client.id }, 'Failed to scan for threats');
    });
  }
});

// Export for use in worker
export { processThreatScanJob, scanForThreats };

// Keep process alive
log.info({ schedule: 'every 15 minutes' }, 'Threat Detection Agent scheduled');
process.on('SIGINT', () => {
  log.info({}, 'Shutting down Threat Detection Agent');
  process.exit(0);
});
