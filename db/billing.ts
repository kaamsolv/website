/**
 * KaamSolv's own subscription sales (billing, M1): prices, checkout rows, and what a verified Razorpay
 * webhook does to them. Framework-free; takes an explicit `db` like the rest of db/.
 *
 * Neon over HTTP can't hold a transaction across statements, so the one step that must not be half-done —
 * "mark this payment paid AND switch the plan on" — is a single SQL statement. Every other step is a
 * single guarded statement too, so a delivery that dies part-way and is redelivered finishes correctly
 * and a duplicate delivery changes nothing. The browser's "success" screen is never consulted.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { plansGranted, type BillingPeriod } from '../app/lib/billing/plans.ts';
import type { BillingEvent } from '../app/lib/billing/razorpay.ts';
import type { Db } from './links.ts';
import { enqueue } from './outbox.ts';
import { billingEvents, billingPayments, invoices, planPrices, plans, subscriptions } from './schema.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export type Price = { planKey: string; name: string; period: BillingPeriod; amountPaise: number; currency: string };

/** Every active price, cheapest plan first, for the billing page. */
export async function listPrices(db: Db): Promise<Price[]> {
  const rows = await db
    .select({ planKey: planPrices.planKey, name: plans.name, period: planPrices.period, amountPaise: planPrices.amountPaise, currency: planPrices.currency })
    .from(planPrices)
    .innerJoin(plans, eq(plans.planKey, planPrices.planKey))
    .where(eq(planPrices.active, true))
    .orderBy(asc(planPrices.amountPaise));
  return rows.map((r) => ({ ...r, period: r.period as BillingPeriod }));
}

/** The price the checkout charges. The browser never supplies an amount. */
export async function priceFor(db: Db, planKey: string, period: BillingPeriod): Promise<Price | null> {
  const [row] = await db
    .select({ planKey: planPrices.planKey, name: plans.name, period: planPrices.period, amountPaise: planPrices.amountPaise, currency: planPrices.currency })
    .from(planPrices)
    .innerJoin(plans, eq(plans.planKey, planPrices.planKey))
    .where(and(eq(planPrices.planKey, planKey), eq(planPrices.period, period), eq(planPrices.active, true)));
  return row ? { ...row, period: row.period as BillingPeriod } : null;
}

/** A checkout the user has started. Nothing is granted until the webhook says it was paid. */
export async function createPendingPayment(db: Db, userId: string, price: Price): Promise<string> {
  const [row] = await db
    .insert(billingPayments)
    .values({ userId, planKey: price.planKey, period: price.period, amountPaise: price.amountPaise, currency: price.currency })
    .returning({ id: billingPayments.id });
  return row.id;
}

export async function attachOrder(db: Db, paymentId: string, orderId: string): Promise<void> {
  await db.update(billingPayments).set({ razorpayOrderId: orderId, updatedAt: new Date() }).where(eq(billingPayments.id, paymentId));
}

/** Razorpay refused to create the order: the checkout row can never be paid. */
export async function abandonPending(db: Db, paymentId: string): Promise<void> {
  await db.update(billingPayments).set({ status: 'failed', updatedAt: new Date() }).where(and(eq(billingPayments.id, paymentId), eq(billingPayments.status, 'created')));
}

export type BillingStatus = {
  subscriptions: { planKey: string; name: string; provider: string; status: string; currentPeriodEnd: string | null; active: boolean }[];
  payments: { id: string; planKey: string; name: string; period: string; amountPaise: number; currency: string; status: string; createdAt: string; paidAt: string | null; invoiceId: string | null; invoiceNumber: string | null }[];
};

/** What the billing page shows for one account: its plans, and its last ten checkouts. */
export async function billingStatus(db: Db, userId: string, now: Date = new Date()): Promise<BillingStatus> {
  const subs = await db
    .select({ planKey: subscriptions.planKey, name: plans.name, provider: subscriptions.provider, status: subscriptions.status, end: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.planKey, subscriptions.planKey))
    .where(eq(subscriptions.userId, userId))
    .orderBy(asc(plans.name));
  const pays = await db
    .select({
      id: billingPayments.id,
      planKey: billingPayments.planKey,
      name: plans.name,
      period: billingPayments.period,
      amountPaise: billingPayments.amountPaise,
      currency: billingPayments.currency,
      status: billingPayments.status,
      createdAt: billingPayments.createdAt,
      paidAt: billingPayments.paidAt,
      invoiceId: billingPayments.invoiceId,
      invoiceNumber: invoices.number,
    })
    .from(billingPayments)
    .innerJoin(plans, eq(plans.planKey, billingPayments.planKey))
    .leftJoin(invoices, eq(invoices.id, billingPayments.invoiceId))
    .where(eq(billingPayments.userId, userId))
    .orderBy(desc(billingPayments.createdAt))
    .limit(10);
  return {
    subscriptions: subs.map((s) => ({
      planKey: s.planKey,
      name: s.name,
      provider: s.provider,
      status: s.status,
      currentPeriodEnd: s.end ? s.end.toISOString() : null,
      active: s.status === 'active' && (s.end === null || s.end > now),
    })),
    payments: pays.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt ? p.paidAt.toISOString() : null })),
  };
}

