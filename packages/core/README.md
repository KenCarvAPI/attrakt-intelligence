# @attrakt/core

Core package with shared types, database schema, and utilities.

## Database Setup

1. Ensure PostgreSQL with TimescaleDB is running (via docker-compose)
2. Run migrations:
   ```bash
   pnpm db:migrate
   ```
3. Enable TimescaleDB hypertables (run in psql or database client):
   ```sql
   SELECT create_hypertable('messages', 'created_at');
   SELECT create_hypertable('events', 'created_at');
   SELECT create_hypertable('metrics', 'created_at');
   ```
4. Seed database (optional):
   ```bash
   pnpm db:seed
   ```

## Schema

The schema includes:
- `clients` - Multi-tenant client configuration
- `platform_configs` - Platform-specific configurations
- `members` - Unified member identities
- `platform_identities` - Platform-specific identity mappings
- `messages` - Time-series message data (hypertable)
- `events` - Time-series event data (hypertable)
- `metrics` - Time-series metrics (hypertable)
- `threats` - Threat detection records
