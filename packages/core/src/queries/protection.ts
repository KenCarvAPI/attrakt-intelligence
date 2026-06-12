/**
 * Protection / threat queries — every function is scoped to a single `clientId`.
 *
 * Backs the protection MCP server. Threat reads *and* mutations are tenant
 * scoped so one client can never read, update, or report another client's
 * threats by id.
 */

import { prisma } from '../prisma';
import type { Platform, ThreatType, ThreatSeverity, ThreatStatus } from '@prisma/client';

export async function flagThreat(input: {
  clientId: string;
  platform: Platform;
  threatType: ThreatType;
  severity: ThreatSeverity;
  content: string;
  evidence?: unknown;
}) {
  const threat = await prisma.threat.create({
    data: {
      clientId: input.clientId,
      platform: input.platform,
      threatType: input.threatType,
      severity: input.severity,
      content: input.content,
      evidence: (input.evidence as never) || {},
      status: 'DETECTED',
    },
  });

  return {
    id: threat.id,
    status: threat.status,
    severity: threat.severity,
    createdAt: threat.createdAt.toISOString(),
  };
}

export async function getThreats(
  clientId: string,
  filters: {
    status?: ThreatStatus;
    severity?: ThreatSeverity;
    threatType?: ThreatType;
    since?: string;
    limit?: number;
  } = {}
) {
  const threats = await prisma.threat.findMany({
    where: {
      clientId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.threatType ? { threatType: filters.threatType } : {}),
      ...(filters.since ? { createdAt: { gte: new Date(filters.since) } } : {}),
    },
    take: Math.min(filters.limit || 100, 1000),
    orderBy: { createdAt: 'desc' },
  });

  return threats.map((t) => ({
    id: t.id,
    platform: t.platform,
    threatType: t.threatType,
    severity: t.severity,
    status: t.status,
    content: t.content.substring(0, 200),
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString(),
  }));
}

/**
 * Update a threat's status/notes. Scoped by clientId: the update only applies
 * if the threat belongs to the client. Throws otherwise (no cross-tenant write).
 */
export async function updateThreat(
  clientId: string,
  threatId: string,
  update: { status?: ThreatStatus; notes?: string }
) {
  const data: { status?: ThreatStatus; notes?: string; resolvedAt?: Date } = {};
  if (update.status) data.status = update.status;
  if (update.notes) data.notes = update.notes;
  if (update.status === 'RESOLVED') data.resolvedAt = new Date();

  const result = await prisma.threat.updateMany({
    where: { id: threatId, clientId },
    data,
  });

  if (result.count === 0) {
    throw new Error(`Threat ${threatId} not found`);
  }

  const threat = await prisma.threat.findFirstOrThrow({ where: { id: threatId, clientId } });
  return {
    id: threat.id,
    status: threat.status,
    notes: threat.notes,
    updatedAt: threat.updatedAt.toISOString(),
  };
}

export async function checkImpersonation(clientId: string, rawUsername: string) {
  const username = rawUsername.toLowerCase().replace('@', '');

  const identities = await prisma.platformIdentity.findMany({
    where: {
      clientId,
      username: { contains: username, mode: 'insensitive' },
    },
  });

  return {
    username,
    potentialImpersonators: identities
      .filter((i) => i.username.toLowerCase() !== username)
      .map((i) => ({ platform: i.platform, username: i.username, memberId: i.memberId })),
  };
}

/**
 * Generate a platform-submission report for one of the client's threats.
 * Scoped by clientId so reports can't be generated for another tenant's threat.
 */
export async function generateThreatReport(clientId: string, threatId: string, targetPlatform?: string) {
  const threat = await prisma.threat.findFirst({ where: { id: threatId, clientId } });
  if (!threat) {
    throw new Error(`Threat ${threatId} not found`);
  }

  const platform = targetPlatform || threat.platform;

  let report: string;
  if (platform === 'TWITTER') {
    report = `Twitter Abuse Report\n\nType: ${threat.threatType}\nSeverity: ${threat.severity}\n\nContent:\n${threat.content}\n\nEvidence: ${JSON.stringify(threat.evidence, null, 2)}`;
  } else if (platform === 'DISCORD') {
    report = `Discord Trust & Safety Report\n\nType: ${threat.threatType}\nSeverity: ${threat.severity}\n\nContent:\n${threat.content}\n\nEvidence: ${JSON.stringify(threat.evidence, null, 2)}`;
  } else {
    report = `Report for ${platform}\n\nType: ${threat.threatType}\nSeverity: ${threat.severity}\n\nContent:\n${threat.content}`;
  }

  return {
    threatId: threat.id,
    platform,
    report,
    generatedAt: new Date().toISOString(),
  };
}

/** Recent threats for a client (backs the protection resource endpoint). */
export async function getRecentThreats(clientId: string, take = 100) {
  const threats = await prisma.threat.findMany({
    where: { clientId },
    take,
    orderBy: { createdAt: 'desc' },
  });
  return threats.map((t) => ({
    id: t.id,
    type: t.threatType,
    severity: t.severity,
    status: t.status,
  }));
}