export type ProcessResult =
  /** Done (or already done). Answer 200. */
  | { result: 'processed' | 'ignored' | 'duplicate'; detail: string }
  /** Understood but not acted on, and a redelivery would not change that (a wrong amount). Answer 200; support reviews it. */
  | { result: 'rejected'; detail: string }
  /** Not yet possible (the payment this refers to hasn't been seen). Answer 5xx so Razorpay redelivers. */
  | { result: 'retry'; detail: string };

const interval = (period: string) => (period === 'year' ? sql`interval '1 year'` : sql`interval '1 month'`);
const planList = (keys: readonly string[]) => sql.join(keys.map((k) => sql`${k}::text`), sql`, `);

/**
 * Applies one verified webhook delivery. `providerEventId` is Razorpay's `x-razorpay-event-id`: seeing it
 * twice is a no-op. Throws on a database error (the caller answers 500 and Razorpay redelivers; the event
 * row is left `failed` so it is visible).
 */
export async function processBillingEvent(db: Db, providerEventId: string, eventType: string, event: BillingEvent): Promise<ProcessResult> {
  const inserted = await db.insert(billingEvents).values({ providerEventId, eventType }).onConflictDoNothing().returning({ id: billingEvents.id });
  let eventRowId = inserted[0]?.id;
  if (!eventRowId) {
    const [existing] = await db.select({ id: billingEvents.id, status: billingEvents.status }).from(billingEvents).where(eq(billingEvents.providerEventId, providerEventId));
    if (!existing) return { result: 'retry', detail: 'event_row_missing' };
    // Seen and finished: nothing to do. Seen but not finished (the first delivery died): do it again, the steps are safe to repeat.
    if (existing.status === 'processed' || existing.status === 'ignored') return { result: 'duplicate', detail: 'already_seen' };
    eventRowId = existing.id;
  }

  let outcome: Exclude<ProcessResult, { result: 'duplicate' }>;
  try {
    outcome = await apply(db, event);
  } catch (err) {
    await finish(db, eventRowId, 'failed', 'error');
    throw err;
  }
  await finish(db, eventRowId, outcome.result === 'processed' ? 'processed' : outcome.result === 'ignored' ? 'ignored' : 'failed', outcome.detail);
  return outcome;
}

async function finish(db: Db, id: string, status: 'processed' | 'ignored' | 'failed', detail: string): Promise<void> {
  await db
    .update(billingEvents)
    .set({ status, detail: detail.slice(0, 120), processedAt: status === 'failed' ? null : new Date() })
    .where(eq(billingEvents.id, id));
}

