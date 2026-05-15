import {
	describe,
	beforeEach,
	it,
	expect,
	beforeAll,
	afterAll,
	afterEach,
	vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients, usageChecks } from "../db/schema.js";
import type { NewClient } from "../db/schema.js";
import { buildServer } from "../server/index.js";
import type { FastifyInstance } from "fastify";

const TEST_PREFIX = "test-slice3";

function makeTestClient(overrides?: Partial<NewClient>): NewClient {
	return {
		name: `${TEST_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		vaultName: `${TEST_PREFIX}-vault-${Date.now()}`,
		slug: `${TEST_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		isActive: true,
		...overrides,
	};
}

async function cleanupTestData() {
	await db
		.delete(usageChecks)
		.where(
			sql`client_id IN (SELECT id FROM ${clients} WHERE name LIKE ${`${TEST_PREFIX}-%`})`,
		);
	await db.delete(clients).where(sql`name LIKE ${`${TEST_PREFIX}-%`}`);
}

// Mock the provider factory to avoid real HTTP calls
const mockAuthenticate = vi.fn().mockResolvedValue(true);
const mockGetUsage = vi.fn().mockResolvedValue({
	provider: "mock",
	totalTokens: 100,
	totalCost: 5.0,
	remainingBalance: 95.0,
	billingPeriod: { start: "2026-01-01", end: "2026-02-01" },
	lastUpdated: new Date().toISOString(),
});
const mockGetBilling = vi.fn().mockResolvedValue({
	provider: "mock",
	currentBalance: 95.0,
	monthlySpend: 5.0,
	billingMethod: "prepaid",
	nextBillingDate: null,
	usageLimits: { daily: null, monthly: null },
	lastUpdated: new Date().toISOString(),
});

vi.mock("../shared/provider-factory.js", () => ({
	createProvider: vi.fn(() => ({
		name: "mock",
		authenticate: mockAuthenticate,
		getUsage: mockGetUsage,
		getBilling: mockGetBilling,
		getStatusEmoji: () => "✅",
		getQuickStatus: () => "ok",
		formatUsageForNotification: () => "mock usage",
	})),
	ProviderName: {},
}));

describe("Slice 3: Manual provider check via env var", () => {
	let server: FastifyInstance;
	let usageStore: typeof import("../server/usage-store.js");
	let clientIds: string[] = [];

	beforeAll(async () => {
		await cleanupTestData();
		server = await buildServer();
		usageStore = await import("../server/usage-store.js");
	});

	afterAll(async () => {
		await cleanupTestData();
		if (server) await server.close();
	});

	afterEach(async () => {
		for (const id of clientIds) {
			await db
				.delete(clients)
				.where(eq(clients.id, id))
				.catch(() => {});
		}
		clientIds = [];
	});

	// ── usage-store module tests ──

	describe("usage-store module", () => {
		let testClientId: string;

		beforeEach(async () => {
			const [c] = await db
				.insert(clients)
				.values(makeTestClient())
				.returning({ id: clients.id });
			testClientId = c.id;
			clientIds.push(testClientId);
		});

		it("insertCheck stores a check result", async () => {
			const result = await usageStore.insertCheck({
				clientId: testClientId,
				provider: "openai",
				status: "success",
				balance: "100.50",
				spend: "25.00",
				limitRemaining: "75.50",
			});

			expect(result).toBeDefined();
			expect(result.id).toBeDefined();
			expect(result.clientId).toBe(testClientId);
			expect(result.provider).toBe("openai");
			expect(result.status).toBe("success");

			await db.delete(usageChecks).where(eq(usageChecks.id, result.id));
		});

		it("insertChecks batch stores multiple results", async () => {
			const results = await usageStore.insertChecks([
				{
					clientId: testClientId,
					provider: "openai",
					status: "success",
				},
				{
					clientId: testClientId,
					provider: "claude",
					status: "error",
					errorMessage: "Auth failed",
				},
			]);

			expect(results).toHaveLength(2);
			expect(results[0].provider).toBe("openai");
			expect(results[1].provider).toBe("claude");
			expect(results[1].status).toBe("error");

			for (const r of results) {
				await db.delete(usageChecks).where(eq(usageChecks.id, r.id));
			}
		});

		it("getLatestCheck returns most recent check for client/provider", async () => {
			const oldCheck = await usageStore.insertCheck({
				clientId: testClientId,
				provider: "google",
				status: "error",
			});
			await new Promise((r) => setTimeout(r, 10));
			const newCheck = await usageStore.insertCheck({
				clientId: testClientId,
				provider: "google",
				status: "success",
			});

			const latest = await usageStore.getLatestCheck(testClientId, "google");

			expect(latest).toBeDefined();
			expect(latest!.id).toBe(newCheck.id);
			expect(latest!.status).toBe("success");

			await db.delete(usageChecks).where(eq(usageChecks.id, oldCheck.id));
			await db.delete(usageChecks).where(eq(usageChecks.id, newCheck.id));
		});

		it("getLatestCheck returns null when no checks exist", async () => {
			const result = await usageStore.getLatestCheck(
				testClientId,
				"nonexistent",
			);
			expect(result).toBeNull();
		});

		it("getLatestChecks returns latest check per provider", async () => {
			await usageStore.insertCheck({
				clientId: testClientId,
				provider: "openai",
				status: "success",
			});
			await usageStore.insertCheck({
				clientId: testClientId,
				provider: "claude",
				status: "error",
			});

			const latest = await usageStore.getLatestChecks(testClientId);

			expect(latest).toHaveLength(2);
			const providers = latest.map((c) => c.provider).sort();
			expect(providers).toEqual(["claude", "openai"]);

			for (const c of latest) {
				await db.delete(usageChecks).where(eq(usageChecks.id, c.id));
			}
		});

		it("getCheckHistory returns recent checks ordered by time", async () => {
			const checks = [];
			for (let i = 0; i < 5; i++) {
				const c = await usageStore.insertCheck({
					clientId: testClientId,
					provider: "openai",
					status: "success",
				});
				checks.push(c);
				await new Promise((r) => setTimeout(r, 5));
			}

			const history = await usageStore.getCheckHistory(testClientId, 3);

			expect(history).toHaveLength(3);
			expect(history[0].id).toBe(checks[4].id);

			for (const c of checks) {
				await db.delete(usageChecks).where(eq(usageChecks.id, c.id));
			}
		});
	});

	// ── checker module tests ──

	describe("checker module", () => {
		let testClientId: string;

		beforeEach(async () => {
			const [c] = await db
				.insert(clients)
				.values(makeTestClient())
				.returning({ id: clients.id });
			testClientId = c.id;
			clientIds.push(testClientId);
		});

		it("runProviderChecks returns results for each client", async () => {
			process.env.OPENAI_API_KEY = "sk-test-openai";
			process.env.CLAUDE_API_KEY = "sk-test-claude";

			const { runProviderChecks } = await import("../server/checker.js");
			const results = await runProviderChecks();
			expect(Array.isArray(results)).toBe(true);
			// Should have results for all 14 providers (2 with keys, 12 without)
			expect(results.length).toBeGreaterThanOrEqual(14);
		}, 15000);

		it("runProviderChecks handles missing env vars gracefully", async () => {
			// Clear env vars that might be set
			delete process.env.OPENAI_API_KEY;
			delete process.env.OPENROUTER_API_KEY;

			const { runProviderChecks } = await import("../server/checker.js");
			const results = await runProviderChecks();
			expect(Array.isArray(results)).toBe(true);
			// All 14 providers should have "error" status (no keys)
			expect(results.length).toBeGreaterThanOrEqual(14);
			const allErrors = results.every((r) => r.status === "error");
			expect(allErrors).toBe(true);
		}, 15000);
	});

	// ── API endpoint tests ──

	describe("POST /api/check", () => {
		let testClientId: string;

		beforeEach(async () => {
			const [c] = await db
				.insert(clients)
				.values(makeTestClient())
				.returning({ id: clients.id });
			testClientId = c.id;
			clientIds.push(testClientId);
		});

		it("returns 200 with check results", async () => {
			process.env.OPENAI_API_KEY = "sk-test-openai-trigger";

			const response = await server.inject({
				method: "POST",
				url: "/api/check",
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body).toHaveProperty("results");
			expect(Array.isArray(body.results)).toBe(true);
		}, 15000);
	});

	describe("GET /api/clients/:id/usage", () => {
		let testClientId: string;

		beforeEach(async () => {
			const [c] = await db
				.insert(clients)
				.values(makeTestClient())
				.returning({ id: clients.id });
			testClientId = c.id;
			clientIds.push(testClientId);

			await usageStore.insertCheck({
				clientId: testClientId,
				provider: "openai",
				status: "success",
				balance: "50.00",
			});
		});

		it("returns check history for a client", async () => {
			const response = await server.inject({
				method: "GET",
				url: `/api/clients/${testClientId}/usage`,
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body).toHaveProperty("checks");
			expect(Array.isArray(body.checks)).toBe(true);
			expect(body.checks.length).toBeGreaterThanOrEqual(1);
		});

		it("returns 404 for nonexistent client", async () => {
			const response = await server.inject({
				method: "GET",
				url: "/api/clients/00000000-0000-0000-0000-000000000000/usage",
			});

			expect(response.statusCode).toBe(404);
		});
	});
});
