import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

export class NousProvider extends BaseAPIProvider {
	readonly name = "nous";
	private readonly baseUrl = "https://forge-api.nousresearch.com";

	constructor(config: ProviderConfig) {
		super(config);
	}

	async authenticate(): Promise<boolean> {
		try {
			// Test the Forge API with a minimal request
			const response = await fetch(`${this.baseUrl}/v1/models`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					Accept: "application/json",
				},
			});

			if (response.status === 401 || response.status === 403) {
				return false;
			}

			// 404 may mean the endpoint doesn't exist but key is valid
			if (response.status === 404) {
				return true;
			}

			return response.ok;
		} catch (error) {
			console.error("Nous authentication error:", error);
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		try {
			return {
				provider: "nous",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: 0,
				usageDetails: {
					models: "Hermes-3-70b, Forge reasoning models",
					capabilities: "Reasoning, text generation",
					note: "Nous Research billing managed at portal.nousresearch.com. No public billing API.",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("Nous usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		return {
			provider: "nous",
			currentBalance: 0,
			monthlySpend: 0,
			billingMethod: "Nous Research Portal",
			nextBillingDate: null,
			usageLimits: {
				daily: null,
				monthly: null,
				note: "Pay-per-token billing. Credits purchased at portal.nousresearch.com/billing.",
			},
			lastUpdated: new Date().toISOString(),
		};
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		return [
			"🧪 **Nous Research Status**",
			`🤖 Models: ${d?.models ?? "Hermes, Forge"}`,
			`⚡ Capabilities: ${d?.capabilities ?? "Reasoning, text gen"}`,
			`ℹ️  ${d?.note ?? ""}`,
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor**: portal.nousresearch.com",
		].join("\n");
	}

	getStatusEmoji(_usage: UsageData): string {
		return "🟢";
	}

	getQuickStatus(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		return `Nous: ${d?.models ?? "Hermes/Forge"}`;
	}
}
