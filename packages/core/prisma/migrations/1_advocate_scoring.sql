-- Advocate scoring: AdvocateScore + ScoringConfig
--
-- Adds the advocacy scoring tables and the AdvocateSegment enum. Run after the
-- initial Prisma migration. Mirrors packages/core/prisma/schema.prisma.

-- Segment buckets, derived from per-client score percentiles.
DO $$ BEGIN
  CREATE TYPE "AdvocateSegment" AS ENUM ('CHAMPION', 'ADVOCATE', 'ACTIVE', 'CASUAL', 'LURKER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Per-member, per-period advocacy scores.
CREATE TABLE IF NOT EXISTS "advocate_scores" (
  "id"               TEXT NOT NULL,
  "memberId"         TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "period"           TEXT NOT NULL,
  "compositeScore"   DOUBLE PRECISION NOT NULL,
  "activityScore"    DOUBLE PRECISION NOT NULL,
  "consistencyScore" DOUBLE PRECISION NOT NULL,
  "breadthScore"     DOUBLE PRECISION NOT NULL,
  "influenceScore"   DOUBLE PRECISION NOT NULL,
  "helpfulnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "segment"          "AdvocateSegment" NOT NULL,
  "metadata"         JSONB DEFAULT '{}',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "advocate_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "advocate_scores_memberId_period_key"
  ON "advocate_scores" ("memberId", "period");
CREATE INDEX IF NOT EXISTS "advocate_scores_clientId_period_idx"
  ON "advocate_scores" ("clientId", "period");
CREATE INDEX IF NOT EXISTS "advocate_scores_clientId_segment_idx"
  ON "advocate_scores" ("clientId", "segment");
CREATE INDEX IF NOT EXISTS "advocate_scores_clientId_period_compositeScore_idx"
  ON "advocate_scores" ("clientId", "period", "compositeScore");

ALTER TABLE "advocate_scores"
  ADD CONSTRAINT "advocate_scores_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advocate_scores"
  ADD CONSTRAINT "advocate_scores_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-client component weights.
CREATE TABLE IF NOT EXISTS "scoring_configs" (
  "id"                TEXT NOT NULL,
  "clientId"          TEXT NOT NULL,
  "activityWeight"    DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "consistencyWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
  "breadthWeight"     DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  "influenceWeight"   DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  "helpfulnessWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scoring_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "scoring_configs_clientId_key"
  ON "scoring_configs" ("clientId");

ALTER TABLE "scoring_configs"
  ADD CONSTRAINT "scoring_configs_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
