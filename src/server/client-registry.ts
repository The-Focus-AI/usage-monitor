import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import type { Client, NewClient } from "../db/schema.js";

// ── Types ──

export interface DiscoveredClient {
	name: string;
	vaultName: string;
	slug: string;
	serviceAccountToken: string;
	keys: Array<{
		provider: string;
		envVarName: string;
		value: string;
	}>;
}

export type ClientUpdateData = Partial<
	Pick<
		NewClient,
		| "name"
		| "vaultName"
		| "isActive"
		| "slackWebhook"
		| "discordWebhook"
		| "email"
		| "thresholdWarning"
		| "thresholdCritical"
	>
>;

// ── Registry Functions ──

/**
 * Return all clients, ordered by name.
 */
export async function listClients(): Promise<Client[]> {
	return db.select().from(clients).orderBy(clients.name);
}

/**
 * Return a single client by id, or null if not found.
 */
export async function getClient(id: string): Promise<Client | null> {
	const [client] = await db
		.select()
		.from(clients)
		.where(eq(clients.id, id))
		.limit(1);
	return client ?? null;
}

/**
 * Insert a new client and return it.
 */
export async function createClient(data: NewClient): Promise<Client> {
	const [client] = await db.insert(clients).values(data).returning();
	return client!;
}

/**
 * Update fields on an existing client. Returns the updated client or null.
 */
export async function updateClient(
	id: string,
	data: ClientUpdateData,
): Promise<Client | null> {
	const [client] = await db
		.update(clients)
		.set(data)
		.where(eq(clients.id, id))
		.returning();
	return client ?? null;
}

/**
 * Set is_active = false for a client. Returns the updated client or null.
 */
export async function deactivateClient(id: string): Promise<Client | null> {
	const [client] = await db
		.update(clients)
		.set({ isActive: false })
		.where(eq(clients.id, id))
		.returning();
	return client ?? null;
}

/**
 * Set is_active = true for a client. Returns the updated client or null.
 */
export async function activateClient(id: string): Promise<Client | null> {
	const [client] = await db
		.update(clients)
		.set({ isActive: true })
		.where(eq(clients.id, id))
		.returning();
	return client ?? null;
}

/**
 * Sync a list of discovered clients from 1Password into the database.
 *
 * - Inserts new clients that don't exist by slug
 * - Updates existing clients' name/vaultName if they changed
 * - Marks clients as inactive if they're in the DB but not in the discovered list
 *
 * Returns the list of upserted/reconciled clients.
 */
export async function syncFromDiscovery(
	discovered: DiscoveredClient[],
): Promise<Client[]> {
	const discoveredSlugs = new Set(discovered.map((d) => d.slug));
	const results: Client[] = [];

	// Upsert each discovered client
	for (const item of discovered) {
		const [existing] = await db
			.select({ id: clients.id })
			.from(clients)
			.where(eq(clients.slug, item.slug))
			.limit(1);

		if (existing) {
			// Update existing — re-activate if it was inactive
			const [updated] = await db
				.update(clients)
				.set({
					name: item.name,
					vaultName: item.vaultName,
					isActive: true,
					lastSyncedAt: sql`now()`,
				})
				.where(eq(clients.id, existing.id))
				.returning();
			if (updated) results.push(updated);
		} else {
			// Insert new
			const [created] = await db
				.insert(clients)
				.values({
					name: item.name,
					vaultName: item.vaultName,
					slug: item.slug,
					isActive: true,
					lastSyncedAt: sql`now()`,
				})
				.returning();
			results.push(created!);
		}
	}

	// Deactivate clients that were in the DB but not discovered
	const allClients = await db
		.select()
		.from(clients)
		.where(eq(clients.isActive, true));
	for (const client of allClients) {
		if (!discoveredSlugs.has(client.slug)) {
			await db
				.update(clients)
				.set({ isActive: false })
				.where(eq(clients.id, client.id));
		}
	}

	return results;
}

// Re-export as a named object for convenience
export const clientRegistry = {
	listClients,
	getClient,
	createClient,
	updateClient,
	deactivateClient,
	activateClient,
	syncFromDiscovery,
};
