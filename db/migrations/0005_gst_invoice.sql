ALTER TABLE "business_profiles" ADD COLUMN "composition" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "signature" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_signature_len" CHECK (char_length("business_profiles"."signature") <= 280000);