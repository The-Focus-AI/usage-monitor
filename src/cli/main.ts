#!/usr/bin/env node

import process from "node:process";
import { config as loadEnv } from "dotenv";
import { ConfigManager } from "../config/manager.js";
import { SlackNotifier } from "../notifications/slack.js";
import { createProvider } from "../shared/provider-factory.js";
import type { NotificationField } from "../shared/types.js";
import { formatUsd, getCurrentUtc, shouldSendDaily } from "../shared/utils.js";

// Load environment variables from .env file
loadEnv();

async function main(): Promise<void> {
	try {
		const configManager = new ConfigManager();
		const services = await configManager.listServices();

		// Get enabled services
		const enabledServices = Object.entries(services).filter(
			([_, config]) => config.enabled,
		);

		if (enabledServices.length === 0) {
			console.error("No enabled services found in configuration");
			process.exit(2);
		}

		console.log(`Monitoring ${enabledServices.length} enabled services...`);

		// Get notification config
		const slackWebhookUrl: string | undefined = process.env.SLACK_WEBHOOK_URL;
		const isDryRun = !slackWebhookUrl;

		// Monitor all enabled services in parallel
		const results = await Promise.allSettled(
			enabledServices.map(async ([serviceType, serviceConfig]) => {
				try {
					const apiKey = await configManager.getCredential(serviceType);
					const provider = createProvider(serviceType, apiKey);

					// Test authentication
					const isAuthenticated = await provider.authenticate();
					if (!isAuthenticated) {
						throw new Error(`${serviceType} authentication failed`);
					}

					// Get usage data
					const usage = await provider.getUsage();
					// Try to fetch billing (for real balance when supported)
					let billingBalance: number | null = null;
					let balanceSource: "billing" | "usage" | "unknown" = "unknown";
					try {
						if (typeof provider.getBilling === "function") {
							const billing = await provider.getBilling?.();
							if (billing && Number.isFinite(billing.currentBalance)) {
								billingBalance = billing.currentBalance;
								balanceSource = "billing";
							}
						}
					} catch {
						// ignore billing errors and fall back to usage
					}
					// Fallback to usage remainingBalance when billing not available
					// Prefer a positive billing balance; otherwise fall back to usage-derived value
					let balance = 0;
					if (billingBalance !== null && billingBalance > 0) {
						balance = billingBalance;
						balanceSource = "billing";
					} else {
						balance = Number.isFinite(usage.remainingBalance)
							? usage.remainingBalance
							: 0;
						balanceSource = "usage";
					}
					const thresholdUsd = serviceConfig.thresholds?.warning || 10;

					return {
						serviceType,
						provider,
						usage,
						balance,
						balanceSource,
						thresholdUsd,
						status: "success" as const,
					};
				} catch (error) {
					console.error(`Error monitoring ${serviceType}:`, error);
					return {
						serviceType,
						error: error instanceof Error ? error.message : "Unknown error",
						status: "error" as const,
					};
				}
			}),
		);

		// Process results
		const successfulResults = results
			.filter(
				(result): result is PromiseFulfilledResult<any> =>
					result.status === "fulfilled",
			)
			.map((result) => result.value)
			.filter((result) => result.status === "success");

		const { hour } = getCurrentUtc();
		const dailyPostHour = 16; // Default daily posting hour

		// Check if any service needs notification
		const criticalServices = successfulResults.filter((result) => {
			if (
				result.serviceType === "openrouter" ||
				result.serviceType === "grok"
			) {
				// Use computed balance when available
				const remaining = Number.isFinite(result.balance)
					? result.balance
					: result.usage.remainingBalance;
				return remaining < result.thresholdUsd;
			}
			// For other services, use different criteria or skip notifications
			return false;
		});

		let shouldNotify = false;
		let cadence = "daily";

		if (criticalServices.length > 0) {
			// Post hourly when any service is under threshold
			cadence = "hourly";
			shouldNotify = true;
		} else {
			// Post once a day at configured hour
			cadence = "daily";
			if (shouldSendDaily(hour, dailyPostHour)) {
				shouldNotify = true;
			}
		}

		// Create notification message
		let text = "";
		const fields: NotificationField[] = [];

		if (criticalServices.length > 0) {
			const criticalNames = criticalServices
				.map((s) => s.serviceType)
				.join(", ");
			text = `:rotating_light: ${criticalServices.length} service(s) need attention: ${criticalNames}`;

			criticalServices.forEach((result) => {
				const balance = result.usage.remainingBalance;
				fields.push({
					title: `${result.serviceType} Balance`,
					value: formatUsd(balance),
				});
			});
		} else {
			text = `:white_check_mark: All ${successfulResults.length} services are healthy`;

			successfulResults.forEach((result) => {
				const status = result.provider.getQuickStatus(result.usage);
				fields.push({
					title: result.serviceType,
					value: status,
				});
			});
		}

		fields.push(
			{
				title: "Services Monitored",
				value: successfulResults.length.toString(),
			},
			{ title: "Cadence", value: cadence },
			{ title: "Last Check", value: new Date().toLocaleString() },
		);

		if (shouldNotify) {
			if (isDryRun) {
				console.log("dry-run: would notify with message:", text);
				console.log("dry-run: fields:", fields);
			} else {
				const slackNotifier = new SlackNotifier({
					webhookUrl: slackWebhookUrl,
				});
				await slackNotifier.send({ text, fields });
				console.log("notified");
			}
		} else {
			console.log("no-notify");
		}

		// Emit JSON log for each service
		successfulResults.forEach((result) => {
			const remaining = Number.isFinite(result.balance)
				? result.balance
				: result.usage.remainingBalance;
			console.log(
				JSON.stringify({
					provider: result.provider.name,
					status: "success",
					remaining,
					balanceSource: result.balanceSource,
					threshold: result.thresholdUsd,
					cadence,
					notified: shouldNotify && !isDryRun,
					dryRun: isDryRun,
					wouldNotify: shouldNotify,
					quickStatus: result.provider.getQuickStatus(result.usage),
				}),
			);
		});

		// Log errors
		results.forEach((result) => {
			if (
				result.status === "rejected" ||
				(result.status === "fulfilled" && result.value.status === "error")
			) {
				const errorResult =
					result.status === "rejected"
						? { serviceType: "unknown", error: result.reason }
						: result.value;

				console.log(
					JSON.stringify({
						provider: errorResult.serviceType,
						status: "error",
						error: errorResult.error,
						cadence,
						notified: false,
						dryRun: isDryRun,
					}),
				);
			}
		});
	} catch (error) {
		console.error("Configuration or runtime error:", error);
		console.log(
			JSON.stringify({
				status: "fatal_error",
				error: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date().toISOString(),
			}),
		);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
