# Product Requirements Document: Multi-Client API Usage Monitor

## Problem Statement

We manage multiple clients who use various AI API providers (OpenAI, Anthropic, OpenRouter, etc.). Each client's API keys are stored in their own 1Password vault, and access tokens for those vaults are stored in a central "thefocus" vault. Currently there is no unified tool to monitor usage, balances, and spend across all clients and providers. Existing code in this repo attempted to build this but became overengineered — it stored keys in PostgreSQL with AES encryption, required Clerk multi-user auth, had 8 database tables, and was far from deployable. We need a radically simpler system that treats 1Password as the sole source of truth for credentials and only uses the database to store check results.

## Solution

A company-wide API usage monitoring service that:

1. Reads a master service account token for the "thefocus" vault (provided via fnox/mise as `OP_SERVICE_ACCOUNT_TOKEN`)
2. Discovers all client service account items in thefocus vault (items named `{slug} service account token` with category `API_CREDENTIAL`)
3. For each client SA, reads their vault and finds API key items matching known provider env-var names
4. Checks each key against its provider's API to retrieve balance, spend, and usage data
5. Stores results in a PostgreSQL database (Neon)
6. Sends notifications via Slack/Discord/Email when balances drop below thresholds
7. Exposes a simple web dashboard to view results
8. Outputs a status file for pi agent skills to consume

The database stores no credentials — only check results and client metadata. 1Password is the authoritative source for everything else.

## User Stories

