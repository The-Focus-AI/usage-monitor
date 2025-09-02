export interface UsageData {
	provider: string;
	totalTokens: number;
	totalCost: number;
	remainingBalance: number;
	usageDetails?: Record<string, any>;
	billingPeriod: {
		start: string;
		end: string;
	};
	lastUpdated: string;
	// Legacy fields for backward compatibility
	totalCredits?: number;
	totalUsage?: number;
	currency?: string;
}

export interface BillingData {
	provider: string;
	currentBalance: number;
	monthlySpend: number;
	billingMethod: string;
	nextBillingDate: string | null;
	usageLimits: {
		daily: number | null;
		monthly: number | null;
		note?: string;
	};
	lastUpdated: string;
	// Legacy fields for backward compatibility
	limit?: number;
	limitRemaining?: number;
	isFreeTeir?: boolean;
}

export interface ProviderConfig {
	apiKey: string;
	baseUrl?: string;
	enabled: boolean;
	billingKey?: string; // Optional: separate key for billing/admin endpoints (e.g. Anthropic admin key, Google OAuth token)
}

export interface NotificationField {
	title: string;
	value: string;
}

export abstract class BaseAPIProvider {
	abstract readonly name: string;
	protected config: ProviderConfig;

	constructor(config: ProviderConfig) {
		this.config = config;
	}

	abstract authenticate(): Promise<boolean>;
	abstract getUsage(): Promise<UsageData>;
	abstract getBilling?(): Promise<BillingData | null>;

	// Abstract methods for notification formatting
	protected abstract formatUsageForNotification(usage: UsageData): string;
	abstract getStatusEmoji(usage: UsageData): string;
	abstract getQuickStatus(usage: UsageData): string;

	protected async fetchJson<T>(
		url: string,
		init: RequestInit = {},
		retries: number = 2,
	): Promise<T> {
		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				const res = await fetch(url, init);
				if (res.ok) {
					return (await res.json()) as T;
				}
				if (attempt === retries) {
					const body = await res.text();
					throw new Error(
						`Request failed ${url} status=${res.status} body=${body}`,
					);
				}
			} catch (error) {
				if (attempt === retries) {
					throw error;
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
		}
		throw new Error("Unexpected error in fetchJson");
	}
}

// Legacy class for backward compatibility
export abstract class APIProvider extends BaseAPIProvider {}
