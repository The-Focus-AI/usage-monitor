# Usage Monitor — Multi-Provider API Usage & Spend Tracker

A hosted application that monitors API usage, credit balances, spend limits, and billing data across **14 AI providers**. Supports both simple API keys and separate billing/admin credentials (Anthropic Admin API keys, Google Cloud OAuth tokens).

## Providers

| #   | Provider               | Auth                | Spend                | Credits/Balance      | Limits         | Billing Tier |
| --- | ---------------------- | ------------------- | -------------------- | -------------------- | -------------- | ------------ |
| 1   | **OpenRouter**         | API key             | ✅ API               | ✅ API               | ✅ API         | Paid         |
| 2   | **OpenAI**             | API key             | ✅ org costs API     | ⚠️ best-effort       | ❌             | Paid         |
| 3   | **Claude (Anthropic)** | API key / Admin key | ✅ **Admin API**     | ✅ Admin API         | ✅ Admin API   | Paid         |
| 4   | **Google AI Studio**   | API key / OAuth     | ⚠️ via Cloud Billing | ⚠️ via Cloud Billing | ⚠️ via Budgets | Free/Paid    |
| 5   | **Mistral AI**         | API key             | ❌ (console only)    | ❌                   | ❌             | Paid         |
| 6   | **Groq**               | API key             | ❌ (Enterprise only) | ❌                   | ❌             | Paid         |
| 7   | **Grok (xAI)**         | API key             | ✅ API               | ✅ API ($25/mo)      | ❌             | Free tier    |
| 8   | **Perplexity**         | API key             | ❌ (invoice only)    | ❌                   | ❌             | Paid         |
| 9   | **fal.ai**             | API key             | ✅ API               | ✅ API               | ❌             | Prepaid      |
| 10  | **Ampcode**            | JSON-RPC            | ✅ JSON-RPC          | ✅ JSON-RPC          | ⚠️ per-hour    | Free + Paid  |
| 11  | **OpenCode Zen**       | API key             | ❌                   | ❌                   | ❌             | Prepaid      |
| 12  | **Nous Research**      | API key             | ❌                   | ❌                   | ❌             | Paid         |
| 13  | **DeepSeek**           | API key             | ✅ API               | ✅ API (CNY)         | ❌             | Prepaid      |
| 14  | **Replicate**          | API key             | ❌ (web only)        | ❌                   | ❌             | Paid         |

### Billing Key Support

Some providers separate their regular API key from billing/admin credentials:

| Provider   | Billing Credential                | What It Unlocks                                                                           |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| **Claude** | Admin API key (`sk-ant-admin...`) | Real-time cost reports, token usage per model, cache efficiency, per-workspace breakdowns |
| **Google** | OAuth 2.0 access token            | Cloud Billing API: billing accounts, budgets, project linkage                             |

Providers automatically detect billing credentials and switch from basic mode (model lists, static info) to rich mode (live spend, token counts, billing details).

## Architecture

```
  Users (Clerk auth) ──► Fastify API ──► PostgreSQL
                              │
                         ┌────┴────┐
                    Web Dashboard   Cron Scheduler
               (React + Tailwind v4) (node-cron hourly)
                    (Focus.AI Labs)       │
                              │     Provider Runner
                              │     (14 providers,
                              │      parallel checks)
                              │      ┌────┴────┐
                              │  API keys      OAuth tokens
                              │  (encrypted)   (auto-refresh)
                              │           │
                              │      Notifications
                              │      (Slack/Discord/Email)
                                   ┌────┴────┐
                              Check Results
                              (per-key health,
                               error messages,
                               historical)
```

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm
- PostgreSQL (local or hosted)
- 1Password CLI (optional, for key import)

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment
cp env.template .env
# Edit .env with your DATABASE_URL, ENCRYPTION_KEY, etc.

# Run database migrations
pnpm db:migrate

# Start the server
pnpm server

