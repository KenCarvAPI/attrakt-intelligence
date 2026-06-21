-- Phase 6.1 ingestion hardening: member opt-out, event idempotency, run tracking.

-- Member opt-out (excluded from scoring/briefs/digests).
ALTER TABLE "members" ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "members" ADD COLUMN "excludedReason" TEXT;
CREATE INDEX "members_clientId_excluded_idx" ON "members"("clientId", "excluded");

-- Event idempotency key (platform-native). Unique per platform; NULLs allowed.
ALTER TABLE "events" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "events_platform_dedupeKey_key" ON "events"("platform", "dedupeKey");

-- Ingestion run tracking (status page + resumable backfill).
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
CREATE INDEX "ingestion_runs_clientId_platform_startedAt_idx" ON "ingestion_runs"("clientId", "platform", "startedAt");
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
