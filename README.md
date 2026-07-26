# Usage Monitor

Company-wide API usage monitor for Focus.AI client/project vaults.

The current architecture treats **1Password as the source of truth for credentials** and **Neon/Postgres as the history store** for monitoring results. API keys are resolved at runtime and are not stored in the database.

## Where we are

### Implemented

- Simplified Fastify server with static React dashboard serving
- Simplified Drizzle schema:
  - `clients`
  - `client_key_inventory` (non-secret discovered item names)
  - `usage_checks`
  - `notification_log`
- 14-provider factory and provider implementations
- 1Password discovery through injectable `op` CLI runner
- Non-secret key inventory preview:
  - `GET /api/discovery-preview`
  - `POST /api/discovery-preview/refresh`
- Client sync from 1Password:
  - `POST /api/sync`
- Provider checks:
  - env-var fallback check path
  - discovered-key check path
  - `POST /api/check`
- Full cycle:
  - discovery → sync → check → notify → status file
  - `POST /api/full-cycle`
- Status file output at `STATUS_OUTPUT_PATH` or `~/.usage-monitor/status.json`
- React dashboard client list, discovery preview, manual check/full-cycle controls, and per-client usage view
- GitHub issue workflow in `AGENTS.md`

### Current caveats

- DB-backed tests currently use the configured Neon database, so test files must run serially.
- Some older CLI/config/TUI files still exist for backward compatibility and are not the main path forward.
- The dashboard package is nested under `src/server/dashboard/` and has its own dependencies.
- The checker still has an env-var fallback path for tests/local development.

## Provider coverage

The discovery module looks for these 1Password item titles in client vaults:

| Provider           | Item title / env var |
| ------------------ | -------------------- |
| OpenRouter         | `OPENROUTER_API_KEY` |
| OpenAI             | `OPENAI_API_KEY`     |
| Claude / Anthropic | `ANTHROPIC_API_KEY`  |
| Google             | `GOOGLE_API_KEY`     |
| Mistral            | `MISTRAL_API_KEY`    |
| Groq               | `GROQ_API_KEY`       |
| Grok / xAI         | `GROK_API_KEY`       |
| Perplexity         | `PERPLEXITY_API_KEY` |
| fal.ai             | `FAL_KEY`            |
| Ampcode            | `AMPCODE_API_KEY`    |
| OpenCode Zen       | `OPENCODE_API_KEY`   |
| Nous Research      | `NOUS_API_KEY`       |
| DeepSeek           | `DEEPSEEK_API_KEY`   |
| Replicate          | `REPLICATE_API_KEY`  |

Additional aliases can be added in the discovery module when we find real-world vault item names that do not match the env-var convention.

## 1Password model

The expected 1Password structure is:

```text
thefocus vault
├── distro-logic service account token
│   ├── credential = ops_...
│   └── vault = Distro-Logic
├── trinity-hunt-pilot service account token
│   ├── credential = ops_...
│   └── vault = Trinity Hunt Pilot
└── ...

Client/project vault
├── OPENAI_API_KEY
├── ANTHROPIC_API_KEY
├── GOOGLE_API_KEY
└── ...
```

The app itself is bootstrapped by fnox/mise. `OP_SERVICE_ACCOUNT_TOKEN` should be injected into the shell for this project and should allow reading the `thefocus` vault.

## Setup

```bash
pnpm install
pnpm db:migrate
```

Required environment:

| Variable                   | Required                | Purpose                                        |
| -------------------------- | ----------------------- | ---------------------------------------------- |
| `DATABASE_URL`             | yes                     | Neon/Postgres connection string                |
| `OP_SERVICE_ACCOUNT_TOKEN` | for 1Password discovery | Service account token that can read `thefocus` |
| `PORT`                     | no                      | API server port, default `3000`                |
| `HOST`                     | no                      | API host, default `0.0.0.0`                    |
| `LOG_LEVEL`                | no                      | Fastify logger level                           |
| `CRON_SCHEDULE`            | no                      | Default `0 * * * *`                            |
| `STATUS_OUTPUT_PATH`       | no                      | Defaults to `~/.usage-monitor/status.json`     |

## Scripts

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `pnpm server`          | Start Fastify server                     |
| `pnpm server:dev`      | Start Fastify server with `tsx watch`    |
| `pnpm dashboard:dev`   | Start Vite dashboard dev server          |
| `pnpm dashboard:build` | Build dashboard                          |
| `pnpm test:run`        | Run the full Vitest suite serially       |
| `pnpm test`            | Vitest watch mode, also serial by config |
| `pnpm test:ui`         | Vitest UI                                |
| `pnpm db:generate`     | Generate Drizzle migration               |
| `pnpm db:migrate`      | Apply Drizzle migrations                 |
| `pnpm db:push`         | Push schema directly                     |
| `pnpm db:studio`       | Open Drizzle Studio                      |

