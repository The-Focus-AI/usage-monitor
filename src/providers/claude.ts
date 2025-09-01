import { BaseAPIProvider } from '../shared/types.js';
import type { ProviderConfig, UsageData, BillingData } from '../shared/types.js';

interface ClaudeMessageResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeProvider extends BaseAPIProvider {
  readonly name = 'claude';
  private readonly baseUrl = 'https://api.anthropic.com/v1';

  constructor(config: ProviderConfig) {
    super(config);
  }

  async authenticate(): Promise<boolean> {
    try {
      // Claude doesn't have a models endpoint, so we'll do a minimal test request
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{
            role: 'user',
            content: 'Hi'
          }]
        }),
      });

      if (response.status === 401) {
        return false; // Invalid API key
      }

      if (response.status === 400) {
        // May get 400 for other reasons but API key is likely valid
        const errorText = await response.text();
        if (errorText.includes('authentication') || errorText.includes('api_key')) {
          return false;
        }
        return true; // Other 400 errors suggest API key is valid
      }

      if (response.status === 429) {
        // Rate limited but API key is valid
        return true;
      }

      if (!response.ok) {
        console.warn(`Claude auth check failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data: ClaudeMessageResponse = await response.json();
      return data.type === 'message' && data.usage && data.usage.input_tokens > 0;
    } catch (error) {
      console.error('Claude authentication error:', error);
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    try {
      // Claude doesn't have a usage API endpoint
      // We'll show available models and billing info
      const availableModels = [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229', 
        'claude-3-haiku-20240307',
        'claude-2.1',
        'claude-2.0',
        'claude-instant-1.2'
      ];
      
      return {
        provider: 'claude',
        totalTokens: 0, // Not available from API
        totalCost: 0, // Not available from API  
        remainingBalance: 0, // Check Anthropic Console
        usageDetails: {
          availableModels: availableModels.length,
          models: availableModels.slice(0, 3).join(', '),
          latestModel: 'claude-3-opus-20240229',
          capabilities: 'Text, vision, function calling',
          note: 'Usage monitoring available at console.anthropic.com',
        },
        billingPeriod: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Claude usage fetch error:', error);
      throw error;
    }
  }

  async getBilling(): Promise<BillingData | null> {
    // Claude billing is managed through Anthropic Console
    return {
      provider: 'claude',
      currentBalance: 0,
      monthlySpend: 0,
      billingMethod: 'Anthropic Console',
      nextBillingDate: null,
      usageLimits: {
        daily: null,
        monthly: null,
        note: 'Token-based pricing. Rate limits vary by tier. Monitor at console.anthropic.com',
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  protected formatUsageForNotification(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return [
      `🧠 **Claude (Anthropic) Status**`,
      `📊 Available Models: ${details?.availableModels || 'N/A'}`,
      `🤖 Models: ${details?.models || 'Claude 3 family'}`,
      `🆕 Latest: ${details?.latestModel || 'Claude 3 Opus'}`,
      `⚡ Capabilities: ${details?.capabilities || 'Advanced reasoning'}`,
      `ℹ️  ${details?.note || 'Constitutional AI with safety focus'}`,
      '',
      `🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
      '',
      '💡 **Monitor Usage**: Visit console.anthropic.com',
      '🧠 **Special**: Constitutional AI, long context, vision capabilities',
    ].join('\n');
  }

  getStatusEmoji(usage: UsageData): string {
    return '🟢'; // API access working
  }

  getQuickStatus(usage: UsageData): string {
    const details = usage.usageDetails as any;
    return `Claude: ${details?.availableModels || 0} models, constitutional AI`;
  }
}