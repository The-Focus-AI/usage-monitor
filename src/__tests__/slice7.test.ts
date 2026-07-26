import {
	describe,
	it,
	expect,
	beforeAll,
	afterAll,
	afterEach,
	beforeEach,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients, usageChecks } from "../db/schema.js";
import type { NewClient } from "../db/schema.js";
import { buildServer } from "../server/index.js";
import type { FastifyInstance } from "fastify";

const TEST_PREFIX = "test-slice7";
const TEST_OUTPUT_DIR = "/tmp/usage-monitor-test";
const TEST_OUTPUT_PATH = `${TEST_OUTPUT_DIR}/status.json`;

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
	await db
		.delete(usageChecks)
		.where(
			sql`client_id IN (SELECT id FROM ${clients} WHERE name LIKE ${`${TEST_PREFIX}-%`})`,
		);
	await db.delete(clients).where(sql`name LIKE ${`${TEST_PREFIX}-%`}`);
}

describe("Slice 7: Status file output", () => {
	let server: FastifyInstance;
	let clientIds: string[] = [];
	let testClientId: string;

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
			await db
				.delete(clients)
				.where(eq(clients.id, id))
				.catch(() => {});
		}
		clientIds = [];
	});

	describe("writeStatusFile", () => {
		beforeEach(async () => {
			const [c] = await db
				.insert(clients)
				.values(
					makeTestClient({
						name: "Test Client A",
						slug: `test-client-a-${Date.now()}`,
					}),
				)
				.returning({ id: clients.id });
			testClientId = c!.id;
			clientIds.push(testClientId);

			// Insert some usage checks
			await db.insert(usageChecks).values({
				clientId: testClientId,
				provider: "openai",
				status: "success",
				balance: "100.50",
				spend: "25.00",
			});
			await db.insert(usageChecks).values({
				clientId: testClientId,
				provider: "claude",
				status: "error",
				errorMessage: "Auth failed",
			});
		});

		it("writes a status JSON file to the configured path", async () => {
			const { writeStatusFile } = await import("../server/status-output.js");

			process.env.STATUS_OUTPUT_PATH = TEST_OUTPUT_PATH;
			await writeStatusFile();

			const fs = await import("node:fs");
			expect(fs.existsSync(TEST_OUTPUT_PATH)).toBe(true);

			const content = JSON.parse(fs.readFileSync(TEST_OUTPUT_PATH, "utf-8"));
			expect(content).toHaveProperty("checkedAt");
			expect(content).toHaveProperty("clients");
			expect(content).toHaveProperty("summary");
		});

		it("writes per-client per-provider status data", async () => {
			const { writeStatusFile } = await import("../server/status-output.js");

			process.env.STATUS_OUTPUT_PATH = TEST_OUTPUT_PATH;
			await writeStatusFile();

			const fs = await import("node:fs");
			const content = JSON.parse(fs.readFileSync(TEST_OUTPUT_PATH, "utf-8"));

			expect(content.clients.length).toBeGreaterThanOrEqual(1);

			const clientEntry = content.clients.find(
				(c: { name: string }) => c.name === "Test Client A",
			);
			expect(clientEntry).toBeDefined();
			expect(clientEntry.keys.length).toBe(2);

			const openaiKey = clientEntry.keys.find(
				(k: { provider: string }) => k.provider === "openai",
			);
			expect(openaiKey).toBeDefined();
			expect(openaiKey.status).toBe("success");
			expect(openaiKey.balance).toBe(100.5);
			expect(openaiKey.spend).toBe(25);
			expect(openaiKey.lastChecked).toBeDefined();

			const claudeKey = clientEntry.keys.find(
				(k: { provider: string }) => k.provider === "claude",
			);
			expect(claudeKey).toBeDefined();
			expect(claudeKey.status).toBe("error");
			expect(claudeKey.error).toBe("Auth failed");
		});

		it("includes summary with healthy/error/critical counts", async () => {
			const { writeStatusFile } = await import("../server/status-output.js");

			process.env.STATUS_OUTPUT_PATH = TEST_OUTPUT_PATH;
			await writeStatusFile();

			const fs = await import("node:fs");
			const content = JSON.parse(fs.readFileSync(TEST_OUTPUT_PATH, "utf-8"));

			expect(content.summary).toHaveProperty("totalKeys");
			expect(content.summary).toHaveProperty("healthy");
			expect(content.summary).toHaveProperty("errors");
			expect(content.summary).toHaveProperty("critical");
			expect(content.summary.totalKeys).toBeGreaterThanOrEqual(2);
		});

		it("creates the output directory if it doesn't exist", async () => {
			const { writeStatusFile } = await import("../server/status-output.js");
			const fs = await import("node:fs");
			const { mkdtempSync } = await import("node:os");
			const path = await import("node:path");

			const tmpDir = fs.mkdtempSync("/tmp/um-test-");
			const nestedPath = path.join(tmpDir, "subdir", "nested", "status.json");

			process.env.STATUS_OUTPUT_PATH = nestedPath;
			await writeStatusFile();

			expect(fs.existsSync(nestedPath)).toBe(true);
			const content = JSON.parse(fs.readFileSync(nestedPath, "utf-8"));
			expect(content).toHaveProperty("clients");

			// Cleanup
			fs.rmSync(tmpDir, { recursive: true });
		});

		it("uses default path when STATUS_OUTPUT_PATH is not set", async () => {
			const { writeStatusFile } = await import("../server/status-output.js");
			const os = await import("node:os");
			const path = await import("node:path");

			delete process.env.STATUS_OUTPUT_PATH;
			await writeStatusFile();

			const fs = await import("node:fs");
			const defaultPath = path.join(
				os.homedir(),
				".usage-monitor",
				"status.json",
			);
			expect(fs.existsSync(defaultPath)).toBe(true);

			// Cleanup
			const content = JSON.parse(fs.readFileSync(defaultPath, "utf-8"));
			expect(content).toHaveProperty("checkedAt");
			fs.rmSync(path.dirname(defaultPath), { recursive: true });
		});
	});
});
