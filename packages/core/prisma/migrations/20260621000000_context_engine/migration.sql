-- CreateEnum
CREATE TYPE "ContextDomain" AS ENUM ('STRATEGY', 'PRODUCT', 'COMMUNITY', 'MARKETING_OPS', 'MARKETING_DATA');

-- CreateTable
CREATE TABLE "context_sources" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "domain" "ContextDomain" NOT NULL,
    "connector" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentialRef" TEXT,
    "cadence" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_items" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceId" TEXT,
    "domain" "ContextDomain" NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT,
    "url" TEXT,
    "structured" JSONB NOT NULL DEFAULT '{}',
    "text" TEXT,
    "occurredAt" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "context_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_chunks" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_sync_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsIngested" INTEGER NOT NULL DEFAULT 0,
    "itemsDeduped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "context_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "context_sources_clientId_domain_idx" ON "context_sources"("clientId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "context_sources_clientId_connector_label_key" ON "context_sources"("clientId", "connector", "label");

-- CreateIndex
CREATE INDEX "context_items_clientId_domain_occurredAt_idx" ON "context_items"("clientId", "domain", "occurredAt");

-- CreateIndex
CREATE INDEX "context_items_clientId_kind_idx" ON "context_items"("clientId", "kind");

-- CreateIndex
CREATE INDEX "context_items_externalId_idx" ON "context_items"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "context_items_clientId_contentHash_key" ON "context_items"("clientId", "contentHash");

-- CreateIndex
CREATE INDEX "context_chunks_clientId_idx" ON "context_chunks"("clientId");

-- CreateIndex
CREATE INDEX "context_chunks_itemId_idx" ON "context_chunks"("itemId");

-- CreateIndex
CREATE INDEX "context_sync_runs_sourceId_startedAt_idx" ON "context_sync_runs"("sourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "context_sources" ADD CONSTRAINT "context_sources_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "context_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "context_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_sync_runs" ADD CONSTRAINT "context_sync_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "context_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

