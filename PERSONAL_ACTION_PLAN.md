# Personal Action Plan: Getting Attrakt Intelligence Live

**Your Name:** [Your Name]  
**Target Launch Date:** [Set Your Date]  
**Status:** Pre-Launch

---

## Phase 1: API Credentials & Accounts (Week 1)

### Discord Setup
- [ ] Go to https://discord.com/developers/applications
- [ ] Create a new application
- [ ] Create a bot and get `DISCORD_BOT_TOKEN`
- [ ] Get `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`
- [ ] Invite bot to your Discord server with permissions:
  - Read Messages
  - Read Message History
  - View Channels
  - Read Members
- [ ] Test bot can connect to your server

**Time Estimate:** 30 minutes  
**Cost:** Free

### GitHub Setup
- [ ] Go to https://github.com/settings/tokens
- [ ] Create Personal Access Token (classic) with scopes:
  - `repo` (for private repos) or `public_repo` (for public repos)
  - `read:org` (if tracking org repos)
- [ ] Get `GITHUB_TOKEN`
- [ ] OR create GitHub App (more advanced):
  - Go to https://github.com/settings/apps
  - Create new app
  - Get `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`
- [ ] Set up webhook in your GitHub repository:
  - Go to repo Settings → Webhooks
  - Add webhook pointing to your deployment URL: `https://your-domain.com/webhooks/github`
  - Set `GITHUB_WEBHOOK_SECRET` (generate random string)
  - Select events: Push, Pull Request, Issues, Issue Comments, Stars, Forks
- [ ] Get OAuth credentials if needed: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

**Time Estimate:** 45 minutes  
**Cost:** Free

### Twitter Setup
- [ ] Go to https://developer.twitter.com
- [ ] Apply for Twitter API v2 access (may take 1-3 days for approval)
- [ ] Create a new project and app
- [ ] Get `TWITTER_BEARER_TOKEN`
- [ ] Get `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET` (for OAuth if needed)
- [ ] List accounts to track in `TWITTER_TRACKED_ACCOUNTS` (comma-separated)

**Time Estimate:** 1 hour (plus approval wait time)  
**Cost:** Free tier available, paid plans start at $100/month

### Anthropic (Claude AI) Setup
- [ ] Go to https://console.anthropic.com
- [ ] Sign up for account
- [ ] Get `ANTHROPIC_API_KEY`
- [ ] Add payment method (required for API access)
- [ ] Check pricing: ~$3 per 1M input tokens, ~$15 per 1M output tokens
- [ ] Estimate monthly cost based on:
  - Daily digests: ~10K tokens/day = ~$0.30/day = ~$9/month
  - Threat detection: ~5K tokens/day = ~$0.15/day = ~$4.50/month
  - **Total estimate: ~$15-30/month** (varies by usage)

**Time Estimate:** 15 minutes  
**Cost:** ~$15-30/month (pay-per-use)

### Slack Setup (Optional but Recommended)
- [ ] Go to https://api.slack.com/apps
- [ ] Create new app for your workspace
- [ ] Go to Incoming Webhooks → Activate
- [ ] Create webhook for your channel
- [ ] Get `SLACK_WEBHOOK_URL`
- [ ] Test webhook works

**Time Estimate:** 15 minutes  
**Cost:** Free

