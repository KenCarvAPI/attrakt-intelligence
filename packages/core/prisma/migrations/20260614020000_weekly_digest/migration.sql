-- Weekly ecosystem health report (pulse-agent), stored as structured JSON +
-- rendered Markdown. One per (client, ISO week).
CREATE TABLE "weekly_digests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_digests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_digests_clientId_period_key" ON "weekly_digests"("clientId", "period");
CREATE INDEX "weekly_digests_clientId_createdAt_idx" ON "weekly_digests"("clientId", "createdAt");

ALTER TABLE "weekly_digests" ADD CONSTRAINT "weekly_digests_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
