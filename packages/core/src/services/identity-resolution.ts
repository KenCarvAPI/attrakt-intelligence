/**
 * Identity Resolution Service
 * Handles cross-platform identity matching and linking
 */

import { prisma } from '../prisma';
import { normalizeUsername, normalizeEmail, isFuzzyUsernameMatch } from '../utils/identity';

export interface IdentityMatchResult {
  memberId: string;
  matchMethod: 'explicit' | 'email' | 'username_exact' | 'username_fuzzy' | 'wallet';
  confidence: number;
}

/**
 * Find or create member and link platform identity
 */
export async function resolveIdentity(
  clientId: string,
  platform: 'DISCORD' | 'GITHUB' | 'TWITTER',
  platformUserId: string,
  username: string,
  options: {
    email?: string;
    displayName?: string;
    walletAddress?: string;
  } = {}
): Promise<IdentityMatchResult> {
  const normalizedUsername = normalizeUsername(username);

  // Strategy 1: Check for existing platform identity *within this tenant*
  const existingIdentity = await prisma.platformIdentity.findUnique({
    where: {
      clientId_platform_platformUserId: {
        clientId,
        platform,
        platformUserId,
      },
    },
    include: {
      member: true,
    },
  });

  if (existingIdentity) {
    return {
      memberId: existingIdentity.memberId,
      matchMethod: existingIdentity.matchMethod as any,
      confidence: existingIdentity.matchConfidence || 1.0,
    };
  }

  // Strategy 2: Email match
  if (options.email) {
    const emailMember = await prisma.member.findFirst({
      where: {
        clientId,
        email: normalizeEmail(options.email),
      },
    });

    if (emailMember) {
      await prisma.platformIdentity.create({
        data: {
          clientId,
          memberId: emailMember.id,
          platform,
          platformUserId,
          username,
          displayName: options.displayName,
          matchMethod: 'email',
          matchConfidence: 1.0,
        },
      });
      return { memberId: emailMember.id, matchMethod: 'email', confidence: 1.0 };
    }
  }

  // Strategy 3: Username exact match
  const exactMatch = await prisma.platformIdentity.findFirst({
    where: {
      member: {
        clientId,
      },
      username: {
        equals: normalizedUsername,
        mode: 'insensitive',
      },
    },
    include: {
      member: true,
    },
  });

  if (exactMatch) {
    await prisma.platformIdentity.create({
      data: {
        clientId,
        memberId: exactMatch.memberId,
        platform,
        platformUserId,
        username,
        displayName: options.displayName,
        matchMethod: 'username_exact',
        matchConfidence: 1.0,
      },
    });
    return { memberId: exactMatch.memberId, matchMethod: 'username_exact', confidence: 1.0 };
  }

  // Strategy 4: Username fuzzy match
  const allIdentities = await prisma.platformIdentity.findMany({
    where: {
      member: {
        clientId,
      },
    },
    include: {
      member: true,
    },
  });

  for (const identity of allIdentities) {
    if (isFuzzyUsernameMatch(normalizedUsername, normalizeUsername(identity.username))) {
      await prisma.platformIdentity.create({
        data: {
          clientId,
          memberId: identity.memberId,
          platform,
          platformUserId,
          username,
          displayName: options.displayName,
          matchMethod: 'username_fuzzy',
          matchConfidence: 0.8,
        },
      });
      return { memberId: identity.memberId, matchMethod: 'username_fuzzy', confidence: 0.8 };
    }
  }

  // Strategy 5: Wallet address match
  if (options.walletAddress) {
    const walletMember = await prisma.member.findFirst({
      where: {
        clientId,
        walletAddress: options.walletAddress.toLowerCase(),
      },
    });

    if (walletMember) {
      await prisma.platformIdentity.create({
        data: {
          clientId,
          memberId: walletMember.id,
          platform,
          platformUserId,
          username,
          displayName: options.displayName,
          matchMethod: 'wallet',
          matchConfidence: 1.0,
        },
      });
      return { memberId: walletMember.id, matchMethod: 'wallet', confidence: 1.0 };
    }
  }

  // Strategy 6: Create new member
  const newMember = await prisma.member.create({
    data: {
      clientId,
      displayName: options.displayName || username,
      email: options.email ? normalizeEmail(options.email) : undefined,
      walletAddress: options.walletAddress?.toLowerCase(),
      platformIdentities: {
        create: {
          clientId,
          platform,
          platformUserId,
          username,
          displayName: options.displayName,
          matchMethod: 'username_exact',
          matchConfidence: 1.0,
        },
      },
    },
  });

  return { memberId: newMember.id, matchMethod: 'username_exact', confidence: 1.0 };
}

/**
 * Calculate contributor score for a member
 */
export async function calculateContributorScore(memberId: string): Promise<{
  activityScore: number;
  qualityScore: number;
  consistencyScore: number;
  overallScore: number;
}> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      messages: true,
      events: true,
    },
  });

  if (!member) {
    throw new Error(`Member ${memberId} not found`);
  }

  // Activity score: based on message and event counts
  const messageCount = member.messages.length;
  const eventCount = member.events.length;
  const activityScore = Math.min((messageCount * 0.5 + eventCount * 0.3) / 100, 1.0);

  // Quality score: based on merged PRs, helpful answers (simplified for MVP)
  const mergedPRs = member.events.filter((e) => e.eventType === 'PULL_REQUEST_MERGED').length;
  const qualityScore = Math.min(mergedPRs / 10, 1.0);

  // Consistency score: based on regular participation
  const daysSinceFirstSeen = Math.max(
    (new Date().getTime() - member.firstSeen.getTime()) / (1000 * 60 * 60 * 24),
    1
  );
  const messagesPerDay = messageCount / daysSinceFirstSeen;
  const consistencyScore = Math.min(messagesPerDay / 5, 1.0);

  // Overall score: weighted average
  const overallScore = activityScore * 0.5 + qualityScore * 0.3 + consistencyScore * 0.2;

  return {
    activityScore,
    qualityScore,
    consistencyScore,
    overallScore,
  };
}

/**
 * Get member journey timeline
 */
export async function getMemberJourney(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      platformIdentities: true,
      events: {
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });

  if (!member) {
    throw new Error(`Member ${memberId} not found`);
  }

  const journey = [];

  // First platform join
  const firstPlatform = member.platformIdentities.reduce((earliest, pi) => {
    if (!earliest || pi.createdAt < earliest.createdAt) {
      return pi;
    }
    return earliest;
  }, member.platformIdentities[0]);

  if (firstPlatform) {
    journey.push({
      event: 'joined',
      platform: firstPlatform.platform,
      timestamp: firstPlatform.createdAt,
      description: `Joined ${firstPlatform.platform}`,
    });
  }

  // Key events
  for (const event of member.events) {
    if (['PULL_REQUEST_MERGED', 'STAR', 'FIRST_MESSAGE'].includes(event.eventType)) {
      journey.push({
        event: event.eventType.toLowerCase(),
        platform: event.platform,
        timestamp: event.createdAt,
        description: formatEventDescription(event),
      });
    }
  }

  return journey.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function formatEventDescription(event: any): string {
  switch (event.eventType) {
    case 'PULL_REQUEST_MERGED':
      return 'First PR merged';
    case 'STAR':
      return 'Starred repository';
    default:
      return event.eventType;
  }
}
