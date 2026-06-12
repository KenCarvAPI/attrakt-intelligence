-- Runs automatically on first container init via /docker-entrypoint-initdb.d.
-- The timescale/timescaledb image preloads the shared library; this makes the
-- extension explicitly available in the application database.
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- NOTE: Converting messages/events/metrics into TimescaleDB hypertables is
-- intentionally NOT done here. Hypertables require every UNIQUE/PRIMARY KEY
-- constraint to include the partitioning column (created_at), which the current
-- Prisma schema does not satisfy (e.g. messages has a unique on
-- [platform, platform_message_id]). The tables work as regular Postgres tables;
-- hypertable conversion is a deliberate, schema-aware follow-up.
