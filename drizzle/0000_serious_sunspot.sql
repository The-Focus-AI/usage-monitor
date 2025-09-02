CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"vault_name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"slack_webhook" text,
	"discord_webhook" text,
	"email" text,
	"threshold_warning" numeric,
	"threshold_critical" numeric,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "usage_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"balance" numeric,
	"spend" numeric,
	"limit_remaining" numeric,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"raw_response" jsonb
);
--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_checks" ADD CONSTRAINT "usage_checks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_slug_idx" ON "clients" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "notif_log_client_idx" ON "notification_log" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "usage_checks_client_idx" ON "usage_checks" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "usage_checks_checked_at_idx" ON "usage_checks" USING btree ("checked_at");