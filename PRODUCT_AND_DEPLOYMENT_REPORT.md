# Attrakt Intelligence: Product Overview & Deployment Report

**Generated:** December 2024  
**Status:** MVP / Beta

---

## Executive Summary

**Attrakt Intelligence** is a Community Intelligence Platform that provides unified tracking, analysis, and protection for communities across Discord, GitHub, and Twitter. The platform automatically monitors community activity, resolves member identities across platforms, generates AI-powered insights, and proactively detects threats.

**Current State:** The codebase is structured as an MVP with all core components implemented. The system is ready for deployment but requires configuration, API credentials, and infrastructure setup.

---

## What This Product Does

### Core Purpose

Attrakt Intelligence solves the problem of fragmented community management by providing:

1. **Unified Community View** - See one person across all platforms (Discord, GitHub, Twitter)
2. **Real-Time Analytics** - Community health metrics, engagement trends, sentiment analysis
3. **AI-Powered Insights** - Daily automated digests with key metrics and trends
4. **Proactive Threat Detection** - Automated scanning for harassment, spam, impersonation, and coordinated attacks
5. **Identity Resolution** - Intelligently links the same person across platforms even with different usernames

### Key Features

#### 1. Multi-Platform Integration
- **Discord**: Real-time bot integration tracking messages, reactions, member activity
- **GitHub**: Webhook-based tracking of commits, PRs, issues, stars, forks
- **Twitter**: API v2 polling for mentions, engagement, follower tracking

#### 2. Cross-Platform Identity Resolution
- Automatically matches the same person across platforms
- Matching strategies:
  - Email-based matching (most reliable)
  - Exact username matching
  - Fuzzy username matching (handles variations)
  - Wallet address matching (for Web3 communities)
- Confidence scoring for each match

#### 3. Real-Time Analytics
- **Metrics Tracked:**
  - Daily/Weekly/Monthly Active Users (DAU/WAU/MAU)
  - Message volume and engagement trends
  - Sentiment analysis (positive/neutral/negative)
  - Growth rates and member acquisition
  - Top contributors and most active members
- **Time-Series Data:** Historical trends stored in TimescaleDB hypertables
- **Platform-Specific Insights:** Channel activity, commits, PRs, mentions, etc.

#### 4. AI-Powered Community Pulse
- **Daily Automated Digests** generated using Claude 3.5 Sonnet
- Includes:
  - Key metrics from past 24 hours
  - Trends and patterns
  - Anomalies and noteworthy events
  - Top contributors
  - Sentiment analysis
- Delivered via Slack and/or Email

#### 5. Threat Detection System
- **Automated Scanning:** 24/7 monitoring of all messages and content
- **Threat Categories:**
  - Harassment (personal attacks, slurs, threats)
  - Impersonation (fake accounts, similar usernames)
  - Spam (repeated messages, suspicious links)
  - Coordinated Attacks (unusual volume from new accounts)
  - FUD (spreading fear, uncertainty, doubt)
- **Alert System:** Real-time notifications via Slack/Email with severity scoring
- **Evidence Collection:** Screenshots, links, and context for moderation actions

#### 6. Admin Dashboard
- Next.js-based web interface
- Data exploration and management
- Community health visualization
- Member profile views
- Threat management interface

### Technical Architecture

```
Platform APIs (Discord, GitHub, Twitter)
  ↓
MCP Server Layer (Model Context Protocol)
  ↓
Data Layer (PostgreSQL + TimescaleDB, Redis + BullMQ)
  ↓
Agent Layer (Community Pulse + Threat Detection)
  ↓
Application Layer (Next.js Admin Dashboard)
```

**Key Technologies:**
- **Language:** TypeScript
- **Runtime:** Node.js 20+
- **Database:** PostgreSQL 16 + TimescaleDB (for time-series data)
- **Cache/Queue:** Redis 7+ + BullMQ
- **LLM:** Claude 3.5 Sonnet (Anthropic API)
- **Framework:** Next.js 14 (Admin Dashboard)
- **MCP Framework:** @modelcontextprotocol/sdk

---

## What You Need to Get It Live

### Prerequisites Checklist

#### 1. Infrastructure Requirements

