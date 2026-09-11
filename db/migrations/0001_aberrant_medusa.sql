CREATE TYPE "public"."device_class" AS ENUM('desktop', 'mobile', 'tablet', 'bot', 'unknown');--> statement-breakpoint
CREATE TABLE "click_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "click_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"link_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"referrer_host" text,
	"country" text,
	"device_class" "device_class" DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "click_events_country_iso2" CHECK ("click_events"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "click_events_referrer_host_len" CHECK (char_length("click_events"."referrer_host") <= 253)
);
--> statement-breakpoint
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "click_events_link_id_occurred_at_idx" ON "click_events" USING btree ("link_id","occurred_at");