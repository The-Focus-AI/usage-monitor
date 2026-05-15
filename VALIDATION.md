# Usage Monitor — Validation Guide

Every slice has validation steps below. Run these in order to verify the system
end-to-end.

---

## Prerequisites

```bash
# Start the server
cd /Users/wschenk/The-Focus-AI/usage-monitor
source .env
pnpm server
```

The server will listen on `http://localhost:3000`.

---

## Slice 1: New schema + server boots clean

**Issue:** #3  
**What changed:** Stripped 8 old DB tables down to 3 (`clients`, `usage_checks`,
`notification_log`). Deleted encryption, Clerk auth, OAuth, old route files.

### Validate

```bash
# 1. Server boots and health endpoint works
curl -s http://localhost:3000/api/health | python3 -m json.tool
# Expected: {"status":"ok","database":"connected"}

# 2. Old routes are gone (SPA fallback returns HTML, not JSON)
curl -s -I http://localhost:3000/api/keys | grep content-type
# Expected: text/html (not application/json)

# 3. The 3 new tables exist
psql "$DATABASE_URL" -c "\dt" 2>/dev/null
# Expected: clients, usage_checks, notification_log (only 3 tables)

# 4. Old tables are gone
psql "$DATABASE_URL" -c "\dt" 2>/dev/null
# (no api_keys, organizations, users, etc.)

# 5. Tests pass
pnpm test:run src/__tests__/slice1.test.ts
```

---

## Slice 2: Client registry API

**Issue:** #4  
**What changed:** Built `client-registry` module with CRUD + `syncFromDiscovery`.
Added `GET /api/clients` endpoint.

### Validate

```bash
# 1. List clients (empty initially)
curl -s http://localhost:3000/api/clients | python3 -m json.tool
# Expected: {"clients": []}

# 2. Create a client in the DB directly
CLIENT_ID=$(psql "$DATABASE_URL" -t -A -c "
INSERT INTO clients (name, vault_name, slug)
VALUES ('Validation Client', 'val-vault', 'validation-client')
RETURNING id;
" 2>/dev/null)
echo "Created client: $CLIENT_ID"

# 3. List clients (should show the new one)
curl -s http://localhost:3000/api/clients | python3 -m json.tool
# Expected: {"clients": [{...}]}

# 4. Tests pass
pnpm test:run src/__tests__/slice2.test.ts

# Cleanup
psql "$DATABASE_URL" -c "DELETE FROM clients WHERE id='$CLIENT_ID';" 2>/dev/null
```

---

## Slice 3: Manual provider check via env var

**Issue:** #5  
**What changed:** Built `usage-store` module. Rewrote `checker.ts` to run provider
checks using env vars. Added `POST /api/check` and `GET /api/clients/:id/usage`.

### Validate

```bash
# 1. Create a client to check
CLIENT_ID=$(psql "$DATABASE_URL" -t -A -c "
INSERT INTO clients (name, vault_name, slug, is_active)
VALUES ('Env Check Client', 'env-vault', 'env-check-client', true)
RETURNING id;
" 2>/dev/null)

# 2. Run provider checks
curl -s -X POST http://localhost:3000/api/check | python3 -m json.tool
# Expected: openrouter succeeds (OPENROUTER_API_KEY is in .env),
#            other 13 providers report "not set in environment"

# 3. Check usage history for the client
curl -s "http://localhost:3000/api/clients/$CLIENT_ID/usage" | python3 -m json.tool
# Expected: array of check results with balance, spend, status

# 4. GET /api/clients now shows lastCheckStatus
curl -s http://localhost:3000/api/clients | python3 -c "
import sys,json; d=json.load(sys.stdin)
for c in d['clients']: print(f\"{c['name']}: {c['lastCheckStatus']}\")
"
# Expected: "Env Check Client: success" (openrouter succeeded)

# 5. Tests pass
pnpm test:run src/__tests__/slice3.test.ts

# Cleanup
psql "$DATABASE_URL" -c "DELETE FROM usage_checks WHERE client_id='$CLIENT_ID';" 2>/dev/null
psql "$DATABASE_URL" -c "DELETE FROM clients WHERE id='$CLIENT_ID';" 2>/dev/null
```

---

## Slice 4: 1Password auto-discovery

**Issue:** #6  
**What changed:** Built `onepassword-discovery` module with `discoverClients()`,
`discoverClientKeys()`, `runDiscovery()`. Added `POST /api/sync`. Injectable op
CLI runner for testability.

### Validate

```bash
# 1. POST /api/sync without OP_SERVICE_ACCOUNT_TOKEN
unset OP_SERVICE_ACCOUNT_TOKEN
curl -s -X POST http://localhost:3000/api/sync | python3 -m json.tool
# Expected: 503 with "OP_SERVICE_ACCOUNT_TOKEN not set"

# 2. Set the token (you need a real 1Password service account token)
export OP_SERVICE_ACCOUNT_TOKEN="your_ops_token_here"
curl -s -X POST http://localhost:3000/api/sync | python3 -m json.tool
# Expected: 200 with list of discovered clients and their keys

# 3. Verify clients were synced to the database
curl -s http://localhost:3000/api/clients | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'{len(d[\"clients\"])} clients discovered from 1Password')
for c in d['clients']:
    print(f\"  - {c['name']} ({c['slug']}) active={c['isActive']}\")
"

# 4. Run full cycle (discovery + check + notify + status file)
curl -s -X POST http://localhost:3000/api/full-cycle | python3 -m json.tool

# 5. Tests pass
pnpm test:run src/__tests__/slice4.test.ts

# Restore env
source .env
```

### Mock-mode validation (no 1Password required)