**Required Services:**
- [ ] **PostgreSQL 16** with TimescaleDB extension
- [ ] **Redis 7+** for caching and job queues
- [ ] **Node.js 20+** runtime environment
- [ ] **pnpm 8+** package manager

**Recommended Hosting:**
- Railway (as mentioned in docs) - provides PostgreSQL, Redis, and Node.js hosting
- Alternative: AWS, Google Cloud, DigitalOcean, or similar

#### 2. API Credentials & Integrations

**Discord Integration:**
- [ ] Create Discord Bot Application at https://discord.com/developers/applications
- [ ] Get `DISCORD_BOT_TOKEN`
- [ ] Get `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` (for OAuth if needed)
- [ ] Invite bot to your Discord server with required permissions:
  - Read Messages
  - Read Message History
  - View Channels
  - Read Members

**GitHub Integration:**
- [ ] Create GitHub Personal Access Token or GitHub App
- [ ] Get `GITHUB_TOKEN` (Personal Access Token) OR
- [ ] Get `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` (for GitHub App)
- [ ] Get `GITHUB_WEBHOOK_SECRET` (for webhook verification)
- [ ] Set up webhook in GitHub repository settings pointing to your webhook endpoint
- [ ] Get `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (for OAuth if needed)

**Twitter Integration:**
- [ ] Apply for Twitter API v2 access at https://developer.twitter.com
- [ ] Get `TWITTER_BEARER_TOKEN`
- [ ] Get `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET` (for OAuth if needed)
- [ ] Configure `TWITTER_TRACKED_ACCOUNTS` (comma-separated list of accounts to monitor)

**Anthropic (Claude AI):**
- [ ] Sign up at https://console.anthropic.com
- [ ] Get `ANTHROPIC_API_KEY`
- [ ] Ensure you have API credits/quota for daily digest generation and threat detection

**Slack (Optional but Recommended):**
- [ ] Create Slack App at https://api.slack.com/apps
- [ ] Set up Incoming Webhook
- [ ] Get `SLACK_WEBHOOK_URL`
- [ ] Configure webhook to post to desired channel

**Email (Resend - Optional but Recommended):**
- [ ] Sign up at https://resend.com
- [ ] Get `RESEND_API_KEY`
- [ ] Configure `RESEND_FROM_EMAIL` (verified domain)
- [ ] Set `CLIENT_EMAIL` (recipient for daily digests)

#### 3. Environment Configuration

**Required Environment Variables:**

```bash
# Application
NODE_ENV=production
DEFAULT_CLIENT_ID=default
PORT=3001
GITHUB_WEBHOOK_PORT=3002

# Database (REQUIRED)
DATABASE_URL=postgresql://user:password@host:5432/attrakt

# Redis (REQUIRED)
REDIS_URL=redis://host:6379

# Discord (REQUIRED for Discord features)
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# GitHub (REQUIRED for GitHub features)
GITHUB_TOKEN=your_github_token
# OR use GitHub App:
# GITHUB_APP_ID=your_app_id
# GITHUB_PRIVATE_KEY=your_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Twitter (REQUIRED for Twitter features)
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_TRACKED_ACCOUNTS=account1,account2,account3
TWITTER_POLL_INTERVAL_MS=900000

# Anthropic (REQUIRED for AI features)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Slack (OPTIONAL - for alerts)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Email (OPTIONAL - for digests)
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=noreply@yourdomain.com
CLIENT_EMAIL=admin@yourdomain.com

# Logging (OPTIONAL)
LOG_LEVEL=info
SERVICE_NAME=attrakt

# Storage (OPTIONAL - for future file storage)
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_ACCESS_KEY_ID=your_access_key
STORAGE_SECRET_ACCESS_KEY=your_secret_key
STORAGE_BUCKET=your_bucket_name
```

**Note:** Create a `.env` file in the root directory with these variables. The system uses Zod validation, so missing required variables will cause startup failures.

#### 4. Database Setup

**Steps:**
1. [ ] Provision PostgreSQL 16 database (with TimescaleDB extension support)
2. [ ] Run database migrations:
   ```bash
   pnpm --filter @attrakt/core db:migrate
   ```
3. [ ] Enable TimescaleDB extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS timescaledb;
   ```
