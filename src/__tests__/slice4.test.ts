import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { buildServer } from "../server/index.js";
import type { FastifyInstance } from "fastify";

// ── Mock data ──

const MOCK_VAULT_ITEMS = [
	{
		id: "sa-client-a",
		title: "client-a service account token",
		category: "API_CREDENTIAL",
		fields: [
			{ id: "credential", label: "credential", value: "ops_client_a_token", purpose: null },
			{ id: "vault", label: "vault", value: "client-a-vault", purpose: null },
		],
	},
	{
		id: "sa-client-b",
		title: "client-b service account token",
		category: "API_CREDENTIAL",
		fields: [
			{ id: "credential", label: "credential", value: "ops_client_b_token", purpose: null },
			{ id: "vault", label: "vault", value: "client-b-vault", purpose: null },
		],
	},
	{
		id: "random-item",
		title: "Some Other Item",
		category: "LOGIN",
		fields: [],
	},
];

const MOCK_CLIENT_A_ITEMS = [
	{
		id: "key-openai",
		title: "OPENAI_API_KEY",
		category: "PASSWORD",
		fields: [{ id: "password", label: "password", value: "sk-openai-abc123", purpose: null }],
	},
	{
		id: "key-claude",
		title: "ANTHROPIC_API_KEY",
		category: "PASSWORD",
		fields: [{ id: "password", label: "password", value: "sk-ant-xyz789", purpose: null }],
	},
	{
		id: "not-a-key",
		title: "AWS_SECRET_KEY",
		category: "PASSWORD",
		fields: [{ id: "password", label: "password", value: "not-mapped", purpose: null }],
	},
];

const MOCK_CLIENT_B_ITEMS = [
	{
		id: "key-google",
		title: "GOOGLE_API_KEY",
		category: "PASSWORD",
		fields: [{ id: "password", label: "password", value: "google-key-123", purpose: null }],
	},
];

const MOCK_EMPTY_VAULT: typeof MOCK_VAULT_ITEMS = [];