```bash
# Set a known env var so the fallback path works
export OPENAI_API_KEY="sk-your-key-here"
curl -s -X POST http://localhost:3000/api/check | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Summary: {d[\"summary\"][\"succeeded\"]} ok, {d[\"summary\"][\"failed\"]} failed')
for r in d['results']:
    if r['status'] == 'success':
        print(f'  ✅ {r[\"provider\"]}')
    else:
        print(f'  ❌ {r[\"provider\"]}: {r[\"error\"]}')
"
```

---

## Slice 5: Full auto-cycle + notifications

**Issue:** #7  
**What changed:** Wired discovery → check → store → notify. Rewrote notification
engine with per-client threshold evaluation. Rewrote scheduler (cron). Added
`POST /api/full-cycle`. Scheduler starts on server boot.

### Validate

```bash
# 1. Run the full cycle
curl -s -X POST http://localhost:3000/api/full-cycle | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Results: {d[\"summary\"][\"total\"]} checks')
print(f'Clients: {d[\"summary\"][\"clientCount\"]}')
print(f'Succeeded: {d[\"summary\"][\"succeeded\"]}')
print(f'Failed: {d[\"summary\"][\"failed\"]}')
for c in d['clients']:
    print(f'  Client: {c[\"name\"]} (active={c[\"isActive\"]})')
"

# 2. Check the scheduler started on boot (look in server logs)
# Expected: [scheduler] Starting: 0 * * * *
#           [scheduler] Started

# 3. Check notification log table
psql "$DATABASE_URL" -c "SELECT client_id, channel, status, message
FROM notification_log ORDER BY sent_at DESC LIMIT 5;" 2>/dev/null

# 4. Test notification thresholds:
#    Create a client with a high threshold, then check
psql "$DATABASE_URL" -c "
UPDATE clients SET threshold_warning = '100', threshold_critical = '50',
  slack_webhook = 'https://hooks.slack.com/services/test/webhook'
WHERE name LIKE 'Demo%';
" 2>/dev/null
# Run checks again — the Slack webhook will 404 but the notification
# will be logged with "failed" status

# 5. Tests pass
pnpm test:run src/__tests__/slice5.test.ts
```

---

## Slice 6: Dashboard UI

**Issue:** #8  
**What changed:** Rewrote the React dashboard. Client list view shows all clients
with status. Click a client to drill into per-provider check results + history
table. No key management UI, no auth.

### Validate

```bash
# 1. Open the dashboard in a browser
open http://localhost:3000
# Expected: Focus.AI Labs branded dashboard with:
#   - Hero header "USAGE MONITOR"
#   - Client list with names, status dots, last checked times
#   - "Run Checks" button in top-right

# 2. Click a client row
# Expected: Drills into detail view showing:
#   - "← Back" button
#   - Latest per-provider checks with balance/spend
#   - Check history table below

# 3. Click "Run Checks"
# Expected: Triggers provider checks, page refreshes with new data

# 4. Click "← Back"
# Expected: Returns to client list with updated status

# 5. Dashboard builds cleanly
cd src/server/dashboard && pnpm build
# Expected: vite build completes without errors
```

---

## Slice 7: Status file output

**Issue:** #9  
**What changed:** Built `status-output` module that writes a JSON status file
after each check cycle. Atomic write (temp file + rename). Configurable path
via `STATUS_OUTPUT_PATH` env var (default: `~/.usage-monitor/status.json`).

### Validate

```bash
# 1. Check the default status file (written by last check cycle)
cat ~/.usage-monitor/status.json | python3 -m json.tool
# Expected: {"checkedAt": "...", "clients": [...], "summary": {...}}

# 2. Check the structure
cat ~/.usage-monitor/status.json | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Checked at: {d[\"checkedAt\"]}')
print(f'Clients: {len(d[\"clients\"])}')
print(f'Summary: {d[\"summary\"]}')
for client in d['clients']:
    print(f'  {client[\"name\"]}: {len(client[\"keys\"])} keys')
    for key in client['keys']:
        print(f'    {key[\"provider\"]}: {key[\"status\"]}', end='')
        if 'balance' in key:
            print(f' balance=\${key[\"balance\"]}', end='')
        if 'error' in key:
            print(f' error={key[\"error\"]}', end='')
        print()
"

# 3. Test custom output path
export STATUS_OUTPUT_PATH="/tmp/usage-monitor-status.json"
curl -s -X POST http://localhost:3000/api/check > /dev/null
cat /tmp/usage-monitor-status.json | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Custom path works: {d[\"summary\"][\"totalKeys\"]} keys')
"
# Expected: Custom path works: N keys

# 4. Verify atomic write (no .tmp file left behind)
ls -la ~/.usage-monitor/ | grep status
# Expected: status.json (no status.json.tmp)

# 5. Tests pass
pnpm test:run src/__tests__/slice7.test.ts
```

---

## Full test suite

Run all 138 tests across 13 test files:

```bash
pnpm test:run
# Expected: 13 test files, 138 tests, all passing
```

---

## Complete system walkthrough

For a full end-to-end test:

```bash
# 1. Start server
pnpm server

# 2. Check health
curl http://localhost:3000/api/health

# 3. Run the full cycle (discovery → check → store → notify → status file)
curl -X POST http://localhost:3000/api/full-cycle

# 4. View client list
curl http://localhost:3000/api/clients

# 5. View a client's usage history
CLIENT_ID=$(curl -s http://localhost:3000/api/clients | python3 -c "
import sys,json; d=json.load(sys.stdin)
if d['clients']: print(d['clients'][0]['id'])
")
curl "http://localhost:3000/api/clients/$CLIENT_ID/usage"

# 6. Open the dashboard
open http://localhost:3000

# 7. Check the status file
cat ~/.usage-monitor/status.json | python3 -m json.tool
```
