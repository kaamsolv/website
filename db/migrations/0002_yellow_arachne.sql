CREATE TYPE "public"."report_reason" AS ENUM('phishing', 'malware', 'spam', 'illegal', 'other');--> statement-breakpoint
CREATE TABLE "link_reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "link_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"link_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"reporter_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_reports_details_len" CHECK (char_length("link_reports"."details") <= 500)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "screened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "link_reports" ADD CONSTRAINT "link_reports_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_reports_link_id_created_at_idx" ON "link_reports" USING btree ("link_id","created_at");--> statement-breakpoint
CREATE INDEX "link_reports_created_at_idx" ON "link_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rate_limits_reset_at_idx" ON "rate_limits" USING btree ("reset_at");