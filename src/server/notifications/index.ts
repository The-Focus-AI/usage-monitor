import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { clients, notificationLog } from "../../db/schema.js";
import type { CheckResult } from "../checker.js";
import { sendSlackNotification } from "./slack.js";
import { sendDiscordNotification } from "./discord.js";
import { sendEmailNotification } from "./email.js";
import type { NotificationPayload } from "./slack.js";

interface ClientNotifConfig {
	id: string;
	name: string;
	slackWebhook: string | null;
	discordWebhook: string | null;
	email: string | null;
	thresholdWarning: string | null;
	thresholdCritical: string | null;
}

/**
 * Process check results and send notifications based on per-client thresholds.
 */
export async function processNotifications(
	results: CheckResult[],
): Promise<void> {
	if (results.length === 0) return;

	// Load all clients that have notification channels configured
	const allClients = await db
		.select({
			id: clients.id,
			name: clients.name,
			slackWebhook: clients.slackWebhook,
			discordWebhook: clients.discordWebhook,
			email: clients.email,
			thresholdWarning: clients.thresholdWarning,
			thresholdCritical: clients.thresholdCritical,
		})
		.from(clients)
		.where(eq(clients.isActive, true));

	if (allClients.length === 0) return;

	// Group results by client
	const resultsByClient = new Map<string, CheckResult[]>();
	for (const r of results) {
		const existing = resultsByClient.get(r.clientId) ?? [];
		existing.push(r);
		resultsByClient.set(r.clientId, existing);
	}

	for (const client of allClients) {
		const clientResults = resultsByClient.get(client.id) ?? [];
		if (clientResults.length === 0) continue;
		await processClientNotifications(client, clientResults);
	}
}

async function processClientNotifications(
	client: ClientNotifConfig,
	results: CheckResult[],
): Promise<void> {
	const severity = evaluateThresholds(client, results);
	if (severity === "healthy") return; // No notification needed

	const payload = buildPayload(client, severity, results);

	// Send via each configured channel
	const sends: Array<Promise<void>> = [];

	if (client.slackWebhook) {
		sends.push(
			sendAndLog(client.id, "slack", client.slackWebhook, payload),
		);
	}
	if (client.discordWebhook) {
		sends.push(
			sendAndLog(client.id, "discord", client.discordWebhook, payload),
		);
	}
	if (client.email) {
		sends.push(
			sendAndLog(client.id, "email", client.email, payload),
		);
	}

	await Promise.allSettled(sends);
}

type Severity = "healthy" | "warning" | "critical" | "error";

function evaluateThresholds(
	client: ClientNotifConfig,
	results: CheckResult[],
): Severity {
	const warning = client.thresholdWarning
		? Number(client.thresholdWarning)
		: null;
	const critical = client.thresholdCritical
		? Number(client.thresholdCritical)
		: null;

	let hasCritical = false;
	let hasWarning = false;
	let hasError = false;

	for (const r of results) {
		if (r.status === "error") {
			hasError = true;
			continue;
		}

		const balance =
			r.usage?.remainingBalance ??
			r.billing?.currentBalance ??
			null;

		if (balance !== null && critical !== null && balance <= critical) {
			hasCritical = true;
		} else if (balance !== null && warning !== null && balance <= warning) {
			hasWarning = true;
		}
	}

	if (hasCritical) return "critical";
	if (hasError) return "error";
	if (hasWarning) return "warning";
	return "healthy";
}

function buildPayload(
	client: ClientNotifConfig,
	severity: Severity,
	results: CheckResult[],
): NotificationPayload {
	const emoji =
		severity === "critical"
			? "🚨"
			: severity === "error"
				? "❌"
				: severity === "warning"
					? "⚠️"
					: "✅";

	const text = `${emoji} ${client.name} — ${severity.toUpperCase()}`;
	const fields = results.map((r) => ({
		title: r.provider,
		value:
			r.status === "error"
				? `Error: ${r.error ?? "Unknown"}`
				: r.usage?.remainingBalance !== undefined
					? `$${Number(r.usage.remainingBalance).toFixed(2)}`
					: "No balance data",
	}));

	return { text, fields };
}

async function sendAndLog(
	clientId: string,
	channel: string,
	target: string,
	payload: NotificationPayload,
): Promise<void> {
	try {
		switch (channel) {
			case "slack":
				await sendSlackNotification(target, payload);
				break;
			case "discord":
				await sendDiscordNotification(target, payload);
				break;
			case "email":
				await sendEmailNotification(target, payload);
				break;
		}

		await db.insert(notificationLog).values({
			clientId,
			channel: channel as "slack" | "discord" | "email",
			message: payload.text,
			status: "sent",
		});
	} catch (error) {
		console.error(
			`[notifications] Failed to send ${channel} for client ${clientId}:`,
			error,
		);

		await db.insert(notificationLog).values({
			clientId,
			channel: channel as "slack" | "discord" | "email",
			message: payload.text,
			status: "failed",
			errorMessage:
				error instanceof Error ? error.message : "Unknown error",
		});
	}
}
