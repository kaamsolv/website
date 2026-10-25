ALTER TABLE "invoices" ADD COLUMN "recur_every" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recur_next" date;--> statement-breakpoint
CREATE INDEX "invoices_user_recur_next_idx" ON "invoices" USING btree ("user_id","recur_next") WHERE "invoices"."recur_next" is not null;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recur_every" CHECK ("invoices"."recur_every" is null or "invoices"."recur_every" in ('week', 'month', 'quarter', 'year'));