1. As an operations user, I want the tool to discover all clients automatically from the thefocus 1Password vault, so that I don't have to manually register each client in a config file.
2. As an operations user, I want the tool to discover which API keys each client has by scanning their vault for known env-var names, so that adding a new key means just putting it in 1Password.
3. As an operations user, I want each client's API keys to be resolved from 1Password at runtime and never stored in the database, so that a DB breach does not expose credentials.
4. As an operations user, I want the tool to run on a cron schedule (hourly) and check all discovered keys, so that I always have up-to-date usage data.
5. As an operations user, I want a simple web dashboard that shows the latest check results per client, so that I can quickly see which clients need attention.
6. As an operations user, I want Slack/Discord/Email notifications when a client's balance drops below a warning or critical threshold, so that I can act before service is interrupted.
7. As an operations user, I want to mark a client as inactive in the database so that the tool stops monitoring them without deleting their 1Password data.
8. As an operations user, I want to configure notification thresholds per client in the database, so that different clients can have different alert levels.
9. As an operations user, I want a CLI command to manually trigger a sync from 1Password, so that I can pick up new clients/keys immediately without waiting for the next cron cycle.
10. As an operations user, I want a CLI command to manually trigger a check of all keys, so that I can verify a new key works immediately.
11. As an operations user, I want the tool to handle provider API failures gracefully (one failed provider shouldn't block others), so that a transient error doesn't lose all results.
12. As a pi agent skill user, I want the tool to output a status JSON file that a skill can read, so that agents can report on API usage contextually.
13. As a developer, I want the tool to be testable with mocked 1Password and provider responses, so that I can validate changes without real API calls.
14. As a developer, I want the provider abstraction layer to remain unchanged, so that adding new providers doesn't require rewiring the monitoring infrastructure.
15. As an operations user, I want to see a per-provider breakdown of all client keys showing which are healthy, which have errors, and which are approaching their limits.

## Implementation Decisions

### Module Architecture

There are seven major modules:

**1. `onepassword-discovery`** — A testable module that encapsulates all 1Password interactions.

- Accepts an `OP_SERVICE_ACCOUNT_TOKEN` for the thefocus vault
- Discovers client SA items (`* service account token`)
- For each SA, reads the client vault via its token
- Finds items matching a known provider-to-env-var mapping
- Returns `Array<{ clientName, vaultName, keys: Array<{ provider, envVarName, value }> }>`
- Pure I/O at the boundary, business logic testable with mock data

**2. `provider-checker`** — Wraps the existing provider factory and individual providers.

- Accepts credentials directly (not fetched from DB)
- Runs checks in parallel across all keys for all clients
- Returns structured results with status, balance, spend, error
- Reuses all 14 existing provider implementations unchanged

**3. `client-registry`** — Database access layer for the `clients` table.

- Caches client state discovered from 1Password
- Allows marking clients as active/inactive
- Stores per-client notification thresholds and channel configs
- Sync operation: compares 1Password discovery against DB, inserts new clients, updates existing, deactivates removed ones

**4. `usage-store`** — Database access layer for the `usage_checks` table.

- Inserts check results
- Queries latest results per client/provider
- Supports historical queries for trends

**5. `notification-engine`** — Reads per-client thresholds from the `clients` table, evaluates check results, sends alerts.

- Reuses existing Slack/Discord/Email senders
- Logs to `notification_log`

**6. `status-output`** — Writes a status JSON file to a configurable path.

- Aggregates latest check results per client
- Includes summary counts (healthy, error, critical)
- Format consumable by pi agent skills

**7. `api-server`** — Simplified Fastify server.

- No auth middleware (Clerk removed)
- Routes: health, clients list, latest usage per client
- Serves the dashboard SPA
- Runs the cron scheduler

### Database Schema

Three tables replacing the current eight:

```
clients
  id              uuid PK
  name            text NOT NULL          — human-readable client name
  vault_name      text NOT NULL          — 1Password vault name
  slug            text NOT NULL UNIQUE   — derived from vault name
  is_active       boolean DEFAULT true
  slack_webhook   text                   — per-client notification config
  discord_webhook text
  email           text
  threshold_warning  numeric
  threshold_critical numeric
  last_synced_at  timestamp
  created_at      timestamp DEFAULT now()
```

```
usage_checks
  id              uuid PK
  client_id       uuid FK -> clients
  provider        text NOT NULL
  checked_at      timestamp DEFAULT now()
  balance         numeric                 — remaining balance/credits
  spend           numeric                 — spend since last billing period
  limit_remaining numeric
  status          'success' | 'error'
  error_message   text
  raw_response    jsonb
```

```
notification_log
  id              uuid PK
  client_id       uuid FK -> clients
  channel         'slack' | 'discord' | 'email'
  sent_at         timestamp DEFAULT now()
  message         text
  status          'sent' | 'failed'
  error_message   text
```

### Provider-to-Env-Var Mapping

The discovery module matches items in client vaults against this mapping (env-var names are the item titles):

| Provider   | Env var name       |
| ---------- | ------------------ |
| openrouter | OPENROUTER_API_KEY |
| openai     | OPENAI_API_KEY     |
| claude     | ANTHROPIC_API_KEY  |
| google     | GOOGLE_API_KEY     |
| mistral    | MISTRAL_API_KEY    |
| groq       | GROQ_API_KEY       |
| perplexity | PERPLEXITY_API_KEY |
| grok       | GROK_API_KEY       |
| fal        | FAL_KEY            |
| ampcode    | AMPCODE_API_KEY    |
| opencode   | OPENCODE_API_KEY   |
| nous       | NOUS_API_KEY       |
| deepseek   | DEEPSEEK_API_KEY   |
| replicate  | REPLICATE_API_KEY  |

### 1Password Item Structure

- **thefocus vault**: Items named `{vault-slug} service account token` with category `API_CREDENTIAL`, containing a `credential` field (the `ops_...` token) and a custom `vault` field (the target vault name)
- **Client vaults**: Items named with env-var names (e.g. `OPENAI_API_KEY`) with category `PASSWORD`, where the password field holds the API key value

### Discovery Flow

```
Master SA token → read thefocus vault → find all API_CREDENTIAL items
  named * service account token → for each, extract `vault` field
  → use that SA to read the client's vault
  → find items matching provider env-var names
  → return { clientName, vaultName, keys }
```

### Notification Flow

After each check cycle, the notification engine:

1. Gets per-client thresholds from the `clients` table
2. Compares check results against thresholds
3. Groups by severity (critical, warning, healthy, error)
4. Sends one consolidated notification per configured client channel
5. Logs to `notification_log`

### API Server Routes

```
GET  /api/health              — health check
GET  /api/clients             — list clients with latest check status
GET  /api/clients/:id/usage   — check history for a client
POST /api/sync                — manually trigger 1Password sync
POST /api/check               — manually trigger provider checks
```

The dashboard SPA is served at `/` with SPA fallback.

## Testing Decisions

- **TDD is mandatory** — every module must have tests written before its implementation
- **Test external behavior, not implementation details** — test what a module returns/does, not how it does it
- **Mock at the I/O boundary** — 1Password interactions should be mockable via a test double that returns known responses; provider checks should be mockable so tests don't make real API calls
- **Prior art**: Existing `src/providers/claude.test.ts`, `src/providers/google.test.ts`, `src/providers/new-providers.test.ts`, and `src/shared/provider-factory.test.ts` demonstrate the project's testing patterns
- **Which modules will be tested**:
  - `onepassword-discovery` — all discovery logic (mock op CLI output)
  - `provider-checker` — parallel execution, error isolation, result aggregation
  - `client-registry` — sync logic, CRUD operations
  - `usage-store` — insert and query operations
  - `notification-engine` — threshold evaluation, channel dispatch
  - `api-server` — route responses (using Fastify's `inject`)

## Out of Scope

- Clerk authentication / multi-user support — not needed for an internal ops tool
- Encrypted key storage in the database — 1Password is the sole credential source
- Google OAuth for billing — will be handled separately if needed
- Admin/billing keys (Anthropic admin key, OpenAI org costs) — future feature
- macOS menu bar app — no longer part of the vision
- TUI (Ink.js terminal UI) — no longer needed
- The original CLI tool (`src/cli/main.ts`) — being replaced by the server
- 1Password key import endpoint (POST /api/keys/1password-import) — unnecessary when 1Password is the source
- Multi-user team features, role-based access — not needed
- Usage trends / charts in dashboard — phase 2 enhancement
- Rate limiting on API endpoints — not needed for internal use

## Further Notes

### Phase Plan

The build is split into three phases:

**Phase B — Foundation** (current PRD scope)

- Strip the database to 3 tables: clients, usage_checks, notification_log
- Remove all Clerk auth, encryption, OAuth, user management
- Rebuild the server with simple routes
- Write all test infrastructure

**Phase A — 1Password Discovery** (next)

- Implement the onepassword-discovery module
- Wire it into the client-registry sync
- Write tests with mocked 1Password responses

**Phase C — End-to-End** (final)

- Wire discovery → checker → store → notify → output
- Dashboard UI showing per-client status
- Status file output for agent skills
- Deploy

### 1Password Bootstrap

The master service account token is provided via fnox/mise at runtime as `OP_SERVICE_ACCOUNT_TOKEN`. The tool does not store this token — it reads it from the environment, which fnox injects on `cd` into the project directory. Follow the standard Focus.AI best-practices for fnox setup (`.fnox/env`, service account in thefocus vault, etc.).

### Provider Changes

The 14 existing provider implementations (`src/providers/`) are unchanged. They accept a `ProviderConfig` with an API key and authenticate/check usage independently. The checker module just needs to pass them credentials from 1Password instead of from the database.