### Resend (Email) Setup (Optional but Recommended)
- [ ] Go to https://resend.com
- [ ] Sign up for account
- [ ] Get `RESEND_API_KEY`
- [ ] Verify your domain (or use Resend's test domain)
- [ ] Set `RESEND_FROM_EMAIL` (must be verified)
- [ ] Set `CLIENT_EMAIL` (where to send digests)
- [ ] Free tier: 3,000 emails/month, then $20/month for 50,000

**Time Estimate:** 20 minutes  
**Cost:** Free for 3K emails/month, then $20/month

---

## Phase 2: Infrastructure Setup (Week 1-2)

### Option A: Railway (Recommended - Easiest)
- [ ] Sign up at https://railway.app
- [ ] Install Railway CLI: `npm i -g @railway/cli`
- [ ] Login: `railway login`
- [ ] Create new project: `railway init`
- [ ] Add PostgreSQL service: `railway add postgresql`
- [ ] Add Redis service: `railway add redis`
- [ ] Note the connection URLs for `DATABASE_URL` and `REDIS_URL`
- [ ] Set up environment variables in Railway dashboard
- [ ] Deploy each service (see Phase 4)

**Time Estimate:** 2-3 hours  
**Cost:** ~$20-50/month (depends on usage)

### Option B: Self-Hosted (VPS/DigitalOcean/AWS)
- [ ] Choose hosting provider (DigitalOcean, AWS, etc.)
- [ ] Provision server (Ubuntu 22.04 recommended)
- [ ] Install Docker and Docker Compose
- [ ] Set up PostgreSQL 16 with TimescaleDB:
  ```bash
  # Use TimescaleDB Docker image
  docker run -d --name postgres \
    -e POSTGRES_PASSWORD=your_password \
    -e POSTGRES_DB=attrakt \
    -p 5432:5432 \
    timescale/timescaledb:latest-pg16
  ```
- [ ] Set up Redis:
  ```bash
  docker run -d --name redis \
    -p 6379:6379 \
    redis:7-alpine
  ```
- [ ] Configure firewall (ports 22, 80, 443, 3000-3002)
- [ ] Set up SSL certificates (Let's Encrypt)
- [ ] Configure reverse proxy (nginx)

**Time Estimate:** 4-6 hours  
**Cost:** ~$10-40/month (VPS)

---

## Phase 3: Local Development & Testing (Week 2)

### Initial Setup
- [ ] Clone repository (if not already done)
- [ ] Install Node.js 20+ and pnpm 8+
- [ ] Run `pnpm install`
- [ ] Start local services: `docker-compose up -d`
- [ ] Copy `.env.example` to `.env` (create if doesn't exist)
- [ ] Fill in all environment variables with test credentials
- [ ] Run database migrations: `pnpm --filter @attrakt/core db:migrate`
- [ ] Enable TimescaleDB hypertables (see DEPLOYMENT.md)

### Test Each Integration
- [ ] Test Discord bot connects and receives messages
- [ ] Test GitHub webhook receives events
- [ ] Test Twitter polling retrieves data
- [ ] Test identity resolution works across platforms
- [ ] Test threat detection with sample content
- [ ] Test daily pulse generation
- [ ] Test Slack notifications
- [ ] Test email delivery
- [ ] Test admin dashboard loads

**Time Estimate:** 4-6 hours

---

## Phase 4: Production Deployment (Week 2-3)

### Deploy Services (Railway Example)

1. **API Server**
   - [ ] Create new Railway service from `packages/api`
   - [ ] Set environment variables
   - [ ] Deploy
   - [ ] Verify health check: `GET /health`

2. **Discord Bot**
   - [ ] Create new Railway service from `packages/mcp-servers`
   - [ ] Set start command: `pnpm run discord-bot`
   - [ ] Set environment variables
   - [ ] Deploy

3. **Discord Worker**
   - [ ] Create new Railway service from `packages/mcp-servers`
   - [ ] Set start command: `pnpm run discord-worker`
   - [ ] Set environment variables
   - [ ] Deploy

4. **GitHub Webhook**
   - [ ] Create new Railway service from `packages/mcp-servers`
   - [ ] Set start command: `pnpm run github-webhook`
   - [ ] Set port: 3002
   - [ ] Set environment variables
   - [ ] Deploy
   - [ ] Update GitHub webhook URL to Railway URL

5. **GitHub Worker**
   - [ ] Create new Railway service from `packages/mcp-servers`
   - [ ] Set start command: `pnpm run github-worker`
   - [ ] Set environment variables
   - [ ] Deploy

6. **Twitter Polling**
   - [ ] Create new Railway service from `packages/mcp-servers`
   - [ ] Set start command: `pnpm run twitter-polling`
   - [ ] Set environment variables
   - [ ] Deploy

7. **Twitter Worker**
   - [ ] Create new Railway service from `packages/mcp-servers`
   - [ ] Set start command: `pnpm run twitter-worker`
   - [ ] Set environment variables
   - [ ] Deploy

8. **Community Pulse Agent**
   - [ ] Create new Railway service from `packages/agents`
   - [ ] Set start command: `pnpm run pulse-agent`
   - [ ] Set environment variables
   - [ ] Deploy

9. **Threat Detection Agent**
   - [ ] Create new Railway service from `packages/agents`
   - [ ] Set start command: `pnpm run threat-agent`
   - [ ] Set environment variables
   - [ ] Deploy

10. **Admin Dashboard**
    - [ ] Create new Railway service from `apps/admin`
    - [ ] Set environment variables
    - [ ] Deploy
    - [ ] Access at Railway-provided URL

**Time Estimate:** 4-6 hours  
**Cost:** ~$20-50/month (Railway pricing)

---

## Phase 5: Post-Deployment Verification (Week 3)

### Health Checks
- [ ] All services are running
- [ ] API health endpoint responds: `GET /health`
- [ ] Queue dashboard accessible: `/admin/queues`
- [ ] Admin dashboard loads
- [ ] Database connections working
- [ ] Redis connections working

### Integration Tests
- [ ] Discord bot receives and processes messages
- [ ] GitHub webhook receives and processes events
- [ ] Twitter polling retrieves data
- [ ] Data appears in database
- [ ] Identity resolution creates member records
- [ ] Metrics are computed
- [ ] Daily pulse generates successfully
- [ ] Threat detection works
- [ ] Slack notifications sent
- [ ] Email digests delivered

### Monitoring Setup
- [ ] Set up error logging (Railway logs or external service)
- [ ] Monitor queue depths
- [ ] Monitor API rate limits
- [ ] Set up alerts for service failures
- [ ] Monitor database performance

**Time Estimate:** 2-3 hours

---

## Phase 6: Security & Hardening (Week 3)

### Security Checklist
- [ ] All environment variables are set (no defaults in production)
- [ ] Database uses strong password
- [ ] SSL/TLS enabled for all external services
- [ ] Firewall rules configured
- [ ] Rate limiting enabled (if not built-in)
- [ ] CORS policies configured
- [ ] Webhook secrets verified
- [ ] API keys rotated (if needed)
- [ ] Backup strategy implemented
- [ ] Data retention policies set

**Time Estimate:** 2-3 hours

---

## Phase 7: Documentation & Launch Prep (Week 3-4)

### Documentation
- [ ] Document your specific deployment setup
- [ ] Create runbook for common issues
- [ ] Document how to add new clients
- [ ] Create user guide for admin dashboard
- [ ] Document API endpoints (if exposing)

### Launch Preparation
- [ ] Test with real community data
- [ ] Load test with expected volume
- [ ] Prepare rollback plan
- [ ] Set up monitoring dashboards
- [ ] Prepare support channels
- [ ] Create launch announcement

**Time Estimate:** 4-6 hours

---

## Quick Start Checklist (If You Want to Move Fast)

**Minimum Viable Setup (Can be done in 1-2 days):**

1. [ ] Get Discord bot token (30 min)
2. [ ] Get GitHub token (30 min)
3. [ ] Get Anthropic API key (15 min)
4. [ ] Set up Railway account (30 min)
5. [ ] Deploy PostgreSQL + Redis on Railway (30 min)
6. [ ] Deploy API server (30 min)
7. [ ] Deploy Discord bot + worker (30 min)
8. [ ] Deploy GitHub webhook + worker (30 min)
9. [ ] Test basic functionality (1 hour)
10. [ ] Deploy admin dashboard (30 min)

**Total: ~6-8 hours of focused work**

---

## Cost Summary

### Monthly Infrastructure Costs
- **Railway:** $20-50/month (PostgreSQL, Redis, services)
- **Anthropic API:** $15-30/month (AI features)
- **Resend:** Free (3K emails) or $20/month
- **Twitter API:** Free tier or $100+/month
- **Slack:** Free
- **Discord:** Free
- **GitHub:** Free

**Total Estimated:** $35-200/month depending on scale

### One-Time Setup Time
- **API Credentials:** 2-3 hours
- **Infrastructure:** 2-4 hours
- **Deployment:** 4-6 hours
- **Testing:** 2-3 hours
- **Security & Documentation:** 2-4 hours

**Total:** 12-20 hours

---

## Troubleshooting Resources

- **Database Issues:** Check TimescaleDB extension is enabled
- **Queue Issues:** Check Redis connection and queue dashboard
- **API Rate Limits:** Monitor usage in each platform's dashboard
- **Service Crashes:** Check Railway logs or server logs
- **Missing Data:** Verify webhooks are configured correctly

---

## Next Steps After Launch

1. Monitor for 1 week
2. Gather user feedback
3. Iterate on features
4. Scale infrastructure as needed
5. Add more platforms (Reddit, Telegram, etc.)

---

**Last Updated:** December 2024  
**Status:** Ready to Execute

