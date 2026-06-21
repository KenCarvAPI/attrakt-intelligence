-- Helpfulness evaluations (Claude-rated, cached per member per period) and
-- advocate briefs (Claude-generated structured member profiles).
-- Mirrors packages/core/prisma/schema.prisma.

CREATE TABLE IF NOT EXISTS "helpfulness_evaluations" (
  "id"            TEXT NOT NULL,
  "memberId"      TEXT NOT NULL,
  "clientId"      TEXT NOT NULL,
  "period"        TEXT NOT NULL,
  "score"         DOUBLE PRECISION NOT NULL,
  "rationale"     TEXT,
  "sampleSize"    INTEGER NOT NULL DEFAULT 0,
  "model"         TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "helpfulness_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "helpfulness_evaluations_memberId_period_key"
  ON "helpfulness_evaluations" ("memberId", "period");
CREATE INDEX IF NOT EXISTS "helpfulness_evaluations_clientId_period_idx"
  ON "helpfulness_evaluations" ("clientId", "period");

ALTER TABLE "helpfulness_evaluations"
  ADD CONSTRAINT "helpfulness_evaluations_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "helpfulness_evaluations"
  ADD CONSTRAINT "helpfulness_evaluations_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "advocate_briefs" (
  "id"                 TEXT NOT NULL,
  "memberId"           TEXT NOT NULL,
  "clientId"           TEXT NOT NULL,
  "brief"              JSONB NOT NULL,
  "model"              TEXT NOT NULL,
  "promptVersion"      TEXT NOT NULL,
  "contextProfileUsed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "advocate_briefs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "advocate_briefs_memberId_createdAt_idx"
  ON "advocate_briefs" ("memberId", "createdAt");
CREATE INDEX IF NOT EXISTS "advocate_briefs_clientId_createdAt_idx"
  ON "advocate_briefs" ("clientId", "createdAt");

ALTER TABLE "advocate_briefs"
  ADD CONSTRAINT "advocate_briefs_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advocate_briefs"
  ADD CONSTRAINT "advocate_briefs_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
