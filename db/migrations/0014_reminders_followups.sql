CREATE TABLE "invoice_followups" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"reminders_paused" boolean DEFAULT false NOT NULL,
	"promised_on" date,
	"promise_note" text DEFAULT '' NOT NULL,
	"promise_set_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_followups_note_len" CHECK (char_length("invoice_followups"."promise_note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "invoice_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"step" integer,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "invoice_reminders_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "invoice_reminders_kind" CHECK ("invoice_reminders"."kind" in ('manual', 'scheduled')),
	CONSTRAINT "invoice_reminders_status" CHECK ("invoice_reminders"."status" in ('queued', 'sent', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "reminder_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"scheduled_enabled" boolean DEFAULT false NOT NULL,
	"days_after_due" integer[] DEFAULT '{3,7,14}'::integer[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_prefs_days" CHECK (cardinality("reminder_prefs"."days_after_due") between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "invoice_followups" ADD CONSTRAINT "invoice_followups_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_followups" ADD CONSTRAINT "invoice_followups_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_prefs" ADD CONSTRAINT "reminder_prefs_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_followups_user_promised_idx" ON "invoice_followups" USING btree ("user_id","promised_on") WHERE "invoice_followups"."promised_on" is not null;--> statement-breakpoint
CREATE INDEX "invoice_reminders_invoice_idx" ON "invoice_reminders" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_reminders_user_created_idx" ON "invoice_reminders" USING btree ("user_id","created_at");--> statement-breakpoint
-- Customer payment reminders are part of Invoice Pro (the bundle switches on invoice_pro, so it gets this too).
INSERT INTO "plan_features" ("plan_key", "feature_key", "limit_value") VALUES
  ('invoice_pro', 'invoice_reminders', NULL)
ON CONFLICT ("plan_key", "feature_key") DO UPDATE SET "limit_value" = EXCLUDED."limit_value";
