-- Add an "archived" status so activating a new ContextProfile version can
-- archive the previously active one (the partial unique index on status='active'
-- still guarantees a single active profile per client).
ALTER TYPE "ContextProfileStatus" ADD VALUE IF NOT EXISTS 'archived';
