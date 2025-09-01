import { BaseAPIProvider } from '../shared/types.js';
import type { ProviderConfig, UsageData, BillingData } from '../shared/types.js';

interface PerplexityTestResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class PerplexityProvider extends BaseAPIProvider {
  readonly name = 'perplexity';
  private readonly baseUrl = 'https://api.perplexity.ai';

  constructor(config: ProviderConfig) {
    super(config);
  }

  async authenticate(): Promise<boolean> {
    try {
      // Perplexity doesn't have a models endpoint, so we'll do a minimal test request
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [{
            role: 'user',
            content: 'Hello'
          }],
          max_tokens: 1,
          temperature: 0,
        }),
      });

      if (response.status === 401) {
        return false; // Invalid API key
      }

      if (response.status === 429) {
        // Rate limited but API key is valid
        return true;
      }

      if (!response.ok) {
        console.warn(`Perplexity auth check failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data: PerplexityTestResponse = await response.json();
      return data.object === 'chat.completion' && data.usage && data.usage.total_tokens > 0;
    } catch (error) {
      console.error('Perplexity authentication error:', error);
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    try {
      // Perplexity doesn't have a usage API endpoint
      // We'll do a minimal test to verify access and show available models
      const availableModels = [
        'llama-3.1-sonar-small-128k-online',
        'llama-3.1-sonar-large-128k-online', 
        'llama-3.1-sonar-huge-128k-online',
        'llama-3.1-8b-instruct',
        'llama-3.1-70b-instruct',
        'mixtral-8x7b-instruct'
      ];
      
      return {
        provider: 'perplexity',
        totalTokens: 0, // Not available from API
        totalCost: 0, // Not available from API  
        remainingBalance: 0, // Check Perplexity console
        usageDetails: {
          availableModels: availableModels.length,
          models: availableModels.slice(0, 3).join(', '),
          searchCapable: true,
          note: 'Usage monitoring available in Settings > API tab at perplexity.ai',
        },
        billingPeriod: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Perplexity usage fetch error:', error);
      throw error;
    }
  }

  async getBilling(): Promise<BillingData | null> {
    // Perplexity billing is managed through their web interface
    return {
      provider: 'perplexity',
      currentBalance: 0,
      monthlySpend: 0,
      billingMethod: 'Perplexity Console',
      nextBillingDate: null,
      usageLimits: {
        daily: null,
        monthly: null,
        note: 'Pro subscribers get $5 monthly credits. Token-based billing. Monitor at Settings > API.',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  protected formatUsageForNotification(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return [
      `🔍 **Perplexity AI (Search-Augmented) Status**`,
      `📊 Available Models: ${details?.availableModels || 'N/A'}`,
      `🤖 Models: ${details?.models || 'N/A'}`,
      `🔎 Search Integration: ${details?.searchCapable ? 'Yes' : 'No'}`,
      `ℹ️  ${details?.note || 'Real-time search capabilities'}`,
      '',
      `🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
      '',
      '💡 **Monitor Usage**: Settings > API tab at perplexity.ai',
      '🔍 **Special**: Real-time online search with citations',
    ].join('\n');
  }

  getStatusEmoji(usage: UsageData): string {
    return '🟢'; // API access working
  }

  getQuickStatus(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return `Perplexity: ${details?.availableModels || 0} models, search-augmented AI`;
  }
}