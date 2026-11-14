CREATE TABLE "affiliate_clicks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "affiliate_clicks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"link_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"referrer_host" text,
	"country" text,
	"device_class" "device_class" DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "affiliate_clicks_country_iso2" CHECK ("affiliate_clicks"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "affiliate_clicks_referrer_host_len" CHECK (char_length("affiliate_clicks"."referrer_host") <= 253)
);
--> statement-breakpoint
CREATE TABLE "affiliate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"affiliate_user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_links_code_shape" CHECK ("affiliate_links"."code" ~ '^[0-9A-Za-z]{6,12}$')
);
--> statement-breakpoint
ALTER TABLE "affiliate_events" DROP CONSTRAINT "affiliate_events_action";--> statement-breakpoint
ALTER TABLE "programmes" ADD COLUMN "destination_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_link_id_affiliate_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_membership_id_programme_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."programme_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_affiliate_user_id_auth_users_id_fk" FOREIGN KEY ("affiliate_user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_clicks_link_idx" ON "affiliate_clicks" USING btree ("link_id","occurred_at");--> statement-breakpoint
CREATE INDEX "affiliate_clicks_merchant_idx" ON "affiliate_clicks" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_membership_key" ON "affiliate_links" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_merchant_code_key" ON "affiliate_links" USING btree ("merchant_id","code");--> statement-breakpoint
CREATE INDEX "affiliate_links_affiliate_idx" ON "affiliate_links" USING btree ("affiliate_user_id");--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_action" CHECK ("affiliate_events"."action" in ('applied', 'withdrawn', 'approved', 'rejected', 'suspended', 'reinstated', 'programme_opened', 'programme_closed', 'portal_created', 'portal_edited', 'merchant_suspended', 'merchant_reinstated', 'link_created', 'destination_saved'));--> statement-breakpoint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_destination_len" CHECK (char_length("programmes"."destination_url") <= 500);