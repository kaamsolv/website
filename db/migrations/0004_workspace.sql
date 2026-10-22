CREATE TYPE "public"."invoice_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hsn_sac" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"rate" text DEFAULT '' NOT NULL,
	"gst_rate" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "state_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "gstin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "bank_account_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "bank_account_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "bank_ifsc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "bank_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "upi_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "show_upi_qr" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "invoice_prefix" text DEFAULT 'INV-' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "default_currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "default_tax_label" text DEFAULT 'GST' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "default_tax_rate" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "default_due_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "default_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "status" "invoice_status" DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_user_id_name_idx" ON "customers" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "items_user_id_name_idx" ON "items" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_due_days" CHECK ("business_profiles"."default_due_days" between 0 and 365);--> statement-breakpoint
-- Plans (docs/products/accounts.md): free accounts save 3 customers and any number of items;
-- the dashboard / paid tracking and currency rates are Pro. Pro gets every key, unlimited.
INSERT INTO "plan_features" ("plan_key", "feature_key", "limit_value") VALUES
  ('free_account', 'invoice_client_directory', 3),
  ('free_account', 'invoice_item_catalogue', NULL),
  ('invoice_pro', 'invoice_item_catalogue', NULL),
  ('invoice_pro', 'invoice_dashboard', NULL),
  ('invoice_pro', 'invoice_fx_rates', NULL)
ON CONFLICT ("plan_key", "feature_key") DO UPDATE SET "limit_value" = EXCLUDED."limit_value";--> statement-breakpoint
-- Existing saved invoices: copy the due date out of the document for overdue queries.
UPDATE "invoices" SET "due_date" = ("data"->>'dueDate')::date
  WHERE "due_date" IS NULL AND ("data"->>'dueDate') ~ '^\d{4}-\d{2}-\d{2}$';
