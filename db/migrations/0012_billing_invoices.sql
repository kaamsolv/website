CREATE TABLE "invoice_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invoice_links_purpose" CHECK ("invoice_links"."purpose" in ('billing', 'share'))
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"provider_ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "outbox_status" CHECK ("outbox"."status" in ('pending', 'sending', 'sent', 'failed', 'blocked', 'dead'))
);
--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD COLUMN "invoiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_links" ADD CONSTRAINT "invoice_links_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_links" ADD CONSTRAINT "invoice_links_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_links_invoice_id_idx" ON "invoice_links" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;