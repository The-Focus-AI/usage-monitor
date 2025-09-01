#!/usr/bin/env node

import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { SlackNotifier } from '../notifications/slack.js';
import { formatUsd, getCurrentUtc, shouldSendDaily } from '../shared/utils.js';
import { configLoader } from '../config/loader.js';
import { ConfigManager } from '../config/manager.js';
import type { NotificationField } from '../shared/types.js';

// Load environment variables from .env file
loadEnv();

// Configuration will be loaded from config file + environment variables

async function main(): Promise<void> {
  try {
    // Try the new config manager first, fall back to old config loader
    let openrouterApiKey: string;
    let slackWebhookUrl: string | undefined;
    let thresholdUsd: number;
    let dailyPostHour: number;

    const configManager = new ConfigManager();
    
    try {
      // Try new config system
      const services = await configManager.listServices();
      
      if (services.openrouter?.enabled) {
        console.log('Using new configuration system...');
        openrouterApiKey = await configManager.getCredential('openrouter');
        
        // TODO: Get notification config from new system
        thresholdUsd = services.openrouter.thresholds?.warning || 10;
        dailyPostHour = 16; // Default for now
        slackWebhookUrl = process.env.SLACK_WEBHOOK_URL; // Fallback to env
      } else {
        throw new Error('OpenRouter not configured in new system');
      }
    } catch {
      // Fall back to old configuration system
      console.log('Falling back to legacy configuration system...');
      const config = await configLoader.load();
      
      if (!config.providers.openrouter?.enabled) {
        console.error('OpenRouter provider not configured or disabled');
        process.exit(2);
      }
      
      openrouterApiKey = config.providers.openrouter.apiKey;
      thresholdUsd = config.thresholds.alertThresholdUsd;
      dailyPostHour = config.thresholds.dailyPostUtcHour;
      slackWebhookUrl = config.notifications.slack?.webhookUrl;
    }

    // Initialize provider
    const provider = new OpenRouterProvider({ 
      apiKey: openrouterApiKey, 
      enabled: true 
    });

    // Test authentication
    const isAuthenticated = await provider.authenticate();
    if (!isAuthenticated) {
      console.error('OpenRouter authentication failed');
      process.exit(1);
    }

    // Get usage data
    const usage = await provider.getUsage();
    const { hour } = getCurrentUtc();

    const underThreshold = usage.remainingBalance < thresholdUsd;

    let shouldNotify = false;
    let cadence = 'daily';

    if (underThreshold) {
      // Post hourly when under threshold
      cadence = 'hourly';
      shouldNotify = true;
    } else {
      // Post once a day at configured hour
      cadence = 'daily';
      if (shouldSendDaily(hour, dailyPostHour)) {
        shouldNotify = true;
      }
    }

    const fields: NotificationField[] = [
      { title: 'Credits Purchased', value: formatUsd(usage.totalCredits) },
      { title: 'Credits Used', value: formatUsd(usage.totalUsage) },
      { title: 'Balance Remaining', value: formatUsd(usage.remainingBalance) },
      { title: 'Threshold', value: formatUsd(thresholdUsd) },
      { title: 'Cadence', value: cadence },
    ];

    const text = underThreshold
      ? `:rotating_light: OpenRouter balance low: ${formatUsd(usage.remainingBalance)} remaining`
      : `:money_with_wings: OpenRouter balance: ${formatUsd(usage.remainingBalance)} remaining`;

    // Check if we have Slack notifications configured
    const isDryRun = !slackWebhookUrl;

    if (shouldNotify) {
      if (isDryRun) {
        console.log('dry-run: would notify with message:', text);
        console.log('dry-run: fields:', fields);
      } else {
        const slackNotifier = new SlackNotifier({ webhookUrl: slackWebhookUrl });
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
        threshold: thresholdUsd,
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