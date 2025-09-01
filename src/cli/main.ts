#!/usr/bin/env node

import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { GoogleAIStudioProvider } from '../providers/google.js';
import { MistralProvider } from '../providers/mistral.js';
import { GroqProvider } from '../providers/groq.js';
import { PerplexityProvider } from '../providers/perplexity.js';
import { OpenAIProvider } from '../providers/openai.js';
import { ClaudeProvider } from '../providers/claude.js';
import { GrokProvider } from '../providers/grok.js';
import type { BaseAPIProvider } from '../shared/types.js';
import { SlackNotifier } from '../notifications/slack.js';
import { formatUsd, getCurrentUtc, shouldSendDaily } from '../shared/utils.js';
import { configLoader } from '../config/loader.js';
import { ConfigManager } from '../config/manager.js';
import type { NotificationField } from '../shared/types.js';

// Load environment variables from .env file
loadEnv();

// Configuration will be loaded from config file + environment variables

// Create provider instances
function createProvider(serviceType: string, apiKey: string): BaseAPIProvider {
  switch (serviceType) {
    case 'openrouter':
      return new OpenRouterProvider({ apiKey, enabled: true });
    case 'google':
      return new GoogleAIStudioProvider({ apiKey, enabled: true });
    case 'mistral':
      return new MistralProvider({ apiKey, enabled: true });
    case 'groq':
      return new GroqProvider({ apiKey, enabled: true });
    case 'perplexity':
      return new PerplexityProvider({ apiKey, enabled: true });
    case 'openai':
      return new OpenAIProvider({ apiKey, enabled: true });
    case 'claude':
      return new ClaudeProvider({ apiKey, enabled: true });
    case 'grok':
      return new GrokProvider({ apiKey, enabled: true });
    default:
      throw new Error(`Unknown provider type: ${serviceType}`);
  }
}

async function main(): Promise<void> {
  try {
    const configManager = new ConfigManager();
    const services = await configManager.listServices();
    
    // Get enabled services
    const enabledServices = Object.entries(services).filter(([_, config]) => config.enabled);
    
    if (enabledServices.length === 0) {
      console.error('No enabled services found in configuration');
      process.exit(2);
    }
    
    console.log(`Monitoring ${enabledServices.length} enabled services...`);
    
    // Get notification config
    let slackWebhookUrl: string | undefined = process.env.SLACK_WEBHOOK_URL;
    const isDryRun = !slackWebhookUrl;
    
    // Monitor all enabled services in parallel
    const results = await Promise.allSettled(
      enabledServices.map(async ([serviceType, serviceConfig]) => {
        try {
          const apiKey = await configManager.getCredential(serviceType);
          const provider = createProvider(serviceType, apiKey);
          
          // Test authentication
          const isAuthenticated = await provider.authenticate();
          if (!isAuthenticated) {
            throw new Error(`${serviceType} authentication failed`);
          }
          
          // Get usage data
          const usage = await provider.getUsage();
          const thresholdUsd = serviceConfig.thresholds?.warning || 10;
          
          return {
            serviceType,
            provider,
            usage,
            thresholdUsd,
            status: 'success' as const,
          };
        } catch (error) {
          console.error(`Error monitoring ${serviceType}:`, error);
          return {
            serviceType,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'error' as const,
          };
        }
      })
    );
    
    // Process results
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map(result => result.value)
      .filter(result => result.status === 'success');
    
    const { hour } = getCurrentUtc();
    const dailyPostHour = 16; // Default daily posting hour
    
    // Check if any service needs notification
    const criticalServices = successfulResults.filter(result => {
      if (result.serviceType === 'openrouter' || result.serviceType === 'grok') {
        return result.usage.remainingBalance < result.thresholdUsd;
      }
      // For other services, use different criteria or skip notifications
      return false;
    });
    
    let shouldNotify = false;
    let cadence = 'daily';
    
    if (criticalServices.length > 0) {
      // Post hourly when any service is under threshold
      cadence = 'hourly';
      shouldNotify = true;
    } else {
      // Post once a day at configured hour
      cadence = 'daily';
      if (shouldSendDaily(hour, dailyPostHour)) {
        shouldNotify = true;
      }
    }

    // Create notification message
    let text = '';
    const fields: NotificationField[] = [];
    
    if (criticalServices.length > 0) {
      const criticalNames = criticalServices.map(s => s.serviceType).join(', ');
      text = `:rotating_light: ${criticalServices.length} service(s) need attention: ${criticalNames}`;
      
      criticalServices.forEach(result => {
        const balance = result.usage.remainingBalance;
        fields.push({
          title: `${result.serviceType} Balance`,
          value: formatUsd(balance)
        });
      });
    } else {
      text = `:white_check_mark: All ${successfulResults.length} services are healthy`;
      
      successfulResults.forEach(result => {
        const status = result.provider.getQuickStatus(result.usage);
        fields.push({
          title: result.serviceType,
          value: status
        });
      });
    }
    
    fields.push(
      { title: 'Services Monitored', value: successfulResults.length.toString() },
      { title: 'Cadence', value: cadence },
      { title: 'Last Check', value: new Date().toLocaleString() }
    );

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

    // Emit JSON log for each service
    successfulResults.forEach(result => {
      console.log(
        JSON.stringify({
          provider: result.provider.name,
          status: 'success',
          remaining: result.usage.remainingBalance,
          threshold: result.thresholdUsd,
          cadence,
          notified: shouldNotify && !isDryRun,
          dryRun: isDryRun,
          wouldNotify: shouldNotify,
          quickStatus: result.provider.getQuickStatus(result.usage),
        })
      );
    });
    
    // Log errors
    results.forEach(result => {
      if (result.status === 'rejected' || (result.status === 'fulfilled' && result.value.status === 'error')) {
        const errorResult = result.status === 'rejected' ? 
          { serviceType: 'unknown', error: result.reason } : 
          result.value;
        
        console.log(
          JSON.stringify({
            provider: errorResult.serviceType,
            status: 'error',
            error: errorResult.error,
            cadence,
            notified: false,
            dryRun: isDryRun,
          })
        );
      }
    });
  } catch (error) {
    console.error('Configuration or runtime error:', error);
    console.log(
      JSON.stringify({
        status: 'fatal_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});