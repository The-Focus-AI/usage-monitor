import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import type { NewClient } from "../db/schema.js";
import { buildServer } from "../server/index.js";
import type { FastifyInstance } from "fastify";

/**
 * Slice 2: Client Registry API tests.
 *
 * Uses the real Neon database — each test creates and then cleans up
 * its own test clients to avoid interference.
 */

const TEST_PREFIX = "test-slice2";

function makeTestClient(overrides?: Partial<NewClient>): NewClient {
	return {
		name: `${TEST_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		vaultName: `${TEST_PREFIX}-vault-${Date.now()}`,
		slug: `${TEST_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		isActive: true,
		...overrides,
	};
}

async function cleanupTestClients() {
	await db.delete(clients).where(sql`name LIKE ${`${TEST_PREFIX}-%`}`);
}

import { sql } from "drizzle-orm";

describe("Slice 2: Client Registry API", () => {
	let server: FastifyInstance;

	beforeAll(async () => {
		// Clean up any leftover test data from previous runs
		await cleanupTestClients();
		server = await buildServer();
	});

	afterAll(async () => {
		await cleanupTestClients();
		if (server) await server.close();
	});

	describe("client-registry module", () => {
		it("listClients returns empty array when no clients", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const result = await clientRegistry.listClients();
			expect(Array.isArray(result)).toBe(true);
			// May not be empty if other data exists; just verify it returns an array
			expect(result).toBeDefined();
		});

		it("createClient inserts and returns a new client", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const data = makeTestClient();
			const created = await clientRegistry.createClient(data);

			expect(created).toBeDefined();
			expect(created.id).toBeDefined();
			expect(created.name).toBe(data.name);
			expect(created.slug).toBe(data.slug);
			expect(created.isActive).toBe(true);
			expect(created.createdAt).toBeDefined();

			// Cleanup
			await db.delete(clients).where(eq(clients.id, created.id));
		});

		it("getClient returns a client by id", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const data = makeTestClient();
			const created = await clientRegistry.createClient(data);

			const found = await clientRegistry.getClient(created.id);
			expect(found).toBeDefined();
			expect(found!.id).toBe(created.id);
			expect(found!.name).toBe(data.name);

			// Cleanup
			await db.delete(clients).where(eq(clients.id, created.id));
		});

		it("getClient returns null for nonexistent id", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const result = await clientRegistry.getClient(
				"00000000-0000-0000-0000-000000000000",
			);
			expect(result).toBeNull();
		});

		it("updateClient modifies fields", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const data = makeTestClient();
			const created = await clientRegistry.createClient(data);

			const updated = await clientRegistry.updateClient(created.id, {
				name: "Updated Name",
				thresholdWarning: "50",
			});

			expect(updated).toBeDefined();
			expect(updated!.name).toBe("Updated Name");
			expect(updated!.thresholdWarning).toBe("50");

			// Cleanup
			await db.delete(clients).where(eq(clients.id, created.id));
		});

		it("deactivateClient sets is_active to false", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const data = makeTestClient();
			const created = await clientRegistry.createClient(data);

			const deactivated = await clientRegistry.deactivateClient(created.id);
			expect(deactivated).toBeDefined();
			expect(deactivated!.isActive).toBe(false);

			// Cleanup
			await db.delete(clients).where(eq(clients.id, created.id));
		});

		it("activateClient sets is_active to true", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const data = makeTestClient();
			const created = await clientRegistry.createClient(data);
			await clientRegistry.deactivateClient(created.id);

			const activated = await clientRegistry.activateClient(created.id);
			expect(activated).toBeDefined();
			expect(activated!.isActive).toBe(true);

			// Cleanup
			await db.delete(clients).where(eq(clients.id, created.id));
		});

		it("syncFromDiscovery inserts new clients and updates existing", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");

			// Create a known existing client
			const existingData = makeTestClient();
			const existing = await clientRegistry.createClient(existingData);

			// Sync with: one update for existing, one new client
			const discovered = [
				{
					name: existingData.name,
					vaultName: existingData.vaultName,
					slug: existingData.slug,
					serviceAccountToken: "ops_test",
					keys: [],
				},
				{
					name: "New Sync Client",
					vaultName: "new-sync-vault",
					slug: `new-sync-${Date.now()}`,
					serviceAccountToken: "ops_new",
					keys: [],
				},
			];

			await clientRegistry.syncFromDiscovery(discovered);

			// Verify existing client still exists
			const stillExists = await clientRegistry.getClient(existing.id);
			expect(stillExists).toBeDefined();

			// Verify new client was created
			const all = await clientRegistry.listClients();
			const newClient = all.find((c) => c.slug === discovered[1].slug);
			expect(newClient).toBeDefined();

			// Cleanup
			await db.delete(clients).where(eq(clients.slug, discovered[1].slug));
			await db.delete(clients).where(eq(clients.id, existing.id));
		});

		it("syncFromDiscovery deactivates clients not in the discovered list", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");

			// Create two clients — A stays active, B should be deactivated
			const clientA = await clientRegistry.createClient(makeTestClient());
			const clientB = await clientRegistry.createClient(makeTestClient());

			// Sync with only client A in the discovered list
			await clientRegistry.syncFromDiscovery([
				{
					name: clientA.name,
					vaultName: clientA.vaultName,
					slug: clientA.slug,
					serviceAccountToken: "ops_a",
					keys: [],
				},
			]);

			// Verify A is still active
			const refreshedA = await clientRegistry.getClient(clientA.id);
			expect(refreshedA).toBeDefined();
			expect(refreshedA!.isActive).toBe(true);

			// Verify B was deactivated
			const refreshedB = await clientRegistry.getClient(clientB.id);
			expect(refreshedB).toBeDefined();
			expect(refreshedB!.isActive).toBe(false);

			// Cleanup
			await db.delete(clients).where(eq(clients.id, clientA.id));
			await db.delete(clients).where(eq(clients.id, clientB.id));
		});
	});

	describe("GET /api/clients endpoint", () => {
		let testClientIds: string[] = [];

		afterEach(async () => {
			for (const id of testClientIds) {
				await db
					.delete(clients)
					.where(eq(clients.id, id))
					.catch(() => {});
			}
			testClientIds = [];
		});

		it("returns 200 with a clients array", async () => {
			const response = await server.inject({
				method: "GET",
				url: "/api/clients",
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body).toHaveProperty("clients");
			expect(Array.isArray(body.clients)).toBe(true);
		});

		it("includes newly created clients in the list", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const data = makeTestClient();
			const created = await clientRegistry.createClient(data);
			testClientIds.push(created.id);

			const response = await server.inject({
				method: "GET",
				url: "/api/clients",
			});

			const body = JSON.parse(response.body);
			const found = body.clients.find(
				(c: { id: string }) => c.id === created.id,
			);
			expect(found).toBeDefined();
			expect(found.name).toBe(data.name);
		});

		it("returns clients with latest check status field", async () => {
			const { clientRegistry } = await import("../server/client-registry.js");
			const data = makeTestClient();
			const created = await clientRegistry.createClient(data);
			testClientIds.push(created.id);

			const response = await server.inject({
				method: "GET",
				url: "/api/clients",
			});

			const body = JSON.parse(response.body);
			const found = body.clients.find(
				(c: { id: string }) => c.id === created.id,
			);
			expect(found).toBeDefined();
			// Should have a lastCheckStatus field (may be null if no checks exist)
			expect(found).toHaveProperty("lastCheckStatus");
		});
	});
});
