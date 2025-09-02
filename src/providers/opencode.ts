import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

interface OpenCodeModelsResponse {
	object: string;
	data: Array<{
		id: string;
		object: string;
		created: number;
		owned_by: string;
	}>;
}

export class OpenCodeProvider extends BaseAPIProvider {
	readonly name = "opencode";
	private readonly baseUrl = "https://opencode.ai/zen/v1";

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

			if (response.status === 401 || response.status === 403) {
				return false;
			}

			return response.ok;
		} catch (error) {
			console.error("OpenCode authentication error:", error);
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		try {
			const models = await this.fetchJson<OpenCodeModelsResponse>(
				`${this.baseUrl}/models`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						Accept: "application/json",
					},
				},
			);

			const modelList = models.data.map((m) => m.id);

			return {
				provider: "opencode",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				usageDetails: {
					totalModels: models.data.length,
					models: modelList.slice(0, 10).join(", "),
					note: "OpenCode Zen billing managed at opencode.ai/zen. No public billing API.",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("OpenCode usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		return {
			provider: "opencode",
			currentBalance: 0,
			monthlySpend: 0,
			billingMethod: "OpenCode Zen Dashboard",
			nextBillingDate: null,
			usageLimits: {
				daily: null,
				monthly: null,
				note: "Prepaid credits with auto-reload ($20 when below $5). Monthly limits configurable per workspace.",
			},
			lastUpdated: new Date().toISOString(),
		};
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		return [
			"🔮 **OpenCode Zen Status**",
			`📊 Models: ${d?.totalModels ?? "N/A"} available`,
			`🤖 Top: ${d?.models ?? "N/A"}`,
			`ℹ️  ${d?.note ?? ""}`,
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor**: opencode.ai/zen",
		].join("\n");
	}

	getStatusEmoji(_usage: UsageData): string {
		return "🟢";
	}

	getQuickStatus(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		return `OpenCode Zen: ${d?.totalModels ?? "?"} models`;
	}
}
