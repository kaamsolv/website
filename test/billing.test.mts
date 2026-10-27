/**
 * Billing M1: the webhook's signature check and parsing (pure), and what each verified Razorpay event does to
 * payments and plans (real Postgres via PGlite, with the real migrations and price seed).
 */

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, billingEvents, billingPayments, subscriptions } from '../db/schema.ts';
import { attachOrder, billingStatus, createPendingPayment, listPrices, priceFor, processBillingEvent } from '../db/billing.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { deleteAccount } from '../db/accounts.ts';
import { addPeriod, plansGranted, priceLabel } from '../app/lib/billing/plans.ts';
import { parseWebhook, verifyWebhookSignature, type BillingEvent } from '../app/lib/billing/razorpay.ts';

const SECRET = 'whsec_test_not_a_real_secret';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');

// ---- signature ----------------------------------------------------------------------------------------------

test('a correct signature on the exact body passes', async () => {
  const body = '{"event":"payment.captured","payload":{}}';
  assert.equal(await verifyWebhookSignature(body, sign(body), SECRET), true);
});

test('a wrong secret, a changed body, a missing or malformed signature all fail', async () => {
  const body = '{"event":"payment.captured"}';
  assert.equal(await verifyWebhookSignature(body, sign(body, 'another-secret'), SECRET), false);
  assert.equal(await verifyWebhookSignature(body + ' ', sign(body), SECRET), false, 'one added space breaks it: the raw body is what is signed');
  assert.equal(await verifyWebhookSignature(body, null, SECRET), false);
  assert.equal(await verifyWebhookSignature(body, '', SECRET), false);
  assert.equal(await verifyWebhookSignature(body, 'zz'.repeat(32), SECRET), false);
  assert.equal(await verifyWebhookSignature(body, sign(body).slice(2), SECRET), false);
});

// ---- parsing -------------------------------------------------------------------------------------------------

const captured = (orderId: string, paymentId: string, amount = 14900) =>
  JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' } } } });

test('webhook bodies are read into the few events that matter', () => {
  assert.deepEqual(parseWebhook(captured('order_1', 'pay_1')), { kind: 'captured', paymentId: 'pay_1', orderId: 'order_1', amountPaise: 14900, currency: 'INR' });
  assert.deepEqual(parseWebhook(JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_2', order_id: 'order_2' } } } })), {
    kind: 'failed',
    paymentId: 'pay_2',
    orderId: 'order_2',
  });
  assert.deepEqual(parseWebhook(JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_3', amount: 14900 } } } })), { kind: 'refund', paymentId: 'pay_3', amountPaise: 14900 });
  assert.deepEqual(parseWebhook(JSON.stringify({ event: 'payment.dispute.created', payload: { dispute: { entity: { payment_id: 'pay_4' } } } })), { kind: 'dispute', paymentId: 'pay_4', outcome: 'created' });
  assert.deepEqual(parseWebhook(JSON.stringify({ event: 'payment.authorized', payload: {} })), { kind: 'ignored', type: 'payment.authorized' });
  assert.deepEqual(parseWebhook(JSON.stringify({ event: 'payment.dispute.under_review', payload: {} })), { kind: 'ignored', type: 'payment.dispute.under_review' });
});

test('malformed bodies are refused, not guessed at', () => {
  assert.equal(parseWebhook('not json'), null);
  assert.equal(parseWebhook('[]'), null);
  assert.equal(parseWebhook('{"event":"payment.captured"}'), null);
  assert.equal(parseWebhook(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'p', order_id: 'o', amount: '149', currency: 'INR' } } } })), null, 'an amount that is not a number');
  assert.equal(parseWebhook(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'p', order_id: 'o', amount: -5, currency: 'INR' } } } })), null);
  assert.equal(parseWebhook(JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { amount: 100 } } } })), null);
});

// ---- plans and periods ---------------------------------------------------------------------------------------

test('a month and a year are added in UTC, clamping to the month end', () => {
  assert.equal(addPeriod(new Date('2026-01-31T10:00:00Z'), 'month').toISOString(), '2026-02-28T10:00:00.000Z');
  assert.equal(addPeriod(new Date('2028-01-31T10:00:00Z'), 'month').toISOString(), '2028-02-29T10:00:00.000Z');
  assert.equal(addPeriod(new Date('2026-12-15T00:00:00Z'), 'month').toISOString(), '2027-01-15T00:00:00.000Z');
  assert.equal(addPeriod(new Date('2028-02-29T00:00:00Z'), 'year').toISOString(), '2029-02-28T00:00:00.000Z');
});

