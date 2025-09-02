import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

interface OpenAIModelsResponse {
	object: string;
	data: Array<{
		id: string;
		object: string;
		created: number;
		owned_by: string;
	}>;
}

interface OpenAIUsageResponse {
	object: string;
	daily_costs: Array<{
		timestamp: number;
		line_items: Array<{
			name: string;
			cost: number;
		}>;
	}>;
	total_usage: number;
}

interface OpenAICreditGrantsResponse {
	object: string;
	total_granted: number;
	total_used: number;
	total_available: number;
}

export class OpenAIProvider extends BaseAPIProvider {
	readonly name = "openai";
	private readonly baseUrl = "https://api.openai.com/v1";

	constructor(config: ProviderConfig) {
		super(config);
	}

	async authenticate(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/models`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					Accept: "application/json",
				},
			});

			if (response.status === 401) {
				return false; // Invalid API key
			}

			if (!response.ok) {
				console.warn(
					`OpenAI auth check failed: ${response.status} ${response.statusText}`,
				);
				return false;
			}

			const data: OpenAIModelsResponse = await response.json();
			return (
				data.object === "list" &&
				Array.isArray(data.data) &&
				data.data.length > 0
			);
		} catch (error) {
			console.error("OpenAI authentication error:", error);
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		try {
			// Get available models first (fast, always works)
			const modelsResponse = await fetch(`${this.baseUrl}/models`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					Accept: "application/json",
				},
			});

			if (!modelsResponse.ok) {
				throw new Error(`Models API request failed: ${modelsResponse.status}`);
			}

			const modelsData: OpenAIModelsResponse = await modelsResponse.json();
			const ownedModels = modelsData.data.filter(
				(m) => m.owned_by === "openai" || m.owned_by === "system",
			);

			let monthlySpend = 0;
			let remainingCredits = 0;
			let usageNote = "Usage details available in OpenAI Dashboard";
			const today = new Date();
			const startStr = new Date(today.getFullYear(), today.getMonth(), 1)
				.toISOString()
				.split("T")[0]!;
			const endStr = today.toISOString().split("T")[0]!;

			// Try modern organization costs API first
			try {
				const costsRes = await fetch(
					`${this.baseUrl}/organization/usage/costs?start_time=${startStr}&end_time=${endStr}`,
					{
						method: "GET",
						headers: {
							Authorization: `Bearer ${this.config.apiKey}`,
							Accept: "application/json",
						},
					},
				);
				if (costsRes.ok) {
					const costsData = (await costsRes.json()) as any;
					const buckets = costsData?.data ?? [];
					monthlySpend =
						buckets.reduce(
							(sum: number, b: any) =>
								sum +
								(b.results?.reduce?.(
									(s: number, r: any) => s + (r.amount?.value ?? 0),
									0,
								) ?? 0),
							0,
						) / 100;
					usageNote = `Monthly spend via org costs API`;
				}
			} catch {
				// Modern costs API not available
			}

			// Fallback: legacy credit_grants
			try {
				const creditsRes = await fetch(
					`${this.baseUrl}/dashboard/billing/credit_grants`,
					{
						method: "GET",
						headers: {
							Authorization: `Bearer ${this.config.apiKey}`,
							Accept: "application/json",
						},
					},
				);
				if (creditsRes.ok) {
					const credits = (await creditsRes.json()) as any;
					remainingCredits = credits?.total_available ?? 0;
				}
			} catch {
				// ignore
			}

			return {
				provider: "openai",
				totalTokens: 0,
				totalCost: monthlySpend,
				remainingBalance:
					remainingCredits || monthlySpend > 0 ? -monthlySpend : 0,
				usageDetails: {
					availableModels: ownedModels.length,
					totalModels: modelsData.data.length,
					monthlySpend,
					note:
						monthlySpend > 0
							? `Monthly spend via org costs API`
							: "Key works for API calls but doesn't have organization billing access. Use an org admin key for spend data.",
				},
				billingPeriod: {
					start: new Date(
						today.getFullYear(),
						today.getMonth(),
						1,
					).toISOString(),
					end: today.toISOString(),
				},
				lastUpdated: today.toISOString(),
			};
		} catch (error) {
			console.error("OpenAI usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		// Best-effort: try legacy credit_grants + usage endpoints
		let currentBalance = 0;
		try {
			const creditsRes = await fetch(
				`${this.baseUrl}/dashboard/billing/credit_grants`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						Accept: "application/json",
					},
				},
			);
			if (creditsRes.ok) {
				const credits: OpenAICreditGrantsResponse = await creditsRes.json();
				currentBalance = credits?.total_available ?? 0;
			}
		} catch {
			// ignore
		}

		let monthlySpend = 0;
		try {
			const today = new Date();
			const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
			const usageResponse = await fetch(
				`${this.baseUrl}/dashboard/billing/usage?start_date=${startDate.toISOString().split("T")[0]}&end_date=${today.toISOString().split("T")[0]}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						Accept: "application/json",
					},
				},
			);
			if (usageResponse.ok) {
				const usageData: OpenAIUsageResponse = await usageResponse.json();
				monthlySpend =
					usageData.daily_costs?.reduce(
						(sum, day) =>
							sum +
							day.line_items.reduce((daySum, item) => daySum + item.cost, 0),
						0,
					) || 0;
			}
		} catch {
			// ignore
		}

		return {
			provider: "openai",
			currentBalance,
			monthlySpend,
			billingMethod: "OpenAI Dashboard (best-effort API)",
			nextBillingDate: null,
			usageLimits: {
				daily: null,
				monthly: null,
				note: "Credit grants endpoint may not be available for all accounts",
			},
			lastUpdated: new Date().toISOString(),
		};
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const details = usage.usageDetails as any;
		return [
			`🤖 **OpenAI (GPT) Status**`,
			`📊 Available Models: ${details?.availableModels || "N/A"}`,
			`🎯 Total Models: ${details?.totalModels || "N/A"}`,
			`🔥 Popular: ${details?.popularModels || "GPT models"}`,
			`💰 Monthly Spend: $${details?.monthlySpend?.toFixed(2) || "0.00"}`,
			`ℹ️  ${details?.note || "Full usage details in OpenAI Dashboard"}`,
			"",
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor Usage**: Visit platform.openai.com/usage",
			"🤖 **Models**: GPT-4, GPT-3.5 Turbo, DALL-E, Whisper, and more",
		].join("\n");
	}

	getStatusEmoji(usage: UsageData): string {
		const details = usage.usageDetails as any;
		const monthlySpend = details?.monthlySpend || 0;

		if (monthlySpend > 100) return "🔴"; // High usage
		if (monthlySpend > 20) return "🟡"; // Moderate usage
		return "🟢"; // Low usage or API access working
	}

	getQuickStatus(usage: UsageData): string {
		const details = usage.usageDetails as any;
		const monthlySpend = details?.monthlySpend || 0;
		return `OpenAI: ${details?.availableModels || 0} models, $${monthlySpend.toFixed(2)} this month`;
	}
}
