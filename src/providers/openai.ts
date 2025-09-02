import { BaseAPIProvider } from '../shared/types.js';
import type { ProviderConfig, UsageData, BillingData } from '../shared/types.js';

interface OpenAIModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

interface OpenAIUsageResponse {
  object: string;
  daily_costs: Array<{
    timestamp: number;
    line_items: Array<{
      name: string;
      cost: number;
    }>;
  }>;
  total_usage: number;
}

interface OpenAICreditGrantsResponse {
  object: string;
  total_granted: number;
  total_used: number;
  total_available: number;
}

export class OpenAIProvider extends BaseAPIProvider {
  readonly name = 'openai';
  private readonly baseUrl = 'https://api.openai.com/v1';

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
        console.warn(`OpenAI auth check failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data: OpenAIModelsResponse = await response.json();
      return data.object === 'list' && Array.isArray(data.data) && data.data.length > 0;
    } catch (error) {
      console.error('OpenAI authentication error:', error);
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    try {
      // Try to fetch legacy credit grants to estimate remaining credits
      let remainingCredits = 0;
      try {
        const creditsRes = await fetch(`${this.baseUrl}/dashboard/billing/credit_grants`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Accept': 'application/json',
          },
        });
        if (creditsRes.ok) {
          const credits: OpenAICreditGrantsResponse = await creditsRes.json();
          remainingCredits = credits?.total_available ?? 0;
        }
      } catch {
        // ignore if not available
      }

      // First get available models for context
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

      const modelsData: OpenAIModelsResponse = await modelsResponse.json();
      const ownedModels = modelsData.data.filter(m => m.owned_by === 'openai' || m.owned_by === 'system');

      // Try to get usage data (may not be available for all accounts)
      let totalUsage = 0;
      let monthlySpend = 0;
      let usageNote = 'Usage details available in OpenAI Dashboard';

      try {
        // Note: The usage endpoint may require special permissions
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        const usageResponse = await fetch(
          `${this.baseUrl}/dashboard/billing/usage?start_date=${startDate.toISOString().split('T')[0]}&end_date=${today.toISOString().split('T')[0]}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Accept': 'application/json',
            },
          }
        );

        if (usageResponse.ok) {
          const usageData: OpenAIUsageResponse = await usageResponse.json();
          totalUsage = usageData.total_usage || 0;
          monthlySpend = usageData.daily_costs?.reduce((sum, day) => 
            sum + day.line_items.reduce((daySum, item) => daySum + item.cost, 0), 0) || 0;
          usageNote = 'Current month usage data available';
        }
      } catch (usageError) {
        // Usage API not available for this key, continue with basic info
        console.log('OpenAI usage API not available, showing basic model access');
      }
      
      return {
        provider: 'openai',
        totalTokens: totalUsage,
        totalCost: monthlySpend,
        remainingBalance: remainingCredits || 0, // Best-effort via credit_grants
        usageDetails: {
          availableModels: ownedModels.length,
          totalModels: modelsData.data.length,
          popularModels: ownedModels.filter(m => 
            m.id.includes('gpt-4') || m.id.includes('gpt-3.5') || m.id.includes('davinci')
          ).slice(0, 3).map(m => m.id).join(', '),
          monthlySpend,
          note: usageNote,
        },
        billingPeriod: {
          start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
          end: new Date().toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('OpenAI usage fetch error:', error);
      throw error;
    }
  }

  async getBilling(): Promise<BillingData | null> {
    // Best-effort: try legacy credit_grants + usage endpoints
    let currentBalance = 0;
    try {
      const creditsRes = await fetch(`${this.baseUrl}/dashboard/billing/credit_grants`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
        },
      });
      if (creditsRes.ok) {
        const credits: OpenAICreditGrantsResponse = await creditsRes.json();
        currentBalance = credits?.total_available ?? 0;
      }
    } catch {
      // ignore
    }

    let monthlySpend = 0;
    try {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      const usageResponse = await fetch(
        `${this.baseUrl}/dashboard/billing/usage?start_date=${startDate.toISOString().split('T')[0]}&end_date=${today.toISOString().split('T')[0]}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Accept': 'application/json',
          },
        }
      );
      if (usageResponse.ok) {
        const usageData: OpenAIUsageResponse = await usageResponse.json();
        monthlySpend = usageData.daily_costs?.reduce((sum, day) => 
          sum + day.line_items.reduce((daySum, item) => daySum + item.cost, 0), 0) || 0;
      }
    } catch {
      // ignore
    }

    return {
      provider: 'openai',
      currentBalance,
      monthlySpend,
      billingMethod: 'OpenAI Dashboard (best-effort API)',
      nextBillingDate: null,
      usageLimits: {
        daily: null,
        monthly: null,
        note: 'Credit grants endpoint may not be available for all accounts',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  protected formatUsageForNotification(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return [
      `🤖 **OpenAI (GPT) Status**`,
      `📊 Available Models: ${details?.availableModels || 'N/A'}`,
      `🎯 Total Models: ${details?.totalModels || 'N/A'}`,
      `🔥 Popular: ${details?.popularModels || 'GPT models'}`,
      `💰 Monthly Spend: $${details?.monthlySpend?.toFixed(2) || '0.00'}`,
      `ℹ️  ${details?.note || 'Full usage details in OpenAI Dashboard'}`,
      '',
      `🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
      '',
      '💡 **Monitor Usage**: Visit platform.openai.com/usage',
      '🤖 **Models**: GPT-4, GPT-3.5 Turbo, DALL-E, Whisper, and more',
    ].join('\n');
  }

  getStatusEmoji(usage: UsageData): string {
    const details = usage.usageDetails as any;
    const monthlySpend = details?.monthlySpend || 0;
    
    if (monthlySpend > 100) return '🔴'; // High usage
    if (monthlySpend > 20) return '🟡';  // Moderate usage
    return '🟢'; // Low usage or API access working
  }

  getQuickStatus(usage: UsageData): string {
    const details = usage.usageDetails as any;
    const monthlySpend = details?.monthlySpend || 0;
    return `OpenAI: ${details?.availableModels || 0} models, $${monthlySpend.toFixed(2)} this month`;
  }
}
