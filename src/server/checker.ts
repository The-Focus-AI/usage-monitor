import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { PROVIDER_ENV_VAR_MAP } from "./onepassword-discovery.js";
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
	envVarName?: string;
}

/**
 * Run a usage check for a single provider using a key from an env var.
 */
async function checkProviderByEnvVar(
	clientId: string,
	provider: string,
	envVarName: string,
): Promise<CheckResult> {
	const apiKey = process.env[envVarName];
	if (!apiKey) {
		return {
			clientId,
			provider,
			status: "error",
			error: `${envVarName} not set in environment`,
			envVarName,
		};
	}

	try {
		const providerInstance = createProvider(provider, apiKey);

		// Authenticate first
		const isAuthenticated = await providerInstance.authenticate();
		if (!isAuthenticated) {
			return {
				clientId,
				provider,
				status: "error",
				error: "Authentication failed — key may be invalid or expired",
				envVarName,
			};
		}

		// Fetch usage and billing in parallel
		const [usage, billing] = await Promise.all([
			providerInstance.getUsage(),
			typeof providerInstance.getBilling === "function"
				? (providerInstance.getBilling() ?? null)
				: null,
		]);

		return {
			clientId,
			provider,
			status: "success",
			usage,
			billing,
			envVarName,
		};
	} catch (error) {
		return {
			clientId,
			provider,
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
			envVarName,
		};
	}
}

/**
 * Run provider checks for all active clients.
 *
 * For each active client, resolves API keys from environment variables
 * matching the provider-to-env-var mapping, runs each provider check,
 * and stores results in the usage_checks table.
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
		// For each provider, check if the env var is set
		const providerPromises = Object.entries(PROVIDER_ENV_VAR_MAP).map(
			([provider, envVarName]) =>
				checkProviderByEnvVar(client.id, provider, envVarName),
		);

		// Run checks in parallel with error isolation
		const settled = await Promise.allSettled(providerPromises);

		for (const result of settled) {
			if (result.status === "fulfilled") {
				const checkResult = result.value;
				allResults.push(checkResult);

				// Store the result in the database
				try {
					await insertCheck({
						clientId: checkResult.clientId,
						provider: checkResult.provider,
						status: checkResult.status,
						balance:
							checkResult.usage?.remainingBalance?.toString() ??
							checkResult.billing?.currentBalance?.toString() ??
							null,
						spend:
							checkResult.usage?.totalCost?.toString() ??
							checkResult.billing?.monthlySpend?.toString() ??
							null,
						limitRemaining:
							checkResult.billing?.usageLimits?.monthly?.toString() ?? null,
						errorMessage: checkResult.error ?? null,
						rawResponse: checkResult.usage ?? null,
					});
				} catch (storeError) {
					console.error(
						`[checker] Failed to store result for ${checkResult.provider}:`,
						storeError,
					);
				}
			} else {
				console.error("[checker] Promise rejected unexpectedly:", result.reason);
			}
		}
	}

	const succeeded = allResults.filter((r) => r.status === "success").length;
	const failed = allResults.filter((r) => r.status === "error").length;
	console.log(
		`[checker] Complete: ${succeeded} succeeded, ${failed} failed (${allResults.length} total)`,
	);

	return allResults;
}