4. [ ] Convert tables to hypertables:
   ```sql
   SELECT create_hypertable('messages', 'created_at');
   SELECT create_hypertable('events', 'created_at');
   SELECT create_hypertable('metrics', 'created_at');
   ```

#### 5. Service Deployment

The system consists of multiple services that need to be deployed:

**Core Services:**
1. [ ] **API Server** (`@attrakt/api`)
   - Main API endpoint
   - Queue management
   - Health checks
   - Port: 3001

2. [ ] **Discord Bot** (`@attrakt/mcp-servers` - discord-bot)
   - Real-time Discord event tracking
   - Runs continuously

3. [ ] **Discord Worker** (`@attrakt/mcp-servers` - discord-worker)
   - Processes Discord events from queue

4. [ ] **GitHub Webhook Receiver** (`@attrakt/mcp-servers` - github-webhook)
   - Receives GitHub webhook events
   - Port: 3002

5. [ ] **GitHub Worker** (`@attrakt/mcp-servers` - github-worker)
   - Processes GitHub events from queue

6. [ ] **Twitter Polling Service** (`@attrakt/mcp-servers` - twitter-polling)
   - Polls Twitter API for updates
   - Runs continuously

7. [ ] **Twitter Worker** (`@attrakt/mcp-servers` - twitter-worker)
   - Processes Twitter events from queue

8. [ ] **Community Pulse Agent** (`@attrakt/agents` - pulse-agent)
   - Generates daily digests
   - Runs on schedule (cron)

9. [ ] **Threat Detection Agent** (`@attrakt/agents` - threat-agent)
   - Scans for threats continuously
   - Runs on schedule

10. [ ] **Admin Dashboard** (`@attrakt/admin`)
    - Next.js web application
    - Port: 3000 (default)

**Deployment Options:**

**Option A: Railway (Recommended)**
- Railway supports multi-service deployments
- Can deploy each service as separate Railway service
- Provides PostgreSQL and Redis add-ons
- Environment variables managed in Railway dashboard

**Option B: Docker Compose (Single Server)**
- Package all services in docker-compose.yml
- Deploy to single server (VPS, EC2, etc.)
- Requires manual process management (PM2, systemd, etc.)

**Option C: Kubernetes**
- Deploy as Kubernetes pods
- Better for scaling and production workloads
- More complex setup

#### 6. Build & Deploy Steps

**Local Build:**
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type check
pnpm type-check
```

**Production Deployment:**
```bash
# For each service, build and deploy:
# 1. API Server
cd packages/api
pnpm build
# Deploy dist/ folder

# 2. MCP Servers
cd packages/mcp-servers
pnpm build
# Deploy dist/ folder

# 3. Agents
cd packages/agents
pnpm build
# Deploy dist/ folder

# 4. Admin Dashboard
cd apps/admin
pnpm build
pnpm start
# Deploy .next/ folder or use Next.js hosting
```

#### 7. Post-Deployment Configuration

**Initial Setup:**
1. [ ] Verify all services are running
2. [ ] Check health endpoint: `GET /health` on API server
3. [ ] Access queue dashboard: `http://your-api-url/admin/queues`
4. [ ] Access admin dashboard: `http://your-admin-url`
5. [ ] Verify database connections
6. [ ] Test Discord bot is receiving events
7. [ ] Test GitHub webhook is receiving events
8. [ ] Test Twitter polling is working
9. [ ] Verify agents are running on schedule
10. [ ] Test Slack/Email notifications

**Monitoring:**
- Set up logging aggregation (e.g., Datadog, LogRocket, or simple file logs)
- Monitor queue depths in BullMQ dashboard
- Monitor database performance (TimescaleDB metrics)
- Set up alerts for service failures
- Monitor API rate limits for external services

#### 8. Security Considerations

**Before Going Live:**
- [ ] Use strong, unique passwords for database
- [ ] Enable SSL/TLS for database connections
- [ ] Use environment variables (never commit secrets)
- [ ] Set up proper firewall rules
- [ ] Enable rate limiting on API endpoints
- [ ] Set up proper CORS policies for admin dashboard
- [ ] Review and restrict Discord bot permissions
- [ ] Secure webhook endpoints with secret verification
- [ ] Use HTTPS for all external-facing services
- [ ] Set up backup strategy for database
- [ ] Configure data retention policies

