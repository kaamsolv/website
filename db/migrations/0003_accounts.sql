CREATE TYPE "public"."subscription_provider" AS ENUM('razorpay', 'manual');--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"logo" text,
	"next_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_logo_len" CHECK (char_length("business_profiles"."logo") <= 280000),
	CONSTRAINT "business_profiles_next_number" CHECK ("business_profiles"."next_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"number" text NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"currency" text NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"issue_date" date,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_data_len" CHECK (length("invoices"."data"::text) <= 64000)
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"plan_key" text NOT NULL,
	"feature_key" text NOT NULL,
	"limit_value" integer,
	CONSTRAINT "plan_features_plan_key_feature_key_pk" PRIMARY KEY("plan_key","feature_key")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"plan_key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "subscription_provider" NOT NULL,
	"provider_ref" text NOT NULL,
	"plan_key" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_ref_unique" UNIQUE("provider_ref")
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_key_plans_plan_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("plan_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_key_plans_plan_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("plan_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "invoices_user_id_updated_at_idx" ON "invoices" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
-- Seed: the two plans and what they grant (docs/products/accounts.md).
-- free_account applies to every signed-in user; invoice_pro to an active subscription.
INSERT INTO "plans" ("plan_key", "name") VALUES ('free_account', 'Free account'), ('invoice_pro', 'Invoice Pro');--> statement-breakpoint
INSERT INTO "plan_features" ("plan_key", "feature_key", "limit_value") VALUES
  ('free_account', 'invoice_save', 20),
  ('invoice_pro', 'invoice_save', NULL),
  ('invoice_pro', 'invoice_watermark_remove', NULL),
  ('invoice_pro', 'invoice_unlimited_items', NULL),
  ('invoice_pro', 'invoice_client_directory', NULL),
  ('invoice_pro', 'invoice_templates', NULL),
  ('invoice_pro', 'invoice_brand_color', NULL),
  ('invoice_pro', 'invoice_quote_mode', NULL),
  ('invoice_pro', 'invoice_recurring', NULL),
  ('invoice_pro', 'invoice_csv_export', NULL),
  ('invoice_pro', 'invoice_batch_csv', NULL);
