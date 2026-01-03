-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert messages table to hypertable (after Prisma migration creates it)
-- Run this after the initial Prisma migration
-- SELECT create_hypertable('messages', 'created_at');

-- Convert events table to hypertable
-- SELECT create_hypertable('events', 'created_at');

-- Convert metrics table to hypertable
-- SELECT create_hypertable('metrics', 'created_at');

-- Note: These commands should be run manually after Prisma migration,
-- or added to a custom migration script