describe("Slice 4: 1Password auto-discovery", () => {
	let server: FastifyInstance;
	let opDiscovery: typeof import("../server/onepassword-discovery.js");
	let runOpMock: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		server = await buildServer();
		opDiscovery = await import("../server/onepassword-discovery.js");
	});

	afterAll(async () => {
		if (server) await server.close();
	});

	afterEach(() => {
		// Reset the op runner to default after each test
		opDiscovery.setOpRunner(undefined);
	});

	// ── Helper: mock the `op` CLI runner ──
	function mockOpRunner(results: Record<string, unknown>) {
		runOpMock = vi.fn((args: string[]) => {
			const key = args.join(" ");
			const result = results[key];
			if (result === undefined) {
				throw new Error(`Unexpected op call: ${key}`);
			}
			return Promise.resolve(result);
		});
		opDiscovery.setOpRunner(runOpMock);
	}

	describe("PROVIDER_ENV_VAR_MAP", () => {
		it("maps all known providers to their env var names", () => {
			const map = opDiscovery.PROVIDER_ENV_VAR_MAP;
			expect(map.openrouter).toBe("OPENROUTER_API_KEY");
			expect(map.openai).toBe("OPENAI_API_KEY");
			expect(map.claude).toBe("ANTHROPIC_API_KEY");
			expect(map.google).toBe("GOOGLE_API_KEY");
			expect(map.mistral).toBe("MISTRAL_API_KEY");
			expect(map.groq).toBe("GROQ_API_KEY");
			expect(map.perplexity).toBe("PERPLEXITY_API_KEY");
			expect(map.grok).toBe("GROK_API_KEY");
			expect(map.fal).toBe("FAL_KEY");
			expect(map.ampcode).toBe("AMPCODE_API_KEY");
			expect(map.opencode).toBe("OPENCODE_API_KEY");
			expect(map.nous).toBe("NOUS_API_KEY");
			expect(map.deepseek).toBe("DEEPSEEK_API_KEY");
			expect(map.replicate).toBe("REPLICATE_API_KEY");
		});
	});

	describe("discoverClients", () => {
		const OLD_ENV = process.env;

		afterEach(() => {
			process.env = { ...OLD_ENV };
		});

		it("returns empty array when OP_SERVICE_ACCOUNT_TOKEN is missing", async () => {
			delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
			const result = await opDiscovery.discoverClients();
			expect(result).toEqual([]);
		});

		it("returns client SA items from the thefocus vault", async () => {
			process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_master_token";

			mockOpRunner({
				// List all items in thefocus vault
				"item list --vault thefocus --format json": MOCK_VAULT_ITEMS,
				// Get details for client-a SA item
				"item get sa-client-a --vault thefocus --format json": MOCK_VAULT_ITEMS[0],
				// Get details for client-b SA item
				"item get sa-client-b --vault thefocus --format json": MOCK_VAULT_ITEMS[1],
			});

			const result = await opDiscovery.discoverClients();

			expect(result).toHaveLength(2);

			expect(result[0].name).toBe("client-a");
			expect(result[0].vaultName).toBe("client-a-vault");
			expect(result[0].serviceAccountToken).toBe("ops_client_a_token");
			expect(result[0].slug).toBe("client-a");

			expect(result[1].name).toBe("client-b");
			expect(result[1].vaultName).toBe("client-b-vault");
			expect(result[1].serviceAccountToken).toBe("ops_client_b_token");
			expect(result[1].slug).toBe("client-b");

			// Verify the correct op commands were called
			expect(runOpMock).toHaveBeenCalledWith([
				"item", "list", "--vault", "thefocus", "--format", "json",
			]);
		});

		it("filters out non-API_CREDENTIAL items", async () => {
			process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_master";

			mockOpRunner({
				"item list --vault thefocus --format json": MOCK_VAULT_ITEMS,
				"item get sa-client-a --vault thefocus --format json": MOCK_VAULT_ITEMS[0],
				"item get sa-client-b --vault thefocus --format json": MOCK_VAULT_ITEMS[1],
			});

			const result = await opDiscovery.discoverClients();

			// Only SA items (client-a, client-b), not the LOGIN item
			expect(result).toHaveLength(2);
		});

		it("handles empty vault gracefully", async () => {
			process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_master";

			mockOpRunner({
				"item list --vault thefocus --format json": MOCK_EMPTY_VAULT,
			});

			const result = await opDiscovery.discoverClients();
			expect(result).toEqual([]);
		});
	});

	describe("discoverClientKeys", () => {
		it("returns matching API keys from a client vault", async () => {
			mockOpRunner({
				"item list --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS,
				"item get key-openai --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS[0],
				"item get key-claude --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS[1],
				"item get not-a-key --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS[2],
			});

			const result = await opDiscovery.discoverClientKeys(
				"ops_client_a_token",
				"client-a-vault",
			);

			expect(result).toHaveLength(2);

			expect(result[0].provider).toBe("openai");
			expect(result[0].envVarName).toBe("OPENAI_API_KEY");
			expect(result[0].value).toBe("sk-openai-abc123");

			expect(result[1].provider).toBe("claude");
			expect(result[1].envVarName).toBe("ANTHROPIC_API_KEY");
			expect(result[1].value).toBe("sk-ant-xyz789");
		});

		it("filters out items not matching known env vars", async () => {
			mockOpRunner({
				"item list --vault unknown-vault --format json": [
					{ id: "unknown-item", title: "SOME_UNKNOWN_KEY", category: "PASSWORD" },
				],
			});

			const result = await opDiscovery.discoverClientKeys(
				"ops_test",
				"unknown-vault",
			);

			expect(result).toEqual([]);
		});

		it("handles empty vault gracefully", async () => {
			mockOpRunner({
				"item list --vault empty-vault --format json": [],
			});

			const result = await opDiscovery.discoverClientKeys(
				"ops_test",
				"empty-vault",
			);
			expect(result).toEqual([]);
		});
	});

	describe("runDiscovery", () => {
		const OLD_ENV = process.env;

		afterEach(() => {
			process.env = { ...OLD_ENV };
		});

		it("returns empty array when OP_SERVICE_ACCOUNT_TOKEN is missing", async () => {
			delete process.env.OP_SERVICE_ACCOUNT_TOKEN;
			const result = await opDiscovery.runDiscovery();
			expect(result).toEqual([]);
		});

		it("discovers clients and their keys in one call", async () => {
			process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_master";

			mockOpRunner({
				"item list --vault thefocus --format json": MOCK_VAULT_ITEMS,
				"item get sa-client-a --vault thefocus --format json": MOCK_VAULT_ITEMS[0],
				"item get sa-client-b --vault thefocus --format json": MOCK_VAULT_ITEMS[1],
				"item list --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS,
				"item get key-openai --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS[0],
				"item get key-claude --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS[1],
				"item get not-a-key --vault client-a-vault --format json": MOCK_CLIENT_A_ITEMS[2],
				"item list --vault client-b-vault --format json": MOCK_CLIENT_B_ITEMS,
				"item get key-google --vault client-b-vault --format json": MOCK_CLIENT_B_ITEMS[0],
			});

			const result = await opDiscovery.runDiscovery();

			expect(result).toHaveLength(2);

			// Client A has 2 keys (openai, claude)
			const clientA = result.find((c) => c.slug === "client-a");
			expect(clientA).toBeDefined();
			expect(clientA!.keys).toHaveLength(2);
			expect(clientA!.keys[0].provider).toBe("openai");
			expect(clientA!.keys[1].provider).toBe("claude");

			// Client B has 1 key (google)
			const clientB = result.find((c) => c.slug === "client-b");
			expect(clientB).toBeDefined();
			expect(clientB!.keys).toHaveLength(1);
			expect(clientB!.keys[0].provider).toBe("google");
		});
	});

	describe("POST /api/sync endpoint", () => {
		const OLD_ENV = process.env;

		beforeAll(async () => {
			await db.delete(clients).where(sql`name LIKE ${"sync-test-%"}`);
		});

		afterEach(() => {
			process.env = { ...OLD_ENV };
		});

		afterAll(async () => {
			await db.delete(clients).where(sql`name LIKE ${"sync-test-%"}`);
		});

		it("runs discovery and syncs clients into the database", async () => {
			process.env.OP_SERVICE_ACCOUNT_TOKEN = "ops_master_sync";

			mockOpRunner({
				"item list --vault thefocus --format json": [
					{
						id: "sa-sync-client",
						title: "sync-test-client service account token",
						category: "API_CREDENTIAL",
						fields: [
							{ id: "credential", label: "credential", value: "ops_sync_token", purpose: null },
							{ id: "vault", label: "vault", value: "sync-test-vault", purpose: null },
						],
					},
				],
				"item get sa-sync-client --vault thefocus --format json": {
					id: "sa-sync-client",
					title: "sync-test-client service account token",
					category: "API_CREDENTIAL",
					fields: [
						{ id: "credential", label: "credential", value: "ops_sync_token", purpose: null },
						{ id: "vault", label: "vault", value: "sync-test-vault", purpose: null },
					],
				},
				"item list --vault sync-test-vault --format json": [
					{
						id: "key-perplexity",
						title: "PERPLEXITY_API_KEY",
						category: "PASSWORD",
						fields: [{ id: "password", label: "password", value: "pplx-test", purpose: null }],
					},
				],
				"item get key-perplexity --vault sync-test-vault --format json": {
					id: "key-perplexity",
					title: "PERPLEXITY_API_KEY",
					category: "PASSWORD",
					fields: [{ id: "password", label: "password", value: "pplx-test", purpose: null }],
				},
			});

			const response = await server.inject({
				method: "POST",
				url: "/api/sync",
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body.status).toBe("ok");
			expect(body.clients).toBeDefined();

			// Verify the client was created in the DB
			const created = await db
				.select()
				.from(clients)
				.where(eq(clients.slug, "sync-test-client"))
				.limit(1);
			expect(created).toHaveLength(1);
			expect(created[0].vaultName).toBe("sync-test-vault");
			expect(created[0].isActive).toBe(true);

			// Cleanup
			await db.delete(clients).where(eq(clients.id, created[0].id));
		});

		it("returns 503 when OP_SERVICE_ACCOUNT_TOKEN is missing", async () => {
			delete process.env.OP_SERVICE_ACCOUNT_TOKEN;

			const response = await server.inject({
				method: "POST",
				url: "/api/sync",
			});

			expect(response.statusCode).toBe(503);
		});
	});
});
