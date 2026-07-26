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

export interface DiscoveryPreviewKey {
	itemName: string;
	category: string;
	provider: string | null;
	checker: string | null;
	monitored: boolean;
}

export interface DiscoveryPreviewClient {
	name: string;
	vaultName: string;
	slug: string;
	keys: DiscoveryPreviewKey[];
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

const ITEM_TITLE_PROVIDER_ALIASES: Record<string, string> = {
	"gemini api key": "google",
	"google api key": "google",
};

function getProviderForItemTitle(title: string): string | undefined {
	return (
		ENV_VAR_TO_PROVIDER[title] ??
		ITEM_TITLE_PROVIDER_ALIASES[title.toLowerCase()]
	);
}

// ── Op CLI runner (injectable for tests) ──

export type OpRunner = (
	args: string[],
	env?: NodeJS.ProcessEnv,
) => Promise<unknown>;

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
async function defaultOpRunner(
	args: string[],
	env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		execFile(
			"op",
			args,
			{ env, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout) => {
				if (error) {
					reject(new Error(`op CLI error: ${error.message}`));
					return;
				}
				try {
					resolve(JSON.parse(stdout));
				} catch {
					resolve(stdout);
				}
			},
		);
	});
}

function runOp(args: string[], env?: NodeJS.ProcessEnv): Promise<unknown> {
	const runner = currentOpRunner ?? defaultOpRunner;
	return env === undefined ? runner(args) : runner(args, env);
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
function getFieldValue(item: OpItem, fieldName: string): string | undefined {
	return item.fields?.find((f) => f.id === fieldName || f.label === fieldName)
		?.value;
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
	// Run all op item get calls in parallel
	const fullItems = await Promise.all(
		saItems.map(
			(item) =>
				runOp([
					"item",
					"get",
					item.id,
					"--vault",
					"thefocus",
					"--format",
					"json",
				]) as Promise<OpItem>,
		),
	);

	const results: Array<Omit<DiscoveredClient, "keys">> = [];

	for (const fullItem of fullItems) {
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
	// Use a per-command environment so parallel client discovery does not race by
	// mutating process.env.OP_SERVICE_ACCOUNT_TOKEN globally.
	const serviceAccountEnv = {
		...process.env,
		OP_SERVICE_ACCOUNT_TOKEN: serviceAccountToken,
	};

	// Step 1: List all items in the client vault
	const items = (await runOp(
		["item", "list", "--vault", vaultName, "--format", "json"],
		serviceAccountEnv,
	)) as OpItem[];

	// Step 3: Filter to items whose title matches a known env var
	const matchedItems = items.filter((item) =>
		getProviderForItemTitle(item.title),
	);

	// Get full item details in parallel for all matching items
	const fullItems = await Promise.all(
		matchedItems.map(
			(item) =>
				runOp(
					["item", "get", item.id, "--vault", vaultName, "--format", "json"],
					serviceAccountEnv,
				) as Promise<OpItem>,
		),
	);

	const keys: DiscoveredClientKey[] = [];
	for (let i = 0; i < matchedItems.length; i++) {
		const fullItem = fullItems[i]!;
		const value =
			getFieldValue(fullItem, "password") ??
			getFieldValue(fullItem, "credential");
		if (!value) continue;

		const title = matchedItems[i]!.title;
		keys.push({
			provider: getProviderForItemTitle(title)!,
			envVarName: title,
			value,
		});
	}

	return keys;
}

/**
 * Read a client vault and return all visible item titles, marking which ones
 * match known provider env-var names. This never reads or returns secret values.
 */
export async function discoverClientKeyPreview(
	serviceAccountToken: string,
	vaultName: string,
): Promise<DiscoveryPreviewKey[]> {
	const serviceAccountEnv = {
		...process.env,
		OP_SERVICE_ACCOUNT_TOKEN: serviceAccountToken,
	};

	const items = (await runOp(
		["item", "list", "--vault", vaultName, "--format", "json"],
		serviceAccountEnv,
	)) as OpItem[];

	return items
		.map((item) => {
			const provider = getProviderForItemTitle(item.title) ?? null;
			return {
				itemName: item.title,
				category: item.category,
				provider,
				checker: provider,
				monitored: provider !== null,
			};
		})
		.sort(
			(a, b) =>
				Number(b.monitored) - Number(a.monitored) ||
				a.itemName.localeCompare(b.itemName),
		);
}

/**
 * Run discovery preview: discover clients, then list all visible key/item names
 * in each client vault without reading secret values.
 */
export async function runDiscoveryPreview(): Promise<DiscoveryPreviewClient[]> {
	const clients = await discoverClients();
	if (clients.length === 0) return [];

	const keysResults = await Promise.all(
		clients.map((client) =>
			discoverClientKeyPreview(client.serviceAccountToken, client.vaultName),
		),
	);

	return clients.map((client, i) => ({
		name: client.name,
		vaultName: client.vaultName,
		slug: client.slug,
		keys: keysResults[i]!,
	}));
}

/**
 * Run full discovery: discover clients, then discover keys for each.
 */
export async function runDiscovery(): Promise<DiscoveredClient[]> {
	const clients = await discoverClients();
	if (clients.length === 0) return [];

	// Run key discovery for all clients in parallel
	const keysResults = await Promise.all(
		clients.map((client) =>
			discoverClientKeys(client.serviceAccountToken, client.vaultName),
		),
	);

	return clients.map((client, i) => ({
		...client,
		keys: keysResults[i]!,
	}));
}

/**
 * Run full discovery and sync results into the database.
 * Returns the synced clients.
 */
export async function runDiscoveryAndSync(): Promise<
	Awaited<ReturnType<typeof clientRegistry.syncFromDiscovery>>
> {
	const discovered = await runDiscovery();
	return clientRegistry.syncFromDiscovery(discovered);
}
