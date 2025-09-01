import { z } from 'zod';

export const ServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  credentialSource: z.enum(['1password', 'env', 'both']).default('1password'),
  onePasswordRef: z.string().optional(),
  fallbackEnvVar: z.string(),
  description: z.string().optional(),
  lastValidated: z.string().optional(), // ISO date
  thresholds: z.object({
    warning: z.number().positive().default(10),
    critical: z.number().positive().default(5),
  }).default({}),
  vault: z.string().optional(), // 1Password vault name
  itemTitle: z.string().optional(), // 1Password item title
});

export const ServicesConfigSchema = z.object({
  services: z.record(z.string(), ServiceConfigSchema).default({}),
  notifications: z.object({
    slack: z.object({
      enabled: z.boolean().default(false),
      credentialSource: z.enum(['1password', 'env']).default('env'),
      onePasswordRef: z.string().optional(),
      fallbackEnvVar: z.string().default('SLACK_WEBHOOK_URL'),
    }).optional(),
    discord: z.object({
      enabled: z.boolean().default(false),
      credentialSource: z.enum(['1password', 'env']).default('env'),
      onePasswordRef: z.string().optional(),
      fallbackEnvVar: z.string().default('DISCORD_WEBHOOK_URL'),
    }).optional(),
  }).default({}),
  lastUpdated: z.string().optional(), // ISO date
});

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;
export type ServicesConfig = z.infer<typeof ServicesConfigSchema>;

/**
 * Known service types and their characteristics
 */
export const KNOWN_SERVICES = {
  openrouter: {
    name: 'OpenRouter',
    description: 'Multi-provider AI API routing service',
    fallbackEnvVar: 'OPENROUTER_API_KEY',
    testEndpoint: '/api/v1/key',
    baseUrl: 'https://openrouter.ai',
    keyPatterns: ['sk-or-', 'openrouter'],
    itemNamePatterns: ['openrouter', 'OpenRouter Key', 'openrouter-api'],
  },
  openai: {
    name: 'OpenAI',
    description: 'OpenAI GPT API service',
    fallbackEnvVar: 'OPENAI_API_KEY',
    testEndpoint: '/v1/models',
    baseUrl: 'https://api.openai.com',
    keyPatterns: ['sk-proj-', 'sk-'],
    itemNamePatterns: ['openai', 'OpenAI Key', 'openai-api'],
  },
  claude: {
    name: 'Claude (Anthropic)',
    description: 'Anthropic Claude AI API service',
    fallbackEnvVar: 'CLAUDE_API_KEY',
    alternateEnvVar: 'ANTHROPIC_API_KEY',
    testEndpoint: '/v1/messages',
    baseUrl: 'https://api.anthropic.com',
    keyPatterns: ['sk-ant-'],
    itemNamePatterns: ['claude', 'Claude API', 'anthropic', 'claude-api'],
  },
  cursor: {
    name: 'Cursor',
    description: 'Cursor AI code editor API',
    fallbackEnvVar: 'CURSOR_API_KEY',
    testEndpoint: null, // Unknown if API exists
    baseUrl: null,
    keyPatterns: ['cursor-'],
    itemNamePatterns: ['cursor', 'Cursor API', 'cursor-api'],
  },
} as const;

export type ServiceType = keyof typeof KNOWN_SERVICES;

/**
 * Guess service type from 1Password item title
 */
export function guessServiceType(itemTitle: string): ServiceType | null {
  const title = itemTitle.toLowerCase();
  
  for (const [serviceType, config] of Object.entries(KNOWN_SERVICES)) {
    for (const pattern of config.itemNamePatterns) {
      if (title.includes(pattern.toLowerCase())) {
        return serviceType as ServiceType;
      }
    }
  }
  
  return null;
}

/**
 * Guess service type from API key format
 */
export function guessServiceTypeFromKey(apiKey: string): ServiceType | null {
  for (const [serviceType, config] of Object.entries(KNOWN_SERVICES)) {
    for (const pattern of config.keyPatterns) {
      if (apiKey.startsWith(pattern)) {
        return serviceType as ServiceType;
      }
    }
  }
  
  return null;
}

/**
 * Filter 1Password items that might be API keys
 */
export function isPotentialApiKey(item: { title: string; category: string }): boolean {
  // Look for secure notes or API credential categories
  if (item.category !== 'SECURE_NOTE' && item.category !== 'API_CREDENTIAL') {
    return false;
  }

  const title = item.title.toLowerCase();
  const apiKeywords = ['api', 'key', 'token', 'secret', 'credential'];
  
  return apiKeywords.some(keyword => title.includes(keyword));
}