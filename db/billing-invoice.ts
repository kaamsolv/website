/**
 * Issues KaamSolv's own sales invoice for a verified subscription payment (billing M2). Framework-free; takes
 * an explicit `db`.
 *
 * The invoice lives in the seller's own KaamSolv account (BILLING_SELLER_EMAIL), numbered by that account's
 * ordinary invoice numbering and recorded in its ordinary payment ledger, so the seller sees these sales in
 * Invoices, Payments & collections and Reports like any other. Nothing here is a second invoicing system.
 *
 * Safe to run again at any point: "claim the payment, take the next number, save the invoice, link them" is ONE
 * statement (the number can't be taken twice or skipped, and a payment can't get two invoices); the ledger entry
 * uses the payment's own id as its idempotency key.
 */

import { eq, sql } from 'drizzle-orm';
import { billingConfig, buildSubscriptionInvoice } from '../app/lib/billing/invoice.ts';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import { getProfile } from './invoices.ts';
import type { Db } from './links.ts';
import { recordPayment } from './payments.ts';
import { authUsers, billingPayments, plans } from './schema.ts';

export type IssueResult =
  | { ok: true; invoiceId: string; number: string; created: boolean }
  /** Can't be made until a setting is fixed; the job waits and is shown as blocked. */
  | { ok: false; kind: 'blocked'; code: string }
  /** Nothing to make (refunded, failed, or the buyer's account is gone). Not a problem to retry. */
  | { ok: false; kind: 'skip'; code: string };

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

/** Today's date in India, YYYY-MM-DD: the date printed on the invoice and used for the ledger entry. */
export const indiaDate = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

export async function issueInvoice(db: Db, paymentId: string, env: Record<string, string | undefined> = process.env): Promise<IssueResult> {
  const [pay] = await db.select().from(billingPayments).where(eq(billingPayments.id, paymentId));
  if (!pay) return { ok: false, kind: 'skip', code: 'payment_not_found' };
  if (pay.status !== 'paid' && pay.status !== 'disputed') return { ok: false, kind: 'skip', code: `payment_is_${pay.status}` };
  if (!pay.userId) return { ok: false, kind: 'skip', code: 'buyer_account_gone' };

  const cfg = billingConfig(env);
  if (!cfg.treatment || !cfg.sellerEmail) return { ok: false, kind: 'blocked', code: cfg.problem ?? 'billing_not_configured' };

  const [seller] = await db.select({ id: authUsers.id }).from(authUsers).where(sql`lower(${authUsers.email}) = ${cfg.sellerEmail}`);
  if (!seller) return { ok: false, kind: 'blocked', code: 'seller_account_missing' };
  const profile = await getProfile(db, seller.id);
  if (!profile) return { ok: false, kind: 'blocked', code: 'seller_not_configured' };

  let invoiceId = pay.invoiceId;
  let number: string | null = null;
  let created = false;

  if (!pay.invoicedAt) {
    const [buyer] = await db.select({ name: authUsers.name, email: authUsers.email }).from(authUsers).where(eq(authUsers.id, pay.userId));
    if (!buyer) return { ok: false, kind: 'skip', code: 'buyer_account_gone' };
    const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.planKey, pay.planKey));
    const paidAt = pay.paidAt ?? new Date();
    const built = buildSubscriptionInvoice({
      seller: profile,
      buyer: { name: buyer.name, email: buyer.email },
      planName: plan?.name ?? 'KaamSolv plan',
      period: pay.period === 'year' ? 'year' : 'month',
      amountPaise: pay.amountPaise,
      paidOn: indiaDate(paidAt),
      treatment: cfg.treatment,
      sac: cfg.sac,
    });
    if (!built.ok) return { ok: false, kind: 'blocked', code: built.code };

    const doc = built.doc;
    const total = computeTotals(doc).total;
    const { logo: _logo, customerId: _customerId, signature: _signature, ...stored } = doc;
    const number$ = sql`(n.invoice_prefix || repeat('0', greatest(0, 4 - length(n.seq::text))) || n.seq::text)`;
    const result = await db.execute(sql`
      WITH cand AS (
        SELECT id FROM billing_payments
         WHERE id = ${pay.id}::uuid AND invoiced_at IS NULL
           AND EXISTS (SELECT 1 FROM business_profiles WHERE user_id = ${seller.id}::uuid)
           FOR UPDATE
      ), n AS (
        UPDATE business_profiles SET next_number = next_number + 1
         WHERE user_id = ${seller.id}::uuid AND EXISTS (SELECT 1 FROM cand)
        RETURNING invoice_prefix, next_number - 1 AS seq
      ), ins AS (
        INSERT INTO invoices (user_id, number, client_name, currency, total, issue_date, due_date, kind, data)
        SELECT ${seller.id}::uuid, ${number$}, ${doc.client.name}, 'INR', ${total}, ${doc.issueDate}::date, ${doc.dueDate}::date, 'invoice',
               jsonb_set(${JSON.stringify(stored)}::jsonb, '{number}', to_jsonb(${number$}))
          FROM n
        RETURNING id, number
      )
      UPDATE billing_payments SET invoice_id = ins.id, invoiced_at = now(), updated_at = now()
        FROM ins WHERE billing_payments.id = ${pay.id}::uuid AND billing_payments.invoiced_at IS NULL
      RETURNING ins.id AS id, ins.number AS number`);
    const row = rowsOf<{ id: string; number: string }>(result)[0];
    if (row) {
      invoiceId = row.id;
      number = row.number;
      created = true;
    } else {
      // Another run claimed it first (or the profile vanished). Read what that run made.
      const [again] = await db.select({ invoiceId: billingPayments.invoiceId, invoicedAt: billingPayments.invoicedAt }).from(billingPayments).where(eq(billingPayments.id, pay.id));
      invoiceId = again?.invoiceId ?? null;
      if (!invoiceId) return { ok: false, kind: 'blocked', code: again?.invoicedAt ? 'invoice_missing' : 'seller_not_configured' };
    }
  }
  if (!invoiceId) return { ok: false, kind: 'skip', code: 'invoice_deleted_by_seller' };

  if (number === null) {
    const r = rowsOf<{ number: string }>(await db.execute(sql`select number from invoices where id = ${invoiceId}::uuid`))[0];
    if (!r) return { ok: false, kind: 'skip', code: 'invoice_deleted_by_seller' };
    number = r.number;
  }

  // The sale was paid through Razorpay: record it in the seller's ledger so the invoice reads Paid. The payment's
  // own id is the idempotency key, so a rerun is a no-op.
  const ledger = await recordPayment(db, seller.id, invoiceId, {
    amountCents: pay.amountPaise,
    paidOn: indiaDate(pay.paidAt ?? new Date()),
    method: 'other',
    reference: pay.razorpayPaymentId ?? '',
    note: 'Razorpay',
    clientKey: pay.id,
    reconcile: false,
  });
  if (!ledger.ok && ledger.reason !== 'exceeds') return { ok: false, kind: 'blocked', code: `ledger_${ledger.reason}` };

  return { ok: true, invoiceId, number, created };
}
