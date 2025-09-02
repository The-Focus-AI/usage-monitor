export interface ApiKey {
	id: string;
	provider: string;
	label: string;
	source: string;
	isActive: boolean;
	keyPreview: string;
	createdAt: string;
	/** Status of the latest usage check, if any */
	lastCheckStatus: "success" | "error" | null;
	/** Error message from the latest check, if it failed */
	lastCheckError: string | null;
	/** When the latest check was run */
	lastCheckAt: string | null;
}

export interface UsageCheck {
	id: string;
	keyId: string;
	orgId: string;
	provider: string;
	checkedAt: string;
	spendAmount: string | null;
	creditBalance: string | null;
	limitRemaining: string | null;
	status: "success" | "error";
	errorMessage: string | null;
}

export interface CheckResult {
	keyId: string;
	orgId: string;
	provider: string;
	status: "success" | "error";
	error?: string;
}

const BASE_URL = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const token = localStorage.getItem("auth_token");
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options?.headers as Record<string, string>),
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export async function fetchKeys(): Promise<ApiKey[]> {
	const data = await apiFetch<{ keys: ApiKey[] }>("/keys");
	return data.keys;
}

export async function addKey(
	provider: string,
	label: string,
	keyValue: string,
	billingKeyValue?: string,
): Promise<void> {
	await apiFetch("/keys", {
		method: "POST",
		body: JSON.stringify({
			provider,
			label,
			keyValue,
			...(billingKeyValue ? { billingKeyValue } : {}),
		}),
	});
}

export async function updateKey(
	id: string,
	updates: { label?: string; keyValue?: string; billingKeyValue?: string },
): Promise<void> {
	await apiFetch(`/keys/${id}`, {
		method: "PATCH",
		body: JSON.stringify(updates),
	});
}

export async function retryKeyCheck(
	id: string,
): Promise<CheckResult> {
	const data = await apiFetch<{ check: CheckResult }>(`/keys/${id}/check`, {
		method: "POST",
		body: "{}",
	});
	return data.check;
}

export async function deleteKey(id: string): Promise<void> {
	await apiFetch(`/keys/${id}`, {
		method: "DELETE",
		body: "{}",
	});
}

export async function fetchUsage(): Promise<UsageCheck[]> {
	const data = await apiFetch<{ checks: UsageCheck[] }>("/usage");
	return data.checks;
}

export async function triggerCheck(): Promise<void> {
	await apiFetch("/check", {
		method: "POST",
		body: "{}",
	});
}

export function setAuthToken(token: string): void {
	localStorage.setItem("auth_token", token);
}
