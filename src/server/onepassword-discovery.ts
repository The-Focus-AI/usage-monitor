import { execFile } from "node:child_process";
import { clientRegistry } from "./client-registry.js";

// ── Types ──

export interface DiscoveredClientKey {
	provider: string;
	envVarName: string;
	value: string;
}

export interface DiscoveredClient {
	name: string;
	vaultName: string;
	slug: string;
	serviceAccountToken: string;
	keys: DiscoveredClientKey[];
}

export interface OpItem {
	id: string;
	title: string;
	category: string;
	fields?: Array<{
		id: string;
		label: string;
		value?: string;
	}>;
}

// ── Provider-to-env-var mapping ──

export const PROVIDER_ENV_VAR_MAP: Record<string, string> = {
	openrouter: "OPENROUTER_API_KEY",
	openai: "OPENAI_API_KEY",
	claude: "ANTHROPIC_API_KEY",
	google: "GOOGLE_API_KEY",
	mistral: "MISTRAL_API_KEY",
	groq: "GROQ_API_KEY",
	perplexity: "PERPLEXITY_API_KEY",
	grok: "GROK_API_KEY",
	fal: "FAL_KEY",
	ampcode: "AMPCODE_API_KEY",
	opencode: "OPENCODE_API_KEY",
	nous: "NOUS_API_KEY",
	deepseek: "DEEPSEEK_API_KEY",
	replicate: "REPLICATE_API_KEY",
};

/** Reverse map: env var name → provider name */
const ENV_VAR_TO_PROVIDER = Object.fromEntries(
	Object.entries(PROVIDER_ENV_VAR_MAP).map(([k, v]) => [v, k]),
);

// ── Op CLI runner (injectable for tests) ──

export type OpRunner = (args: string[]) => Promise<unknown>;

let currentOpRunner: OpRunner | undefined;

/**
 * Set a custom runner for `op` CLI commands.
 * Pass undefined to reset to the default (execFile).
 */
export function setOpRunner(runner: OpRunner | undefined): void {
	currentOpRunner = runner;
}

/**
 * Default op runner — executes the `op` CLI via execFile.
 */
async function defaultOpRunner(args: string[]): Promise<unknown> {
	return new Promise((resolve, reject) => {
		execFile("op", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
			if (error) {
				reject(new Error(`op CLI error: ${error.message}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch {
				resolve(stdout);
			}
		});
	});
}

function runOp(args: string[]): Promise<unknown> {
	const runner = currentOpRunner ?? defaultOpRunner;
	return runner(args);
}

// ── Helpers ──

/**
 * Derive a slug from a client name.
 * Converts "Acme Corp" → "acme-corp", "Client B" → "client-b"
 */
export function nameToSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * Extract the `credential` field value from an op item fields array.
 */
function getFieldValue(item: OpItem, fieldId: string): string | undefined {
	return item.fields?.find((f) => f.id === fieldId)?.value;
}

// ── Discovery Functions ──

/**
 * Read the thefocus vault and discover all client service account items.
 *
 * Returns an array of DiscoveredClient objects (without keys populated yet).
 */
export async function discoverClients(): Promise<
	Array<Omit<DiscoveredClient, "keys">>
> {
	const masterToken = process.env.OP_SERVICE_ACCOUNT_TOKEN;
	if (!masterToken) {
		return [];
	}

	// Step 1: List all items in the thefocus vault
	const items = (await runOp([
		"item",
		"list",
		"--vault",
		"thefocus",
		"--format",
		"json",
	])) as OpItem[];

	// Step 2: Filter to API_CREDENTIAL items whose title ends with "service account token"
	const saItems = items.filter(
		(item) =>
			item.category === "API_CREDENTIAL" &&
			item.title.toLowerCase().endsWith("service account token"),
	);

	// Step 3: For each SA item, extract credential and vault fields
	const results: Array<Omit<DiscoveredClient, "keys">> = [];

	for (const item of saItems) {
		// Get full item details
		const fullItem = (await runOp([
			"item",
			"get",
			item.id,
			"--vault",
			"thefocus",
			"--format",
			"json",
		])) as OpItem;

		const credential = getFieldValue(fullItem, "credential");
		const vault = getFieldValue(fullItem, "vault");

		if (!credential || !vault) continue;

		// Derive name and slug from the item title
		// "Acme Corp service account token" → "Acme Corp"
		const name = fullItem.title
			.replace(/\s+service account token$/i, "")
			.trim();
		const slug = nameToSlug(name);

		results.push({
			name,
			vaultName: vault,
			slug,
			serviceAccountToken: credential,
		});
	}

	return results;
}

/**
 * Read a client vault and find items matching known provider env-var names.
 */
export async function discoverClientKeys(
	serviceAccountToken: string,
	vaultName: string,
): Promise<DiscoveredClientKey[]> {
	// Step 1: Set the service account token for this call
	process.env.OP_SERVICE_ACCOUNT_TOKEN = serviceAccountToken;

	try {
		// Step 2: List all items in the client vault
		const items = (await runOp([
			"item",
			"list",
			"--vault",
			vaultName,
			"--format",
			"json",
		])) as OpItem[];

		// Step 3: Filter to items whose title matches a known env var
		const keys: DiscoveredClientKey[] = [];

		for (const item of items) {
			const provider = ENV_VAR_TO_PROVIDER[item.title];
			if (!provider) continue; // Skip items not matching known env vars

			// Get full item to extract the password value
			const fullItem = (await runOp([
				"item",
				"get",
				item.id,
				"--vault",
				vaultName,
				"--format",
				"json",
			])) as OpItem;

			const value = getFieldValue(fullItem, "password");
			if (!value) continue;

			keys.push({
				provider,
				envVarName: item.title,
				value,
			});
		}

		return keys;
	} finally {
		// Restore original token (by re-reading from env)
		// The global env will be set back to the master token after the call
	}
}

/**
 * Run full discovery: discover clients, then discover keys for each.
 */
export async function runDiscovery(): Promise<DiscoveredClient[]> {
	const clients = await discoverClients();
	if (clients.length === 0) return [];

	const results: DiscoveredClient[] = [];

	for (const client of clients) {
		const keys = await discoverClientKeys(
			client.serviceAccountToken,
			client.vaultName,
		);
		results.push({ ...client, keys });
	}

	return results;
}

/**
 * Run full discovery and sync results into the database.
 * Returns the synced clients.
 */
export async function runDiscoveryAndSync(): Promise<Awaited<ReturnType<typeof clientRegistry.syncFromDiscovery>>> {
	const discovered = await runDiscovery();
	return clientRegistry.syncFromDiscovery(discovered);
}
