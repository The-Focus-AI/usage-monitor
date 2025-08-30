#!/usr/bin/env node

import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { SlackNotifier } from '../notifications/slack.js';
import { formatUsd, getCurrentUtc, shouldSendDaily } from '../shared/utils.js';
import { configLoader } from '../config/loader.js';
import type { NotificationField } from '../shared/types.js';

// Load environment variables from .env file
loadEnv();

// Configuration will be loaded from config file + environment variables

async function main(): Promise<void> {
  try {
    // Load configuration
    const config = await configLoader.load();
    
    // Check if OpenRouter is configured
    if (!config.providers.openrouter?.enabled) {
      console.error('OpenRouter provider not configured or disabled');
      process.exit(2);
    }

    // Initialize provider
    const provider = new OpenRouterProvider(config.providers.openrouter);

    // Test authentication
    const isAuthenticated = await provider.authenticate();
    if (!isAuthenticated) {
      console.error('OpenRouter authentication failed');
      process.exit(1);
    }

    // Get usage data
    const usage = await provider.getUsage();
    const { hour } = getCurrentUtc();

    const underThreshold = usage.remainingBalance < config.thresholds.alertThresholdUsd;

    let shouldNotify = false;
    let cadence = 'daily';

    if (underThreshold) {
      // Post hourly when under threshold
      cadence = 'hourly';
      shouldNotify = true;
    } else {
      // Post once a day at configured hour
      cadence = 'daily';
      if (shouldSendDaily(hour, config.thresholds.dailyPostUtcHour)) {
        shouldNotify = true;
      }
    }

    const fields: NotificationField[] = [
      { title: 'Credits Purchased', value: formatUsd(usage.totalCredits) },
      { title: 'Credits Used', value: formatUsd(usage.totalUsage) },
      { title: 'Balance Remaining', value: formatUsd(usage.remainingBalance) },
      { title: 'Threshold', value: formatUsd(config.thresholds.alertThresholdUsd) },
      { title: 'Cadence', value: cadence },
    ];

    const text = underThreshold
      ? `:rotating_light: OpenRouter balance low: ${formatUsd(usage.remainingBalance)} remaining`
      : `:money_with_wings: OpenRouter balance: ${formatUsd(usage.remainingBalance)} remaining`;

    // Check if we have Slack notifications configured
    const isDryRun = !config.notifications.slack?.enabled || !config.notifications.slack?.webhookUrl;

    if (shouldNotify) {
      if (isDryRun) {
        console.log('dry-run: would notify with message:', text);
        console.log('dry-run: fields:', fields);
      } else {
        const slackNotifier = new SlackNotifier({ webhookUrl: config.notifications.slack.webhookUrl });
        await slackNotifier.send({ text, fields });
        console.log('notified');
      }
    } else {
      console.log('no-notify');
    }

    // Also emit a JSON line for logs/consumers
    console.log(
      JSON.stringify({
        provider: provider.name,
        purchased: usage.totalCredits,
        used: usage.totalUsage,
        remaining: usage.remainingBalance,
        threshold: config.thresholds.alertThresholdUsd,
        cadence,
        notified: shouldNotify && !isDryRun,
        dryRun: isDryRun,
        wouldNotify: shouldNotify,
      })
    );
  } catch (error) {
    console.error('Configuration or runtime error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});