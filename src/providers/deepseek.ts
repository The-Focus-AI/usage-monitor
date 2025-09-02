import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

interface DeepSeekBalanceResponse {
	is_available: boolean;
	balance_infos: Array<{
		currency: string;
		total_balance: string;
		granted_balance: string;
		topped_up_balance: string;
	}>;
}

export class DeepSeekProvider extends BaseAPIProvider {
	readonly name = "deepseek";
	private readonly baseUrl = "https://api.deepseek.com";

	constructor(config: ProviderConfig) {
		super(config);
	}

	async authenticate(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/user/balance`, {
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
			let balance = 0;
			let totalBalance = 0;

			try {
				const res = await fetch(`${this.baseUrl}/user/balance`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						Accept: "application/json",
					},
				});

				if (res.ok) {
					const data: DeepSeekBalanceResponse = await res.json();
					if (data.is_available && data.balance_infos.length > 0) {
						const info = data.balance_infos[0]!;
						balance = Number.parseFloat(info.total_balance) || 0;
						totalBalance = Number.parseFloat(info.topped_up_balance) || 0;
					}
				}
			} catch {
				// balance endpoint may not work for all keys
			}

			// Also hit models endpoint for model access count
			let modelCount = 0;
			try {
				const modelsRes = await fetch(`${this.baseUrl}/models`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						Accept: "application/json",
					},
				});
				if (modelsRes.ok) {
					const modelsData = (await modelsRes.json()) as any;
					modelCount = modelsData?.data?.length ?? 0;
				}
			} catch {
				// ignore
			}

			return {
				provider: "deepseek",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: balance,
				usageDetails: {
					balance,
					totalBalance,
					modelCount,
					currency: "CNY",
					note: "DeepSeek uses prepaid balance in CNY. Pricing per token varies by model.",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("DeepSeek usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		try {
			const res = await fetch(`${this.baseUrl}/user/balance`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					Accept: "application/json",
				},
			});
			if (!res.ok) return null;

			const data: DeepSeekBalanceResponse = await res.json();
			const balance = data.balance_infos[0]?.total_balance ?? "0";

			return {
				provider: "deepseek",
				currentBalance: Number.parseFloat(balance) || 0,
				monthlySpend: 0,
				billingMethod: "DeepSeek Prepaid Balance (CNY)",
				nextBillingDate: null,
				usageLimits: {
					daily: null,
					monthly: null,
					note: "Prepaid balance. Top up at platform.deepseek.com",
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
			"🔮 **DeepSeek Status**",
			`💰 Balance: ¥${Number(d?.balance ?? 0).toFixed(2)} CNY`,
			`📊 Models: ${d?.modelCount ?? "?"} available`,
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor**: platform.deepseek.com",
		].join("\n");
	}

	getStatusEmoji(usage: UsageData): string {
		const d = usage.usageDetails as any;
		const balance = d?.balance ?? usage.remainingBalance;
		if (balance <= 1) return "🔴";
		if (balance <= 10) return "🟡";
		return "🟢";
	}

	getQuickStatus(usage: UsageData): string {
		const d = usage.usageDetails as any;
		const balance = d?.balance ?? usage.remainingBalance;
		return `DeepSeek: ¥${Number(balance).toFixed(2)} CNY`;
	}
}
