# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL PLATFORMS                               │
│   Discord API │ GitHub API │ Twitter API v2                              │
└───────────────┬─────────────────┬─────────────────┬─────────────────────┘
                │                 │                 │
                ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MCP SERVER LAYER                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│  │  discord-mcp    │ │   github-mcp    │ │  twitter-mcp    │            │
│  │                 │ │                 │ │                 │            │
│  │ • read_messages │ │ • get_issues    │ │ • search_mentions│           │
│  │ • get_members   │ │ • get_prs       │ │ • get_engagement│            │
│  │ • get_channels  │ │ • get_commits   │ │ • get_followers │            │
│  │ • send_message  │ │ • get_contrib   │ │ • get_user      │            │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘            │
│                                                                          │
│  ┌─────────────────┐ ┌─────────────────┐                                │
│  │  analytics-mcp  │ │ protection-mcp  │                                │
│  │                 │ │                 │                                │
│  │ • get_metrics   │ │ • flag_threat   │                                │
│  │ • get_member    │ │ • get_evidence  │                                │
│  │ • get_sentiment │ │ • check_imperson│                                │
│  │ • query_events  │ │ • create_report │                                │
│  └─────────────────┘ └─────────────────┘                                │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    PostgreSQL + TimescaleDB                      │    │
│  │                                                                  │    │
│  │  members │ messages │ events │ identities │ threats │ metrics   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         Redis                                    │    │
│  │              cache │ queues │ real-time pub/sub                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT LAYER                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Agent Runtime                                 │    │
│  │                                                                  │    │
│  │  ┌──────────────────┐    ┌──────────────────┐                   │    │
│  │  │  Community Pulse │    │ Threat Detection │                   │    │
│  │  │                  │    │                  │                   │    │
│  │  │ • Daily digest   │    │ • Harassment scan│                   │    │
│  │  │ • Sentiment track│    │ • Impersonation  │                   │    │
│  │  │ • Anomaly detect │    │ • Evidence collect│                  │    │
│  │  └──────────────────┘    └──────────────────┘                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                                │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│  │ Internal Admin  │ │  Report Engine  │ │  Alert System   │            │
│  │   Dashboard     │ │                 │ │                 │            │
│  │                 │ │ • Daily digest  │ │ • Slack webhook │            │
│  │ • Client config │ │ • Weekly report │ │ • Email alerts  │            │
│  │ • Data explorer │ │ • PDF export    │ │ • Escalation    │            │
│  │ • Agent logs    │ │ • Markdown      │ │                 │            │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Ingestion**: Platform events (Discord messages, GitHub webhooks, Twitter polls) are captured and queued
2. **Processing**: Workers process queued events, store in database, and perform identity resolution
3. **Analytics**: Metrics are computed hourly and stored in TimescaleDB hypertables
4. **Agents**: Scheduled agents (Community Pulse, Threat Detection) analyze data and generate insights
5. **Delivery**: Digests and alerts are delivered via Slack/email
6. **Dashboard**: Admin dashboard provides data exploration and management

## Key Components

### MCP Servers
- **discord-mcp**: Discord bot integration with MCP tools
- **github-mcp**: GitHub API integration
- **twitter-mcp**: Twitter API v2 integration
- **analytics-mcp**: Unified analytics queries
- **protection-mcp**: Threat management

### Workers
- **ingest:discord**: Process Discord events
- **ingest:github**: Process GitHub webhooks
- **ingest:twitter**: Process Twitter events
- **compute:metrics**: Compute hourly metrics
- **agent:pulse**: Generate daily digests
- **agent:threat-scan**: Scan for threats

### Agents
- **Community Pulse**: Daily digest generation with anomaly detection
- **Threat Detection**: Real-time threat scanning using Claude

### Database Schema
- **clients**: Multi-tenant client configuration
- **members**: Unified member identities
- **platform_identities**: Platform-specific identity mappings
- **messages**: Time-series message data (hypertable)
- **events**: Time-series event data (hypertable)
- **metrics**: Time-series metrics (hypertable)
- **threats**: Threat detection records

## Identity Resolution

Identity matching strategies (in priority order):
1. Explicit link (future: user connects accounts)
2. Email match
3. Username exact match
4. Username fuzzy match (Levenshtein distance < 2)
5. Wallet address match
6. Create new member

## Security

- Environment variables for sensitive credentials
- Rate limiting on external API calls
- Threat detection with severity scoring
- Evidence collection for platform reports
- Human review for all threat actions