# Or with auto-reload
pnpm server:dev
```

### Scripts

| Command                | Description                            |
| ---------------------- | -------------------------------------- |
| `pnpm check`           | Run CLI usage check (local config mode) |
| `pnpm status`          | Show key health table from database     |
| `pnpm status:json`     | Show key health as JSON                 |
| `pnpm server`          | Start the API + dashboard server        |
| `pnpm server:dev`      | Start server with auto-reload           |
| `pnpm dashboard:dev`   | Start dashboard dev server (port 5173)  |
| `pnpm dashboard:build` | Build dashboard for production          |
| `pnpm test:run`        | Run all tests (98 tests, 9 files)       |
| `pnpm test:ui`         | Open Vitest UI                          |
| `pnpm db:generate`     | Generate Drizzle migrations            |
| `pnpm db:migrate`      | Run pending migrations                 |
| `pnpm db:push`         | Push schema directly to DB             |
| `pnpm db:studio`       | Open Drizzle Studio                    |

## Environment Variables

| Variable               | Required | Description                                                                 |
| ---------------------- | -------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string                                                |
| `ENCRYPTION_KEY`       | Yes      | 64-char hex key for encrypting API keys and OAuth tokens                    |
| `PORT`                 | No       | Server port (default: 3000)                                                 |
| `CRON_SCHEDULE`        | No       | Cron expression (default: hourly at minute 0)                               |
| `LOG_LEVEL`            | No       | Pino log level (default: info)                                              |
| `NODE_ENV`             | No       | Set to `development` for dev mode auth bypass                               |
| `DEV_USER_ID`          | No       | Dev mode: user UUID                                                         |
| `DEV_ORG_ID`           | No       | Dev mode: org UUID                                                          |
| `SLACK_WEBHOOK_URL`    | No       | Default Slack webhook (CLI mode)                                            |
| `RESEND_API_KEY`       | No       | Resend API key for email notifications                                      |
| `SENDGRID_API_KEY`     | No       | SendGrid API key for email notifications                                    |
| `GOOGLE_CLIENT_ID`     | No       | Google OAuth client ID (for Cloud Billing integration)                      |
| `GOOGLE_CLIENT_SECRET` | No       | Google OAuth client secret                                                  |
| `GOOGLE_REDIRECT_URI`  | No       | OAuth callback URL (e.g. `http://localhost:3000/api/oauth/google/callback`) |

Generate an encryption key:

```bash
openssl rand -hex 32
```

## API Endpoints

### Keys

| Method | Path                         | Auth  | Description                                                |
| ------ | ---------------------------- | ----- | ---------------------------------------------------------- |
| GET    | `/api/keys`                  | Yes   | List org's API keys (masked) with latest check status      |
| POST   | `/api/keys`                  | Yes   | Add a new API key (auto-runs initial check)                |
| PATCH  | `/api/keys/:id`              | Yes   | Update key value, billing key, or label                    |
| POST   | `/api/keys/:id/check`        | Yes   | Retry a check for a single key                             |
| DELETE | `/api/keys/:id`              | Admin | Remove an API key                                          |
| POST   | `/api/keys/1password-import` | Yes   | Import keys from 1Password (WIP)                           |

The `GET /api/keys` response now includes per-key health data:

```json
{
  "keys": [{
    "id": "...",
    "provider": "openai",
    "label": "Production",
    "keyPreview": "****abcd",
    "isActive": true,
    "lastCheckStatus": "error",
    "lastCheckError": "Authentication failed — key may be invalid or expired",
    "lastCheckAt": "2026-05-06T12:00:00.000Z",
    ...
  }]
}
```

### Usage

| Method | Path         | Auth | Description                     |
| ------ | ------------ | ---- | ------------------------------- |
| GET    | `/api/usage` | Yes  | Get latest usage checks for org |
| POST   | `/api/check` | No   | Trigger a manual usage check    |

### Health

| Method | Path          | Auth | Description              |
| ------ | ------------- | ---- | ------------------------ |
| GET    | `/api/health` | No   | Health check + DB status |

### OAuth (Google Cloud Billing)

| Method | Path                         | Auth        | Description                                  |
| ------ | ---------------------------- | ----------- | -------------------------------------------- |
| GET    | `/api/oauth/google/start`    | Yes (Clerk) | Redirect to Google OAuth consent screen      |
| GET    | `/api/oauth/google/callback` | No (state)  | Handle Google OAuth redirect callback        |
| GET    | `/api/oauth/google/status`   | Yes (Clerk) | Check if org has valid Google billing tokens |
| DELETE | `/api/oauth/google/revoke`   | Admin       | Revoke Google billing access                 |

### Web Dashboard

| Method | Path           | Auth | Description                                 |
| ------ | -------------- | ---- | ------------------------------------------- |
| GET    | `/dashboard/*` | No   | Web dashboard (SPA, served as static files) |

## CLI Status Tool

The `pnpm status` command connects to the same database as the server and displays the health of all API keys from the terminal — no browser needed.

```
pnpm status
```

Output:

