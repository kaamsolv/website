ALTER TABLE "business_profiles" ADD COLUMN "quote_prefix" text DEFAULT 'QT-' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "quote_next_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "default_template" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "default_brand_color" text DEFAULT '#FE6336' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "kind" text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_user_id_kind_idx" ON "invoices" USING btree ("user_id","kind");--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_quote_next_number" CHECK ("business_profiles"."quote_next_number" >= 1);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_kind" CHECK ("invoices"."kind" in ('invoice', 'quote'));