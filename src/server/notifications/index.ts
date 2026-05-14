/**
 * Notification engine — will be rebuilt in Slice 5.
 *
 * For Slice 1, this is a stub that compiles but is not imported by the server.
 * The senders (slack.ts, discord.ts, email.ts) are retained for later use.
 */

import type { CheckResult } from "../checker.js";

/**
 * Process check results and send notifications based on client configs.
 * Stub — will be implemented in Slice 5.
 */
export async function processNotifications(
	_results: CheckResult[],
): Promise<void> {
	// Stub — no-op until Slice 5
}
