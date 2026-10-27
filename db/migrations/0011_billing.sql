CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "billing_events_provider_event_id_unique" UNIQUE("provider_event_id"),
	CONSTRAINT "billing_events_status" CHECK ("billing_events"."status" in ('received', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"plan_key" text NOT NULL,
	"period" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"paid_at" timestamp with time zone,
	"granted_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "billing_payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id"),
	CONSTRAINT "billing_payments_status" CHECK ("billing_payments"."status" in ('created', 'paid', 'failed', 'refunded', 'disputed')),
	CONSTRAINT "billing_payments_period" CHECK ("billing_payments"."period" in ('month', 'year')),
	CONSTRAINT "billing_payments_amount" CHECK ("billing_payments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"plan_key" text NOT NULL,
	"period" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plan_prices_plan_key_period_pk" PRIMARY KEY("plan_key","period"),
	CONSTRAINT "plan_prices_period" CHECK ("plan_prices"."period" in ('month', 'year')),
	CONSTRAINT "plan_prices_amount" CHECK ("plan_prices"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_plan_key_plans_plan_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("plan_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_key_plans_plan_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("plan_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payments_user_id_idx" ON "billing_payments" USING btree ("user_id");
--> statement-breakpoint
-- Seed (docs/products/billing.md): the bundle is a price-list entry only. Buying it switches on invoice_pro and
-- qr_pro (app/lib/billing/plans.ts), so its features can never drift from those two plans.
INSERT INTO "plans" ("plan_key", "name") VALUES ('invoice_qr_bundle', 'Invoice + QR Pro');--> statement-breakpoint
INSERT INTO "plan_prices" ("plan_key", "period", "amount_paise") VALUES
  ('invoice_pro', 'month', 14900),
  ('invoice_pro', 'year', 149000),
  ('qr_pro', 'month', 9900),
  ('qr_pro', 'year', 99000),
  ('invoice_qr_bundle', 'month', 19900),
  ('invoice_qr_bundle', 'year', 199000);
