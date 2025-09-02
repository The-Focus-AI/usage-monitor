import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

// --- Anthropic Admin API response types ---

interface AnthropicCostReportResponse {
	has_more: boolean;
	next_page: string | null;
	data: Array<{
		starting_at: string;
		ending_at: string;
		cost: number; // in cents, decimal string
		workspace_id: string | null;
		description: string;
	}>;
}

interface AnthropicUsageReportResponse {
	has_more: boolean;
	next_page: string | null;
	data: Array<{
		starting_at: string;
		ending_at: string;
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens: number;
		cache_read_input_tokens: number;
		model: string;
		service_tier: string;
		api_key_id: string | null;
		workspace_id: string | null;
	}>;
}

const ADMIN_KEY_PREFIX = "sk-ant-admin";

export class ClaudeProvider extends BaseAPIProvider {
	readonly name = "claude";
	private readonly baseUrl = "https://api.anthropic.com/v1";
	private readonly isAdmin: boolean;

	constructor(config: ProviderConfig) {
		super(config);
		// Admin if billingKey is present, or if the main API key is an admin key
		this.isAdmin =
			!!this.config.billingKey?.startsWith(ADMIN_KEY_PREFIX) ||
			this.config.apiKey.startsWith(ADMIN_KEY_PREFIX);
	}

	private get adminKey(): string {
		return (
			(this.isAdmin ? this.config.billingKey : undefined) ?? this.config.apiKey
		);
	}

	async authenticate(): Promise<boolean> {
		if (this.isAdmin) {
			return this.authenticateAdmin();
		}
		return this.authenticateRegular();
	}

	private async authenticateAdmin(): Promise<boolean> {
		try {
			// Minimal cost_report call to verify admin access
			const today = new Date().toISOString().split("T")[0]!;
			const res = await fetch(
				`${this.baseUrl}/organizations/cost_report?starting_at=${today}&ending_at=${today}&bucket_width=1d`,
				{
					method: "GET",
					headers: {
						"x-api-key": this.adminKey,
						Accept: "application/json",
					},
				},
			);

			if (res.status === 401 || res.status === 403) {
				throw new Error(
					"Admin API key rejected — verify at console.anthropic.com/settings/admin-keys",
				);
			}
			if (res.status === 404) {
				throw new Error(
					"Not an admin API key — admin keys start with sk-ant-admin. Create one at console.anthropic.com/settings/admin-keys",
				);
			}

			return res.ok;
		} catch (error) {
			if (error instanceof Error && error.message.includes("Admin")) {
				throw error; // re-throw auth-specific errors
			}
			console.error("Anthropic admin authentication error:", error);
			return false;
		}
	}

	private async authenticateRegular(): Promise<boolean> {
		// Try x-api-key header first (direct Anthropic)
		let response = await fetch(`${this.baseUrl}/messages`, {
			method: "POST",
			headers: {
				"x-api-key": this.config.apiKey,
				"Content-Type": "application/json",
				"anthropic-version": "2023-06-01",
				Accept: "application/json",
			},
			body: JSON.stringify({
				model: "claude-3-haiku-20240307",
				max_tokens: 1,
				messages: [{ role: "user", content: "Hi" }],
			}),
		});

		if (response.status === 404) {
			throw new Error(
				"Not an Anthropic API key — this key doesn't work with api.anthropic.com. Direct keys start with sk-ant-api03-",
			);
		}

		if (response.status === 401 || response.status === 403) {
			// Try Bearer token (OpenRouter proxy or other gateway)
			response = await fetch(`${this.baseUrl}/messages`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					"Content-Type": "application/json",
					"anthropic-version": "2023-06-01",
					Accept: "application/json",
				},
				body: JSON.stringify({
					model: "claude-3-haiku-20240307",
					max_tokens: 1,
					messages: [{ role: "user", content: "Hi" }],
				}),
			});

			if (response.status === 404) {
				throw new Error(
					"Not an Anthropic API key — use a key from console.anthropic.com (sk-ant-api03-...)",
				);
			}

