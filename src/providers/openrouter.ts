import {
	BaseAPIProvider,
	type UsageData,
	type BillingData,
} from "../shared/types.js";

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

export class OpenRouterProvider extends BaseAPIProvider {
	readonly name = "openrouter";
	private readonly baseUrl = "https://openrouter.ai/api/v1";

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
		const remainingBalance =
			typeof keyData?.limit_remaining === "number"
				? keyData.limit_remaining
				: Math.max(totalCredits - totalUsage, 0);

		return {
			provider: "openrouter",
			totalTokens: totalUsage, // For consistency with new interface
			totalCost: totalUsage,
			remainingBalance,
			usageDetails: {
				totalCredits,
				totalUsage,
				currency: "USD",
			},
			billingPeriod: {
				start: new Date().toISOString(),
				end: new Date().toISOString(),
			},
			lastUpdated: new Date().toISOString(),
			// Legacy fields for backward compatibility
			totalCredits,
			totalUsage,
			currency: "USD",
		};
	}

	async getBilling(): Promise<BillingData> {
		const keyData = await this.getKeyInfo();
		return {
			provider: "openrouter",
			currentBalance: keyData?.limit_remaining || 0,
			monthlySpend: keyData?.usage || 0,
			billingMethod: "OpenRouter Credits",
			nextBillingDate: null,
			usageLimits: {
				daily: null,
				monthly: keyData?.limit || null,
				note: keyData?.is_free_tier ? "Free tier account" : "Paid account",
			},
			lastUpdated: new Date().toISOString(),
			// Legacy fields for backward compatibility
			...(keyData?.limit !== undefined ? { limit: keyData.limit } : {}),
			...(keyData?.limit_remaining !== undefined
				? { limitRemaining: keyData.limit_remaining }
				: {}),
			...(keyData?.is_free_tier !== undefined
				? { isFreeTeir: keyData.is_free_tier }
				: {}),
		};
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const details = usage.usageDetails as any;
		return [
			`💰 **OpenRouter Balance Status**`,
			`💳 Credits Purchased: $${details?.totalCredits?.toFixed(2) || "0.00"}`,
			`📊 Credits Used: $${details?.totalUsage?.toFixed(2) || "0.00"}`,
			`💰 Balance Remaining: $${usage.remainingBalance.toFixed(2)}`,
			"",
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
		].join("\n");
	}

	getStatusEmoji(usage: UsageData): string {
		const balance = usage.remainingBalance;

		if (balance < 5) return "🔴"; // Low balance
		if (balance < 15) return "🟡"; // Moderate balance
		return "🟢"; // Good balance
	}

	getQuickStatus(usage: UsageData): string {
		return `$${usage.remainingBalance.toFixed(2)} remaining`;
	}

	private async getCredits(): Promise<OpenRouterCreditsResponse["data"]> {
		const url = `${this.baseUrl}/credits`;
		const response = await this.fetchJson<OpenRouterCreditsResponse>(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				"Content-Type": "application/json",
			},
		});
		return response.data;
	}

	private async getKeyInfo(): Promise<OpenRouterKeyResponse["data"]> {
		const url = `${this.baseUrl}/key`;
		const response = await this.fetchJson<OpenRouterKeyResponse>(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				"Content-Type": "application/json",
			},
		});
		return response.data;
	}
}
