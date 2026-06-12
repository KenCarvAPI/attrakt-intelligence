-- Add Discourse as a supported platform.
ALTER TYPE "Platform" ADD VALUE 'DISCOURSE';

-- Scope platform identities to a tenant so the same external account can be
-- tracked independently by two different clients.

-- 1. Add the column as nullable first so existing rows can be backfilled.
ALTER TABLE "platform_identities" ADD COLUMN "clientId" TEXT;

-- 2. Backfill clientId from the owning member.
UPDATE "platform_identities" AS pi
SET "clientId" = m."clientId"
FROM "members" AS m
WHERE pi."memberId" = m."id";

-- 3. Now enforce NOT NULL.
ALTER TABLE "platform_identities" ALTER COLUMN "clientId" SET NOT NULL;

-- 4. Replace the global (platform, platformUserId) uniqueness with a
--    per-tenant constraint, and index clientId for scoped lookups.
DROP INDEX "platform_identities_platform_platformUserId_key";
CREATE INDEX "platform_identities_clientId_idx" ON "platform_identities"("clientId");
CREATE UNIQUE INDEX "platform_identities_clientId_platform_platformUserId_key" ON "platform_identities"("clientId", "platform", "platformUserId");
