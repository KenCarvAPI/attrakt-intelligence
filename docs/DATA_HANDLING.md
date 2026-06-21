# Data Handling & Retention

How Attrakt Intelligence handles data, what it stores, and the controls around
confidentiality. This pairs with the multi-tenancy guarantees in the codebase
(every query is scoped by `clientId`).

## What we store

**Community data — public platform activity only.** Ingestion captures messages
and events that are already public on the platform: Discord messages in servers
the bot is in, public GitHub activity (commits, PRs, issues, stars/forks), and
public Discourse topics/posts. We do not collect private messages, DMs, email
contents, or any non-public profile data. Identity resolution links public
handles into a unified `Member`; explicit cross-platform links (e.g. a GitHub
URL a user put on their own Discourse profile) are treated as high-confidence
signals.

**Internal knowledge — client-confidential.** `KnowledgeDocument` and
`ContextProfile` hold material the client gives us (product docs, brand
guidelines, leadership interviews, strategy). This is **confidential** and
handled accordingly:

- **Tenant-scoped, always.** Every read is filtered by `clientId`; cascade
  deletes remove a client's documents with the client.
- **Never used cross-client.** Synthesis, briefs, digests, and campaign briefs
  only ever load the *active client's* own profile/documents. There is no
  cross-tenant operation that reads another client's knowledge.
- **Never logged in full.** Ingestion logs character counts and content hashes,
  not raw text (`packages/core/src/services/knowledge.ts`). Do not add logging
  of `rawText` or full `ContextProfile` sections.

## Tenant isolation

Multi-tenancy is enforced in code and covered by integration tests
(`packages/core/src/services/tenant-isolation.test.ts`): data for client A is
never returned when querying as client B — across members, messages, events,
identity resolution, and platform→client mapping.

## Member opt-out (exclusion)

Individuals can be excluded from all advocacy outputs:

```
pnpm member:exclude --client <slug> --member <id> [--reason "opt-out"]
pnpm member:exclude --client <slug> --member <id> --unexclude
```

Excluded members (`Member.excluded = true`) are filtered out of **scoring,
advocate briefs, and weekly digests** via the shared `SCORABLE_MEMBER_WHERE`
clause. Merged members (`deletedAt`) are likewise excluded. Their underlying
public activity rows remain (for accurate ecosystem metrics) but they are never
surfaced as advocates or featured in outputs.

## Retention

- **Community activity** (messages, events, metrics): retained for the life of
  the client engagement to power trend analysis; deleted on client offboarding
  (cascade from `Client`).
- **Knowledge documents & context profiles**: retained while active; superseded
  context profiles are archived (status `archived`), not deleted, so outputs
  remain attributable to the profile that produced them. Removed on offboarding.
- **Ingestion runs / digests / briefs**: operational records, retained with the
  client.

To offboard a client and remove all their data, delete the `Client` row — every
related table cascades.

## Encryption & backups

- **In transit:** all platform and Anthropic API calls are HTTPS.
- **At rest:** rely on the managed Postgres provider's encryption at rest. This
  **must be confirmed enabled with the provider**, because backups now contain
  client-confidential knowledge documents.
- **Backups:** provider-level automated backups (see `DEPLOYMENT.md`). Because
  backups include confidential knowledge documents, they inherit the same
  confidentiality and encryption requirements as the primary database.
- **Credentials:** platform credentials live in `PlatformConfig.credentials`
  (per tenant) and environment secrets; never commit secrets.

## Out of scope (MVP)

No threat/evidence collection, no Twitter ingestion, no Discord message sending,
and no live connectors to internal systems (Notion/Drive/Slack) — knowledge
intake is upload/paste only.
