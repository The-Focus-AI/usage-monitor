#!/usr/bin/env node

// Usage Monitor for OpenRouter + Slack notifications
// - Reads OPENROUTER_API_KEY and SLACK_WEBHOOK_URL from env
// - Fetches credits and key usage from OpenRouter
// - Decides whether to notify hourly (< $10 remaining) or daily (>= $10)
// - Posts a message to Slack

import process from 'node:process';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const BALANCE_ALERT_THRESHOLD_USD = parseFloat(process.env.BALANCE_ALERT_THRESHOLD_USD || '10');
// Hour of day in UTC for daily summary, default 16:00 UTC
const DAILY_POST_UTC_HOUR = parseInt(process.env.DAILY_POST_UTC_HOUR || '16', 10);

if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY');
  process.exit(2);
}

// Check if we're in dry run mode (SLACK_WEBHOOK_URL is empty or missing)
const isDryRun = !SLACK_WEBHOOK_URL || SLACK_WEBHOOK_URL.trim() === '';

if (!isDryRun && !SLACK_WEBHOOK_URL) {
  console.error('Missing SLACK_WEBHOOK_URL');
  process.exit(2);
}

/**
 * Fetch JSON with simple retry
 */
async function fetchJson(url, init = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res && res.ok) return res.json();
    if (attempt === retries) {
      const body = res && typeof res.text === 'function' ? await res.text() : 'unknown error';
      throw new Error(`Request failed ${url} status=${res?.status} body=${body}`);
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
}

async function getCredits() {
  // https://openrouter.ai/docs/api-reference/get-credits
  const url = 'https://openrouter.ai/api/v1/credits';
  const data = await fetchJson(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  // returns { data: { total_credits, total_usage } }
  return data?.data;
}

async function getKeyInfo() {
  // https://openrouter.ai/docs/api-reference/api-keys/get-current-api-key
  const url = 'https://openrouter.ai/api/v1/key';
  const data = await fetchJson(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return data?.data; // { label, limit, usage, limit_remaining, is_free_tier, ... }
}

function formatUsd(n) {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function nowUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const h = now.getUTCHours();
  const mi = now.getUTCMinutes();
  return { now, y, m, d, h, mi };
}

function shouldSendDaily({ hourUtc }) {
  return hourUtc === DAILY_POST_UTC_HOUR;
}

function hashDayKey(prefix = 'daily') {
  const { y, m, d } = nowUtc();
  return `${prefix}:${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// No persistent cache required; GitHub cron runs every hour. We dedupe by hour/day using time checks only.

async function postToSlack({ text, fields = [], footer = '' }) {
  const payload = {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
      ...(fields.length
        ? [
            {
              type: 'section',
              fields: fields.map((f) => ({ type: 'mrkdwn', text: `*${f.title}:* ${f.value}` })),
            },
          ]
        : []),
      { type: 'context', elements: [{ type: 'mrkdwn', text: footer || 'usage-monitor' }] },
    ],
  };

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const [{ total_credits = 0, total_usage = 0 } = {}, keyInfo = {}] = await Promise.all([
    getCredits(),
    getKeyInfo(),
  ]);

  const creditsPurchased = Number(total_credits) || 0;
  const creditsUsed = Number(total_usage) || Number(keyInfo.usage) || 0;

  // Remaining balance can be inferred from credits - usage OR keyInfo.limit_remaining when set
  const remaining = Number.isFinite(keyInfo.limit_remaining)
    ? Number(keyInfo.limit_remaining)
    : Math.max(creditsPurchased - creditsUsed, 0);

  const { h } = nowUtc();

  const underThreshold = remaining < BALANCE_ALERT_THRESHOLD_USD;

  let shouldNotify = false;
  let cadence = 'daily';

  if (underThreshold) {
    // Post hourly when under threshold; cron runs hourly so every run at minute 5 will notify
    cadence = 'hourly';
    shouldNotify = true;
  } else {
    // Post once a day at configured hour; cron also triggers at that minute
    cadence = 'daily';
    if (shouldSendDaily({ hourUtc: h })) {
      shouldNotify = true;
    }
  }

  const fields = [
    { title: 'Credits Purchased', value: formatUsd(creditsPurchased) },
    { title: 'Credits Used', value: formatUsd(creditsUsed) },
    { title: 'Balance Remaining', value: formatUsd(remaining) },
    { title: 'Threshold', value: formatUsd(BALANCE_ALERT_THRESHOLD_USD) },
    { title: 'Cadence', value: cadence },
  ];

  const text = underThreshold
    ? `:rotating_light: OpenRouter balance low: ${formatUsd(remaining)} remaining`
    : `:money_with_wings: OpenRouter balance: ${formatUsd(remaining)} remaining`;

  if (shouldNotify) {
    if (isDryRun) {
      console.log('dry-run: would notify with message:', text);
      console.log('dry-run: fields:', fields);
    } else {
      await postToSlack({ text, fields });
      console.log('notified');
    }
  } else {
    console.log('no-notify');
  }

  // Also emit a JSON line for logs/consumers
  console.log(
    JSON.stringify({
      purchased: creditsPurchased,
      used: creditsUsed,
      remaining,
      threshold: BALANCE_ALERT_THRESHOLD_USD,
      cadence,
      notified: shouldNotify && !isDryRun,
      dryRun: isDryRun,
      wouldNotify: shouldNotify
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