```
PROVIDER       LABEL                  STATUS       LAST CHECK   ERROR
────────────────────────────────────────────────────────────────────────────────────
✗ openai       Production             ERROR        2h ago
  │ Authentication failed — key may be invalid or expired
✓ claude       Dev                    WORKING      just now
✓ grok         Staging                WORKING      15m ago
○ deepseek     Research               UNCHECKED    —
– google       Old Key                INACTIVE     3d ago

5 keys: 2 working, 1 with errors, 1 unchecked, 1 inactive
```

**Options:**

| Flag | Description |
|------|-------------|
| `--org <uuid>` | Specify a different org ID (default: `DEV_ORG_ID` from `.env`) |
| `--json` | Output raw JSON for scripting (`pnpm status:json` shortcut) |

**Health states:**

| Icon | State | Meaning |
|------|-------|---------|
| `✓` (blue) | Working | Latest check succeeded |
| `✗` (red) | Error | Latest check failed, error shown below |
| `○` (gray) | Unchecked | No check has been run yet |
| `–` (dim) | Inactive | Key is disabled |

Keys are sorted: **errors first**, then unchecked, working, inactive — same as the dashboard.

## Clerk Auth & OAuth

Two separate OAuth systems coexist:

- **Clerk OAuth** → User identity. Who are you? Which org do you belong to?
- **Google Cloud Billing OAuth** → API authorization. Can our server read your GCP billing?

They connect via the Clerk `orgId`. When a user (already authenticated by Clerk) initiates Google billing OAuth, the resulting tokens are stored per-org in the `oauth_tokens` table. The callback route uses an HMAC-signed `state` parameter to verify the OAuth redirect is genuine and to link tokens to the correct Clerk org.

## Dashboard

The web dashboard is a React + Tailwind CSS v4 SPA at `src/server/dashboard/`. It uses the **Focus.AI Labs** design system — a research-report aesthetic inspired by Bell Labs publications.

### Design

- **Color palette**: Warm paper (`#f3f2ea`), Void (`#1a1a1a`), Rand-Blue (`#0055aa`), Alert-Red (`#d93025`)
- **Typography**: Inter (UI), Courier Prime (labels, metadata, data)
- **Grid**: 8px base unit, 12-column responsive layout, generous section padding
- **Visual rhythm**: Hierarchy via opacity, not gray shades. Mono uppercase labels with wide tracking.
- **Distinctive elements**: Offset shadow containers, tab navigation with lifted active states, 1px void-grid card lists, auto-numbered sections

### Features

- **Key Management**: Add, view, retry, edit, and remove API keys with provider selection
- **Key Health Status**: Every key shows a health indicator at a glance:
  - **Working** (blue dot) — Latest check succeeded
  - **Not Working** (red dot) — Latest check failed, with error message displayed
  - **Unchecked** (gray dot) — No check has been run yet
  - **Inactive** (muted) — Key is disabled
- **Inline Fix**: Edit key credentials directly from the key list — update the API key, billing key, or both without delete/re-add
- **Per-Key Retry**: Re-check any individual key on demand
- **Usage History**: Latest check results per key with balances, spend, and status. Historical data table.
- **OAuth Status**: Check and manage Google Cloud Billing connections
- **Provider Autodetect**: Newly added keys are automatically checked to show health immediately

### Key Health States

| State | Visual | Behavior |
|-------|--------|----------|
| **Working** | Blue dot + "Working" badge | Shows "Re-check" button for manual re-verification |
| **Not Working** | Red dot + "Not Working" badge | Error message displayed in red left-bordered callout. Shows "Fix" and "Retry" buttons |
| **Unchecked** | Gray dot + "Unchecked" badge | No check has been run. Shows "Fix" and "Retry" buttons |
| **Inactive** | Muted dot + "Inactive" badge | Key is disabled, not monitored. No actions available |

Keys are sorted by health priority: **errors first → unchecked → working → inactive** — so problems are always at the top.

### Development

```bash
# Start Vite dev server with API proxying (port 5173)
pnpm dashboard:dev

# Build for production
pnpm dashboard:build
```

In development, the Vite dev server proxies `/api` requests to `http://localhost:3000`.
In production, the Fastify server serves the built static files from `dist/`.

## Notifications

Multi-channel notifications with per-org configuration:

- **Slack**: Webhook-based, Block Kit formatting
- **Discord**: Webhook-based, embed formatting
- **Email**: Resend, SendGrid, or SMTP

Notifications fire after each scheduled check. Thresholds are configurable per org per channel (warning + critical levels).

## Project Structure

