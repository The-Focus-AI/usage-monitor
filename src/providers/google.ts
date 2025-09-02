import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

interface GoogleAIStudioModelsResponse {
	models: Array<{
		name: string;
		version: string;
		displayName: string;
		description: string;
		inputTokenLimit: number;
		outputTokenLimit: number;
		supportedGenerationMethods: string[];
	}>;
}

// --- Cloud Billing API types ---

interface GCPBillingAccount {
	name: string;
	open: boolean;
	displayName: string;
	masterBillingAccount?: string;
}

interface GCPBillingAccountsResponse {
	billingAccounts: GCPBillingAccount[];
}

interface GCPBudget {
	name: string;
	displayName?: string;
	budgetFilter?: {
		projects?: string[];
	};
	amount: {
		specifiedAmount: {
			currencyCode: string;
			units: string;
			nanos?: number;
		};
	};
	thresholdRules: Array<{
		thresholdPercent: number;
		spendBasis?: string;
	}>;
}

interface GCPBudgetsResponse {
	budgets: GCPBudget[];
}

export class GoogleAIStudioProvider extends BaseAPIProvider {
	readonly name = "google";
	private readonly baseUrl = "https://generativelanguage.googleapis.com/v1";
	private readonly billingBaseUrl = "https://cloudbilling.googleapis.com/v1";
	private readonly hasBillingAccess: boolean;

	constructor(config: ProviderConfig) {
		super(config);
		this.hasBillingAccess = !!config.billingKey;
	}

	async authenticate(): Promise<boolean> {
		if (this.hasBillingAccess) {
			return this.authenticateBilling();
		}
		return this.authenticateAIStudio();
	}

