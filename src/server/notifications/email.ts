import type { NotificationPayload } from "./slack.js";

/**
 * Send an email notification.
 * Uses a simple SMTP-friendly approach. Configure via:
 * - RESEND_API_KEY for Resend (resend.com)
 * - SENDGRID_API_KEY for SendGrid
 * - SMTP_* env vars for direct SMTP
 */
export async function sendEmailNotification(
	to: string,
	payload: NotificationPayload,
): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (apiKey) {
		return sendViaResend(apiKey, to, payload);
	}

	const sendgridKey = process.env.SENDGRID_API_KEY;
	if (sendgridKey) {
		return sendViaSendGrid(sendgridKey, to, payload);
	}

	// Fall back to SMTP if configured
	const smtpHost = process.env.SMTP_HOST;
	if (smtpHost) {
		return sendViaSmtp(to, payload);
	}

	console.log("Email notification would be sent:", payload.text);
}

async function sendViaResend(
	apiKey: string,
	to: string,
	payload: NotificationPayload,
): Promise<void> {
	const from = process.env.EMAIL_FROM ?? "usage-monitor@example.com";
	const body = payload.fields
		? payload.text +
			"\n\n" +
			payload.fields.map((f) => `${f.title}: ${f.value}`).join("\n")
		: payload.text;

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to,
			subject: "Usage Monitor Alert",
			text: body,
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Resend email failed: ${response.status} ${text}`);
	}
}

async function sendViaSendGrid(
	apiKey: string,
	to: string,
	payload: NotificationPayload,
): Promise<void> {
	const from = process.env.EMAIL_FROM ?? "usage-monitor@example.com";
	const body = payload.fields
		? payload.text +
			"\n\n" +
			payload.fields.map((f) => `${f.title}: ${f.value}`).join("\n")
		: payload.text;

	const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			personalizations: [{ to: [{ email: to }] }],
			from: { email: from },
			subject: "Usage Monitor Alert",
			content: [{ type: "text/plain", value: body }],
		}),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`SendGrid email failed: ${response.status} ${text}`);
	}
}

async function sendViaSmtp(
	_to: string,
	payload: NotificationPayload,
): Promise<void> {
	// SMTP would need nodemailer. Print to console for now.
	console.log(`[SMTP] Would send email: ${payload.text.substring(0, 100)}...`);
}
