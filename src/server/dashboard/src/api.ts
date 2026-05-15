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

const BASE_URL = "/api";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		headers: { "Content-Type": "application/json" },
		...options,
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
