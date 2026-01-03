# Attrakt Intelligence MVP

Community intelligence platform with Discord, GitHub, and Twitter integrations via MCP servers, unified data store, identity resolution, and AI agents.

## Architecture

```
Platform APIs (Discord, GitHub, Twitter) 
  → MCP Servers (discord-mcp, github-mcp, twitter-mcp, analytics-mcp, protection-mcp)
  → Data Layer (PostgreSQL + TimescaleDB, Redis + BullMQ)
  → Agent Layer (Community Pulse + Threat Detection agents)
  → Application Layer (Next.js Admin Dashboard)
```

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **MCP Framework:** @modelcontextprotocol/sdk
- **Database:** PostgreSQL 16 + TimescaleDB
- **Cache/Queue:** Redis + BullMQ
- **Agent Runtime:** Custom agent framework with Claude 3.5 Sonnet
- **LLM:** Claude 3.5 Sonnet (Anthropic API)
- **Admin UI:** React + Next.js 14
- **Hosting:** Railway (recommended)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start local services (PostgreSQL + Redis):
   ```bash
   docker-compose up -d
   ```
4. Set up environment variables (copy `.env.example` to `.env` and fill in values)
5. Run database migrations:
   ```bash
   pnpm --filter @attrakt/core db:migrate
   ```
6. Enable TimescaleDB hypertables (see DEPLOYMENT.md)
7. Start development servers (see DEPLOYMENT.md for full list)

## Project Structure

```
.
├── packages/
│   ├── core/          # Shared types, utils, database schema
│   ├── mcp-servers/   # MCP servers (discord, github, twitter, analytics, protection)
│   ├── agents/        # AI agents (Community Pulse, Threat Detection)
│   └── api/           # API server with queue management
├── apps/
│   └── admin/         # Next.js admin dashboard
└── docker-compose.yml # Local development services
```

## Features

- **Multi-Platform Integration**: Discord, GitHub, and Twitter
- **Unified Identity Resolution**: Cross-platform member matching
- **Real-Time Analytics**: Metrics computation with TimescaleDB
- **AI-Powered Insights**: Daily community digests with Claude
- **Threat Detection**: Automated threat scanning and alerting
- **Admin Dashboard**: Data exploration and management interface

## Development

- `pnpm dev` - Start all development servers
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm type-check` - Type check all packages
- `pnpm test` - Run all tests (when implemented)

## Documentation

- [Architecture Overview](ARCHITECTURE.md)
- [Deployment Guide](DEPLOYMENT.md)

## License

Private - All Rights Reserved