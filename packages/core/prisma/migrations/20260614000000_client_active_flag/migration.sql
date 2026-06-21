-- Multi-tenancy: every worker and scheduler iterates over active clients only.
-- Existing clients default to active so current behaviour is preserved.
ALTER TABLE "clients" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "clients_active_idx" ON "clients"("active");
