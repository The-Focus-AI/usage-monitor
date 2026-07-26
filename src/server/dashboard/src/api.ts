export interface Client {
	id: string;
	name: string;
	vaultName: string;
	slug: string;
	isActive: boolean;
	slackWebhook: string | null;
	discordWebhook: string | null;
	email: string | null;
	thresholdWarning: string | null;
	thresholdCritical: string | null;
	lastSyncedAt: string | null;
	createdAt: string;
	lastCheckStatus: "success" | "error" | null;
	lastCheckAt: string | null;
}

export interface UsageCheck {
	id: string;
	clientId: string;
	provider: string;
	checkedAt: string;
	balance: string | null;
	spend: string | null;
	limitRemaining: string | null;
	status: "success" | "error";
	errorMessage: string | null;
}

export interface DiscoveryPreviewKey {
	itemName: string;
	category: string;
	provider: string | null;
	checker: string | null;
	monitored: boolean;
}

export interface DiscoveryPreviewClient {
	id?: string;
	name: string;
	vaultName: string;
	slug: string;
	lastSyncedAt?: string | null;
	keys: DiscoveryPreviewKey[];
}

const BASE_URL = "/api";

async function fetchJson<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const { headers: optionHeaders, body, ...restOptions } = options;
	const headers = new Headers(optionHeaders);
	const hasBody = body !== undefined && body !== null;

	if (hasBody && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const res = await fetch(`${BASE_URL}${path}`, {
		...restOptions,
		...(hasBody ? { body } : {}),
		...(Array.from(headers).length > 0 ? { headers } : {}),
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export async function fetchClients(): Promise<Client[]> {
	const data = await fetchJson<{ clients: Client[] }>("/clients");
	return data.clients;
}

export async function fetchClientUsage(
	clientId: string,
): Promise<UsageCheck[]> {
	const data = await fetchJson<{ checks: UsageCheck[] }>(
		`/clients/${clientId}/usage`,
	);
	return data.checks;
}

export async function fetchDiscoveryPreview(): Promise<
	DiscoveryPreviewClient[]
> {
	const data = await fetchJson<{ clients: DiscoveryPreviewClient[] }>(
		"/discovery-preview",
	);
	return data.clients;
}

export async function refreshDiscoveryPreview(): Promise<
	DiscoveryPreviewClient[]
> {
	const data = await fetchJson<{ clients: DiscoveryPreviewClient[] }>(
		"/discovery-preview/refresh",
		{ method: "POST" },
	);
	return data.clients;
}

export async function triggerFullCycle(): Promise<{
	summary: { total: number; succeeded: number; failed: number };
}> {
	return fetchJson("/full-cycle", { method: "POST" });
}

export async function triggerCheck(): Promise<{
	summary: { total: number; succeeded: number; failed: number };
}> {
	return fetchJson("/check", { method: "POST" });
}
