import { APIProvider, type UsageData, type BillingData } from '../shared/types.js';

interface OpenRouterCreditsResponse {
  data: {
    total_credits: number;
    total_usage: number;
  };
}

interface OpenRouterKeyResponse {
  data: {
    label?: string;
    limit?: number;
    usage?: number;
    limit_remaining?: number;
    is_free_tier?: boolean;
  };
}

export class OpenRouterProvider extends APIProvider {
  readonly name = 'openrouter';
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  async authenticate(): Promise<boolean> {
    try {
      await this.getKeyInfo();
      return true;
    } catch {
      return false;
    }
  }

  async getUsage(): Promise<UsageData> {
    const [creditsData, keyData] = await Promise.all([
      this.getCredits(),
      this.getKeyInfo(),
    ]);

    const totalCredits = creditsData?.total_credits || 0;
    const totalUsage = creditsData?.total_usage || keyData?.usage || 0;
    
    // Calculate remaining balance from credits - usage OR use limit_remaining if available
    const remainingBalance = Number.isFinite(keyData?.limit_remaining)
      ? keyData.limit_remaining
      : Math.max(totalCredits - totalUsage, 0);

    return {
      totalCredits,
      totalUsage,
      remainingBalance,
      currency: 'USD',
    };
  }

  async getBilling(): Promise<BillingData> {
    const keyData = await this.getKeyInfo();
    return {
      limit: keyData?.limit,
      limitRemaining: keyData?.limit_remaining,
      isFreeTeir: keyData?.is_free_tier,
    };
  }

  private async getCredits(): Promise<OpenRouterCreditsResponse['data']> {
    const url = `${this.baseUrl}/credits`;
    const response = await this.fetchJson<OpenRouterCreditsResponse>(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  }

  private async getKeyInfo(): Promise<OpenRouterKeyResponse['data']> {
    const url = `${this.baseUrl}/key`;
    const response = await this.fetchJson<OpenRouterKeyResponse>(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  }
}