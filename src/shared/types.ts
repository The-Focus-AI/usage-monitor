export interface UsageData {
  totalCredits: number;
  totalUsage: number;
  remainingBalance: number;
  currency: string;
}

export interface BillingData {
  limit?: number;
  limitRemaining?: number;
  isFreeTeir?: boolean;
}

export interface NotificationField {
  title: string;
  value: string;
}

export abstract class APIProvider {
  abstract readonly name: string;
  protected config: { apiKey: string; baseUrl?: string; enabled: boolean };

  constructor(config: { apiKey: string; baseUrl?: string; enabled: boolean }) {
    this.config = config;
  }

  abstract authenticate(): Promise<boolean>;
  abstract getUsage(): Promise<UsageData>;
  abstract getBilling?(): Promise<BillingData>;

  protected async fetchJson<T>(
    url: string, 
    init: RequestInit = {}, 
    retries: number = 2
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, init);
        if (res.ok) {
          return await res.json();
        }
        if (attempt === retries) {
          const body = await res.text();
          throw new Error(`Request failed ${url} status=${res.status} body=${body}`);
        }
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
    throw new Error('Unexpected error in fetchJson');
  }
}