## API endpoints

| Method | Path                             | Purpose                                                               |
| ------ | -------------------------------- | --------------------------------------------------------------------- |
| `GET`  | `/api/health`                    | Server + DB health check                                              |
| `GET`  | `/api/clients`                   | Clients with latest overall check status                              |
| `GET`  | `/api/clients/:id/usage`         | Usage history for one client                                          |
| `GET`  | `/api/discovery-preview`         | Cached non-secret key inventory                                       |
| `POST` | `/api/discovery-preview/refresh` | Refresh cached inventory from 1Password without reading secret values |
| `POST` | `/api/sync`                      | Full 1Password discovery and client sync                              |
| `POST` | `/api/check`                     | Run provider checks using env-var fallback path                       |
| `POST` | `/api/full-cycle`                | Run discovery → sync → check → notify → status output                 |

## Testing walkthrough

### Rules

- Always use **pnpm**.
- Always use **Vitest**.
- Write tests before implementation.
- Prefer module-level tests next to the file under test. The existing slice tests in `src/__tests__/` are legacy/tracer-bullet tests and should not be used as the pattern for new module tests.
- Do not call real provider APIs from unit tests. Test provider orchestration with controlled inputs or injectable boundaries.
- 1Password tests should mock the injectable `op` runner, except for an explicit manual smoke test.

### Clean baseline

Run the full suite with:

```bash
pnpm test:run
```

Current clean baseline:

```text
Test Files  14 passed (14)
Tests       143 passed (143)
```

Why serial? Several slice tests use the same Neon database and exercise sync/deactivation behavior. Parallel test files can race and produce false failures such as a client becoming inactive during another test. `pnpm test:run` is configured with `--fileParallelism=false` and `vitest.config.ts` also sets `fileParallelism: false`.

Do **not** use plain `pnpm vitest run` for the full suite unless you also pass `--fileParallelism=false`.

### Fast focused runs

Run one slice/module test while iterating:

```bash
pnpm vitest run src/__tests__/slice4.test.ts --fileParallelism=false
pnpm vitest run src/server/dashboard/src/api.test.ts --fileParallelism=false
pnpm vitest run src/providers/new-providers.test.ts --fileParallelism=false
```

### TDD loop for a new issue

1. Read the GitHub issue and its blockers.
2. Mark it `agent-working` per `AGENTS.md`.
3. Write a failing test first.
4. Run only that test file and confirm it fails for the expected reason.
5. Implement the smallest code path to pass.
6. Re-run the focused test.
7. Run the full suite:

   ```bash
   pnpm test:run
   ```

8. Commit locally, summarize results, and ask the user for validation before pushing.

### DB-backed test hygiene

- Use unique test prefixes for inserted data.
- Clean up by prefix in `beforeAll`/`afterAll`.
- Avoid assertions that depend on unrelated rows already in Neon.
- Avoid global sync operations in parallel tests; they can deactivate clients outside the test's intent.
- If a DB test fails unexpectedly, re-run it serially in isolation before changing application code.

### Manual 1Password smoke test

Only run this when intentionally validating live 1Password access:

```bash
op vault list --format json | jq '.[].name'
pnpm server:dev
curl -X POST http://localhost:3000/api/discovery-preview/refresh
curl http://localhost:3000/api/discovery-preview
```

Expected behavior:

- If `OP_SERVICE_ACCOUNT_TOKEN` is unset, refresh returns `503`.
- If set correctly, refresh returns clients and non-secret item inventory.
- The inventory includes item names/categories and whether each item is monitored; it does not include key values.

### Manual server smoke test

```bash
pnpm server:dev
curl http://localhost:3000/api/health
curl http://localhost:3000/api/clients
curl -X POST http://localhost:3000/api/full-cycle
```

Expected behavior:

- `/api/health` returns `status: ok` when DB is reachable.
- `/api/clients` returns a client array.
- `/api/full-cycle` returns a summary and writes the status file.

### Dashboard smoke test

In two terminals:

```bash
pnpm server:dev
pnpm dashboard:dev
```

Open `http://localhost:5173`. The dashboard should show:

- client list
- discovery preview refresh
- manual check/full-cycle controls
- per-client usage history

### Build checks

The project preference is to validate TypeScript through `tsx`/Vitest rather than relying on `pnpm build` as the main test step. Use `pnpm dashboard:build` when changing dashboard build tooling or release packaging.

## Development workflow

See `AGENTS.md` for the GitHub issue workflow. In short:

1. Pick an open `ready-for-agent` issue with blockers satisfied.
2. Mark it `agent-working`.
3. Build with TDD.
4. Commit locally.
5. Ask the user to validate.
6. Push with a `Closes #<issue>` reference only after approval.
