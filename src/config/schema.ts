import { z } from "zod";

export const ProviderConfigSchema = z.object({
	apiKey: z.string().min(1, "API key is required"),
	baseUrl: z.string().url().optional(),
	enabled: z.boolean().default(true),
});

export const NotificationConfigSchema = z.object({
	slack: z
		.object({
			webhookUrl: z.string().url("Invalid Slack webhook URL"),
			enabled: z.boolean().default(true),
		})
		.optional(),
	discord: z
		.object({
			webhookUrl: z.string().url("Invalid Discord webhook URL"),
			enabled: z.boolean().default(true),
		})
		.optional(),
	email: z
		.object({
			smtp: z.string().min(1, "SMTP server is required"),
			to: z.string().email("Invalid email address"),
			enabled: z.boolean().default(true),
		})
		.optional(),
});

export const ThresholdConfigSchema = z.object({
	alertThresholdUsd: z
		.number()
		.positive("Threshold must be positive")
		.default(10),
	dailyPostUtcHour: z.number().int().min(0).max(23).default(16),
});

export const ConfigSchema = z.object({
	providers: z
		.object({
			openrouter: ProviderConfigSchema.optional(),
			openai: ProviderConfigSchema.optional(),
			claude: ProviderConfigSchema.optional(),
			cursor: ProviderConfigSchema.optional(),
		})
		.refine(
			(providers) =>
				Object.values(providers).some((provider) => provider?.enabled),
			"At least one provider must be enabled",
		),
	notifications: NotificationConfigSchema,
	thresholds: ThresholdConfigSchema.default({
		alertThresholdUsd: 10,
		dailyPostUtcHour: 16,
	}),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;
export type ThresholdConfig = z.infer<typeof ThresholdConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