test('the bundle grants two plans, everything else grants itself; prices read in Indian grouping', () => {
  assert.deepEqual(plansGranted('invoice_qr_bundle'), ['invoice_pro', 'qr_pro']);
  assert.deepEqual(plansGranted('invoice_pro'), ['invoice_pro']);
  assert.equal(priceLabel(14900), '₹149');
  assert.equal(priceLabel(149000), '₹1,490');
  assert.equal(priceLabel(12345600), '₹1,23,456');
});

// ---- the database --------------------------------------------------------------------------------------------

let db: Db;
let close: () => Promise<void>;
before(async () => {
  ({ db, close } = await makeTestDb());
});
after(async () => {
  await close();
});

let counter = 0;
async function newUser(): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email: `buyer${++counter}@example.com`, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}

/** A checkout the way the route makes it: a priced row with a Razorpay order attached. */
async function checkout(userId: string, planKey = 'invoice_pro', period: 'month' | 'year' = 'month') {
  const price = await priceFor(db, planKey, period);
  assert.ok(price, `${planKey}/${period} has a price`);
  const id = await createPendingPayment(db, userId, price);
  const orderId = `order_${++counter}`;
  await attachOrder(db, id, orderId);
  return { id, orderId, amountPaise: price.amountPaise };
}

let eventSeq = 0;
const eventId = () => `evt_${++eventSeq}`;
const capture = (c: { orderId: string; amountPaise: number }, paymentId: string): BillingEvent => ({ kind: 'captured', paymentId, orderId: c.orderId, amountPaise: c.amountPaise, currency: 'INR' });

const canDashboard = async (userId: string) => (await getEntitlements(db, userId)).keys.includes('invoice_dashboard');
const payment = async (id: string) => (await db.select().from(billingPayments).where(eq(billingPayments.id, id)))[0];
const subsOf = async (userId: string) => db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
const DAY = 86_400_000;

test('the price list is seeded: three plans, monthly and yearly, in paise', async () => {
  const prices = await listPrices(db);
  const get = (k: string, p: string) => prices.find((x) => x.planKey === k && x.period === p)?.amountPaise;
  assert.equal(get('invoice_pro', 'month'), 14900);
  assert.equal(get('invoice_pro', 'year'), 149000);
  assert.equal(get('qr_pro', 'month'), 9900);
  assert.equal(get('qr_pro', 'year'), 99000);
  assert.equal(get('invoice_qr_bundle', 'month'), 19900);
  assert.equal(get('invoice_qr_bundle', 'year'), 199000);
  assert.equal(await priceFor(db, 'free_account', 'month'), null, 'a plan with no price can not be bought');
  assert.equal(await priceFor(db, 'invoice_pro', 'month').then((p) => p?.name), 'Invoice Pro');
});

test('a checkout alone grants nothing: only the verified payment event does', async () => {
  const user = await newUser();
  const c = await checkout(user);
  assert.equal((await payment(c.id)).status, 'created');
  assert.equal(await canDashboard(user), false, 'starting a checkout, or returning from it, switches nothing on');
  assert.equal((await subsOf(user)).length, 0);
});

test('a captured payment marks it paid and switches the plan on for about a month', async () => {
  const user = await newUser();
  const c = await checkout(user);
  const out = await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_a'));
  assert.equal(out.result, 'processed');
  const p = await payment(c.id);
  assert.equal(p.status, 'paid');
  assert.equal(p.razorpayPaymentId, 'pay_a');
  assert.ok(p.paidAt && p.grantedAt);
  assert.equal(await canDashboard(user), true);
  const [s] = await subsOf(user);
  assert.equal(s.provider, 'razorpay');
  assert.equal(s.planKey, 'invoice_pro');
  assert.equal(s.status, 'active');
  const days = (s.currentPeriodEnd!.getTime() - Date.now()) / DAY;
  assert.ok(days > 27 && days < 32, `about a month, got ${days.toFixed(1)} days`);
});

test('the same webhook delivered twice changes nothing', async () => {
  const user = await newUser();
  const c = await checkout(user);
  const id = eventId();
  assert.equal((await processBillingEvent(db, id, 'captured', capture(c, 'pay_b'))).result, 'processed');
  const before = (await subsOf(user))[0].currentPeriodEnd!.getTime();
  assert.equal((await processBillingEvent(db, id, 'captured', capture(c, 'pay_b'))).result, 'duplicate');
  assert.equal((await subsOf(user)).length, 1);
  assert.equal((await subsOf(user))[0].currentPeriodEnd!.getTime(), before);
});

test('the same payment under a new event id is still only paid once', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_c'));
  const before = (await subsOf(user))[0].currentPeriodEnd!.getTime();
  const again = await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_c'));
  assert.equal(again.result, 'ignored');
  assert.equal((await subsOf(user))[0].currentPeriodEnd!.getTime(), before);
});

