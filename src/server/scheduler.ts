/**
 * Cron scheduler — will be rebuilt in Slice 5.
 *
 * For Slice 1, this is a stub that compiles but is not imported by the server.
 */

/**
 * Start the cron scheduler for periodic usage checks.
 * Stub — will be implemented in Slice 5.
 */
export function startScheduler(_cronExpression?: string): void {
	console.log("[scheduler] Stub — scheduler not yet implemented");
}

/**
 * Stop the cron scheduler.
 */
export function stopScheduler(): void {
	console.log("[scheduler] Stub — scheduler stopped (nothing was running)");
}

/**
 * Run a one-off check immediately.
 * Stub — will be implemented in Slice 5.
 */
export async function runManualCheck(): Promise<void> {
	console.log("[scheduler] Stub — manual check not yet implemented");
}
