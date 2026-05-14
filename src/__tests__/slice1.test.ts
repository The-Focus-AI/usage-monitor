import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

describe("Slice 1: New schema + server boots clean", () => {
	let server: FastifyInstance;

	afterEach(async () => {
		if (server) {
			await server.close();
		}
	});

	it("schema exports exactly 3 tables", async () => {
		const schema = await import("../db/schema.js");

		// Verify the three new tables exist (Drizzle table objects are real runtime values)
		expect(schema.clients).toBeDefined();
		expect(schema.usageChecks).toBeDefined();
		expect(schema.notificationLog).toBeDefined();

		// Verify old tables are gone
		expect(schema.organizations).toBeUndefined();
		expect(schema.users).toBeUndefined();
		expect(schema.orgMembers).toBeUndefined();
		expect(schema.apiKeys).toBeUndefined();
		expect(schema.orgNotificationConfigs).toBeUndefined();
		expect(schema.oauthTokens).toBeUndefined();

		// Verify clients table has expected columns via Drizzle internal symbol
		const columns =
			schema.clients[Symbol.for("drizzle:Columns") as unknown as string];
		const columnNames = Object.keys(columns);
		expect(columnNames).toContain("id");
		expect(columnNames).toContain("name");
		expect(columnNames).toContain("vaultName");
		expect(columnNames).toContain("slug");
		expect(columnNames).toContain("isActive");
		expect(columnNames).toContain("slackWebhook");
		expect(columnNames).toContain("discordWebhook");
		expect(columnNames).toContain("email");
		expect(columnNames).toContain("thresholdWarning");
		expect(columnNames).toContain("thresholdCritical");
		expect(columnNames).toContain("lastSyncedAt");
		expect(columnNames).toContain("createdAt");
	});

	it("server boots and GET /api/health returns 200", async () => {
		const { buildServer } = await import("../server/index.js");
		server = await buildServer();
		await server.ready();

		const response = await server.inject({
			method: "GET",
			url: "/api/health",
		});

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body.status).toBe("ok");
		expect(body.timestamp).toBeDefined();
		expect(body.database).toBeDefined();
	});

	it("server does not expose old routes", async () => {
		const { buildServer } = await import("../server/index.js");
		server = await buildServer();
		await server.ready();

		// These old routes should return 404
		const oldRoutes = ["/api/keys", "/api/usage", "/api/oauth/google/start"];
		for (const route of oldRoutes) {
			const response = await server.inject({
				method: "GET",
				url: route,
			});
			expect(response.statusCode).toBe(404);
		}
	});

	it("no references to deleted modules in non-test source", async () => {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		// Walk src/ for .ts files (excluding test files and node_modules)
		const srcDir = path.resolve(import.meta.dirname, "..");
		const forbidden = ["Clerk", "encrypt", "decrypt", "oauth", "clerkOrgId"];
		const errors: string[] = [];

		async function walk(dir: string) {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (
					entry.isDirectory() &&
					!entry.name.startsWith(".") &&
					entry.name !== "node_modules"
				) {
					await walk(fullPath);
				} else if (
					entry.isFile() &&
					entry.name.endsWith(".ts") &&
					!entry.name.endsWith(".test.ts") &&
					entry.name !== "slice1.test.ts"
				) {
					const content = await fs.readFile(fullPath, "utf-8");
					for (const term of forbidden) {
						if (content.includes(term)) {
							errors.push(`${fullPath}: contains "${term}"`);
						}
					}
				}
			}
		}

		await walk(srcDir);
		expect(errors).toEqual([]);
	});
});
