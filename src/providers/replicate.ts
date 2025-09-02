import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

interface ReplicateAccountResponse {
	type: string;
	username: string;
	name: string;
	github_url?: string;
}

export class ReplicateProvider extends BaseAPIProvider {
	readonly name = "replicate";
	private readonly baseUrl = "https://api.replicate.com/v1";

	constructor(config: ProviderConfig) {
		super(config);
	}

	async authenticate(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/account`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					Accept: "application/json",
				},
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		try {
			let accountType = "unknown";
			let username = "unknown";

			try {
				const res = await fetch(`${this.baseUrl}/account`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						Accept: "application/json",
					},
				});
				if (res.ok) {
					const account: ReplicateAccountResponse = await res.json();
					accountType = account.type;
					username = account.username;
				}
			} catch {
				// ignore
			}

			return {
				provider: "replicate",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				usageDetails: {
					accountType,
					username,
					note: "Replicate does not expose billing via API. Check billing at replicate.com/billing",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("Replicate usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		try {
			const res = await fetch(`${this.baseUrl}/account`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					Accept: "application/json",
				},
			});
			if (!res.ok) return null;
			const account: ReplicateAccountResponse = await res.json();

			return {
				provider: "replicate",
				currentBalance: 0,
				monthlySpend: 0,
				billingMethod:
					account.type === "organization"
						? "Organization Billing"
						: "Personal Billing",
				nextBillingDate: null,
				usageLimits: {
					daily: null,
					monthly: null,
					note: "Billing managed at replicate.com/billing. Prepaid credits or monthly arrears.",
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch {
			return null;
		}
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const d = usage.usageDetails as any;
		return [
			"🖼️ **Replicate Status**",
			`👤 Account: ${d?.username ?? "?"} (${d?.accountType ?? "?"})`,
			`ℹ️  ${d?.note ?? "No billing API available"}`,
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor**: replicate.com/billing",
		].join("\n");
	}

	getStatusEmoji(_usage: UsageData): string {
		return "🟢";
	}

	getQuickStatus(usage: UsageData): string {
		const d = usage.usageDetails as any;
		return `Replicate: ${d?.username ?? "?"} (${d?.accountType ?? "?"})`;
	}
}
