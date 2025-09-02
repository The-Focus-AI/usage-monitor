import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

interface FalAccountBilling {
	credits?: {
		current_balance: number;
		currency: string;
	};
}

interface FalUsageRecord {
	id: string;
	created_at: string;
	[key: string]: unknown;
}

interface FalUsageResponse {
	data: FalUsageRecord[];
	total: number;
}

export class FalProvider extends BaseAPIProvider {
	readonly name = "fal";
	private readonly baseUrl = "https://api.fal.ai/v1";

	constructor(config: ProviderConfig) {
		super(config);
	}

	async authenticate(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/models`, {
				method: "GET",
				headers: {
					Authorization: `Key ${this.config.apiKey}`,
					Accept: "application/json",
				},
			});

			if (response.status === 401 || response.status === 403) {
				return false;
			}

			return response.ok;
		} catch (error) {
			console.error("fal.ai authentication error:", error);
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		try {
			let currentBalance = 0;
			let currency = "USD";

			try {
				const billingUrl = `${this.baseUrl}/account/billing?expand=credits`;
				const billing = await this.fetchJson<FalAccountBilling>(billingUrl, {
					method: "GET",
					headers: {
						Authorization: `Key ${this.config.apiKey}`,
						Accept: "application/json",
					},
				});
				if (billing.credits) {
					currentBalance = billing.credits.current_balance;
					currency = billing.credits.currency;
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.error(`[fal] billing endpoint failed:`, msg);
				// If 403, surface that this key lacks billing permissions
				if (msg.includes("403") || msg.includes("admin")) {
					return {
						provider: "fal",
						totalTokens: 0,
						totalCost: 0,
						remainingBalance: -2, // billing permission required
						usageDetails: {
							note: "Billing requires an admin API key. Your key lacks billing permissions.",
						},
						billingPeriod: { start: "", end: "" },
						lastUpdated: new Date().toISOString(),
					};
				}
			}

			let totalUsage = 0;
			let usageCount = 0;

			try {
				const usage = await this.fetchJson<FalUsageResponse>(
					`${this.baseUrl}/models/usage?limit=50`,
					{
						method: "GET",
						headers: {
							Authorization: `Key ${this.config.apiKey}`,
							Accept: "application/json",
						},
					},
				);
				totalUsage = usage.total;
				usageCount = usage.data.length;
			} catch {
				// Usage endpoint optional
			}

			return {
				provider: "fal",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: currentBalance,
				usageDetails: {
					creditBalance: currentBalance,
					currency,
					recentUsageRecords: usageCount,
					totalUsageRecords: totalUsage,
					note: "fal.ai uses prepaid credits. Pricing varies by model.",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("fal.ai usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		try {
			const billing = await this.fetchJson<FalAccountBilling>(
				`${this.baseUrl}/account/billing?expand=credits`,
				{
					method: "GET",
					headers: {
						Authorization: `Key ${this.config.apiKey}`,
						Accept: "application/json",
					},
				},
			);

			return {
				provider: "fal",
				currentBalance: billing.credits?.current_balance ?? 0,
				monthlySpend: 0,
				billingMethod: "fal.ai Prepaid Credits",
				nextBillingDate: null,
				usageLimits: {
					daily: null,
					monthly: null,
					note: "Pay-per-use model. Credits deducted per successful output.",
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch {
			return null;
		}
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		const balance = (d?.creditBalance as number) ?? 0;
		return [
			"🎨 **fal.ai Status**",
			`💰 Credit Balance: $${balance.toFixed(2)}`,
			`📊 Records: ${d?.recentUsageRecords ?? 0}/${d?.totalUsageRecords ?? 0}`,
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor**: fal.ai/dashboard",
		].join("\n");
	}

	getStatusEmoji(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		const balance = (d?.creditBalance as number) ?? usage.remainingBalance;
		if (balance <= 1) return "🔴";
		if (balance <= 5) return "🟡";
		return "🟢";
	}

	getQuickStatus(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		const balance = (d?.creditBalance as number) ?? usage.remainingBalance;
		return `fal.ai: $${Number(balance).toFixed(2)} credits`;
	}
}
