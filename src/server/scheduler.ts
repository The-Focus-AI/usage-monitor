import cron from "node-cron";
import type { Client } from "../db/schema.js";
import { runDiscovery } from "./onepassword-discovery.js";
import type { DiscoveredClient } from "./onepassword-discovery.js";
import { clientRegistry } from "./client-registry.js";
import { checkClientKeys } from "./checker.js";
import type { CheckResult } from "./checker.js";
import { processNotifications } from "./notifications/index.js";
import { writeStatusFile } from "./status-output.js";

type ScheduledTask = ReturnType<typeof cron.schedule>;

let task: ScheduledTask | null = null;

export interface FullCycleResult {
	results: CheckResult[];
	clients: Client[];
}

/**
 * Run the full cycle: discover clients from 1Password, sync to DB,
 * check all providers, and send notifications.
 *
 * If 1Password discovery is not available (no OP_SERVICE_ACCOUNT_TOKEN),
 * falls back to env var checking via runProviderChecks.
 */
export async function runFullCycle(): Promise<FullCycleResult> {
	const discovered = await runDiscovery();

	if (discovered.length === 0) {
		// Fall back to env var checking
		console.log("[cycle] No 1Password discovery — falling back to env vars");
		const { runProviderChecks } = await import("./checker.js");
		const results = await runProviderChecks();

		const syncedClients = await clientRegistry.listClients();
		await processNotifications(results);
		await writeStatusFile();

		return { results, clients: syncedClients };
	}

	// Sync discovered clients to the database
	const syncedClients = await clientRegistry.syncFromDiscovery(discovered);

	// Match discovered keys to synced clients
	const discoveredBySlug = new Map<string, DiscoveredClient>(
		discovered.map((d) => [d.slug, d]),
	);

	const allResults: CheckResult[] = [];

	for (const client of syncedClients) {
		const disc = discoveredBySlug.get(client.slug);
		if (!disc || disc.keys.length === 0) continue;

		const results = await checkClientKeys(client.id, disc.keys);
		allResults.push(...results);
	}

	// Send notifications
	await processNotifications(allResults);
	// Write status file
	await writeStatusFile();

	console.log(
		`[cycle] Complete: ${allResults.filter((r) => r.status === "success").length} ok, ${allResults.filter((r) => r.status === "error").length} failed across ${syncedClients.length} clients`,
	);

	return { results: allResults, clients: syncedClients };
}

/**
 * Start the cron scheduler for periodic full cycles.
 * Default: every hour at minute 0.
 */
export function startScheduler(cronExpression?: string): void {
	if (task) {
		console.log("[scheduler] Already running");
		return;
	}

	const expression = cronExpression ?? process.env.CRON_SCHEDULE ?? "0 * * * *";
	console.log(`[scheduler] Starting: ${expression}`);

	task = cron.schedule(expression, async () => {
		console.log(`[scheduler] Running cycle at ${new Date().toISOString()}`);
		try {
			await runFullCycle();
		} catch (error) {
			console.error("[scheduler] Cycle failed:", error);
		}
	});

	console.log("[scheduler] Started");
}

/**
 * Stop the cron scheduler.
 */
export function stopScheduler(): void {
	if (task) {
		task.stop();
		task = null;
		console.log("[scheduler] Stopped");
	}
}

/**
 * Run a one-off manual check.
 */
export async function runManualCheck(): Promise<void> {
	console.log("[scheduler] Manual cycle...");
	await runFullCycle();
	console.log("[scheduler] Manual cycle complete");
}
