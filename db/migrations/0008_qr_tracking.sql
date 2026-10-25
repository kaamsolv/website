CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_codes_kind" CHECK ("qr_codes"."kind" in ('url', 'whatsapp', 'social', 'file')),
	CONSTRAINT "qr_codes_name_len" CHECK (char_length("qr_codes"."name") between 1 and 80),
	CONSTRAINT "qr_codes_data_len" CHECK (length("qr_codes"."payload"::text) + length("qr_codes"."design"::text) <= 64000)
);
--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_codes_link_id_key" ON "qr_codes" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "qr_codes_user_id_created_at_idx" ON "qr_codes" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Seed: a free account may track 3 QR codes; qr_pro (granted by hand for now) has no limit.
INSERT INTO "plans" ("plan_key", "name") VALUES ('qr_pro', 'QR Pro');--> statement-breakpoint
INSERT INTO "plan_features" ("plan_key", "feature_key", "limit_value") VALUES
  ('free_account', 'qr_dynamic', 3),
  ('qr_pro', 'qr_dynamic', NULL);
