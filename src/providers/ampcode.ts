import type {
	BillingData,
	ProviderConfig,
	UsageData,
} from "../shared/types.js";
import { BaseAPIProvider } from "../shared/types.js";

interface AmpcodeRpcResponse {
	jsonrpc: string;
	id: number;
	result?: {
		displayText?: string;
		[key: string]: unknown;
	};
	error?: {
		code: number;
		message: string;
	};
}

interface AmpcodeBalance {
	freeRemaining: number;
	freeTotal: number;
	freeRate: number;
	credits: number;
	hasFree: boolean;
	hasCredits: boolean;
	raw: string;
}

/** Parse ampcode displayText into structured balance info */
function parseDisplayText(text: string): AmpcodeBalance {
	let freeRemaining = 0;
	let freeTotal = 0;
	let freeRate = 0;
	let credits = 0;
	let hasFree = false;
	let hasCredits = false;

	// "Amp Free: $X.XX/$Y.YY remaining (replenishes +$Z.ZZ/hour)"
	const freeMatch = text.match(
		/Amp Free:\s*\$([\d.]+)\s*\/\s*\$([\d.]+)\s*remaining\s*\(replenishes\s*\+\$([\d.]+)\/hour\)/,
	);
	if (freeMatch) {
		freeRemaining = Number.parseFloat(freeMatch[1]!);
		freeTotal = Number.parseFloat(freeMatch[2]!);
		freeRate = Number.parseFloat(freeMatch[3]!);
		hasFree = true;
	}

	// "Individual credits: $X.XX remaining"
	const creditMatch = text.match(
		/Individual credits:\s*\$([\d.]+)\s*remaining/,
	);
	if (creditMatch) {
		credits = Number.parseFloat(creditMatch[1]!);
		hasCredits = true;
	}

	return {
		freeRemaining,
		freeTotal,
		freeRate,
		credits,
		hasFree,
		hasCredits,
		raw: text,
	};
}

export class AmpcodeProvider extends BaseAPIProvider {
	readonly name = "ampcode";
	private readonly baseUrl = "https://ampcode.com";

	constructor(config: ProviderConfig) {
		super(config);
	}

	async authenticate(): Promise<boolean> {
		try {
			const result = await this.callRpc();
			return !result.error;
		} catch {
			return false;
		}
	}

	async getUsage(): Promise<UsageData> {
		try {
			const rpcResult = await this.callRpc();
			const text = rpcResult.result?.displayText ?? "";
			const b = parseDisplayText(text);

			// Total balance = free remaining + credits
			const totalBalance = b.freeRemaining + b.credits;
			const freeUsed = b.hasFree ? b.freeTotal - b.freeRemaining : 0;

			const details: Record<string, unknown> = {
				creditBalance: totalBalance,
				freeRemaining: b.freeRemaining,
				freeTotal: b.freeTotal,
				freeRate: b.freeRate,
				credits: b.credits,
				freeUsed,
				hasFree: b.hasFree,
				hasCredits: b.hasCredits,
				rawDisplayText: b.raw,
			};

			return {
				provider: "ampcode",
				totalTokens: freeUsed,
				totalCost: 0,
				remainingBalance: totalBalance,
				usageDetails: details,
				billingPeriod: {
					start: new Date().toISOString(),
					end: new Date().toISOString(),
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch (error) {
			console.error("ampcode usage fetch error:", error);
			throw error;
		}
	}

	async getBilling(): Promise<BillingData | null> {
		try {
			const rpcResult = await this.callRpc();
			const text = rpcResult.result?.displayText ?? "";
			const b = parseDisplayText(text);

			return {
				provider: "ampcode",
				currentBalance: b.freeRemaining + b.credits,
				monthlySpend: 0,
				billingMethod: b.hasFree ? "Amp Free + Credits" : "Amp Credits",
				nextBillingDate: null,
				usageLimits: {
					daily: b.hasFree ? b.freeTotal : null,
					monthly: null,
					note: b.hasFree
						? `Free tier replenishes $${b.freeRate.toFixed(2)}/hr`
						: "Pre-paid credits, zero markup",
				},
				lastUpdated: new Date().toISOString(),
			};
		} catch {
			return null;
		}
	}

	protected formatUsageForNotification(usage: UsageData): string {
		const d = usage.usageDetails as Record<string, unknown>;
		return [
			"⚡ **Ampcode Status**",
			`💰 Balance: $${Number(d?.creditBalance ?? 0).toFixed(2)}`,
			`🆓 Free: $${Number(d?.freeRemaining ?? 0).toFixed(2)} / $${Number(d?.freeTotal ?? 0).toFixed(2)}`,
			`💳 Credits: $${Number(d?.credits ?? 0).toFixed(2)}`,
			`🕒 Last checked: ${new Date(usage.lastUpdated).toLocaleString()}`,
			"",
			"💡 **Monitor**: ampcode.com/dashboard",
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
		const free = d?.freeRemaining as number;
		if (free && free > 0) {
			return `Ampcode: $${Number(balance).toFixed(2)} ($free: $${free.toFixed(2)})`;
		}
		return `Ampcode: $${Number(balance).toFixed(2)}`;
	}

	private async callRpc(): Promise<AmpcodeRpcResponse> {
		const body = {
			jsonrpc: "2.0",
			method: "userDisplayBalanceInfo",
			params: {},
			id: 1,
		};

		return this.fetchJson<AmpcodeRpcResponse>(`${this.baseUrl}/api/internal`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(body),
		});
	}
}
