CREATE TABLE "merchant_brand_settings" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"logo" text,
	"brand_colour" text DEFAULT '#FE6336' NOT NULL,
	"programme_name" text DEFAULT '' NOT NULL,
	"programme_description" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_brand_colour" CHECK ("merchant_brand_settings"."brand_colour" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "merchant_brand_logo_len" CHECK (char_length("merchant_brand_settings"."logo") <= 280000),
	CONSTRAINT "merchant_brand_programme_name_len" CHECK (char_length("merchant_brand_settings"."programme_name") <= 80),
	CONSTRAINT "merchant_brand_description_len" CHECK (char_length("merchant_brand_settings"."programme_description") <= 500),
	CONSTRAINT "merchant_brand_terms_len" CHECK (char_length("merchant_brand_settings"."terms") <= 10000)
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_slug_shape" CHECK ("merchants"."slug" ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
	CONSTRAINT "merchants_name_len" CHECK (char_length("merchants"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "merchant_brand_settings" ADD CONSTRAINT "merchant_brand_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_owner_user_id_auth_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_owner_user_id_key" ON "merchants" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants" USING btree ("slug");