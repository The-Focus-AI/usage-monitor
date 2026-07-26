CREATE TABLE "client_key_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"item_name" text NOT NULL,
	"category" text NOT NULL,
	"provider" text,
	"checker" text,
	"monitored" boolean DEFAULT false NOT NULL,
	"last_discovered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_key_inventory" ADD CONSTRAINT "client_key_inventory_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_key_inventory_client_idx" ON "client_key_inventory" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_key_inventory_client_item_unique" ON "client_key_inventory" USING btree ("client_id","item_name");