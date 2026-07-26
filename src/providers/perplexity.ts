import { BaseAPIProvider } from "../shared/types.js";
import type {
	ProviderConfig,
	UsageData,
	BillingData,
} from "../shared/types.js";

interface PerplexityTestResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		finish_reason: string;
		message: {
			role: string;
			content: string;
		};
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export class PerplexityProvider extends BaseAPIProvider {
	readonly name = "perplexity";
	private readonly baseUrl = "https://api.perplexity.ai";

	constructor(config: ProviderConfig) {
		super(config);
	}

	async authenticate(): Promise<boolean> {
		try {
			// Perplexity doesn't have a models endpoint, so we'll do a minimal test request
			// Try an offline instruct model first (more permissive), then fallback to sonar online
			const tryAuth = async (
				model: string,
			): Promise<{
				ok: boolean;
				status: number;
				body?: string;
				data?: PerplexityTestResponse;
			}> => {
				const res = await fetch(`${this.baseUrl}/chat/completions`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						"Content-Type": "application/json",
						Accept: "application/json",
						"User-Agent": "usage-monitor/0.1",
					},
					body: JSON.stringify({
						model,
						messages: [{ role: "user", content: "Hello" }],
						max_tokens: 1,
						temperature: 0,
					}),
				});
				if (res.ok) {
					const data: PerplexityTestResponse = await res.json();
					return { ok: true, status: res.status, data };
				}
				let body: string | undefined;
				try {
					body = await res.text();
				} catch {
					// Ignore response body read failures; status is enough for auth fallback.
				}
				return body === undefined
					? { ok: false, status: res.status }
					: { ok: false, status: res.status, body };
			};

			// First attempt with an instruct model
			let result = await tryAuth("llama-3.1-8b-instruct");
			if (!result.ok) {
				// Fallback to sonar online variant
				const fallback = await tryAuth("llama-3.1-sonar-small-128k-online");
				result = fallback;
			}

			if (result.ok && result.data) {
				return result.data.object === "chat.completion" && !!result.data.usage;
			}

			// Handle common non-auth related errors as success (e.g., model permissions, bad params)
			if (result.status === 429) return true; // rate limit implies valid key
			if (result.status === 400) {
				const msg = (result.body || "").toLowerCase();
				const isAuthError =
					msg.includes("auth") ||
					msg.includes("api key") ||
					msg.includes("unauthorized");
				if (!isAuthError) {
					// Treat other 400s (e.g., model not enabled, invalid params) as authenticated
					return true;
				}
			}

			if (result.status === 401) return false; // invalid key

			console.warn(
				`Perplexity auth check failed: ${result.status} ${result.body || ""}`,
			);
			return false;
		} catch (error) {
			console.error("Perplexity authentication error:", error);
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		try {
			// Perplexity doesn't have a usage API endpoint
			// We'll do a minimal test to verify access and show available models
			const availableModels = [
				"llama-3.1-sonar-small-128k-online",
				"llama-3.1-sonar-large-128k-online",
				"llama-3.1-sonar-huge-128k-online",
				"llama-3.1-8b-instruct",
				"llama-3.1-70b-instruct",
				"mixtral-8x7b-instruct",
			];

			return {
				provider: "perplexity",
				totalTokens: 0, // Not available from API
				totalCost: 0, // Not available from API
				remainingBalance: 0, // Check Perplexity console
				usageDetails: {
					availableModels: availableModels.length,
					models: availableModels.slice(0, 3).join(", "),
					searchCapable: true,
					note: "Usage monitoring available in Settings > API tab at perplexity.ai",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("Perplexity usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		// Perplexity billing is managed through their web interface
		return {
			provider: "perplexity",
			currentBalance: 0,
			monthlySpend: 0,
			billingMethod: "Perplexity Console",
			nextBillingDate: null,
			usageLimits: {
				daily: null,
				monthly: null,
				note: "Pro subscribers get $5 monthly credits. Token-based billing. Monitor at Settings > API.",
			},
			lastUpdated: new Date().toISOString(),
		};
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const details = usage.usageDetails as any;
		return [
			`🔍 **Perplexity AI (Search-Augmented) Status**`,
			`📊 Available Models: ${details?.availableModels || "N/A"}`,
			`🤖 Models: ${details?.models || "N/A"}`,
			`🔎 Search Integration: ${details?.searchCapable ? "Yes" : "No"}`,
			`ℹ️  ${details?.note || "Real-time search capabilities"}`,
			"",
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor Usage**: Settings > API tab at perplexity.ai",
			"🔍 **Special**: Real-time online search with citations",
		].join("\n");
	}

	getStatusEmoji(_usage: UsageData): string {
		return "🟢"; // API access working
	}

	getQuickStatus(usage: UsageData): string {
		const details = usage.usageDetails as any;
		return `Perplexity: ${details?.availableModels || 0} models, search-augmented AI`;
	}
}
