CREATE TABLE "affiliate_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "affiliate_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"merchant_id" uuid NOT NULL,
	"affiliate_user_id" uuid,
	"actor_user_id" uuid,
	"application_id" uuid,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_events_action" CHECK ("affiliate_events"."action" in ('applied', 'withdrawn', 'approved', 'rejected', 'programme_opened', 'programme_closed'))
);
--> statement-breakpoint
CREATE TABLE "affiliate_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_profiles_name_len" CHECK (char_length("affiliate_profiles"."display_name") between 1 and 80),
	CONSTRAINT "affiliate_profiles_website_len" CHECK (char_length("affiliate_profiles"."website") <= 200)
);
--> statement-breakpoint
CREATE TABLE "programme_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"affiliate_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"decision_note" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programme_applications_status" CHECK ("programme_applications"."status" in ('pending', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "programme_applications_message_len" CHECK (char_length("programme_applications"."message") <= 500),
	CONSTRAINT "programme_applications_note_len" CHECK (char_length("programme_applications"."decision_note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "programme_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"affiliate_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programme_memberships_status" CHECK ("programme_memberships"."status" in ('active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programmes_status" CHECK ("programmes"."status" in ('open', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_affiliate_user_id_auth_users_id_fk" FOREIGN KEY ("affiliate_user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_applications" ADD CONSTRAINT "programme_applications_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_applications" ADD CONSTRAINT "programme_applications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_applications" ADD CONSTRAINT "programme_applications_affiliate_user_id_auth_users_id_fk" FOREIGN KEY ("affiliate_user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_memberships" ADD CONSTRAINT "programme_memberships_programme_id_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_memberships" ADD CONSTRAINT "programme_memberships_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_memberships" ADD CONSTRAINT "programme_memberships_affiliate_user_id_auth_users_id_fk" FOREIGN KEY ("affiliate_user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_events_merchant_idx" ON "affiliate_events" USING btree ("merchant_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "affiliate_events_affiliate_idx" ON "affiliate_events" USING btree ("affiliate_user_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "programme_applications_one_pending_idx" ON "programme_applications" USING btree ("programme_id","affiliate_user_id") WHERE "programme_applications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "programme_applications_merchant_idx" ON "programme_applications" USING btree ("merchant_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "programme_applications_affiliate_idx" ON "programme_applications" USING btree ("affiliate_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "programme_memberships_programme_affiliate_key" ON "programme_memberships" USING btree ("programme_id","affiliate_user_id");--> statement-breakpoint
CREATE INDEX "programme_memberships_affiliate_idx" ON "programme_memberships" USING btree ("affiliate_user_id");--> statement-breakpoint
CREATE INDEX "programme_memberships_merchant_idx" ON "programme_memberships" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programmes_merchant_id_key" ON "programmes" USING btree ("merchant_id");--> statement-breakpoint
CREATE FUNCTION "affiliate_events_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'affiliate_events is append-only';
  END IF;
  -- A direct DELETE runs this trigger at depth 1. Removing a merchant or an account cascades from inside another
  -- trigger (depth 2 or more), which is the one way rows may go.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'affiliate_events is append-only';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "affiliate_events_append_only" BEFORE UPDATE OR DELETE ON "affiliate_events" FOR EACH ROW EXECUTE FUNCTION "affiliate_events_guard"();
