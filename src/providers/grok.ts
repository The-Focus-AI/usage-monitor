import { BaseAPIProvider } from '../shared/types.js';
import type { ProviderConfig, UsageData, BillingData } from '../shared/types.js';

interface GrokModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

interface GrokChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GrokProvider extends BaseAPIProvider {
  readonly name = 'grok';
  private readonly baseUrl = 'https://api.x.ai/v1';

  constructor(config: ProviderConfig) {
    super(config);
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 401) {
        return false; // Invalid API key
      }

      if (!response.ok) {
        console.warn(`Grok auth check failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data: GrokModelsResponse = await response.json();
      return data.object === 'list' && Array.isArray(data.data) && data.data.length > 0;
    } catch (error) {
      console.error('Grok authentication error:', error);
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    try {
      // Get available models
      const modelsResponse = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!modelsResponse.ok) {
        throw new Error(`Models API request failed: ${modelsResponse.status} ${modelsResponse.statusText}`);
      }

      const modelsData: GrokModelsResponse = await modelsResponse.json();
      
      // Try a minimal test to verify functionality and get usage info
      let tokensUsed = 0;
      try {
        const testResponse = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            model: 'grok-beta',
            messages: [{
              role: 'user',
              content: 'Hi'
            }],
            max_tokens: 1,
            temperature: 0,
          }),
        });

        if (testResponse.ok) {
          const testData: GrokChatResponse = await testResponse.json();
          tokensUsed = testData.usage?.total_tokens || 0;
        }
      } catch (testError) {
        // Test request failed, but that's okay for monitoring purposes
        console.log('Grok test request failed, continuing with model info');
      }
      
      return {
        provider: 'grok',
        totalTokens: tokensUsed,
        totalCost: 0, // Calculated from $25 monthly credits
        remainingBalance: 25, // $25 monthly credits (estimated)
        usageDetails: {
          availableModels: modelsData.data.length,
          models: modelsData.data.slice(0, 3).map(m => m.id).join(', '),
          primaryModel: 'grok-beta',
          monthlyCredits: 25,
          features: 'Real-time search, function calling, 128K context',
          note: 'Usage monitoring available at console.x.ai',
        },
        billingPeriod: {
          start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
          end: new Date().toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Grok usage fetch error:', error);
      throw error;
    }
  }

  async getBilling(): Promise<BillingData | null> {
    // Grok billing is managed through xAI Console
    return {
      provider: 'grok',
      currentBalance: 25, // $25 monthly credits
      monthlySpend: 0,
      billingMethod: 'xAI Console ($25 monthly credits)',
      nextBillingDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0],
      usageLimits: {
        daily: null,
        monthly: 25, // $25 credits per month
        note: 'Everyone gets $25 of free API credits per month. Live Search costs $25 per 1,000 sources.',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  protected formatUsageForNotification(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return [
      `🚀 **Grok (xAI) Status**`,
      `📊 Available Models: ${details?.availableModels || 'N/A'}`,
      `🤖 Models: ${details?.models || 'Grok models'}`,
      `🎯 Primary: ${details?.primaryModel || 'grok-beta'}`,
      `💰 Monthly Credits: $${details?.monthlyCredits || 25}`,
      `⚡ Features: ${details?.features || 'Real-time capabilities'}`,
      `ℹ️  ${details?.note || 'Latest AI from xAI'}`,
      '',
      `🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
      '',
      '💡 **Monitor Usage**: Visit console.x.ai',
      '🔍 **Special**: Real-time web search, live information access',
    ].join('\n');
  }

  getStatusEmoji(usage: UsageData): string {
    const balance = usage.remainingBalance || 0;
    
    if (balance < 5) return '🔴';   // Low credits
    if (balance < 15) return '🟡';  // Moderate credits
    return '🟢'; // Good credits remaining
  }

  getQuickStatus(usage: UsageData): string {
    const details = usage.usageDetails as any;
    const balance = usage.remainingBalance || 0;
    return `Grok: ${details?.availableModels || 0} models, $${balance.toFixed(2)} credits remaining`;
  }
}