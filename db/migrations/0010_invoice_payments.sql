CREATE TABLE "invoice_payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payment_events_action" CHECK ("invoice_payment_events"."action" in ('recorded', 'voided', 'edited'))
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"client_key" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_amount" CHECK ("invoice_payments"."amount" > 0),
	CONSTRAINT "invoice_payments_method" CHECK ("invoice_payments"."method" in ('upi', 'bank', 'cash', 'card', 'cheque', 'other')),
	CONSTRAINT "invoice_payments_reference_len" CHECK (char_length("invoice_payments"."reference") <= 100),
	CONSTRAINT "invoice_payments_note_len" CHECK (char_length("invoice_payments"."note") <= 400),
	CONSTRAINT "invoice_payments_void_reason_len" CHECK (char_length("invoice_payments"."void_reason") <= 200)
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_paid" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_payment_events" ADD CONSTRAINT "invoice_payment_events_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment_events" ADD CONSTRAINT "invoice_payment_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment_events" ADD CONSTRAINT "invoice_payment_events_payment_id_invoice_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."invoice_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_payment_events_payment_idx" ON "invoice_payment_events" USING btree ("payment_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_payments_user_client_key_idx" ON "invoice_payments" USING btree ("user_id","client_key");--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_idx" ON "invoice_payments" USING btree ("invoice_id","paid_on");--> statement-breakpoint
CREATE INDEX "invoice_payments_user_paid_on_idx" ON "invoice_payments" USING btree ("user_id","paid_on") WHERE "invoice_payments"."voided_at" is null;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_paid" CHECK ("invoices"."amount_paid" >= 0);--> statement-breakpoint
-- ── The payment ledger's rules, enforced by the database ─────────────────────────────────────────────────
-- Source of truth: the non-voided rows of invoice_payments. invoices.amount_paid is always recomputed from them
-- (never incremented), and invoices.status follows it: 'paid' means amount_paid >= total (and > 0). The enum is
-- unchanged: "partially paid" is status 'unpaid' with amount_paid > 0. Existing 'paid' invoices keep status 'paid'
-- with amount_paid 0 — "marked paid, no payments recorded". Nothing is backfilled and no payment is invented.
-- The checks live in AFTER triggers so a repeated idempotency key (INSERT … ON CONFLICT DO NOTHING) changes nothing.

-- Recompute an invoice's received total from its ledger, under the invoice row's lock. Two payments at the same
-- instant are applied one after the other; the second sees the first and is refused if the invoice is covered.
CREATE FUNCTION "invoice_payments_sync"(p_invoice uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  inv_total numeric(14,2);
  received numeric(14,2);
BEGIN
  SELECT total INTO inv_total FROM invoices WHERE id = p_invoice FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT coalesce(sum(amount), 0) INTO received FROM invoice_payments WHERE invoice_id = p_invoice AND voided_at IS NULL;
  IF received > inv_total THEN
    RAISE EXCEPTION 'payment_exceeds';
  END IF;
  UPDATE invoices SET amount_paid = received WHERE id = p_invoice;
END
$$;
--> statement-breakpoint
-- A new payment: the invoice must be the same user's own invoice (not a quotation), in the same currency; the date
-- must be real and not in the future (a day of slack for time zones); an invoice holds at most 200 entries.
CREATE FUNCTION "invoice_payments_after_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv record;
  n integer;
BEGIN
  SELECT user_id, kind, currency INTO inv FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'payment_owner';
  END IF;
  IF inv.kind <> 'invoice' THEN
    RAISE EXCEPTION 'payment_quote';
  END IF;
  IF inv.currency <> NEW.currency THEN
    RAISE EXCEPTION 'payment_currency';
  END IF;
  IF NEW.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'payment_immutable';
  END IF;
  IF NEW.paid_on > (now() AT TIME ZONE 'UTC')::date + 1 OR NEW.paid_on < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'payment_date';
  END IF;
  SELECT count(*) INTO n FROM invoice_payments WHERE invoice_id = NEW.invoice_id;
  IF n > 200 THEN
    RAISE EXCEPTION 'payment_cap';
  END IF;
  PERFORM invoice_payments_sync(NEW.invoice_id);
  INSERT INTO invoice_payment_events (user_id, invoice_id, payment_id, action, detail)
    VALUES (NEW.user_id, NEW.invoice_id, NEW.id, 'recorded',
            jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency, 'paid_on', NEW.paid_on, 'method', NEW.method, 'reference', NEW.reference));
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- A payment can't be moved, re-valued or re-dated, and a voided one is frozen. Only reference and note may change
-- (and a payment is voided once, never un-voided).
CREATE FUNCTION "invoice_payments_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.invoice_id <> OLD.invoice_id OR NEW.amount <> OLD.amount
     OR NEW.currency <> OLD.currency OR NEW.paid_on <> OLD.paid_on OR NEW.method <> OLD.method
     OR NEW.client_key <> OLD.client_key OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'payment_immutable';
  END IF;
  IF OLD.voided_at IS NOT NULL AND (NEW.voided_at IS DISTINCT FROM OLD.voided_at OR NEW.void_reason <> OLD.void_reason
     OR NEW.reference <> OLD.reference OR NEW.note <> OLD.note) THEN
    RAISE EXCEPTION 'payment_voided';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Voiding gives the amount back to the invoice; editing a note or reference goes to the audit trail.
