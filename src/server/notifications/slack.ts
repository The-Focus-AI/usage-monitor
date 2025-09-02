export interface NotificationPayload {
	text: string;
	fields?: Array<{ title: string; value: string }>;
}

/**
 * Send a notification to a Slack webhook.
 * Supports the legacy webhook format and the newer Block Kit format.
 */
export async function sendSlackNotification(
	webhookUrl: string,
	payload: NotificationPayload,
): Promise<void> {
	const blocks = buildSlackBlocks(payload);

	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text: payload.text,
			blocks,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Slack notification failed: ${response.status} ${body}`);
	}
}

function buildSlackBlocks(payload: NotificationPayload) {
	const blocks: unknown[] = [
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: payload.text,
			},
		},
	];

	if (payload.fields?.length) {
		blocks.push({
			type: "divider",
		});

		const fieldText = payload.fields
			.map((f) => `*${f.title}*: ${f.value}`)
			.join("\n");

		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: fieldText,
			},
		});
	}

	return blocks;
}
