-- Internal Knowledge Layer
-- Adds KnowledgeDocument + ContextProfile on top of the existing base schema.

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM (
  'product_docs',
  'brand_guidelines',
  'marketing_material',
  'leadership_interview',
  'strategy_doc',
  'website',
  'other'
);

-- CreateEnum
CREATE TYPE "ContextProfileStatus" AS ENUM ('draft', 'active');

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

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_clientId_contentHash_key" ON "knowledge_documents"("clientId", "contentHash");

-- CreateIndex
CREATE INDEX "knowledge_documents_clientId_sourceType_idx" ON "knowledge_documents"("clientId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "context_profiles_clientId_version_key" ON "context_profiles"("clientId", "version");

-- CreateIndex
CREATE INDEX "context_profiles_clientId_status_idx" ON "context_profiles"("clientId", "status");

-- One active profile per client (partial unique index, not expressible in Prisma schema)
CREATE UNIQUE INDEX "context_profiles_one_active_per_client" ON "context_profiles"("clientId") WHERE "status" = 'active';

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_profiles" ADD CONSTRAINT "context_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
