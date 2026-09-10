CREATE TYPE "public"."link_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_code" text NOT NULL,
	"destination" text NOT NULL,
	"status" "link_status" DEFAULT 'active' NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"account_id" uuid,
	"anon_session_id" text,
	"click_count" bigint DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "links_short_code_key" ON "links" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "links_account_id_idx" ON "links" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "links_anon_session_id_idx" ON "links" USING btree ("anon_session_id");