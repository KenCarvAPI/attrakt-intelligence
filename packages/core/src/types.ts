import { z } from 'zod';

// Re-export Prisma types
export type {
  Client,
  PlatformConfig,
  Platform,
  Member,
  PlatformIdentity,
  Message,
  Event,
  EventType,
  Metric,
  MetricType,
  Threat,
  ThreatType,
  ThreatSeverity,
  ThreatStatus,
} from '@prisma/client';

// Zod schemas for validation
export const ClientSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
});

export const MemberSchema = z.object({
  clientId: z.string(),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  walletAddress: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const MessageSchema = z.object({
  clientId: z.string(),
  memberId: z.string().optional(),
  platform: z.enum(['DISCORD', 'GITHUB', 'TWITTER']),
  platformMessageId: z.string(),
  channelId: z.string().optional(),
  content: z.string(),
  sentiment: z.number().min(-1).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ThreatSchema = z.object({
  clientId: z.string(),
  platform: z.enum(['DISCORD', 'GITHUB', 'TWITTER']),
  threatType: z.enum(['HARASSMENT', 'IMPERSONATION', 'SPAM', 'COORDINATED', 'FUD', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  content: z.string(),
  evidence: z.record(z.unknown()).optional(),
});
