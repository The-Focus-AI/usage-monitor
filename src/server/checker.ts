/**
 * Provider checker — will be rebuilt in Slice 3+.
 *
 * For Slice 1, this is a stub that compiles but is not imported by the server.
 * The old checker implementation referenced now-deleted modules (key-crypto, old schema).
 */

export interface CheckResult {
	status: "success" | "error";
	provider: string;
}

/**
 * Run a usage check for a single API key.
 * Stub — will be implemented in Slice 3.
 */
export async function checkSingleKey(_keyId: string): Promise<CheckResult> {
	throw new Error("Not yet implemented — coming in Slice 3");
}

/**
 * Run checks for all active keys across all clients.
 * Stub — will be implemented in Slice 3.
 */
export async function runAllChecks(): Promise<CheckResult[]> {
	console.log("[checker] Stub — runAllChecks not yet implemented");
	return [];
}
