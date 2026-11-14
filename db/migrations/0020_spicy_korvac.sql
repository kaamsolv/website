ALTER TABLE "affiliate_events" DROP CONSTRAINT "affiliate_events_action";--> statement-breakpoint
ALTER TABLE "programme_memberships" DROP CONSTRAINT "programme_memberships_status";--> statement-breakpoint
ALTER TABLE "programme_applications" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme_applications" ADD COLUMN "channel" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme_applications" ADD COLUMN "country" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme_memberships" ADD COLUMN "status_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme_memberships" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_events" ADD CONSTRAINT "affiliate_events_action" CHECK ("affiliate_events"."action" in ('applied', 'withdrawn', 'approved', 'rejected', 'suspended', 'reinstated', 'programme_opened', 'programme_closed', 'portal_created', 'portal_edited'));--> statement-breakpoint
ALTER TABLE "programme_applications" ADD CONSTRAINT "programme_applications_category" CHECK ("programme_applications"."category" = '' or "programme_applications"."category" in ('teacher', 'parenting_creator', 'influencer', 'blogger', 'youtuber', 'community_admin', 'referral_partner', 'other'));--> statement-breakpoint
ALTER TABLE "programme_applications" ADD CONSTRAINT "programme_applications_channel" CHECK ("programme_applications"."channel" = '' or "programme_applications"."channel" in ('instagram', 'youtube', 'facebook', 'whatsapp', 'website', 'newsletter', 'in_person', 'other'));--> statement-breakpoint
ALTER TABLE "programme_applications" ADD CONSTRAINT "programme_applications_country_len" CHECK (char_length("programme_applications"."country") <= 60);--> statement-breakpoint
ALTER TABLE "programme_memberships" ADD CONSTRAINT "programme_memberships_note_len" CHECK (char_length("programme_memberships"."status_note") <= 300);--> statement-breakpoint
ALTER TABLE "programme_memberships" ADD CONSTRAINT "programme_memberships_status" CHECK ("programme_memberships"."status" in ('active', 'suspended'));