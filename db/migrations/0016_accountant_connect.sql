CREATE TABLE "accountant_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_downloaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accountant_packs_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "accountant_packs_status" CHECK ("accountant_packs"."status" in ('queued', 'sent', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "accountant_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"accountant_name" text DEFAULT '' NOT NULL,
	"accountant_email" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"day_of_month" integer DEFAULT 5 NOT NULL,
	"send_hour" integer DEFAULT 10 NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"sections" text[] DEFAULT '{register,tax_summary,payments,outstanding,ageing}'::text[] NOT NULL,
	"verified_at" timestamp with time zone,
	"verify_hash" text,
	"verify_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accountant_settings_day" CHECK ("accountant_settings"."day_of_month" between 1 and 28),
	CONSTRAINT "accountant_settings_hour" CHECK ("accountant_settings"."send_hour" between 0 and 23),
	CONSTRAINT "accountant_settings_name_len" CHECK (char_length("accountant_settings"."accountant_name") <= 80)
);
--> statement-breakpoint
ALTER TABLE "accountant_packs" ADD CONSTRAINT "accountant_packs_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_settings" ADD CONSTRAINT "accountant_settings_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accountant_packs_user_idx" ON "accountant_packs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accountant_packs_token_idx" ON "accountant_packs" USING btree ("token_hash") WHERE "accountant_packs"."token_hash" is not null;--> statement-breakpoint
CREATE INDEX "accountant_settings_due_idx" ON "accountant_settings" USING btree ("enabled") WHERE "accountant_settings"."enabled" and "accountant_settings"."verified_at" is not null;