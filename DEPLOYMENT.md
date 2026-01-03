# Deployment Guide

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose
- PostgreSQL 16 with TimescaleDB extension
- Redis 7+

## Local Development Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Attrakt_intellignece
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start local services:
   ```bash
   docker-compose up -d
   ```

4. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

5. Run database migrations:
   ```bash
   pnpm --filter @attrakt/core db:migrate
   ```

6. Enable TimescaleDB hypertables:
   ```sql
   -- Connect to PostgreSQL
   psql -U attrakt -d attrakt

   -- Enable TimescaleDB extension
   CREATE EXTENSION IF NOT EXISTS timescaledb;

   -- Convert tables to hypertables
   SELECT create_hypertable('messages', 'created_at');
   SELECT create_hypertable('events', 'created_at');
   SELECT create_hypertable('metrics', 'created_at');
   ```

7. Start development servers:
   ```bash
   # Terminal 1: API server
   pnpm --filter @attrakt/api dev

   # Terminal 2: Discord bot
   pnpm --filter @attrakt/mcp-servers run discord-bot

   # Terminal 3: Discord worker
   pnpm --filter @attrakt/mcp-servers run discord-worker

   # Terminal 4: GitHub webhook receiver
   pnpm --filter @attrakt/mcp-servers run github-webhook

   # Terminal 5: GitHub worker
   pnpm --filter @attrakt/mcp-servers run github-worker

   # Terminal 6: Twitter polling
   pnpm --filter @attrakt/mcp-servers run twitter-polling

   # Terminal 7: Twitter worker
   pnpm --filter @attrakt/mcp-servers run twitter-worker

   # Terminal 8: Community Pulse Agent
   pnpm --filter @attrakt/agents run pulse-agent

   # Terminal 9: Threat Detection Agent
   pnpm --filter @attrakt/agents run threat-agent

   # Terminal 10: Admin dashboard
   pnpm --filter @attrakt/admin dev
   ```

## Production Deployment (Railway)

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Create a new project:
   ```bash
   railway init
   ```

4. Add PostgreSQL service:
   ```bash
   railway add postgresql
   ```

5. Add Redis service:
   ```bash
   railway add redis
   ```

6. Set environment variables in Railway dashboard or via CLI:
   ```bash
   railway variables set DATABASE_URL=${{Postgres.DATABASE_URL}}
   railway variables set REDIS_URL=${{Redis.REDIS_URL}}
   # ... set other environment variables
   ```

7. Deploy services:
   - Deploy API server
   - Deploy Discord bot (as worker)
   - Deploy GitHub webhook receiver
   - Deploy Twitter polling service
   - Deploy agents (Community Pulse, Threat Detection)
   - Deploy admin dashboard

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `DISCORD_BOT_TOKEN`: Discord bot token
- `GITHUB_TOKEN`: GitHub personal access token or app credentials
- `TWITTER_BEARER_TOKEN`: Twitter API bearer token
- `ANTHROPIC_API_KEY`: Claude API key
- `SLACK_WEBHOOK_URL`: Slack webhook for alerts
- `RESEND_API_KEY`: Resend API key for email delivery

## Monitoring

- Health checks: `GET /health` on API server
- Queue dashboard: `http://localhost:3001/admin/queues`
- Database: Use Prisma Studio (`pnpm --filter @attrakt/core db:studio`)

## Scaling

- API server: Scale horizontally behind load balancer
- Workers: Scale based on queue depth
- Agents: One instance per agent type recommended
- Database: Use read replicas for analytics queries
- Redis: Use Redis Cluster for high availability