async function apply(db: Db, event: BillingEvent): Promise<Exclude<ProcessResult, { result: 'duplicate' }>> {
  switch (event.kind) {
    case 'ignored':
      return { result: 'ignored', detail: event.type };

    case 'captured': {
      const [pay] = await db.select().from(billingPayments).where(eq(billingPayments.razorpayOrderId, event.orderId));
      if (!pay) return { result: 'ignored', detail: 'unknown_order' };
      if (pay.status === 'paid') {
        // A delivery that granted the plan but died before queueing the invoice is finished by its redelivery.
        await enqueue(db, 'billing_invoice', `billing_invoice:${pay.id}`, { paymentId: pay.id });
        return { result: 'ignored', detail: 'already_paid' };
      }
      if (pay.status === 'refunded' || pay.status === 'disputed') return { result: 'ignored', detail: `already_${pay.status}` };
      if (pay.amountPaise !== event.amountPaise || pay.currency !== event.currency) return { result: 'rejected', detail: 'amount_mismatch' };

      // One statement: claim the payment (only one delivery can win) and switch the plan(s) on. The period
      // runs from the later of now and the current end, so renewing early doesn't lose the days left.
      const keys = plansGranted(pay.planKey);
      const length = interval(pay.period);
      await db.execute(sql`
        WITH paid AS (
          UPDATE billing_payments
             SET status = 'paid', razorpay_payment_id = ${event.paymentId}, paid_at = now(), granted_at = now(), updated_at = now()
           WHERE id = ${pay.id} AND status IN ('created', 'failed')
          RETURNING user_id
        )
        INSERT INTO subscriptions (user_id, provider, provider_ref, plan_key, status, current_period_end)
        SELECT paid.user_id, 'razorpay', 'razorpay:' || paid.user_id::text || ':' || g.plan_key, g.plan_key, 'active', now() + ${length}
          FROM paid CROSS JOIN (VALUES ${sql.join(keys.map((k) => sql`(${k}::text)`), sql`, `)}) AS g(plan_key)
         WHERE paid.user_id IS NOT NULL
        ON CONFLICT (provider_ref) DO UPDATE
           SET status = 'active',
               current_period_end = greatest(subscriptions.current_period_end, now()) + ${length},
               updated_at = now()
      `);
      // The invoice and its email are a job of their own: if they fail, the payment and the plan stay as they are.
      await enqueue(db, 'billing_invoice', `billing_invoice:${pay.id}`, { paymentId: pay.id });
      return { result: 'processed', detail: 'paid' };
    }

    case 'failed': {
      // Only a payment that hasn't succeeded: a late "failed" for an earlier attempt must not undo a paid order.
      await db
        .update(billingPayments)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(and(eq(billingPayments.razorpayOrderId, event.orderId), eq(billingPayments.status, 'created')));
      return { result: 'processed', detail: 'failed' };
    }

    case 'refund': {
      const [pay] = await db.select().from(billingPayments).where(eq(billingPayments.razorpayPaymentId, event.paymentId));
      if (!pay) return { result: 'retry', detail: 'payment_not_known_yet' };
      if (pay.status === 'refunded') return { result: 'ignored', detail: 'already_refunded' };
      // Policy: only a full refund ends access. A partial refund is for support to look at.
      if (event.amountPaise < pay.amountPaise) return { result: 'ignored', detail: 'partial_refund' };
      const keys = plansGranted(pay.planKey);
      await db.execute(sql`
        WITH r AS (
          UPDATE billing_payments SET status = 'refunded', refunded_at = now(), updated_at = now()
           WHERE id = ${pay.id} AND status IN ('paid', 'disputed')
          RETURNING user_id
        )
        UPDATE subscriptions s
           SET current_period_end = least(coalesce(s.current_period_end, now()), now()), updated_at = now()
          FROM r
         WHERE s.user_id = r.user_id AND s.provider = 'razorpay' AND s.plan_key IN (${planList(keys)})
      `);
      return { result: 'processed', detail: 'refunded' };
    }

    case 'dispute': {
      const [pay] = await db.select().from(billingPayments).where(eq(billingPayments.razorpayPaymentId, event.paymentId));
      if (!pay) return { result: 'retry', detail: 'payment_not_known_yet' };
      const keys = plansGranted(pay.planKey);
      if (event.outcome === 'created') {
        if (pay.status !== 'paid') return { result: 'ignored', detail: `payment_is_${pay.status}` };
        await db.execute(sql`
          WITH d AS (
            UPDATE billing_payments SET status = 'disputed', disputed_at = now(), updated_at = now()
             WHERE id = ${pay.id} AND status = 'paid'
            RETURNING user_id
          )
          UPDATE subscriptions s SET status = 'suspended', updated_at = now()
            FROM d
           WHERE s.user_id = d.user_id AND s.provider = 'razorpay' AND s.plan_key IN (${planList(keys)})
        `);
        return { result: 'processed', detail: 'disputed' };
      }
      if (event.outcome === 'won') {
        if (pay.status !== 'disputed') return { result: 'ignored', detail: `payment_is_${pay.status}` };
        await db.execute(sql`
          WITH w AS (
            UPDATE billing_payments SET status = 'paid', updated_at = now()
             WHERE id = ${pay.id} AND status = 'disputed'
            RETURNING user_id
          )
          UPDATE subscriptions s SET status = 'active', updated_at = now()
            FROM w
           WHERE s.user_id = w.user_id AND s.provider = 'razorpay' AND s.plan_key IN (${planList(keys)})
        `);
        return { result: 'processed', detail: 'dispute_won' };
      }
      // Lost or closed: access stays suspended and support decides. Not guessed here.
      return { result: 'ignored', detail: `dispute_${event.outcome}_needs_review` };
    }
  }
}

/** Support view: events that did not finish cleanly, newest first (no personal data in them). */
export async function listProblemEvents(db: Db, limit = 50) {
  return rowsOf<{ provider_event_id: string; event_type: string; status: string; detail: string; received_at: string }>(
    await db.execute(sql`select provider_event_id, event_type, status, detail, received_at from billing_events where status in ('failed', 'received') order by received_at desc limit ${limit}`),
  );
}
