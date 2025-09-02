import type { NotificationPayload } from "./slack.js";

/**
 * Send a notification to a Discord webhook.
 */
export async function sendDiscordNotification(
	webhookUrl: string,
	payload: NotificationPayload,
): Promise<void> {
	const embeds: unknown[] = [];

	if (payload.fields?.length) {
		embeds.push({
			title: "Usage Monitor Status",
			description: payload.text,
			fields: payload.fields.map((f) => ({
				name: f.title,
				value: f.value,
				inline: true,
			})),
			color: payload.text.includes("🚨") ? 0xef4444 : 0x22c55e,
			timestamp: new Date().toISOString(),
		});
	}

	const body: Record<string, unknown> = {
		content: payload.text,
	};

	if (embeds.length > 0) {
		body.embeds = embeds;
	}

	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Discord notification failed: ${response.status} ${text}`);
	}
}