```
src/
├── cli/                    # CLI tool (pnpm check)
│   └── main.ts
├── config/                 # Configuration (1Password, service detection)
├── db/                     # Database layer
│   ├── schema.ts           # Drizzle ORM schema (8 tables)
│   ├── index.ts            # DB connection
│   ├── encryption.ts       # AES-256-GCM key encryption
│   └── encryption.test.ts
├── providers/              # 14 provider implementations
│   ├── openrouter.ts       # OpenRouter — real-time credits/usage API
│   ├── openai.ts           # OpenAI — org costs API + legacy credit grants
│   ├── claude.ts           # Anthropic — Admin API (cost_report, usage_report) + regular fallback
│   ├── google.ts           # Google — AI Studio models + Cloud Billing API (OAuth)
│   ├── grok.ts             # xAI — models + test chat for token counts
│   ├── deepseek.ts         # DeepSeek — balance API (CNY)
│   ├── fal.ts              # fal.ai — billing credits + usage records
│   ├── ampcode.ts          # Ampcode — JSON-RPC balance parser
│   ├── mistral.ts          # Mistral — models only
│   ├── groq.ts             # Groq — active models only
│   ├── perplexity.ts       # Perplexity — models only
│   ├── opencode.ts         # OpenCode Zen — models only
│   ├── nous.ts             # Nous Research — static model info
│   ├── replicate.ts        # Replicate — account info only
│   ├── claude.test.ts      # 12 tests: admin/regular paths, emoji, status, billing
│   ├── google.test.ts      # 9 tests: billing key detection, formatting, billing
│   ├── new-providers.test.ts  # 13 tests: fal, ampcode, opencode, nous
├── server/                 # Hosted application
│   ├── index.ts            # Fastify server + static dashboard + oauth routes
│   ├── main.ts             # Entry point
│   ├── auth.ts             # Clerk auth middleware
│   ├── checker.ts          # Provider runner (decrypts keys, injects OAuth tokens)
│   ├── scheduler.ts        # Cron scheduler
│   ├── oauth/              # OAuth integration
│   │   ├── google.ts       # Google OAuth: URL builder, token exchange, refresh, revoke
│   │   └── google.test.ts  # 3 tests: URL construction, invalid state handling
│   ├── routes/             # API routes
│   │   ├── health.ts       # Health check
│   │   ├── keys.ts         # Key CRUD with health status, single-key retry, inline edit
│   │   ├── oauth.ts        # OAuth: start, callback, status, revoke
│   │   └── usage.ts        # Usage history
│   ├── notifications/      # Slack, Discord, Email
│   │   ├── index.ts, slack.ts, discord.ts, email.ts
│   └── dashboard/          # React + Vite web UI (Focus.AI Labs brand)
│       └── src/
│           ├── styles.css   # Tailwind v4 with Labs design tokens
│           ├── App.tsx      # Main app with hero, tabs, status
│           ├── api.ts       # API client with key health types
│           └── components/
│               ├── AddKeyForm.tsx   # Add key form with billing hints
│               ├── KeyList.tsx      # Key health, inline fix, retry
│               └── UsageHistory.tsx # Latest checks + historical table
├── shared/                 # Shared types, utils, provider factory
│   ├── types.ts            # UsageData, BillingData, ProviderConfig, BaseAPIProvider
│   ├── utils.ts            # Formatting, date helpers
│   ├── utils.test.ts
│   ├── provider-factory.ts # 14-provider factory with optional billingKey
│   └── provider-factory.test.ts  # 4 tests
└── tui/                    # Ink.js interactive setup
```

## Data Model

```
organizations ──┬── api_keys ──────── usage_checks
                ├── org_members
                ├── oauth_tokens ─── (auto-refreshed Google access tokens)
                ├── org_notification_configs
                └── notification_log
users ──────────┴── org_members
```

### Tables

| Table                      | Description                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- |
| `organizations`            | Clerk-synced orgs with slug                                                  |
| `users`                    | Clerk-synced users                                                           |
| `org_members`              | User-to-org memberships with role                                            |
| `api_keys`                 | Encrypted API keys (with optional `billing_key_value` for admin/OAuth creds) |
| `oauth_tokens`             | Encrypted OAuth access + refresh tokens (per org per provider)               |
| `usage_checks`             | Append-only log of every provider check with balances                        |
| `org_notification_configs` | Per-org per-channel notification thresholds                                  |
| `notification_log`         | Sent notification history                                                    |

### Security

- **api_keys.key_value**: Encrypted at rest with AES-256-GCM
- **api_keys.billing_key_value**: Same encryption, for admin/OAuth credentials
- **oauth_tokens.access_token**: Encrypted at rest
- **oauth_tokens.refresh_token**: Encrypted at rest
- Keys are only decrypted during active provider checks; never logged or exposed in API responses
- OAuth tokens auto-refresh before expiry; failed refreshes trigger deletion