test('two deliveries racing for the same payment grant it exactly once', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await Promise.all([processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_d')), processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_d'))]);
  const [s] = await subsOf(user);
  const days = (s.currentPeriodEnd!.getTime() - Date.now()) / DAY;
  assert.ok(days > 27 && days < 32, `one month, not two: ${days.toFixed(1)} days`);
});

test('an amount that does not match the order is rejected and grants nothing', async () => {
  const user = await newUser();
  const c = await checkout(user);
  const out = await processBillingEvent(db, eventId(), 'captured', { ...capture(c, 'pay_e'), amountPaise: 100 });
  assert.deepEqual(out, { result: 'rejected', detail: 'amount_mismatch' });
  assert.equal((await payment(c.id)).status, 'created');
  assert.equal(await canDashboard(user), false);
  const wrongCurrency = await processBillingEvent(db, eventId(), 'captured', { ...capture(c, 'pay_e'), currency: 'USD' });
  assert.equal(wrongCurrency.result, 'rejected');
});

test('a payment for an order we never made is ignored', async () => {
  const out = await processBillingEvent(db, eventId(), 'captured', { kind: 'captured', paymentId: 'pay_x', orderId: 'order_never', amountPaise: 14900, currency: 'INR' });
  assert.deepEqual(out, { result: 'ignored', detail: 'unknown_order' });
});

test('a failed attempt marks the checkout failed, and a later success on the same order still works', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'failed', { kind: 'failed', paymentId: 'pay_f1', orderId: c.orderId });
  assert.equal((await payment(c.id)).status, 'failed');
  assert.equal(await canDashboard(user), false);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_f2'));
  assert.equal((await payment(c.id)).status, 'paid');
  assert.equal(await canDashboard(user), true);
});

test('a late "failed" for an earlier attempt can not undo a paid order', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_g'));
  await processBillingEvent(db, eventId(), 'failed', { kind: 'failed', paymentId: 'pay_g_old', orderId: c.orderId });
  assert.equal((await payment(c.id)).status, 'paid');
  assert.equal(await canDashboard(user), true);
});

test('renewing early adds a month on top of the days left', async () => {
  const user = await newUser();
  const first = await checkout(user);
  const second = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(first, 'pay_h1'));
  await processBillingEvent(db, eventId(), 'captured', capture(second, 'pay_h2'));
  const subs = await subsOf(user);
  assert.equal(subs.length, 1, 'one subscription row per plan, extended');
  const days = (subs[0].currentPeriodEnd!.getTime() - Date.now()) / DAY;
  assert.ok(days > 57 && days < 63, `about two months, got ${days.toFixed(1)} days`);
});

test('a yearly plan runs about a year', async () => {
  const user = await newUser();
  const c = await checkout(user, 'qr_pro', 'year');
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_y'));
  const days = ((await subsOf(user))[0].currentPeriodEnd!.getTime() - Date.now()) / DAY;
  assert.ok(days > 363 && days < 367, `got ${days.toFixed(1)} days`);
});

test('the bundle switches on both Invoice Pro and QR Pro', async () => {
  const user = await newUser();
  const c = await checkout(user, 'invoice_qr_bundle');
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_bundle'));
  const keys = (await getEntitlements(db, user)).keys;
  assert.ok(keys.includes('invoice_dashboard'), 'Invoice Pro');
  assert.ok(keys.includes('qr_campaigns'), 'QR Pro');
  assert.deepEqual((await subsOf(user)).map((s) => s.planKey).sort(), ['invoice_pro', 'qr_pro']);
});

test('a full refund ends access at once and leaves the record', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_r'));
  assert.equal(await canDashboard(user), true);
  const out = await processBillingEvent(db, eventId(), 'refund', { kind: 'refund', paymentId: 'pay_r', amountPaise: c.amountPaise });
  assert.equal(out.result, 'processed');
  assert.equal((await payment(c.id)).status, 'refunded');
  assert.equal(await canDashboard(user), false);
  assert.equal((await processBillingEvent(db, eventId(), 'refund', { kind: 'refund', paymentId: 'pay_r', amountPaise: c.amountPaise })).result, 'ignored', 'a second refund event is not applied twice');
});

test('a partial refund is recorded for support but does not end access', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_pr'));
  const out = await processBillingEvent(db, eventId(), 'refund', { kind: 'refund', paymentId: 'pay_pr', amountPaise: 1000 });
  assert.deepEqual(out, { result: 'ignored', detail: 'partial_refund' });
  assert.equal((await payment(c.id)).status, 'paid');
  assert.equal(await canDashboard(user), true);
});

