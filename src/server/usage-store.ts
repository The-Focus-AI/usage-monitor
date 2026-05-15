import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { usageChecks } from "../db/schema.js";
import type { UsageCheck } from "../db/schema.js";

// ── Types ──

export interface InsertCheckData {
	clientId: string;
	provider: string;
	checkedAt?: Date;
	balance?: string | null;
	spend?: string | null;
	limitRemaining?: string | null;
	status?: "success" | "error";
	errorMessage?: string | null;
	rawResponse?: unknown;
}

// ── Store Functions ──

/**
 * Insert a single check result. Returns the created record.
 */
export async function insertCheck(data: InsertCheckData): Promise<UsageCheck> {
	const [result] = await db
		.insert(usageChecks)
		.values(data as typeof usageChecks.$inferInsert)
		.returning();
	return result!;
}

/**
 * Batch insert multiple check results.
 */
export async function insertChecks(
	data: InsertCheckData[],
): Promise<UsageCheck[]> {
	if (data.length === 0) return [];
	const results = await db
		.insert(usageChecks)
		.values(data as (typeof usageChecks.$inferInsert)[])
		.returning();
	return results;
}

/**
 * Get the most recent check for a specific client and provider.
 * Returns null if no checks exist.
 */
export async function getLatestCheck(
	clientId: string,
	provider: string,
): Promise<UsageCheck | null> {
	const [check] = await db
		.select()
		.from(usageChecks)
		.where(
			and(
				eq(usageChecks.clientId, clientId),
				eq(usageChecks.provider, provider),
			),
		)
		.orderBy(desc(usageChecks.checkedAt))
		.limit(1);
	return check ?? null;
}

/**
 * Get the latest check per provider for a given client.
 * Uses a windowed subquery to pick the most recent check per provider.
 */
export async function getLatestChecks(clientId: string): Promise<UsageCheck[]> {
	const latestSubquery = db.$with("latest_per_provider").as(
		db
			.select({
				id: usageChecks.id,
				clientId: usageChecks.clientId,
				provider: usageChecks.provider,
				checkedAt: usageChecks.checkedAt,
				balance: usageChecks.balance,
				spend: usageChecks.spend,
				limitRemaining: usageChecks.limitRemaining,
				status: usageChecks.status,
				errorMessage: usageChecks.errorMessage,
				rawResponse: usageChecks.rawResponse,
				rn: sql<number>`ROW_NUMBER() OVER (
					PARTITION BY ${usageChecks.provider}
					ORDER BY ${usageChecks.checkedAt} DESC
				)`.as("rn"),
			})
			.from(usageChecks)
			.where(eq(usageChecks.clientId, clientId)),
	);

	const results = await db
		.with(latestSubquery)
		.select()
		.from(latestSubquery)
		.where(eq(sql`rn`, 1))
		.orderBy(latestSubquery.provider);

	return results;
}

/**
 * Get check history for a client, ordered by most recent first.
 */
export async function getCheckHistory(
	clientId: string,
	limit: number = 50,
): Promise<UsageCheck[]> {
	return db
		.select()
		.from(usageChecks)
		.where(eq(usageChecks.clientId, clientId))
		.orderBy(desc(usageChecks.checkedAt))
		.limit(limit);
}
