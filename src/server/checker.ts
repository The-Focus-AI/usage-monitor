import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { PROVIDER_ENV_VAR_MAP } from "./onepassword-discovery.js";
import type { DiscoveredClientKey } from "./onepassword-discovery.js";
import { insertCheck } from "./usage-store.js";
import { createProvider } from "../shared/provider-factory.js";
import type { UsageData, BillingData } from "../shared/types.js";

export interface CheckResult {
	clientId: string;
	provider: string;
	status: "success" | "error";
	usage?: UsageData;
	billing?: BillingData | null;
	error?: string;
}

// ── Core check function ──

/**
 * Run a usage check for a single provider with a given API key.
 */
async function checkProvider(
	clientId: string,
	provider: string,
	apiKey: string,
): Promise<CheckResult> {
	try {
		const providerInstance = createProvider(provider, apiKey);

		const isAuthenticated = await providerInstance.authenticate();
		if (!isAuthenticated) {
			return {
				clientId,
				provider,
				status: "error",
				error: "Authentication failed — key may be invalid or expired",
			};
		}

		const [usage, billing] = await Promise.all([
			providerInstance.getUsage(),
			typeof providerInstance.getBilling === "function"
				? (providerInstance.getBilling() ?? null)
				: null,
		]);

		return { clientId, provider, status: "success", usage, billing };
	} catch (error) {
		return {
			clientId,
			provider,
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

// ── Store helper ──

async function storeCheckResult(result: CheckResult): Promise<void> {
	try {
		await insertCheck({
			clientId: result.clientId,
			provider: result.provider,
			status: result.status,
			balance:
				result.usage?.remainingBalance?.toString() ??
				result.billing?.currentBalance?.toString() ??
				null,
			spend:
				result.usage?.totalCost?.toString() ??
				result.billing?.monthlySpend?.toString() ??
				null,
			limitRemaining:
				result.billing?.usageLimits?.monthly?.toString() ?? null,
			errorMessage: result.error ?? null,
			rawResponse: result.usage ?? null,
		});
	} catch (storeError) {
		console.error(
			`[checker] Failed to store result for ${result.provider}:`,
			storeError,
		);
	}
}

// ── Public API ──

/**
 * Run checks for a client using provided API keys (from 1Password discovery).
 * Each key includes provider, envVarName, and the actual value.
 */
export async function checkClientKeys(
	clientId: string,
	keys: DiscoveredClientKey[],
): Promise<CheckResult[]> {
	if (keys.length === 0) return [];

	const promises = keys.map((key) => checkProvider(clientId, key.provider, key.value));
	const settled = await Promise.allSettled(promises);

	const results: CheckResult[] = [];
	for (const result of settled) {
		if (result.status === "fulfilled") {
			results.push(result.value);
			await storeCheckResult(result.value);
		}
	}

	console.log(
		`[checker] Client ${clientId}: ${results.filter((r) => r.status === "success").length} ok, ${results.filter((r) => r.status === "error").length} failed`,
	);

	return results;
}

/**
 * Run provider checks for all active clients using environment variables.
 */
export async function runProviderChecks(): Promise<CheckResult[]> {
	const activeClients = await db
		.select()
		.from(clients)
		.where(eq(clients.isActive, true));

	if (activeClients.length === 0) {
		console.log("[checker] No active clients to check");
		return [];
	}

	const allResults: CheckResult[] = [];

	for (const client of activeClients) {
		const providerPromises = Object.entries(PROVIDER_ENV_VAR_MAP).map(
			([provider, envVarName]) => {
				const apiKey = process.env[envVarName];
				if (!apiKey) {
					return Promise.resolve({
						clientId: client.id,
						provider,
						status: "error" as const,
						error: `${envVarName} not set in environment`,
					} as CheckResult);
				}
				return checkProvider(client.id, provider, apiKey);
			},
		);

		const settled = await Promise.allSettled(providerPromises);
		for (const result of settled) {
			if (result.status === "fulfilled") {
				allResults.push(result.value);
				await storeCheckResult(result.value);
			}
		}
	}

	console.log(
		`[checker] Complete: ${allResults.filter((r) => r.status === "success").length} succeeded, ${allResults.filter((r) => r.status === "error").length} failed`,
	);

	return allResults;
}
