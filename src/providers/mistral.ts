import { BaseAPIProvider } from '../shared/types.js';
import type { ProviderConfig, UsageData, BillingData } from '../shared/types.js';

interface MistralModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

export class MistralProvider extends BaseAPIProvider {
  readonly name = 'mistral';
  private readonly baseUrl = 'https://api.mistral.ai/v1';

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
        console.warn(`Mistral auth check failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data: MistralModelsResponse = await response.json();
      return data.object === 'list' && Array.isArray(data.data) && data.data.length > 0;
    } catch (error) {
      console.error('Mistral authentication error:', error);
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    try {
      // Mistral doesn't have a public usage API endpoint
      // We'll use the models endpoint to verify access and return available models
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: MistralModelsResponse = await response.json();
      
      return {
        provider: 'mistral',
        totalTokens: 0, // Not available from API
        totalCost: 0, // Not available from API
        remainingBalance: 0, // Not available from API - check La Plateforme console
        usageDetails: {
          availableModels: data.data.length,
          modelIds: data.data.slice(0, 5).map(m => m.id).join(', '),
          note: 'Usage monitoring available at console.mistral.ai (La Plateforme)',
        },
        billingPeriod: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Mistral usage fetch error:', error);
      throw error;
    }
  }

  async getBilling(): Promise<BillingData | null> {
    // Mistral billing is managed through La Plateforme (console.mistral.ai)
    return {
      provider: 'mistral',
      currentBalance: 0,
      monthlySpend: 0,
      billingMethod: 'La Plateforme (console.mistral.ai)',
      nextBillingDate: null,
      usageLimits: {
        daily: null,
        monthly: null,
        note: 'Rate limits and billing managed through La Plateforme. Free tier available with restrictive limits.',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  protected formatUsageForNotification(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return [
      `🔍 **Mistral AI Status**`,
      `📊 Available Models: ${details?.availableModels || 'N/A'}`,
      `🤖 Models: ${details?.modelIds || 'N/A'}`,
      `ℹ️  ${details?.note || 'Usage monitoring via La Plateforme'}`,
      '',
      `🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
      '',
      '💡 **Monitor Usage**: Visit console.mistral.ai for detailed billing and usage',
      '📍 **Platform**: La Plateforme (Mistral AI)',
    ].join('\n');
  }

  getStatusEmoji(usage: UsageData): string {
    return '🟢'; // API access working
  }

  getQuickStatus(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return `Mistral AI: ${details?.availableModels || 0} models available`;
  }
}