CREATE FUNCTION "invoice_payments_after_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    PERFORM invoice_payments_sync(NEW.invoice_id);
    INSERT INTO invoice_payment_events (user_id, invoice_id, payment_id, action, detail)
      VALUES (NEW.user_id, NEW.invoice_id, NEW.id, 'voided', jsonb_build_object('amount', NEW.amount, 'reason', NEW.void_reason));
  ELSIF NEW.reference <> OLD.reference OR NEW.note <> OLD.note THEN
    INSERT INTO invoice_payment_events (user_id, invoice_id, payment_id, action, detail)
      VALUES (NEW.user_id, NEW.invoice_id, NEW.id, 'edited',
              jsonb_build_object('reference', jsonb_build_array(OLD.reference, NEW.reference), 'note', jsonb_build_array(OLD.note, NEW.note)));
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "invoice_payments_guard" BEFORE UPDATE ON "invoice_payments" FOR EACH ROW EXECUTE FUNCTION "invoice_payments_guard"();--> statement-breakpoint
CREATE TRIGGER "invoice_payments_ai" AFTER INSERT ON "invoice_payments" FOR EACH ROW EXECUTE FUNCTION "invoice_payments_after_insert"();--> statement-breakpoint
CREATE TRIGGER "invoice_payments_au" AFTER UPDATE ON "invoice_payments" FOR EACH ROW EXECUTE FUNCTION "invoice_payments_after_update"();--> statement-breakpoint
-- The invoice side. Once an invoice has payments its currency and type are fixed and its total can't fall below
-- what was received; status and paid_at are derived from the ledger, whatever a caller tried to set. With no
-- payments, nothing can flip an invoice from unpaid to paid, so "fully paid with a balance outstanding" can't exist.
CREATE FUNCTION "invoices_ledger_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_paid > 0 OR OLD.amount_paid > 0 THEN
    IF OLD.amount_paid > 0 AND (NEW.currency <> OLD.currency OR NEW.kind <> OLD.kind) THEN
      RAISE EXCEPTION 'invoice_has_payments';
    END IF;
    IF NEW.total < NEW.amount_paid THEN
      RAISE EXCEPTION 'invoice_total_below_paid';
    END IF;
    IF NEW.amount_paid > 0 AND NEW.amount_paid >= NEW.total THEN
      NEW.status := 'paid';
      IF NOT (OLD.status = 'paid' AND OLD.amount_paid > 0 AND OLD.paid_at IS NOT NULL AND OLD.amount_paid = NEW.amount_paid) THEN
        NEW.paid_at := (SELECT max(paid_on) FROM invoice_payments WHERE invoice_id = NEW.id AND voided_at IS NULL)::timestamp AT TIME ZONE 'UTC';
      END IF;
    ELSE
      NEW.status := 'unpaid';
      NEW.paid_at := NULL;
    END IF;
  ELSIF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
    RAISE EXCEPTION 'invoice_unsettled';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "invoices_ledger_guard" BEFORE UPDATE OF "total", "currency", "kind", "status", "amount_paid" ON "invoices" FOR EACH ROW EXECUTE FUNCTION "invoices_ledger_guard"();--> statement-breakpoint
-- Recording and viewing payments is basic recordkeeping, so every account has it. Collection analytics and reports are Pro, later.
INSERT INTO "plan_features" ("plan_key", "feature_key", "limit_value") VALUES
  ('free_account', 'invoice_payments', NULL),
  ('invoice_pro', 'invoice_payments', NULL);
