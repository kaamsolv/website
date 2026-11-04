CREATE TABLE "recurring_automation" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"auto_create" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"ends_on" date,
	"max_runs" integer,
	"runs_done" integer DEFAULT 0 NOT NULL,
	"ended_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_automation_max_runs" CHECK ("recurring_automation"."max_runs" is null or "recurring_automation"."max_runs" between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "recurring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"created_invoice_id" uuid,
	"status" text DEFAULT 'started' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "recurring_runs_status" CHECK ("recurring_runs"."status" in ('started', 'created', 'skipped', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "recurring_automation" ADD CONSTRAINT "recurring_automation_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_automation" ADD CONSTRAINT "recurring_automation_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_runs" ADD CONSTRAINT "recurring_runs_created_invoice_id_invoices_id_fk" FOREIGN KEY ("created_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_automation_active_idx" ON "recurring_automation" USING btree ("auto_create") WHERE "recurring_automation"."auto_create" and not "recurring_automation"."paused" and "recurring_automation"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_runs_invoice_due_idx" ON "recurring_runs" USING btree ("invoice_id","due_on");--> statement-breakpoint
CREATE INDEX "recurring_runs_user_idx" ON "recurring_runs" USING btree ("user_id","created_at");