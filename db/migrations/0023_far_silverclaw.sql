CREATE TABLE "affiliate_coupon_codes" (
	"merchant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_coupon_codes_merchant_id_code_pk" PRIMARY KEY("merchant_id","code"),
	CONSTRAINT "affiliate_coupon_codes_owner_key" UNIQUE("merchant_id","code","membership_id"),
	CONSTRAINT "affiliate_coupon_codes_shape" CHECK ("affiliate_coupon_codes"."code" ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$')
);
--> statement-breakpoint
CREATE TABLE "affiliate_coupon_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"code" text NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"active_to" timestamp with time zone,
	CONSTRAINT "affiliate_coupon_periods_range" CHECK ("affiliate_coupon_periods"."active_to" is null or "affiliate_coupon_periods"."active_to" > "affiliate_coupon_periods"."active_from")
);
--> statement-breakpoint
CREATE TABLE "affiliate_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"affiliate_user_id" uuid NOT NULL,
	"external_order_id" text NOT NULL,
	"order_number" text NOT NULL,
	"currency" text NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"store_modified_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"status_rank" integer NOT NULL,
	"woo_status" text NOT NULL,
	"sale_paise" bigint NOT NULL,
	"refunded_paise" bigint DEFAULT 0 NOT NULL,
	"coupon_code" text NOT NULL,
	"version_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_orders_status" CHECK ("affiliate_orders"."status" in ('pending', 'processing', 'completed', 'cancelled', 'refunded')),
	CONSTRAINT "affiliate_orders_currency" CHECK ("affiliate_orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "affiliate_orders_amounts" CHECK ("affiliate_orders"."sale_paise" >= 0 and "affiliate_orders"."refunded_paise" >= 0),
	CONSTRAINT "affiliate_orders_text_len" CHECK (char_length("affiliate_orders"."order_number") <= 40 and char_length("affiliate_orders"."external_order_id") <= 20 and char_length("affiliate_orders"."woo_status") <= 40)
);
--> statement-breakpoint
CREATE TABLE "store_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"last_received_at" timestamp with time zone,
	"ambiguous_orders" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_connections_secret_version" CHECK ("store_connections"."secret_version" >= 1),
	CONSTRAINT "store_connections_ambiguous" CHECK ("store_connections"."ambiguous_orders" >= 0)
);
--> statement-breakpoint
ALTER TABLE "affiliate_events" DROP CONSTRAINT "affiliate_events_action";--> statement-breakpoint
ALTER TABLE "affiliate_coupon_codes" ADD CONSTRAINT "affiliate_coupon_codes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_coupon_codes" ADD CONSTRAINT "affiliate_coupon_codes_membership_id_programme_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."programme_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_coupon_periods" ADD CONSTRAINT "affiliate_coupon_periods_owner_fk" FOREIGN KEY ("merchant_id","code","membership_id") REFERENCES "public"."affiliate_coupon_codes"("merchant_id","code","membership_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_orders" ADD CONSTRAINT "affiliate_orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_orders" ADD CONSTRAINT "affiliate_orders_membership_id_programme_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."programme_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_orders" ADD CONSTRAINT "affiliate_orders_affiliate_user_id_auth_users_id_fk" FOREIGN KEY ("affiliate_user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_connections" ADD CONSTRAINT "store_connections_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_coupon_codes_membership_idx" ON "affiliate_coupon_codes" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_coupon_periods_one_open_per_membership" ON "affiliate_coupon_periods" USING btree ("membership_id") WHERE "affiliate_coupon_periods"."active_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_coupon_periods_one_open_per_code" ON "affiliate_coupon_periods" USING btree ("merchant_id","code") WHERE "affiliate_coupon_periods"."active_to" is null;--> statement-breakpoint
CREATE INDEX "affiliate_coupon_periods_lookup_idx" ON "affiliate_coupon_periods" USING btree ("merchant_id","code","active_from");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_orders_merchant_external_key" ON "affiliate_orders" USING btree ("merchant_id","external_order_id");--> statement-breakpoint
CREATE INDEX "affiliate_orders_membership_idx" ON "affiliate_orders" USING btree ("membership_id","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "affiliate_orders_merchant_idx" ON "affiliate_orders" USING btree ("merchant_id","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "store_connections_merchant_key" ON "store_connections" USING btree ("merchant_id");--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_action" CHECK ("affiliate_events"."action" in ('applied', 'withdrawn', 'approved', 'rejected', 'suspended', 'reinstated', 'programme_opened', 'programme_closed', 'portal_created', 'portal_edited', 'merchant_suspended', 'merchant_reinstated', 'link_created', 'destination_saved', 'store_connected', 'store_secret_rotated', 'store_disconnected', 'coupon_set', 'coupon_cleared'));