CREATE TABLE "portal_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"reporter_ip_hash" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	CONSTRAINT "portal_reports_reason" CHECK ("portal_reports"."reason" in ('impersonation', 'scam', 'misleading', 'illegal', 'other')),
	CONSTRAINT "portal_reports_status" CHECK ("portal_reports"."status" in ('open', 'reviewed', 'dismissed')),
	CONSTRAINT "portal_reports_details_len" CHECK (char_length("portal_reports"."details") <= 500)
);
--> statement-breakpoint
ALTER TABLE "affiliate_events" DROP CONSTRAINT "affiliate_events_action";--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "suspended_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_reports" ADD CONSTRAINT "portal_reports_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_reports_merchant_idx" ON "portal_reports" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "portal_reports_status_idx" ON "portal_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_action" CHECK ("affiliate_events"."action" in ('applied', 'withdrawn', 'approved', 'rejected', 'suspended', 'reinstated', 'programme_opened', 'programme_closed', 'portal_created', 'portal_edited', 'merchant_suspended', 'merchant_reinstated'));--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_status" CHECK ("merchants"."status" in ('active', 'suspended'));--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_suspended_reason_len" CHECK (char_length("merchants"."suspended_reason") <= 300);--> statement-breakpoint
INSERT INTO "plans" ("plan_key", "name") VALUES ('affiliate_manager', 'Affiliate Manager') ON CONFLICT ("plan_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_features" ("plan_key", "feature_key", "limit_value") VALUES ('affiliate_manager', 'affiliate_programme', 1) ON CONFLICT ("plan_key", "feature_key") DO NOTHING;
