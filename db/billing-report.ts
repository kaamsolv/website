/**
 * What an operator needs to see about billing, read-only (billing M2.5). Framework-free; takes an explicit `db`.
 * Counts and ids only: no names, emails, amounts per person or message bodies. Printed by `npm run billing:status`
 * (db/billing-status.mts).
 */

import { sql } from 'drizzle-orm';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export type BillingReport = {
  payments: { status: string; n: number }[];
  /** Paid, and the invoice isn't made yet: the seller isn't configured, the job is waiting, or it failed. */
  paidNotInvoiced: { id: string; paidAt: string | null; ageMinutes: number }[];
  /** Checkouts started more than an hour ago that were never paid (abandoned or failed). */
  staleCheckouts: number;
  outbox: { status: string; n: number }[];
  stuckJobs: { id: string; kind: string; status: string; attempts: number; lastError: string; ageMinutes: number }[];
  problemEvents: { eventId: string; type: string; status: string; detail: string; ageMinutes: number }[];
};

export async function billingReport(db: Db, limit = 20): Promise<BillingReport> {
  const payments = rowsOf<{ status: string; n: number }>(await db.execute(sql`select status, count(*)::int as n from billing_payments group by status order by status`));
  const paidNotInvoiced = rowsOf<{ id: string; paid_at: string | null; age: number }>(
    await db.execute(sql`
      select id, paid_at, (extract(epoch from now() - coalesce(paid_at, created_at)) / 60)::int as age
        from billing_payments where status = 'paid' and invoiced_at is null order by paid_at limit ${limit}`),
  ).map((r) => ({ id: r.id, paidAt: r.paid_at, ageMinutes: r.age }));
  const [stale] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from billing_payments where status in ('created', 'failed') and created_at < now() - interval '1 hour'`));
  const outbox = rowsOf<{ status: string; n: number }>(await db.execute(sql`select status, count(*)::int as n from outbox group by status order by status`));
  const stuckJobs = rowsOf<{ id: string; kind: string; status: string; attempts: number; last_error: string; age: number }>(
    await db.execute(sql`
      select id, kind, status, attempts, last_error, (extract(epoch from now() - updated_at) / 60)::int as age
        from outbox where status in ('dead', 'blocked', 'failed') order by updated_at desc limit ${limit}`),
  ).map((r) => ({ id: r.id, kind: r.kind, status: r.status, attempts: r.attempts, lastError: r.last_error, ageMinutes: r.age }));
  const problemEvents = rowsOf<{ provider_event_id: string; event_type: string; status: string; detail: string; age: number }>(
    await db.execute(sql`
      select provider_event_id, event_type, status, detail, (extract(epoch from now() - received_at) / 60)::int as age
        from billing_events where status in ('failed', 'received') order by received_at desc limit ${limit}`),
  ).map((r) => ({ eventId: r.provider_event_id, type: r.event_type, status: r.status, detail: r.detail, ageMinutes: r.age }));
  return { payments, paidNotInvoiced, staleCheckouts: stale?.n ?? 0, outbox, stuckJobs, problemEvents };
}

/** Which billing settings this machine's environment has (names only, never values). */
export function billingSettingsPresent(env: Record<string, string | undefined> = process.env): { name: string; set: boolean }[] {
  return ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'BILLING_SELLER_EMAIL', 'BILLING_TAX_TREATMENT', 'BILLING_TAX_RATE', 'BILLING_SAC', 'CRON_SECRET', 'RESEND_API_KEY'].map((name) => ({
    name,
    set: Boolean(env[name]?.trim()),
  }));
}
