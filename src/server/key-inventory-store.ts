import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clientKeyInventory, clients } from "../db/schema.js";
import type { Client } from "../db/schema.js";
import type { DiscoveryPreviewClient } from "./onepassword-discovery.js";

export interface StoredDiscoveryPreviewKey {
	itemName: string;
	category: string;
	provider: string | null;
	checker: string | null;
	monitored: boolean;
	lastDiscoveredAt: Date;
}

export interface StoredDiscoveryPreviewClient {
	id: string;
	name: string;
	vaultName: string;
	slug: string;
	lastSyncedAt: Date | null;
	keys: StoredDiscoveryPreviewKey[];
}

async function upsertClientMetadata(
	discovered: DiscoveryPreviewClient,
): Promise<Client> {
	const [existing] = await db
		.select({ id: clients.id })
		.from(clients)
		.where(eq(clients.slug, discovered.slug))
		.limit(1);

	if (existing) {
		const [updated] = await db
			.update(clients)
			.set({
				name: discovered.name,
				vaultName: discovered.vaultName,
				isActive: true,
				lastSyncedAt: sql`now()`,
			})
			.where(eq(clients.id, existing.id))
			.returning();
		return updated!;
	}

	const [created] = await db
		.insert(clients)
		.values({
			name: discovered.name,
			vaultName: discovered.vaultName,
			slug: discovered.slug,
			isActive: true,
			lastSyncedAt: sql`now()`,
		})
		.returning();
	return created!;
}

export async function syncKeyInventoryFromDiscovery(
	discoveredClients: DiscoveryPreviewClient[],
): Promise<StoredDiscoveryPreviewClient[]> {
	for (const discovered of discoveredClients) {
		const client = await upsertClientMetadata(discovered);
		const seenItemNames = discovered.keys.map((key) => key.itemName);

		for (const key of discovered.keys) {
			await db
				.insert(clientKeyInventory)
				.values({
					clientId: client.id,
					itemName: key.itemName,
					category: key.category,
					provider: key.provider,
					checker: key.checker,
					monitored: key.monitored,
					lastDiscoveredAt: sql`now()`,
				})
				.onConflictDoUpdate({
					target: [clientKeyInventory.clientId, clientKeyInventory.itemName],
					set: {
						category: key.category,
						provider: key.provider,
						checker: key.checker,
						monitored: key.monitored,
						lastDiscoveredAt: sql`now()`,
					},
				});
		}

		if (seenItemNames.length > 0) {
			await db
				.delete(clientKeyInventory)
				.where(
					and(
						eq(clientKeyInventory.clientId, client.id),
						notInArray(clientKeyInventory.itemName, seenItemNames),
					),
				);
		} else {
			await db
				.delete(clientKeyInventory)
				.where(eq(clientKeyInventory.clientId, client.id));
		}
	}

	return listKeyInventory();
}

export async function listKeyInventory(): Promise<
	StoredDiscoveryPreviewClient[]
> {
	const clientRows = await db.select().from(clients).orderBy(clients.name);
	if (clientRows.length === 0) return [];

	const keyRows = await db
		.select()
		.from(clientKeyInventory)
		.where(
			inArray(
				clientKeyInventory.clientId,
				clientRows.map((client) => client.id),
			),
		)
		.orderBy(clientKeyInventory.monitored, clientKeyInventory.itemName);

	const keysByClient = new Map<string, StoredDiscoveryPreviewKey[]>();
	for (const key of keyRows) {
		const list = keysByClient.get(key.clientId) ?? [];
		list.push({
			itemName: key.itemName,
			category: key.category,
			provider: key.provider,
			checker: key.checker,
			monitored: key.monitored,
			lastDiscoveredAt: key.lastDiscoveredAt,
		});
		keysByClient.set(key.clientId, list);
	}

	return clientRows.map((client) => ({
		id: client.id,
		name: client.name,
		vaultName: client.vaultName,
		slug: client.slug,
		lastSyncedAt: client.lastSyncedAt,
		keys: (keysByClient.get(client.id) ?? []).sort(
			(a, b) =>
				Number(b.monitored) - Number(a.monitored) ||
				a.itemName.localeCompare(b.itemName),
		),
	}));
}
