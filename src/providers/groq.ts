import { BaseAPIProvider } from '../shared/types.js';
import type { ProviderConfig, UsageData, BillingData } from '../shared/types.js';

interface GroqModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
    active: boolean;
  }>;
}

export class GroqProvider extends BaseAPIProvider {
  readonly name = 'groq';
  private readonly baseUrl = 'https://api.groq.com/openai/v1';

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
        console.warn(`Groq auth check failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data: GroqModelsResponse = await response.json();
      return data.object === 'list' && Array.isArray(data.data) && data.data.length > 0;
    } catch (error) {
      console.error('Groq authentication error:', error);
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    try {
      // Groq has usage monitoring at console.groq.com/dashboard/usage
      // but no public API endpoint. We'll verify access with models endpoint
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

      const data: GroqModelsResponse = await response.json();
      const activeModels = data.data.filter(m => m.active);
      
      return {
        provider: 'groq',
        totalTokens: 0, // Not available from API
        totalCost: 0, // Not available from API
        remainingBalance: 0, // Check GroqCloud dashboard
        usageDetails: {
          availableModels: activeModels.length,
          totalModels: data.data.length,
          activeModelIds: activeModels.slice(0, 3).map(m => m.id).join(', '),
          note: 'Usage monitoring available at console.groq.com/dashboard/usage',
        },
        billingPeriod: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Groq usage fetch error:', error);
      throw error;
    }
  }

  async getBilling(): Promise<BillingData | null> {
    // Groq billing is managed through GroqCloud console
    return {
      provider: 'groq',
      currentBalance: 0,
      monthlySpend: 0,
      billingMethod: 'GroqCloud Console',
      nextBillingDate: null,
      usageLimits: {
        daily: null,
        monthly: null,
        note: 'Progressive billing thresholds and spend limits managed at console.groq.com',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  protected formatUsageForNotification(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return [
      `⚡ **Groq (Fast AI Inference) Status**`,
      `📊 Active Models: ${details?.availableModels || 'N/A'}`,
      `🎯 Total Models: ${details?.totalModels || 'N/A'}`,
      `🤖 Available: ${details?.activeModelIds || 'N/A'}`,
      `ℹ️  ${details?.note || 'Fast LLM inference'}`,
      '',
      `🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
      '',
      '💡 **Monitor Usage**: Visit console.groq.com/dashboard/usage',
      '⚡ **Speed**: Ultra-fast inference with LPUs (Language Processing Units)',
    ].join('\n');
  }

  getStatusEmoji(usage: UsageData): string {
    return '🟢'; // API access working
  }

  getQuickStatus(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return `Groq: ${details?.availableModels || 0} active models, ultra-fast inference`;
  }
}