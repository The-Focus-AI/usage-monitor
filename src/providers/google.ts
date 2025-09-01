import { BaseAPIProvider } from '../shared/types.js';
import type { ProviderConfig, UsageData, BillingData } from '../shared/types.js';

interface GoogleAIStudioModelsResponse {
  models: Array<{
    name: string;
    version: string;
    displayName: string;
    description: string;
    inputTokenLimit: number;
    outputTokenLimit: number;
    supportedGenerationMethods: string[];
  }>;
}

export class GoogleAIStudioProvider extends BaseAPIProvider {
  readonly name = 'google';
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1';

  constructor(config: ProviderConfig) {
    super(config);
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models?key=${this.config.apiKey}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.status === 401) {
        return false; // Invalid API key
      }

      if (!response.ok) {
        console.warn(`Google AI Studio auth check failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data: GoogleAIStudioModelsResponse = await response.json();
      return Array.isArray(data.models) && data.models.length > 0;
    } catch (error) {
      console.error('Google AI Studio authentication error:', error);
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    try {
      // Google AI Studio doesn't have a direct usage API endpoint
      // We'll use the models endpoint to verify access and return basic info
      const response = await fetch(`${this.baseUrl}/models?key=${this.config.apiKey}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: GoogleAIStudioModelsResponse = await response.json();
      
      return {
        provider: 'google',
        totalTokens: 0, // Not available from API
        totalCost: 0, // Not available from API
        remainingBalance: 0, // Not available from API - free tier has no balance concept
        usageDetails: {
          availableModels: data.models.length,
          modelNames: data.models.slice(0, 5).map(m => m.displayName).join(', '),
          note: 'Google AI Studio usage monitoring requires Cloud Console billing setup',
        },
        billingPeriod: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Google AI Studio usage fetch error:', error);
      throw error;
    }
  }

  async getBilling(): Promise<BillingData | null> {
    // Google AI Studio billing is managed through Google Cloud Console
    // The Gemini API billing requires Cloud Billing to be enabled
    // and usage is monitored at generativelanguage.googleapis.com
    return {
      provider: 'google',
      currentBalance: 0,
      monthlySpend: 0,
      billingMethod: 'Google Cloud Billing',
      nextBillingDate: null,
      usageLimits: {
        daily: null,
        monthly: null,
        note: 'Rate limits vary by tier. Free tier: 2 RPM, 32K TPD. Paid tiers have higher limits.',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  protected formatUsageForNotification(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return [
      `🔍 **Google AI Studio (Gemini) Status**`,
      `📊 Available Models: ${details?.availableModels || 'N/A'}`,
      `🤖 Recent Models: ${details?.modelNames || 'N/A'}`,
      `ℹ️  ${details?.note || 'Usage monitoring requires Cloud Console setup'}`,
      '',
      `🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
      '',
      '💡 **Setup Cloud Billing**: Enable billing in Google Cloud Console to monitor detailed usage',
      '📍 **Service**: generativelanguage.googleapis.com',
    ].join('\n');
  }

  getStatusEmoji(usage: UsageData): string {
    return '🟢'; // Google AI Studio free tier is always "healthy"
  }

  getQuickStatus(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return `Google AI Studio: ${details?.availableModels || 0} models available`;
  }
}