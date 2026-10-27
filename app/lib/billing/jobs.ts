/**
 * What the outbox does for a verified subscription payment (billing M2): make the invoice, make its private
 * link, email it. Every step is safe to repeat, so a retry after a crash or a provider error finishes the work
 * instead of doing it twice: the invoice is created once (db/billing-invoice.ts), the link is reused, and the
 * email carries an idempotency key. A failure here never touches the payment or the plan, which were settled
 * by the webhook already.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../../../db/client';
import { issueInvoice } from '../../../db/billing-invoice';
import { ensureLink } from '../../../db/invoice-links';
import type { Db } from '../../../db/links';
import { enqueue, runDue, type JobOutcome, type OutboxJob } from '../../../db/outbox';
import { authUsers, billingPayments, invoices, plans } from '../../../db/schema';
import { BILLING_EMAIL_FROM, sendEmailChecked } from '../email';
import { linkSecret } from '../links/token';
import { siteOrigin } from '../site-origin';
import { summaryJob } from '../notify/summary-job';
import { invoiceEmail } from './email';

/** The public address of an invoice link. */
export function invoiceUrl(token: string, env: Record<string, string | undefined> = process.env): string {
  return `${siteOrigin(env)}/i/${token}`;
}

/** Queues "invoice and email this payment". Safe to call any number of times for the same payment. */
export async function queueInvoiceFor(db: Db, paymentId: string): Promise<boolean> {
  return enqueue(db, 'billing_invoice', `billing_invoice:${paymentId}`, { paymentId });
}

/** Queues another email of the same invoice (the "send it again" button). Never makes a second invoice. */
export async function queueResend(db: Db, paymentId: string, stamp: number = Date.now()): Promise<boolean> {
  return enqueue(db, 'billing_invoice', `billing_invoice_resend:${paymentId}:${Math.floor(stamp / 60_000)}`, { paymentId });
}

/** What a run can be given instead of the real thing (tests do this; production passes nothing). */
export type JobDeps = { env?: Record<string, string | undefined>; send?: typeof sendEmailChecked; secret?: string };

export async function billingInvoiceJob(db: Db, job: OutboxJob, deps: JobDeps = {}): Promise<JobOutcome> {
  const env = deps.env ?? process.env;
  const send = deps.send ?? sendEmailChecked;
  const paymentId = typeof job.payload.paymentId === 'string' ? job.payload.paymentId : '';
  if (!paymentId) return { result: 'sent', ref: 'skipped:no_payment' };

  const issued = await issueInvoice(db, paymentId, env);
  if (!issued.ok) return issued.kind === 'blocked' ? { result: 'blocked', code: issued.code } : { result: 'sent', ref: `skipped:${issued.code}` };

  const [pay] = await db
    .select({ userId: billingPayments.userId, planKey: billingPayments.planKey, amountPaise: billingPayments.amountPaise })
    .from(billingPayments)
    .where(eq(billingPayments.id, paymentId));
  const [owner] = await db.select({ userId: invoices.userId }).from(invoices).where(eq(invoices.id, issued.invoiceId));
  if (!pay?.userId || !owner) return { result: 'sent', ref: 'skipped:nobody_to_send_to' };
  const [buyer] = await db.select({ name: authUsers.name, email: authUsers.email }).from(authUsers).where(eq(authUsers.id, pay.userId));
  if (!buyer) return { result: 'sent', ref: 'skipped:buyer_account_gone' };
  const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.planKey, pay.planKey));

  const link = await ensureLink(db, deps.secret ?? linkSecret(), { invoiceId: issued.invoiceId, userId: owner.userId, purpose: 'billing' });
  const email = invoiceEmail({ to: buyer.email, buyerName: buyer.name, number: issued.number, planName: plan?.name ?? 'KaamSolv', amountPaise: pay.amountPaise, url: invoiceUrl(link.token, env) });
  const sent = await send(email, BILLING_EMAIL_FROM, job.dedupeKey);
  if (sent.ok) return { result: 'sent', ref: sent.id };
  return sent.code === 'email_not_configured' ? { result: 'blocked', code: sent.code } : { result: 'retry', code: sent.code };
}

/**
 * How many jobs one request may run. Every database query is a subrequest, a job is about 25 of them, and the Workers
 * Free plan allows 50 per request (10,000 on Paid), so a request that already did its own work runs ONE job and the
 * scheduled retry runs three. A job that doesn't get run is just picked up by the next schedule.
 */
export const DRAIN_AFTER_REQUEST = 1;
export const DRAIN_SCHEDULED = 3;

/** Runs whatever is due. Called right after a webhook (the fast path) and by the scheduled retry. */
export async function drainOutbox(limit = DRAIN_SCHEDULED) {
  const db = await getDb();
  return runDue(db, { billing_invoice: (job) => billingInvoiceJob(db, job), receivables_summary: (job) => summaryJob(db, job) }, limit);
}
