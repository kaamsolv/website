CREATE TABLE "qr_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_campaigns_name_len" CHECK (char_length("qr_campaigns"."name") between 1 and 80),
	CONSTRAINT "qr_campaigns_description_len" CHECK (char_length("qr_campaigns"."description") <= 500),
	CONSTRAINT "qr_campaigns_dates" CHECK ("qr_campaigns"."ends_on" is null or "qr_campaigns"."starts_on" is null or "qr_campaigns"."ends_on" >= "qr_campaigns"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "qr_campaigns" ADD CONSTRAINT "qr_campaigns_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_campaigns_user_name_key" ON "qr_campaigns" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_campaign_id_qr_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."qr_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_codes_user_id_campaign_id_idx" ON "qr_codes" USING btree ("user_id","campaign_id");--> statement-breakpoint
-- Seed: campaigns, scan breakdowns (and the 90-day range) and CSV export are QR Pro, hidden until payments exist.
INSERT INTO "plan_features" ("plan_key", "feature_key", "limit_value") VALUES
  ('qr_pro', 'qr_campaigns', NULL),
  ('qr_pro', 'qr_breakdowns', NULL),
  ('qr_pro', 'qr_export', NULL);
--> statement-breakpoint
-- The QR limit, enforced by the database. The app checks the plan's limit before inserting, but under
-- Postgres's default isolation two saves in the same instant could both see room. This trigger takes a
-- per-user lock, then counts with a fresh snapshot, so the second save waits for the first and is refused.
-- The plan's limit arrives as a transaction-local setting ('kk.qr_limit'); with none, only the 2,000 hard cap applies.
CREATE FUNCTION "qr_codes_enforce_limit"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cap integer := least(coalesce(nullif(current_setting('kk.qr_limit', true), '')::integer, 2000), 2000);
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('qr_codes:' || NEW.user_id::text, 0));
  SELECT count(*) INTO n FROM qr_codes WHERE user_id = NEW.user_id;
  IF n >= cap THEN
    RAISE EXCEPTION 'qr_limit';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Also fires when a row is moved to another user (UPDATE OF user_id), so that can't slip past the limit either.
CREATE TRIGGER "qr_codes_enforce_limit" BEFORE INSERT OR UPDATE OF "user_id" ON "qr_codes" FOR EACH ROW EXECUTE FUNCTION "qr_codes_enforce_limit"();
