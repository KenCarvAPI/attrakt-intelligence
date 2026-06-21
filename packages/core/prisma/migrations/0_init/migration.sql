-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('DISCORD', 'GITHUB', 'TWITTER', 'DISCOURSE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MESSAGE_REACTION', 'MENTION', 'LINK_CLICK', 'JOIN', 'LEAVE', 'STAR', 'FORK', 'PUSH', 'PULL_REQUEST_OPENED', 'PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED', 'ISSUE_OPENED', 'ISSUE_CLOSED', 'ISSUE_COMMENT', 'TWEET', 'REPLY', 'RETWEET', 'LIKE', 'FOLLOW', 'UNFOLLOW', 'GOVERNANCE_POST', 'GOVERNANCE_VOTE', 'GOVERNANCE_PROPOSAL', 'DISCOURSE_TOPIC_CREATED', 'DISCOURSE_POST_CREATED', 'DISCOURSE_SOLUTION_ACCEPTED');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('DAU', 'WAU', 'MAU', 'MESSAGE_VOLUME', 'RESPONSE_RATE', 'CONTRIBUTOR_VELOCITY', 'SENTIMENT_AVERAGE', 'SENTIMENT_POSITIVE', 'SENTIMENT_NEGATIVE', 'GROWTH_RATE', 'MEMBER_COUNT', 'ONLINE_COUNT');

-- CreateEnum
CREATE TYPE "ThreatType" AS ENUM ('HARASSMENT', 'IMPERSONATION', 'SPAM', 'COORDINATED', 'FUD', 'OTHER');

-- CreateEnum
CREATE TYPE "ThreatSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ThreatStatus" AS ENUM ('DETECTED', 'REVIEWING', 'ACTIONED', 'RESOLVED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "AdvocateSegment" AS ENUM ('CHAMPION', 'ADVOCATE', 'ACTIVE', 'CASUAL', 'LURKER');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('product_docs', 'brand_guidelines', 'marketing_material', 'leadership_interview', 'strategy_doc', 'website', 'other');

-- CreateEnum
CREATE TYPE "ContextProfileStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'live',
    "status" TEXT NOT NULL DEFAULT 'running',
    "itemsIngested" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "cursor" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
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
    "deletedAt" TIMESTAMP(3),
    "mergedIntoId" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excludedReason" TEXT,

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
    "dedupeKey" TEXT,
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

-- CreateTable
CREATE TABLE "advocate_scores" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "compositeScore" DOUBLE PRECISION NOT NULL,
    "activityScore" DOUBLE PRECISION NOT NULL,
    "consistencyScore" DOUBLE PRECISION NOT NULL,
    "breadthScore" DOUBLE PRECISION NOT NULL,
    "influenceScore" DOUBLE PRECISION NOT NULL,
    "helpfulnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "segment" "AdvocateSegment" NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advocate_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_configs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "activityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "consistencyWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "breadthWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "influenceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "helpfulnessWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpfulness_evaluations" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpfulness_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advocate_briefs" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contextProfileUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advocate_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" "KnowledgeSourceType" NOT NULL,
    "rawText" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ContextProfileStatus" NOT NULL DEFAULT 'draft',
    "products" JSONB NOT NULL DEFAULT '{}',
    "brandVoice" JSONB NOT NULL DEFAULT '{}',
    "audience" JSONB NOT NULL DEFAULT '{}',
    "marketingFunction" JSONB NOT NULL DEFAULT '{}',
    "strategicDirection" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_digests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_briefs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_slug_key" ON "clients"("slug");

-- CreateIndex
CREATE INDEX "clients_active_idx" ON "clients"("active");

-- CreateIndex
CREATE INDEX "ingestion_runs_clientId_platform_startedAt_idx" ON "ingestion_runs"("clientId", "platform", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_configs_clientId_platform_key" ON "platform_configs"("clientId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_clientId_idx" ON "members"("clientId");

-- CreateIndex
CREATE INDEX "members_email_idx" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_deletedAt_idx" ON "members"("deletedAt");

-- CreateIndex
CREATE INDEX "members_clientId_excluded_idx" ON "members"("clientId", "excluded");

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
CREATE UNIQUE INDEX "events_platform_dedupeKey_key" ON "events"("platform", "dedupeKey");

-- CreateIndex
CREATE INDEX "metrics_clientId_metricType_createdAt_idx" ON "metrics"("clientId", "metricType", "createdAt");

-- CreateIndex
CREATE INDEX "threats_clientId_status_severity_idx" ON "threats"("clientId", "status", "severity");

-- CreateIndex
CREATE INDEX "threats_platform_idx" ON "threats"("platform");

-- CreateIndex
CREATE INDEX "threats_createdAt_idx" ON "threats"("createdAt");

-- CreateIndex
CREATE INDEX "advocate_scores_clientId_period_idx" ON "advocate_scores"("clientId", "period");

-- CreateIndex
CREATE INDEX "advocate_scores_clientId_segment_idx" ON "advocate_scores"("clientId", "segment");

-- CreateIndex
CREATE INDEX "advocate_scores_clientId_period_compositeScore_idx" ON "advocate_scores"("clientId", "period", "compositeScore");

-- CreateIndex
CREATE UNIQUE INDEX "advocate_scores_memberId_period_key" ON "advocate_scores"("memberId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_configs_clientId_key" ON "scoring_configs"("clientId");

-- CreateIndex
CREATE INDEX "helpfulness_evaluations_clientId_period_idx" ON "helpfulness_evaluations"("clientId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "helpfulness_evaluations_memberId_period_key" ON "helpfulness_evaluations"("memberId", "period");

-- CreateIndex
CREATE INDEX "advocate_briefs_memberId_createdAt_idx" ON "advocate_briefs"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "advocate_briefs_clientId_createdAt_idx" ON "advocate_briefs"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "knowledge_documents_clientId_sourceType_idx" ON "knowledge_documents"("clientId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_clientId_contentHash_key" ON "knowledge_documents"("clientId", "contentHash");

-- CreateIndex
CREATE INDEX "context_profiles_clientId_status_idx" ON "context_profiles"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "context_profiles_clientId_version_key" ON "context_profiles"("clientId", "version");

-- CreateIndex
CREATE INDEX "weekly_digests_clientId_createdAt_idx" ON "weekly_digests"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_digests_clientId_period_key" ON "weekly_digests"("clientId", "period");

-- CreateIndex
CREATE INDEX "campaign_briefs_clientId_createdAt_idx" ON "campaign_briefs"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "advocate_scores" ADD CONSTRAINT "advocate_scores_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate_scores" ADD CONSTRAINT "advocate_scores_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_configs" ADD CONSTRAINT "scoring_configs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpfulness_evaluations" ADD CONSTRAINT "helpfulness_evaluations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpfulness_evaluations" ADD CONSTRAINT "helpfulness_evaluations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate_briefs" ADD CONSTRAINT "advocate_briefs_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate_briefs" ADD CONSTRAINT "advocate_briefs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_profiles" ADD CONSTRAINT "context_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_digests" ADD CONSTRAINT "weekly_digests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_briefs" ADD CONSTRAINT "campaign_briefs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active ContextProfile per client (partial unique index; not expressible
-- in the Prisma schema, so applied here). Activation archives the prior active.
CREATE UNIQUE INDEX "context_profiles_one_active_per_client" ON "context_profiles"("clientId") WHERE "status" = 'active';
