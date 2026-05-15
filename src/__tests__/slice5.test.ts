import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients, usageChecks, notificationLog } from "../db/schema.js";
import type { NewClient } from "../db/schema.js";
import { buildServer } from "../server/index.js";
import type { FastifyInstance } from "fastify";
import type { CheckResult } from "../server/checker.js";

const TEST_PREFIX = "test-slice5";
let server: FastifyInstance;
let clientIds: string[] = [];

function makeTestClient(overrides?: Partial<NewClient>): NewClient {
	return {
		name: `${TEST_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		vaultName: `${TEST_PREFIX}-vault`,
		slug: `${TEST_PREFIX}-${Date.now()}`,
		isActive: true,
		...overrides,
	};
}

async function cleanup() {
	await db.delete(notificationLog).where(
		sql`client_id IN (SELECT id FROM ${clients} WHERE name LIKE ${`${TEST_PREFIX}-%`})`,
	);
	await db.delete(usageChecks).where(
		sql`client_id IN (SELECT id FROM ${clients} WHERE name LIKE ${`${TEST_PREFIX}-%`})`,
	);
	await db.delete(clients).where(sql`name LIKE ${`${TEST_PREFIX}-%`}`);
}

describe("Slice 5: Full auto-cycle + notifications", () => {
	beforeAll(async () => {
		await cleanup();
		server = await buildServer();
	});

	afterAll(async () => {
		await cleanup();
		if (server) await server.close();
	});

	afterEach(async () => {
		for (const id of clientIds) {
			await db.delete(clients).where(eq(clients.id, id)).catch(() => {});
		}
		clientIds = [];
	});

	describe("runProviderChecks accepts discovered keys", () => {
		let testClientId: string;

		beforeEach(async () => {
			const [c] = await db.insert(clients).values(makeTestClient()).returning({ id: clients.id });
			testClientId = c!.id;
			clientIds.push(testClientId);
		});

		it("checkClientKeys runs checks with provided keys", async () => {
			const { checkClientKeys } = await import("../server/checker.js");

			const results = await checkClientKeys(testClientId, [
				{ provider: "openai", envVarName: "OPENAI_API_KEY", value: "sk-test" },
				{ provider: "claude", envVarName: "ANTHROPIC_API_KEY", value: "sk-ant-test" },
			]);

			expect(results).toHaveLength(2);
			// Both should fail auth since keys are fake — but they ran
			expect(results.every((r) => r.status === "error" || r.status === "success")).toBe(true);
			expect(results.every((r) => r.clientId === testClientId)).toBe(true);
		}, 15000);

		it("checkClientKeys handles empty keys array", async () => {
			const { checkClientKeys } = await import("../server/checker.js");
			const results = await checkClientKeys(testClientId, []);
			expect(results).toEqual([]);
		});
	});

	describe("notification engine", () => {
		let testClientId: string;

		beforeEach(async () => {
			const [c] = await db.insert(clients).values(makeTestClient({
				slackWebhook: "https://hooks.slack.com/test",
				thresholdWarning: "50",
				thresholdCritical: "10",
			})).returning({ id: clients.id });
			testClientId = c!.id;
			clientIds.push(testClientId);
		});

		it("processNotifications sends for critical balance", async () => {
			const { processNotifications } = await import("../server/notifications/index.js");

			// Mock fetch so we don't actually hit Slack
			const fetchMock = vi.fn().mockResolvedValue({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const results: CheckResult[] = [{
				clientId: testClientId,
				provider: "openai",
				status: "success",
				usage: {
					provider: "openai",
					totalTokens: 0,
					totalCost: 0,
					remainingBalance: 5,
					billingPeriod: { start: "", end: "" },
					lastUpdated: "",
				},
			}];

			await processNotifications(results);

			// Should have fired a Slack notification
			expect(fetchMock).toHaveBeenCalled();

			// Should have logged it
			const logs = await db.select().from(notificationLog)
				.where(eq(notificationLog.clientId, testClientId));
			expect(logs.length).toBeGreaterThanOrEqual(1);
			expect(logs[0].channel).toBe("slack");
			expect(logs[0].status).toBe("sent");

			vi.unstubAllGlobals();
		});

		it("processNotifications does not send for healthy clients", async () => {
			const { processNotifications } = await import("../server/notifications/index.js");

			const fetchMock = vi.fn().mockResolvedValue({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const results: CheckResult[] = [{
				clientId: testClientId,
				provider: "openai",
				status: "success",
				usage: {
					provider: "openai",
					totalTokens: 0,
					totalCost: 0,
					remainingBalance: 500,
					billingPeriod: { start: "", end: "" },
					lastUpdated: "",
				},
			}];

			await processNotifications(results);

			// Balance 500 is above warning (50) and critical (10) — no notification
			expect(fetchMock).not.toHaveBeenCalled();

			// Clean up any accidental logs
			await db.delete(notificationLog).where(eq(notificationLog.clientId, testClientId));

			vi.unstubAllGlobals();
		});
	});

	describe("scheduler", () => {
		it("runFullCycle runs and returns results", async () => {
			const { runFullCycle } = await import("../server/scheduler.js");
			const result = await runFullCycle();
			expect(Array.isArray(result.results)).toBe(true);
			expect(Array.isArray(result.clients)).toBe(true);
		}, 15000);
	});

	describe("POST /api/full-cycle endpoint", () => {
		it("returns 200 with cycle results", async () => {
			const response = await server.inject({
				method: "POST",
				url: "/api/full-cycle",
			});
			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body).toHaveProperty("status", "ok");
			expect(body).toHaveProperty("results");
			expect(body).toHaveProperty("clients");
		}, 15000);
	});
});