			if (response.status === 401 || response.status === 403) {
				throw new Error(
					"API key rejected by Anthropic. Check key at console.anthropic.com/settings/keys",
				);
			}
		}

		if (response.status === 429) return true; // Rate limited but key valid
		if (!response.ok) {
			throw new Error(
				`Anthropic API error (HTTP ${response.status}). Verify key at console.anthropic.com`,
			);
		}

		const data = (await response.json()) as any;
		return data.type === "message" && data.usage && data.usage.input_tokens > 0;
	}

	async getUsage(): Promise<UsageData> {
		if (this.isAdmin) {
			return this.getAdminUsage();
		}
		return this.getRegularUsage();
	}

	private async getAdminUsage(): Promise<UsageData> {
		const today = new Date();
		const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
			.toISOString()
			.split("T")[0]!;
		const todayStr = today.toISOString().split("T")[0]!;
		const lastUpdated = today.toISOString();

		let totalCost = 0;
		let totalInputTokens = 0;
		let totalOutputTokens = 0;
		let totalCacheCreation = 0;
		let totalCacheRead = 0;
		const models = new Set<string>();
		let workspaceCount = 0;
		const workspaceSet = new Set<string | null>();

		// Fetch cost report (monthly)
		try {
			const costUrl = `${this.baseUrl}/organizations/cost_report?starting_at=${startOfMonth}&ending_at=${todayStr}&bucket_width=1d`;
			const costRes = await fetch(costUrl, {
				method: "GET",
				headers: {
					"x-api-key": this.adminKey,
					Accept: "application/json",
				},
			});

			if (costRes.ok) {
				const costData = (await costRes.json()) as AnthropicCostReportResponse;
				for (const bucket of costData.data) {
					totalCost += Number(bucket.cost) / 100; // cents → USD
					workspaceSet.add(bucket.workspace_id);
				}
				workspaceCount = workspaceSet.size;
			}
		} catch {
			// cost_report failed, continue with usage_report
		}

		// Fetch usage report (monthly, daily buckets)
		try {
			const usageUrl = `${this.baseUrl}/organizations/usage_report/messages?starting_at=${startOfMonth}&ending_at=${todayStr}&bucket_width=1d`;
			const usageRes = await fetch(usageUrl, {
				method: "GET",
				headers: {
					"x-api-key": this.adminKey,
					Accept: "application/json",
				},
			});

			if (usageRes.ok) {
				const usageData =
					(await usageRes.json()) as AnthropicUsageReportResponse;
				for (const bucket of usageData.data) {
					totalInputTokens += bucket.input_tokens;
					totalOutputTokens += bucket.output_tokens;
					totalCacheCreation += bucket.cache_creation_input_tokens;
					totalCacheRead += bucket.cache_read_input_tokens;
					if (bucket.model) models.add(bucket.model);
				}
			}
		} catch {
			// usage_report failed
		}

		const totalTokens = totalInputTokens + totalOutputTokens;
		const note =
			totalCost > 0
				? "Admin API — live cost + usage data"
				: "Admin API key works but cost/usage data may not be available yet (data appears within ~5 minutes of requests)";

		return {
			provider: "claude",
			totalTokens,
			totalCost,
			remainingBalance: -1, // Anthropic doesn't expose balance/credit
			usageDetails: {
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
				cacheCreationTokens: totalCacheCreation,
				cacheReadTokens: totalCacheRead,
				uniqueModels: models.size,
				modelList: [...models].sort().slice(0, 10).join(", "),
				workspaceCount,
				note,
			},
			billingPeriod: {
				start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
				end: today.toISOString(),
			},
			lastUpdated,
		};
	}

	private async getRegularUsage(): Promise<UsageData> {
		try {
			const availableModels = [
				"claude-3-opus-20240229",
				"claude-3-sonnet-20240229",
				"claude-3-haiku-20240307",
				"claude-2.1",
				"claude-2.0",
				"claude-instant-1.2",
			];

			return {
				provider: "claude",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: 0,
				usageDetails: {
					availableModels: availableModels.length,
					models: availableModels.slice(0, 3).join(", "),
					latestModel: "claude-3-opus-20240229",
					capabilities: "Text, vision, function calling",
					note: "Usage monitoring available at console.anthropic.com. Use an admin API key (sk-ant-admin...) for live cost data.",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("Claude usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		if (this.isAdmin) {
			return this.getAdminBilling();
		}
		return this.getRegularBilling();
	}

	private async getAdminBilling(): Promise<BillingData | null> {
		const today = new Date();
		const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
			.toISOString()
			.split("T")[0]!;
		const todayStr = today.toISOString().split("T")[0]!;

		let monthlySpend = 0;

		try {
			const url = `${this.baseUrl}/organizations/cost_report?starting_at=${startOfMonth}&ending_at=${todayStr}&bucket_width=1d`;
			const res = await fetch(url, {
				method: "GET",
				headers: {
					"x-api-key": this.adminKey,
					Accept: "application/json",
				},
			});

			if (res.ok) {
				const data = (await res.json()) as AnthropicCostReportResponse;
				monthlySpend = data.data.reduce(
					(sum, b) => sum + Number(b.cost) / 100,
					0,
				);
			}
		} catch {
			// ignore
		}

		return {
			provider: "claude",
			currentBalance: -1,
			monthlySpend,
			billingMethod: "Anthropic Admin API (live cost report)",
			nextBillingDate: new Date(today.getFullYear(), today.getMonth() + 1, 1)
				.toISOString()
				.split("T")[0]!,
			usageLimits: {
				daily: null,
				monthly: null,
				note: "Admin API provides real-time cost data. Rate limits configured in console.anthropic.com.",
			},
			lastUpdated: today.toISOString(),
		};
	}

	private getRegularBilling(): Promise<BillingData | null> {
		return Promise.resolve({
			provider: "claude",
			currentBalance: 0,
			monthlySpend: 0,
			billingMethod: "Anthropic Console",
			nextBillingDate: null,
			usageLimits: {
				daily: null,
				monthly: null,
				note: "Token-based pricing. Rate limits vary by tier. Use an admin API key for live cost data.",
			},
			lastUpdated: new Date().toISOString(),
		});
	}

	protected formatUsageForNotification(usage: UsageData): string {
		if (this.isAdmin) {
			return this.formatAdminNotification(usage);
		}
		return this.formatRegularNotification(usage);
	}

	private formatAdminNotification(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		return [
			"🧠 **Claude (Anthropic) Status**",
			`💰 Monthly Spend: $${(usage.totalCost ?? 0).toFixed(2)}`,
			`🔤 Tokens: ${(d?.inputTokens ?? 0).toLocaleString()} in / ${(d?.outputTokens ?? 0).toLocaleString()} out`,
			`💾 Cache: ${(d?.cacheReadTokens ?? 0).toLocaleString()} read / ${(d?.cacheCreationTokens ?? 0).toLocaleString()} created`,
			`📊 Models: ${d?.uniqueModels ?? "?"} unique (${d?.modelList ?? "?"})`,
			`🏢 Workspaces: ${d?.workspaceCount ?? "?"}`,
			"",
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Admin API**: Live cost + usage data via Anthropic Admin API",
			"🧠 **Monitor**: console.anthropic.com",
		].join("\n");
	}

	private formatRegularNotification(usage: UsageData): string {
		const details = usage.usageDetails as any;
		return [
			"🧠 **Claude (Anthropic) Status**",
			`📊 Available Models: ${details?.availableModels || "N/A"}`,
			`🤖 Models: ${details?.models || "Claude 3 family"}`,
			`🆕 Latest: ${details?.latestModel || "Claude 3 Opus"}`,
			`⚡ Capabilities: ${details?.capabilities || "Advanced reasoning"}`,
			`ℹ️  ${details?.note || "Constitutional AI with safety focus"}`,
			"",
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor Usage**: Visit console.anthropic.com",
			"🧠 **Special**: Constitutional AI, long context, vision capabilities",
		].join("\n");
	}

	getStatusEmoji(usage: UsageData): string {
		if (this.isAdmin) {
			const spend = usage.totalCost;
			if (spend > 500) return "🔴";
			if (spend > 100) return "🟡";
			return "🟢";
		}
		return "🟢"; // API access working (regular key)
	}

	getQuickStatus(usage: UsageData): string {
		if (this.isAdmin) {
			const d = usage.usageDetails as Record<string, unknown>;
			return `Claude: $${(usage.totalCost ?? 0).toFixed(2)} this month, ${d?.uniqueModels ?? 0} models`;
		}
		const details = usage.usageDetails as any;
		return `Claude: ${details?.availableModels || 0} models, constitutional AI`;
	}
}
