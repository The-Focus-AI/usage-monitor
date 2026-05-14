import {
	boolean,
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// ── Enums ──
// Inline status checks via text columns + constraints handled app-side.
// Drizzle doesn't require SQL-level enums, but we can add them via migrations.

// ── Clients ──
// Each row = one monitored client/org discovered from 1Password.
// Notification configs are stored as columns directly on this table.
export const clients = pgTable(
	"clients",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		vaultName: text("vault_name").notNull(),
		slug: text("slug").notNull().unique(),
		isActive: boolean("is_active").notNull().default(true),
		// Per-client notification configs
		slackWebhook: text("slack_webhook"),
		discordWebhook: text("discord_webhook"),
		email: text("email"),
		thresholdWarning: numeric("threshold_warning"),
		thresholdCritical: numeric("threshold_critical"),
		lastSyncedAt: timestamp("last_synced_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("clients_slug_idx").on(table.slug)],
);

// ── Usage Checks ──
// Each row = one provider check result for a client at a point in time.
export const usageChecks = pgTable(
	"usage_checks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		clientId: uuid("client_id")
			.notNull()
			.references(() => clients.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		checkedAt: timestamp("checked_at").defaultNow().notNull(),
		balance: numeric("balance"),
		spend: numeric("spend"),
		limitRemaining: numeric("limit_remaining"),
		status: text("status", { enum: ["success", "error"] })
			.notNull()
			.default("success"),
		errorMessage: text("error_message"),
		rawResponse: jsonb("raw_response"),
	},
	(table) => [
		index("usage_checks_client_idx").on(table.clientId),
		index("usage_checks_checked_at_idx").on(table.checkedAt),
	],
);

// ── Notification Log ──
// Each row = one notification attempt sent to a client.
export const notificationLog = pgTable(
	"notification_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		clientId: uuid("client_id")
			.notNull()
			.references(() => clients.id, { onDelete: "cascade" }),
		channel: text("channel", { enum: ["slack", "discord", "email"] }).notNull(),
		sentAt: timestamp("sent_at").defaultNow().notNull(),
		message: text("message").notNull(),
		status: text("status", { enum: ["sent", "failed"] })
			.notNull()
			.default("sent"),
		errorMessage: text("error_message"),
	},
	(table) => [index("notif_log_client_idx").on(table.clientId)],
);

// ---- Type exports ----
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type UsageCheck = typeof usageChecks.$inferSelect;
export type NewUsageCheck = typeof usageChecks.$inferInsert;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type NewNotificationLogEntry = typeof notificationLog.$inferInsert;