## Billing Key Setup

Some providers separate API keys from billing credentials. Adding a billing key unlocks real spend, usage, and cost data.

### OpenAI — Organization Admin Key

To get cost and spend data, you need an API key from an **organization owner/admin** account:

1. Go to [platform.openai.com/settings/organization/admin-keys](https://platform.openai.com/settings/organization/admin-keys)
2. Create a new API key (must be done by an org owner or admin member)
3. This key will have permission to access `/organization/usage/costs` — the endpoint that returns actual monthly spend
4. Add it as the `billingKeyValue` when creating your OpenAI key:
   ```json
   POST /api/keys
   {
     "provider": "openai",
     "label": "OpenAI Org Admin",
     "keyValue": "sk-proj-your-regular-key",
     "billingKeyValue": "sk-proj-your-org-admin-key"
   }
   ```

**Note**: Regular API keys (non-admin) can only verify model access — they return `$0.00` for spend because the costs API requires organization billing permissions.

### Anthropic (Claude) — Admin API Key

Anthropic's Admin API provides live cost reports, token usage, and per-model breakdowns:

1. Go to [console.anthropic.com/settings/admin-keys](https://console.anthropic.com/settings/admin-keys)
2. Create an Admin API key (starts with `sk-ant-admin...`)
3. Requires organization owner/admin role — standard keys (`sk-ant-api03...`) cannot access the Admin API
4. The admin key can be provided either as the main `keyValue` (detected automatically by the `sk-ant-admin` prefix) or as a separate `billingKeyValue`:
   ```json
   POST /api/keys
   {
     "provider": "claude",
     "label": "Claude with Admin",
     "keyValue": "sk-ant-api03-your-regular-key",
     "billingKeyValue": "sk-ant-admin-your-admin-key"
   }
   ```

Without an admin key, the Claude provider shows available models but no cost data. With it, you get real-time spend, token counts per model, cache efficiency stats, and per-workspace breakdowns.

## Google Cloud Billing Setup

To enable Cloud Billing monitoring for Gemini/Vertex AI usage:

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add the redirect URI (e.g. `http://localhost:3000/api/oauth/google/callback`)
4. Set in `.env`:
   ```bash
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback
   ```
5. In the dashboard, navigate to Google and click "Connect Billing"
6. Grant the Cloud Billing read-only scope
7. The scheduler will automatically use the OAuth token for billing data

**Note**: Detailed per-service spend data requires setting up [BigQuery Billing Export](https://cloud.google.com/billing/docs/how-to/export-data-bigquery) in GCP. Without it, the integration shows billing accounts, budgets, and AI Studio model availability.

---

## Roadmap

### Current (v0.1)

- ✅ 14 provider implementations with parallel checks
- ✅ Encrypted API key storage (AES-256-GCM)
- ✅ Clerk authentication with org-based isolation
- ✅ Google Cloud Billing OAuth integration
- ✅ Cron-based hourly scheduler
- ✅ Multi-channel notifications (Slack, Discord, Email)
- ✅ Web dashboard with Focus.AI Labs brand design
- ✅ Per-key health status (working / not working / unchecked)
- ✅ Error messages displayed inline on failed keys
- ✅ Single-key retry (re-check without re-adding)
- ✅ Inline key editing (fix credentials without delete/re-add)
- ✅ Auto-initial check on key creation
- ✅ Keys sorted by health (errors first)

### In Progress

- ⏳ 1Password key import — discover and sync API keys from 1Password vaults (`POST /api/keys/1password-import` is stubbed)
- ⏳ Notification threshold configuration UI — per-provider, per-channel thresholds (warning + critical) with dashboard controls
- ⏳ Historical trend charts — spend and balance over time per provider

### Planned

- 📋 Per-provider model/endpoint enable/disable — granular control over which models each key can access
- 📋 Rate limit monitoring — track 429 responses, retry-after headers, per-endpoint rate limit usage
- 📋 Alert rules — configurable conditions (balance below threshold, spend spike, auth failure) with per-channel routing
- 📋 Multi-org admin dashboard — switch between orgs, view aggregated stats
- 📋 Key rotation reminders — auto-notify on key age or expiry
- 📋 Webhook notifications — POST check results to arbitrary URLs for custom integrations
- 📋 Scheduled check overrides — per-key check frequency (e.g., high-usage keys checked every 15 min)
- 📋 Bulk operations — select and retry/fix/delete multiple keys at once
- 📋 Audit log — tracked changes to keys, notifications, and configuration
