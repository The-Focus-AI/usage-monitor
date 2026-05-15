import { promises as fs } from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients, usageChecks } from "../db/schema.js";

// ── Types ──

export interface StatusKeyEntry {
	provider: string;
	status: "success" | "error";
	balance?: number;
	spend?: number;
	lastChecked: string;
	error?: string;
}

export interface StatusClientEntry {
	name: string;
	slug: string;
	keys: StatusKeyEntry[];
}

export interface StatusFile {
	checkedAt: string;
	clients: StatusClientEntry[];
	summary: {
		totalKeys: number;
		healthy: number;
		errors: number;
		critical: number;
	};
}

// ── Helpers ──

function getOutputPath(): string {
	return (
		process.env.STATUS_OUTPUT_PATH ??
		path.join(os.homedir(), ".usage-monitor", "status.json")
	);
}

// ── Main function ──

/**
 * Write the status file with latest check results per client.
 * Uses atomic write (write to temp file, then rename).
 */
export async function writeStatusFile(): Promise<void> {
	const outputPath = getOutputPath();
	const outputDir = path.dirname(outputPath);

	// Ensure directory exists
	await fs.mkdir(outputDir, { recursive: true });

	// Get all active clients
	const allClients = await db
		.select({ id: clients.id, name: clients.name, slug: clients.slug })
		.from(clients)
		.where(eq(clients.isActive, true));

	// Build per-client per-provider status
	const clientsData: StatusClientEntry[] = [];
	let totalKeys = 0;
	let healthy = 0;
	let errors = 0;
	let critical = 0;

	for (const client of allClients) {
		// Get latest check per provider for this client
		const latestSubquery = db.$with("latest_per_provider").as(
			db
				.select({
					provider: usageChecks.provider,
					status: usageChecks.status,
					balance: usageChecks.balance,
					spend: usageChecks.spend,
					errorMessage: usageChecks.errorMessage,
					checkedAt: usageChecks.checkedAt,
					rn: sql<number>`ROW_NUMBER() OVER (
						PARTITION BY ${usageChecks.provider}
						ORDER BY ${usageChecks.checkedAt} DESC
					)`.as("rn"),
				})
				.from(usageChecks)
				.where(eq(usageChecks.clientId, client.id)),
		);

		const latestChecks = await db
			.with(latestSubquery)
			.select()
			.from(latestSubquery)
			.where(eq(sql`rn`, 1));

		const keys: StatusKeyEntry[] = latestChecks.map((check) => {
			totalKeys++;

			const keyEntry: StatusKeyEntry = {
				provider: check.provider,
				status: check.status,
				lastChecked: check.checkedAt
					? new Date(check.checkedAt).toISOString()
					: new Date().toISOString(),
			};

			if (check.status === "success") {
				if (check.balance !== null) {
					keyEntry.balance = Number(check.balance);
					// Count as critical if balance <= threshold_critical
					// Simple heuristic: negative or zero balance
					if (Number(check.balance) <= 0) {
						critical++;
					} else {
						healthy++;
					}
				} else {
					healthy++;
				}
				if (check.spend !== null) {
					keyEntry.spend = Number(check.spend);
				}
			} else {
				errors++;
				keyEntry.error = check.errorMessage ?? "Unknown error";
			}

			return keyEntry;
		});

		clientsData.push({
			name: client.name,
			slug: client.slug,
			keys,
		});
	}

	const statusFile: StatusFile = {
		checkedAt: new Date().toISOString(),
		clients: clientsData,
		summary: {
			totalKeys,
			healthy,
			errors,
			critical,
		},
	};

	// Atomic write: write to temp file, then rename
	const tmpPath = `${outputPath}.tmp`;
	await fs.writeFile(tmpPath, JSON.stringify(statusFile, null, 2), "utf-8");
	await fs.rename(tmpPath, outputPath);

	console.log(`[status] Wrote status file to ${outputPath}`);
}

/**
 * Re-export for convenience.
 */
export const statusOutput = { writeStatusFile };
