# Usage Monitor (OpenRouter -> Slack)

Monitors OpenRouter credits/usage and posts to Slack:

- Under threshold (default $10): posts hourly
- Otherwise: posts once per day at a fixed UTC hour (default 16:00)

## Requirements

- GitHub repository with Actions enabled
- Secrets configured:
  - `OPENROUTER_API_KEY`: your OpenRouter API key
  - `SLACK_WEBHOOK_URL`: Slack Incoming Webhook URL
- Optional:
  - Repository variable `BALANCE_ALERT_THRESHOLD_USD` to override threshold

## How it works

- Reads credits from `GET /api/v1/credits` and key info from `GET /api/v1/key`
- Computes remaining balance
- If remaining < threshold, posts hourly and deduplicates by hour
- Else, posts daily at the configured UTC hour and deduplicates by day

## Local run

```bash
OPENROUTER_API_KEY=... \
SLACK_WEBHOOK_URL=... \
node usage-monitor/scripts/check-balance.mjs
```

Set `DAILY_POST_UTC_HOUR` and `BALANCE_ALERT_THRESHOLD_USD` to customize.

## GitHub Actions

Workflow file: `.github/workflows/usage-monitor.yml`
- Runs hourly at minute 5
- Also runs at 16:05 UTC for the daily summary
- No persisted state is required; hourly runs handle alert cadence and a daily run posts the summary at the set hour.