test('a refund that arrives before its payment is asked to come back later; then it applies', async () => {
  const user = await newUser();
  const c = await checkout(user);
  const early = await processBillingEvent(db, eventId(), 'refund', { kind: 'refund', paymentId: 'pay_ooo', amountPaise: c.amountPaise });
  assert.deepEqual(early, { result: 'retry', detail: 'payment_not_known_yet' });
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_ooo'));
  assert.equal(await canDashboard(user), true);
  const again = await processBillingEvent(db, eventId(), 'refund', { kind: 'refund', paymentId: 'pay_ooo', amountPaise: c.amountPaise });
  assert.equal(again.result, 'processed');
  assert.equal(await canDashboard(user), false);
});

test('a refunded payment can not be granted again by a late capture event', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_late'));
  await processBillingEvent(db, eventId(), 'refund', { kind: 'refund', paymentId: 'pay_late', amountPaise: c.amountPaise });
  const out = await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_late'));
  assert.equal(out.result, 'ignored');
  assert.equal(await canDashboard(user), false);
});

test('a dispute suspends access, winning it restores it, losing it leaves it suspended for review', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_dp'));
  await processBillingEvent(db, eventId(), 'dispute', { kind: 'dispute', paymentId: 'pay_dp', outcome: 'created' });
  assert.equal((await payment(c.id)).status, 'disputed');
  assert.equal(await canDashboard(user), false);
  await processBillingEvent(db, eventId(), 'dispute', { kind: 'dispute', paymentId: 'pay_dp', outcome: 'won' });
  assert.equal((await payment(c.id)).status, 'paid');
  assert.equal(await canDashboard(user), true);

  const user2 = await newUser();
  const c2 = await checkout(user2);
  await processBillingEvent(db, eventId(), 'captured', capture(c2, 'pay_dp2'));
  await processBillingEvent(db, eventId(), 'dispute', { kind: 'dispute', paymentId: 'pay_dp2', outcome: 'created' });
  const lost = await processBillingEvent(db, eventId(), 'dispute', { kind: 'dispute', paymentId: 'pay_dp2', outcome: 'lost' });
  assert.deepEqual(lost, { result: 'ignored', detail: 'dispute_lost_needs_review' });
  assert.equal(await canDashboard(user2), false);
});

test('events KaamSolv does not use are recorded and ignored', async () => {
  const out = await processBillingEvent(db, eventId(), 'payment.authorized', { kind: 'ignored', type: 'payment.authorized' });
  assert.equal(out.result, 'ignored');
  const rows = await db.select().from(billingEvents).where(eq(billingEvents.eventType, 'payment.authorized'));
  assert.ok(rows.length >= 1 && rows[0].status === 'ignored');
});

test('an event that could not finish stays visible as failed, and its redelivery is processed', async () => {
  const user = await newUser();
  const c = await checkout(user);
  const id = eventId();
  const early = await processBillingEvent(db, id, 'refund', { kind: 'refund', paymentId: 'pay_wait', amountPaise: c.amountPaise });
  assert.equal(early.result, 'retry');
  assert.equal((await db.select().from(billingEvents).where(eq(billingEvents.providerEventId, id)))[0].status, 'failed');
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_wait'));
  const redelivered = await processBillingEvent(db, id, 'refund', { kind: 'refund', paymentId: 'pay_wait', amountPaise: c.amountPaise });
  assert.equal(redelivered.result, 'processed', 'the same event id is processed when the first try could not finish');
  assert.equal((await db.select().from(billingEvents).where(eq(billingEvents.providerEventId, id)))[0].status, 'processed');
});

test('the billing page data shows only this account, newest checkout first', async () => {
  const a = await newUser();
  const b = await newUser();
  const ca = await checkout(a);
  await processBillingEvent(db, eventId(), 'captured', capture(ca, 'pay_s1'));
  await checkout(b);
  const sa = await billingStatus(db, a);
  assert.equal(sa.payments.length, 1);
  assert.equal(sa.subscriptions[0].active, true);
  assert.equal(sa.subscriptions[0].name, 'Invoice Pro');
  const sb = await billingStatus(db, b);
  assert.equal(sb.subscriptions.length, 0);
  assert.equal(sb.payments[0].status, 'created');
});

test('deleting an account keeps the sales record, without the link to the person', async () => {
  const user = await newUser();
  const c = await checkout(user);
  await processBillingEvent(db, eventId(), 'captured', capture(c, 'pay_del'));
  const [{ email }] = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, user));
  await deleteAccount(db, user, email);
  const p = await payment(c.id);
  assert.equal(p.status, 'paid');
  assert.equal(p.userId, null);
  assert.equal((await subsOf(user)).length, 0, 'access goes with the account');
});
