import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { ConfigSchema, type Config } from './schema.js';
import { safeParseFloat, safeParseInt } from '../shared/utils.js';

export class ConfigLoader {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || resolve(process.cwd(), 'usage-monitor.json');
  }

  /**
   * Load configuration from file with environment variable fallbacks
   */
  async load(): Promise<Config> {
    let fileConfig = {};
    
    // Try to load from config file
    if (existsSync(this.configPath)) {
      try {
        const content = await readFile(this.configPath, 'utf-8');
        fileConfig = JSON.parse(content);
      } catch (error) {
        console.warn(`Warning: Failed to load config from ${this.configPath}:`, error);
      }
    }

    // Merge with environment variables (env takes precedence)
    const config = this.mergeWithEnvironment(fileConfig);
    
    // Validate using Zod schema
    const result = ConfigSchema.safeParse(config);
    
    if (!result.success) {
      const errorMessages = result.error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      throw new Error(`Configuration validation failed:\n${errorMessages.join('\n')}`);
    }

    return result.data;
  }

  /**
   * Save configuration to file
   */
  async save(config: Config): Promise<void> {
    const validated = ConfigSchema.parse(config);
    await writeFile(this.configPath, JSON.stringify(validated, null, 2), 'utf-8');
  }

  private mergeWithEnvironment(fileConfig: any): any {
    const envConfig: any = {
      providers: {},
      notifications: {},
      thresholds: {
        alertThresholdUsd: safeParseFloat(process.env.BALANCE_ALERT_THRESHOLD_USD, 10),
        dailyPostUtcHour: safeParseInt(process.env.DAILY_POST_UTC_HOUR, 16),
      },
    };

    // OpenRouter configuration
    const openrouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_TOKEN;
    if (openrouterApiKey) {
      envConfig.providers.openrouter = {
        apiKey: openrouterApiKey,
        enabled: true,
      };
    }

    // OpenAI configuration
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (openaiApiKey) {
      envConfig.providers.openai = {
        apiKey: openaiApiKey,
        enabled: true,
      };
    }

    // Claude configuration
    const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (claudeApiKey) {
      envConfig.providers.claude = {
        apiKey: claudeApiKey,
        enabled: true,
      };
    }

    // Cursor configuration
    const cursorApiKey = process.env.CURSOR_API_KEY;
    if (cursorApiKey) {
      envConfig.providers.cursor = {
        apiKey: cursorApiKey,
        enabled: true,
      };
    }

    // Slack configuration
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhookUrl) {
      envConfig.notifications.slack = {
        webhookUrl: slackWebhookUrl,
        enabled: true,
      };
    }

    // Discord configuration
    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordWebhookUrl) {
      envConfig.notifications.discord = {
        webhookUrl: discordWebhookUrl,
        enabled: true,
      };
    }

    // Deep merge file config with environment config (env takes precedence)
    return this.deepMerge(fileConfig, envConfig);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && source[key] !== undefined) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
}

// Export a default instance
export const configLoader = new ConfigLoader();