#### 9. Testing Checklist

**Before Launch:**
- [ ] Test Discord bot receives and processes messages
- [ ] Test GitHub webhook receives events
- [ ] Test Twitter polling retrieves data
- [ ] Test identity resolution across platforms
- [ ] Test threat detection with sample content
- [ ] Test daily pulse generation
- [ ] Test Slack notifications
- [ ] Test email delivery
- [ ] Test admin dashboard loads and displays data
- [ ] Test queue processing
- [ ] Test database queries and metrics computation
- [ ] Load test with sample data

#### 10. Cost Estimation

**Infrastructure Costs (Monthly):**
- PostgreSQL + TimescaleDB: $20-100+ (depending on size)
- Redis: $10-50+ (depending on size)
- Node.js hosting (Railway/Heroku/etc.): $20-100+ per service
- Anthropic API: Pay-per-use (varies by usage)
- Resend (Email): Free tier available, then $20+/month
- Discord/GitHub/Twitter APIs: Mostly free (rate limits apply)

**Total Estimated Monthly Cost:** $100-500+ depending on scale

---

## Deployment Priority

### Phase 1: Core Infrastructure (Week 1)
1. Set up PostgreSQL + TimescaleDB
2. Set up Redis
3. Configure environment variables
4. Run database migrations
5. Deploy API server
6. Verify health checks

### Phase 2: Platform Integrations (Week 1-2)
1. Deploy Discord bot and worker
2. Deploy GitHub webhook and worker
3. Deploy Twitter polling and worker
4. Test each integration separately
5. Verify data is being stored

### Phase 3: AI Agents (Week 2)
1. Deploy Community Pulse agent
2. Deploy Threat Detection agent
3. Configure cron schedules
4. Test digest generation
5. Test threat detection

### Phase 4: Admin Dashboard (Week 2-3)
1. Deploy Next.js admin dashboard
2. Configure authentication (if needed)
3. Test data visualization
4. Test user workflows

### Phase 5: Monitoring & Alerts (Week 3)
1. Set up logging
2. Configure Slack/Email notifications
3. Set up monitoring dashboards
4. Test alert system
5. Document runbooks

---

## Known Gaps & Considerations

### Missing Components (May Need Implementation)
1. **Authentication System** - Admin dashboard may need auth (not clear from codebase)
2. **Multi-Tenancy** - System supports multiple clients but may need tenant isolation
3. **Rate Limiting** - May need to implement rate limiting on API endpoints
4. **Error Handling** - Review error handling and retry logic
5. **Data Export** - May need to implement data export functionality
6. **Backup Strategy** - Need to set up automated backups
7. **CI/CD Pipeline** - Need deployment automation
8. **Environment File** - `.env.example` file doesn't exist, need to create one

### Potential Issues
1. **Twitter API Limits** - Twitter API v2 has rate limits, polling may hit limits
2. **Anthropic API Costs** - Daily digests and threat detection will incur API costs
3. **Database Scaling** - TimescaleDB needs proper configuration for scale
4. **Queue Backlog** - Need monitoring for queue depth to prevent backlogs
5. **Service Dependencies** - Services depend on each other, need proper startup order

---

## Next Steps

1. **Create `.env.example` file** with all required variables documented
2. **Set up development environment** locally to test all integrations
3. **Choose hosting provider** (Railway recommended)
4. **Obtain all API credentials** (Discord, GitHub, Twitter, Anthropic, etc.)
5. **Set up infrastructure** (PostgreSQL, Redis)
6. **Deploy services incrementally** following Phase 1-5 above
7. **Test thoroughly** before going live
8. **Monitor and iterate** based on real-world usage

---

## Support & Documentation

- **Architecture:** See `ARCHITECTURE.md`
- **Deployment:** See `DEPLOYMENT.md`
- **Product Overview:** See `PRODUCT_OVERVIEW.md`
- **Pitch Deck:** See `PITCH_DECK.md`

---

**Report Generated:** December 2024  
**Status:** Ready for deployment with proper configuration

