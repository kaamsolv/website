CREATE TABLE "accountant_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invite_hash" text,
	"invite_expires_at" timestamp with time zone,
	"accountant_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "accountant_access_status" CHECK ("accountant_access"."status" in ('invited', 'active', 'revoked')),
	CONSTRAINT "accountant_access_name_len" CHECK (char_length("accountant_access"."name") <= 80)
);
--> statement-breakpoint
CREATE TABLE "accountant_access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"access_id" uuid NOT NULL,
	"action" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accountant_access_events_action" CHECK ("accountant_access_events"."action" in ('invited', 'accepted', 'revoked', 'viewed', 'downloaded')),
	CONSTRAINT "accountant_access_events_detail_len" CHECK (char_length("accountant_access_events"."detail") <= 60)
);
--> statement-breakpoint
ALTER TABLE "accountant_access" ADD CONSTRAINT "accountant_access_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_access" ADD CONSTRAINT "accountant_access_accountant_user_id_auth_users_id_fk" FOREIGN KEY ("accountant_user_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_access_events" ADD CONSTRAINT "accountant_access_events_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_access_events" ADD CONSTRAINT "accountant_access_events_access_id_accountant_access_id_fk" FOREIGN KEY ("access_id") REFERENCES "public"."accountant_access"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accountant_access_owner_email_idx" ON "accountant_access" USING btree ("owner_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "accountant_access_invite_idx" ON "accountant_access" USING btree ("invite_hash") WHERE "accountant_access"."invite_hash" is not null;--> statement-breakpoint
CREATE INDEX "accountant_access_user_idx" ON "accountant_access" USING btree ("accountant_user_id") WHERE "accountant_access"."status" = 'active';--> statement-breakpoint
CREATE INDEX "accountant_access_events_owner_idx" ON "accountant_access_events" USING btree ("owner_id","at" DESC NULLS LAST);