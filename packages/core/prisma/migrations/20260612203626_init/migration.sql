-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('DISCORD', 'GITHUB', 'TWITTER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MESSAGE_REACTION', 'MENTION', 'LINK_CLICK', 'JOIN', 'LEAVE', 'STAR', 'FORK', 'PUSH', 'PULL_REQUEST_OPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_OPENED', 'ISSUE_CLOSED', 'ISSUE_COMMENT', 'TWEET', 'REPLY', 'RETWEET', 'LIKE', 'FOLLOW', 'UNFOLLOW');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('DAU', 'WAU', 'MAU', 'MESSAGE_VOLUME', 'RESPONSE_RATE', 'CONTRIBUTOR_VELOCITY', 'SENTIMENT_AVERAGE', 'SENTIMENT_POSITIVE', 'SENTIMENT_NEGATIVE', 'GROWTH_RATE', 'MEMBER_COUNT', 'ONLINE_COUNT');

-- CreateEnum
CREATE TYPE "ThreatType" AS ENUM ('HARASSMENT', 'IMPERSONATION', 'SPAM', 'COORDINATED', 'FUD', 'OTHER');

-- CreateEnum
CREATE TYPE "ThreatSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ThreatStatus" AS ENUM ('DETECTED', 'REVIEWING', 'ACTIONED', 'RESOLVED', 'FALSE_POSITIVE');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_configs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "credentials" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "walletAddress" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_identities" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "matchMethod" TEXT,
    "matchConfidence" DOUBLE PRECISION DEFAULT 1.0,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "memberId" TEXT,
    "platform" "Platform" NOT NULL,
    "platformMessageId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "content" TEXT NOT NULL,
    "rawContent" JSONB DEFAULT '{}',
    "sentiment" DOUBLE PRECISION,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "memberId" TEXT,
    "platform" "Platform" NOT NULL,
    "eventType" "EventType" NOT NULL,
    "eventData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "metricType" "MetricType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threats" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "threatType" "ThreatType" NOT NULL,
    "severity" "ThreatSeverity" NOT NULL,
    "status" "ThreatStatus" NOT NULL DEFAULT 'DETECTED',
    "content" TEXT NOT NULL,
    "evidence" JSONB DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "threats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_slug_key" ON "clients"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "platform_configs_clientId_platform_key" ON "platform_configs"("clientId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_clientId_idx" ON "members"("clientId");

-- CreateIndex
CREATE INDEX "members_email_idx" ON "members"("email");

-- CreateIndex
CREATE INDEX "platform_identities_memberId_idx" ON "platform_identities"("memberId");

-- CreateIndex
CREATE INDEX "platform_identities_platform_username_idx" ON "platform_identities"("platform", "username");

-- CreateIndex
CREATE UNIQUE INDEX "platform_identities_platform_platformUserId_key" ON "platform_identities"("platform", "platformUserId");

-- CreateIndex
CREATE INDEX "messages_clientId_createdAt_idx" ON "messages"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_memberId_idx" ON "messages"("memberId");

-- CreateIndex
CREATE INDEX "messages_platform_channelId_idx" ON "messages"("platform", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_platform_platformMessageId_key" ON "messages"("platform", "platformMessageId");

-- CreateIndex
CREATE INDEX "events_clientId_createdAt_idx" ON "events"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "events_memberId_idx" ON "events"("memberId");

-- CreateIndex
CREATE INDEX "events_eventType_idx" ON "events"("eventType");

-- CreateIndex
CREATE INDEX "metrics_clientId_metricType_createdAt_idx" ON "metrics"("clientId", "metricType", "createdAt");

-- CreateIndex
CREATE INDEX "threats_clientId_status_severity_idx" ON "threats"("clientId", "status", "severity");

-- CreateIndex
CREATE INDEX "threats_platform_idx" ON "threats"("platform");

-- CreateIndex
CREATE INDEX "threats_createdAt_idx" ON "threats"("createdAt");

-- AddForeignKey
ALTER TABLE "platform_configs" ADD CONSTRAINT "platform_configs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_identities" ADD CONSTRAINT "platform_identities_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threats" ADD CONSTRAINT "threats_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