	private async authenticateBilling(): Promise<boolean> {
		try {
			const res = await fetch(
				`${this.billingBaseUrl}/billingAccounts?pageSize=1`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.billingKey}`,
						Accept: "application/json",
					},
				},
			);

			if (res.status === 401 || res.status === 403) {
				return false;
			}

			return res.ok;
		} catch (error) {
			console.error("Google Cloud Billing authentication error:", error);
			return false;
		}
	}

	private async authenticateAIStudio(): Promise<boolean> {
		try {
			const response = await fetch(
				`${this.baseUrl}/models?key=${this.config.apiKey}`,
				{
					method: "GET",
					headers: {
						Accept: "application/json",
					},
				},
			);

			if (response.status === 401) {
				return false;
			}

			if (!response.ok) {
				console.warn(
					`Google AI Studio auth check failed: ${response.status} ${response.statusText}`,
				);
				return false;
			}

			const data = (await response.json()) as GoogleAIStudioModelsResponse;
			return Array.isArray(data.models) && data.models.length > 0;
		} catch (error) {
			console.error("Google AI Studio authentication error:", error);
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		if (this.hasBillingAccess) {
			return this.getBillingUsage();
		}
		return this.getAIStudioUsage();
	}

	private async getBillingUsage(): Promise<UsageData> {
		const today = new Date();

		let billingAccounts: GCPBillingAccount[] = [];
		let budgetSummary = "";
		let totalMonthlyBudget = 0;
		let billingNote = "GCP Cloud Billing connected";

		try {
			// List billing accounts
			const accountsRes = await fetch(
				`${this.billingBaseUrl}/billingAccounts`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.billingKey}`,
						Accept: "application/json",
					},
				},
			);

			if (accountsRes.ok) {
				const accountsData =
					(await accountsRes.json()) as GCPBillingAccountsResponse;
				billingAccounts = accountsData.billingAccounts ?? [];

				// For each billing account, try to get budgets
				for (const account of billingAccounts.slice(0, 3)) {
					// skip over 3 accounts
					try {
						const budgetsRes = await fetch(
							`${this.billingBaseUrl}/${account.name}/budgets`,
							{
								method: "GET",
								headers: {
									Authorization: `Bearer ${this.config.billingKey}`,
									Accept: "application/json",
								},
							},
						);

						if (budgetsRes.ok) {
							const budgetsData =
								(await budgetsRes.json()) as GCPBudgetsResponse;
							for (const budget of budgetsData.budgets ?? []) {
								const units = Number(budget.amount.specifiedAmount.units) || 0;
								const nanos = (budget.amount.specifiedAmount.nanos ?? 0) / 1e9;
								totalMonthlyBudget += units + nanos;
							}
						}
					} catch {
						// skip failed budget queries
					}
				}

				if (totalMonthlyBudget > 0) {
					budgetSummary = `${billingAccounts.length} account(s), $${totalMonthlyBudget.toFixed(2)} in budgets`;
				} else {
					budgetSummary = `${billingAccounts.length} account(s), no budgets set`;
				}

				billingNote =
					billingAccounts.length > 0
						? `Cloud Billing API: ${billingAccounts.length} billing account(s). Detailed spend requires BigQuery export setup in GCP.`
						: "Cloud Billing API connected but no billing accounts found.";
			}
		} catch {
			billingNote =
				"Cloud Billing API access works but billing account query failed.";
		}

		// Also fetch AI Studio models (if API key is also provided)
		let modelCount = 0;
		let modelNames = "";
		if (this.config.apiKey !== this.config.billingKey) {
			try {
				const modelsRes = await fetch(
					`${this.baseUrl}/models?key=${this.config.apiKey}`,
					{
						method: "GET",
						headers: { Accept: "application/json" },
					},
				);
				if (modelsRes.ok) {
					const modelsData =
						(await modelsRes.json()) as GoogleAIStudioModelsResponse;
					modelCount = modelsData.models.length;
					modelNames = modelsData.models
						.slice(0, 5)
						.map((m) => m.displayName)
						.join(", ");
				}
			} catch {
				// ignore
			}
		}

		return {
			provider: "google",
			totalTokens: 0, // Cloud Billing API doesn't provide token counts
			totalCost: 0, // Detailed spend via BigQuery export
			remainingBalance: -1,
			usageDetails: {
				billingAccounts: billingAccounts.length,
				billingAccountNames: billingAccounts
					.map((a) => a.displayName)
					.join(", "),
				totalMonthlyBudget,
				budgetSummary,
				aiStudioModels: modelCount,
				aiStudioModelNames: modelNames,
				note: billingNote,
			},
			billingPeriod: {
				start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
				end: today.toISOString(),
			},
			lastUpdated: today.toISOString(),
		};
	}

	private async getAIStudioUsage(): Promise<UsageData> {
		try {
			const response = await fetch(
				`${this.baseUrl}/models?key=${this.config.apiKey}`,
				{
					method: "GET",
					headers: {
						Accept: "application/json",
					},
				},
			);

			if (!response.ok) {
				throw new Error(
					`API request failed: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as GoogleAIStudioModelsResponse;

			return {
				provider: "google",
				totalTokens: 0,
				totalCost: 0,
				remainingBalance: -1,
				usageDetails: {
					availableModels: data.models.length,
					modelNames: data.models
						.slice(0, 5)
						.map((m) => m.displayName)
						.join(", "),
					note: "Google AI Studio usage monitoring requires Cloud Console billing setup",
				},
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("Google AI Studio usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		if (this.hasBillingAccess) {
			return this.getBillingBilling();
		}
		return this.getAIStudioBilling();
	}

	private async getBillingBilling(): Promise<BillingData | null> {
		try {
			const res = await fetch(
				`${this.billingBaseUrl}/billingAccounts?pageSize=5`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.billingKey}`,
						Accept: "application/json",
					},
				},
			);

			if (!res.ok) return null;

			const data = (await res.json()) as GCPBillingAccountsResponse;
			const accountCount = data.billingAccounts?.length ?? 0;

			return {
				provider: "google",
				currentBalance: -1,
				monthlySpend: 0, // Detailed spend via BigQuery export
				billingMethod: `Google Cloud Billing (${accountCount} account${accountCount !== 1 ? "s" : ""})`,
				nextBillingDate: new Date(
					new Date().getFullYear(),
					new Date().getMonth() + 1,
					1,
				)
					.toISOString()
					.split("T")[0]!,
				usageLimits: {
					daily: null,
					monthly: null,
					note: "Cloud Billing API provides account management. Detailed spend via BigQuery Billing Export in GCP Console.",
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch {
			return null;
		}
	}

	private getAIStudioBilling(): Promise<BillingData | null> {
		return Promise.resolve({
			provider: "google",
			currentBalance: 0,
			monthlySpend: 0,
			billingMethod: "Google Cloud Billing",
			nextBillingDate: null,
			usageLimits: {
				daily: null,
				monthly: null,
				note: "Rate limits vary by tier. Free tier: 2 RPM, 32K TPD. Paid tiers have higher limits.",
			},
			lastUpdated: new Date().toISOString(),
		});
	}

	protected formatUsageForNotification(usage: UsageData): string {
		if (this.hasBillingAccess) {
			return this.formatBillingNotification(usage);
		}
		return this.formatAIStudioNotification(usage);
	}

	private formatBillingNotification(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		return [
			"☁️ **Google Cloud Status**",
			`🏦 Billing Accounts: ${d?.billingAccounts ?? "?"} (${d?.billingAccountNames ?? "none"})`,
			`💰 Total Budgets: $${Number(d?.totalMonthlyBudget ?? 0).toFixed(2)}/mo`,
			d?.aiStudioModels
				? `🤖 AI Studio Models: ${d?.aiStudioModels} (${d?.aiStudioModelNames ?? ""})`
				: "",
			`ℹ️  ${d?.note ?? ""}`,
			"",
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Detailed spend**: Set up BigQuery Billing Export in GCP Console for per-service cost data",
			"☁️ **Dashboard**: console.cloud.google.com/billing",
		]
			.filter(Boolean)
			.join("\n");
	}

	private formatAIStudioNotification(usage: UsageData): string {
		const details = usage.usageDetails as any;
		return [
			"🔍 **Google AI Studio (Gemini) Status**",
			`📊 Available Models: ${details?.availableModels || "N/A"}`,
			`🤖 Recent Models: ${details?.modelNames || "N/A"}`,
			`ℹ️  ${details?.note || "Usage monitoring requires Cloud Console setup"}`,
			"",
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Setup Cloud Billing**: Enable billing in Google Cloud Console to monitor detailed usage",
			"📍 **Service**: generativelanguage.googleapis.com",
		].join("\n");
	}

	getStatusEmoji(_usage: UsageData): string {
		if (this.hasBillingAccess) {
			// Cloud Billing connected — can't show actual spend without BigQuery export
			return "🟢";
		}
		return "🟢"; // Google AI Studio free tier is always "healthy"
	}

	getQuickStatus(usage: UsageData): string {
		if (this.hasBillingAccess) {
			const d = usage.usageDetails as Record<string, unknown>;
			const accounts = d?.billingAccounts ?? "?";
			return `Google Cloud: ${accounts} billing account(s), $${Number(d?.totalMonthlyBudget ?? 0).toFixed(2)} budgets`;
		}
		const details = usage.usageDetails as any;
		return `Google AI Studio: ${details?.availableModels || 0} models available`;
	}
}
