# Usage Monitor — Development Tasks

## Architecture (Hosted Application)

- **Platform**: VPS (Node.js process)
- **Database**: PostgreSQL (Drizzle ORM)
- **Auth**: Clerk/Auth0 — multi-user with organizations
- **Framework**: Fastify API + React/Vite dashboard + existing CLI
- **Scheduling**: node-cron (hourly)
- **Notifications**: Slack, Discord, Email
- **Key storage**: Encrypted in DB (AES-256-GCM), optional 1Password import

## Completed Phases

### Phase 1: Database + Server Scaffold ✅

- [x] PostgreSQL schema with Drizzle ORM (7 tables)
- [x] AES-256-GCM key encryption at rest
- [x] Fastify server with health check, CORS, shutdown
- [x] Drizzle migration generated

### Phase 2: Key Management API ✅

- [x] POST /api/keys — add key (encrypted)
- [x] GET /api/keys — list keys (masked)
- [x] DELETE /api/keys/:id — remove key (admin only)
- [x] POST /api/keys/1password-import — placeholder
- [x] Clerk auth middleware with org/user auto-provisioning
- [x] Dev mode auth bypass

### Phase 3: Provider Runner + Cron ✅

- [x] Shared provider factory (CLI + server)
- [x] Checker: load keys from DB, decrypt, run providers, store results
- [x] Scheduler: node-cron hourly + manual trigger
- [x] Parallel provider execution with error isolation

### Phase 4: New Providers ✅ (4 new, 12 total)

- [x] **fal.ai** — billing API (credit balance, usage records)
- [x] **ampcode.com** — JSON-RPC balance check
- [x] **opencode.ai** — models list (best-effort)
- [x] **nousresearch.com** — Forge API models (best-effort)
- [x] KNOWN_SERVICES entries for auto-detection
- [x] Provider tests (13 new)

### Phase 5: Dashboard UI ✅

- [x] React + Vite app in `src/server/dashboard/`
- [x] Key management: add/list/delete with provider picker
- [x] Usage history: latest checks per key with balances
- [x] API client with auth token support
- [x] Server serves built dashboard via @fastify/static
- [x] Dashboard builds to `src/server/dashboard/dist/`

### Phase 6: Notifications ✅

- [x] Slack webhook sender (Block Kit formatting)
- [x] Discord webhook sender (embed formatting)
- [x] Email sender (Resend, SendGrid, SMTP fallback)
- [x] Notification orchestrator with per-org thresholds
- [x] Notification log in database
- [x] Wired into cron scheduler

### Legacy: TypeScript Migration & Multi-Provider ✅

- [x] OpenRouter, Google, OpenAI, Mistral, Groq, Grok, Claude, Perplexity
- [x] 1Password CLI integration + setup wizard
- [x] Zod configuration validation
- [x] Vitest test suite (47 tests)

## Pending / Future

### Near-term

- [ ] Implement 1Password key import endpoint (POST /api/keys/1password-import)
- [ ] Anthropic org-level cost/usage API integration (needs org admin key)
- [ ] OpenAI /organization/costs API integration
- [ ] Dashboard: auth login flow (Clerk React components)
- [ ] Dashboard: org settings (notification configs, thresholds)
- [ ] Dashboard: usage trends / charts
- [ ] Replicate provider

### Medium-term

- [ ] CI/CD pipeline (lint, test, deploy)
- [ ] Docker container for deployment
- [ ] Rate limiting on API endpoints
- [ ] API key rotation support
- [ ] Usage analytics and reporting
- [ ] Export functionality (CSV, JSON)

### Long-term

- [ ] Webhook for external alerting
- [ ] Team management UI
- [ ] Provider cost comparison
- [ ] Budget forecasting
