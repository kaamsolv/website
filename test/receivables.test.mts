/**
 * Billing M3: the receivables snapshot, the summary message, the schedule and the opt-in summary email. Real Postgres
 * (PGlite, real migrations). The figures are worked out by hand in the scenario comment below.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, outbox, subscriptions } from '../db/schema.ts';
import { getCollections, getReceivables } from '../db/collections.ts';
import { createInvoice } from '../db/invoices.ts';
import { recordPayment, voidPayment } from '../db/payments.ts';
import { claimDue } from '../db/outbox.ts';
import { enqueueDueSummaries, getSummaryCadence, setSummaryCadence } from '../db/notifications.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { hasSomethingToReport, receivablesMessage, type SummaryFigures } from '../app/lib/invoice/receivables-summary.ts';
import { dueCadences, isoWeekKey, istClock, isCadence } from '../app/lib/notify/schedule.ts';
import { summaryEmail, summaryJob } from '../app/lib/notify/summary-job.ts';
import type { CurrencyCode, Invoice } from '../app/lib/invoice/types.ts';

// ---- the schedule (pure) --------------------------------------------------------------------------------------

test('India time: the date and hour follow Asia/Kolkata, across midnight and the date line of UTC', () => {
  assert.deepEqual(istClock(new Date('2026-10-26T18:29:59Z')), { date: '2026-10-26', hour: 23, isoDow: 1, day: 26, weekKey: '2026-W44', monthKey: '2026-10' });
  const midnight = istClock(new Date('2026-10-26T18:30:00Z'));
  assert.deepEqual([midnight.date, midnight.hour, midnight.isoDow], ['2026-10-27', 0, 2], '18:30 UTC is already the next day, midnight, in India');
  assert.equal(istClock(new Date('2026-10-27T03:30:00Z')).hour, 9);
});

test('ISO week numbers, including the year edges', () => {
  assert.equal(isoWeekKey(2026, 10, 26), '2026-W44');
  assert.equal(isoWeekKey(2026, 1, 1), '2026-W01');
  assert.equal(isoWeekKey(2026, 12, 28), '2026-W53');
  assert.equal(isoWeekKey(2027, 1, 1), '2026-W53', '1 Jan 2027 is a Friday in the last week of 2026');
  assert.equal(isoWeekKey(2027, 1, 4), '2027-W01');
  assert.equal(isoWeekKey(2024, 12, 30), '2025-W01');
});

test('weekly is due on Monday from 9 am India time, monthly on the 1st from 9 am; nothing otherwise', () => {
  assert.deepEqual(dueCadences(new Date('2026-10-26T03:29:00Z')), [], 'Monday 8:59 am');
  assert.deepEqual(dueCadences(new Date('2026-10-26T03:30:00Z')), [{ cadence: 'weekly', key: '2026-W44' }], 'Monday 9:00 am');
  assert.deepEqual(dueCadences(new Date('2026-10-26T17:00:00Z')), [{ cadence: 'weekly', key: '2026-W44' }], 'still Monday evening in India');
  assert.deepEqual(dueCadences(new Date('2026-10-26T19:00:00Z')), [], 'Tuesday 12:30 am in India');
  assert.deepEqual(dueCadences(new Date('2026-10-25T10:00:00Z')), [], 'a Sunday');
  assert.deepEqual(dueCadences(new Date('2026-12-01T05:00:00Z')), [{ cadence: 'monthly', key: '2026-12' }], 'the 1st (a Tuesday)');
  assert.deepEqual(dueCadences(new Date('2027-03-01T05:00:00Z')).map((d) => d.cadence), ['weekly', 'monthly'], 'a Monday that is also the 1st');
  assert.deepEqual(dueCadences(new Date('2026-11-30T20:00:00Z')), [], '1 December 1:30 am in India is before 9');
  assert.equal(isCadence('weekly') && isCadence('off') && !isCadence('daily') && !isCadence(null), true);
});

// ---- the message (pure) ---------------------------------------------------------------------------------------

const fig = (currency: CurrencyCode, o: Partial<SummaryFigures> = {}): SummaryFigures => ({
  currency,
  today: '2026-10-27',
  outstanding: { amount: 125000, count: 12 },
  overdue: { amount: 28000, count: 4 },
  dueToday: { amount: 0, count: 0 },
  dueNext7: { amount: 32000, count: 3 },
  dueNext30: { amount: 52000, count: 6 },
  receivedThisMonth: { amount: 86000, count: 9 },
  ...o,
});

test('the summary message says what each figure covers, one block per currency, with the link', () => {
  const m = receivablesMessage([fig('INR')], 'https://kaamsolv.com/app/invoices/collections')!;
  assert.ok(m.startsWith('KaamSolv receivables, as of 27 Oct 2026\n\nOutstanding: ₹1,25,000.00 (12 invoices)\nOverdue: ₹28,000.00 (4 invoices)'));
  assert.ok(m.includes('Due in the next 7 days: ₹32,000.00') && m.includes('Due in the next 30 days: ₹52,000.00') && m.includes('Received in Oct 2026: ₹86,000.00'));
  assert.ok(m.includes('"next 30 days" includes the next 7'));
  assert.ok(m.endsWith('View receivables: https://kaamsolv.com/app/invoices/collections'));
  const one = receivablesMessage([fig('INR', { outstanding: { amount: 10, count: 1 } })], null)!;
  assert.ok(one.includes('(1 invoice)') && !one.includes('View receivables'));
  const two = receivablesMessage([fig('INR'), fig('USD', { outstanding: { amount: 60, count: 1 } })], null)!;
  assert.ok(two.includes('\nINR\n') && two.includes('\nUSD\n') && two.includes('Outstanding: $60.00'), 'never summed or converted');
  assert.equal(receivablesMessage([], null), null);
});

test('there is something to send only when money is owed or came in this month', () => {
  const nothing = fig('INR', { outstanding: { amount: 0, count: 0 }, receivedThisMonth: { amount: 0, count: 0 } });
  assert.equal(hasSomethingToReport([nothing]), false);
  assert.equal(hasSomethingToReport([nothing, fig('USD')]), true);
  assert.equal(hasSomethingToReport([{ ...nothing, receivedThisMonth: { amount: 5, count: 1 } }]), true);
  assert.equal(hasSomethingToReport([]), false);
});

test('the email carries the message, the link, and how to turn it off; hostile text is escaped', () => {
  const e = summaryEmail('a@b.test', 'Outstanding: <b>x</b> & "y"', 'https://kaamsolv.com/app/invoices/collections');
  assert.equal(e.subject, 'Your KaamSolv receivables summary');
  assert.ok(e.text.includes('turned on the receivables summary') && e.text.includes('https://kaamsolv.com/app/invoices/collections'));
  assert.ok(!e.html.includes('<b>x</b>') && e.html.includes('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;'));
});

// ---- the database --------------------------------------------------------------------------------------------

let db: Db;
let close: () => Promise<void>;
after(async () => close());

const TODAY = '2026-10-27';
async function user(email: string, pro = false): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  if (pro) await db.insert(subscriptions).values({ userId: u.id, provider: 'manual', providerRef: `manual:test:${u.id}`, planKey: 'invoice_pro', status: 'active' });
  return u.id;
}
async function inv(userId: string, n: string, rate: string, due: string, o: { currency?: CurrencyCode; kind?: 'quote'; issue?: string } = {}): Promise<string> {
  const doc: Invoice = { ...newInvoice(new Date(2026, 9, 10)), number: n, issueDate: o.issue ?? '2026-09-01', dueDate: due, currency: o.currency ?? 'INR', items: [{ id: 'a', description: 'Work', qty: '1', rate }], taxRate: '', ...(o.kind ? { kind: o.kind } : {}) };
  const r = await createInvoice(db, userId, doc, null);
  assert.ok(r.ok);
  return r.ok ? r.id : '';
}
async function pay(userId: string, invoice: string, amount: number, paidOn: string): Promise<string> {
  const r = await recordPayment(db, userId, invoice, { amountCents: Math.round(amount * 100), paidOn, method: 'bank', reference: '', note: '', clientKey: randomUUID(), reconcile: false });
  assert.ok(r.ok, `payment ${amount} on ${paidOn}`);
  return r.ok ? r.payment.id : '';
}

/**
 * Today is 27 Oct 2026. Account A, INR:
 *   R1 5,000 due 27 Oct (today)        R2 3,000 due 28 Oct (+1)           R3 2,000 due 3 Nov (+7), 500 paid on 20 Oct → 1,500 owed
 *   R4 4,000 due 4 Nov (+8)            R5 1,000 due 26 Nov (+30), a 100 payment voided      R6 800 due 27 Nov (+31)
 *   R7 6,000 due 1 Oct (26 days over)  R8 9,000 due 1 Jul (118 days over)  R9 700 no due date   Q 9,999 a quotation
 *   P1 1,200 due 5 Oct, paid in full on 10 Oct     P2 1,500 due 10 Sep, paid in full on 30 Sep (last month)
 *   USD: U1 100 due 30 Oct.   Account B: one big invoice, which must never show up.
 */
let A: string;
let B: string;
before(async () => {
  ({ db, close } = await makeTestDb());
  A = await user('recv-a@example.test', true);
  B = await user('recv-b@example.test', true);
  await inv(A, 'R1', '5000', '2026-10-27');
  await inv(A, 'R2', '3000', '2026-10-28');
  const r3 = await inv(A, 'R3', '2000', '2026-11-03');
  await inv(A, 'R4', '4000', '2026-11-04');
  const r5 = await inv(A, 'R5', '1000', '2026-11-26');
  await inv(A, 'R6', '800', '2026-11-27');
  await inv(A, 'R7', '6000', '2026-10-01');
  await inv(A, 'R8', '9000', '2026-07-01');
  await inv(A, 'R9', '700', '');
  await inv(A, 'Q', '9999', '2026-11-01', { kind: 'quote' });
  const p1 = await inv(A, 'P1', '1200', '2026-10-05');
  const p2 = await inv(A, 'P2', '1500', '2026-09-10');
  await inv(A, 'U1', '100', '2026-10-30', { currency: 'USD' });
  await pay(A, r3, 500, '2026-10-20');
  await voidPayment(db, A, r5, await pay(A, r5, 100, '2026-10-21'), 'mistake');
  await pay(A, p1, 1200, '2026-10-10');
  await pay(A, p2, 1500, '2026-09-30');
  await inv(B, 'B1', '99999', '2026-10-27');
});

test('the snapshot: every figure as worked out by hand, from the same ledger', async () => {
  const r = await getReceivables(db, A, { today: TODAY });
  assert.equal(r.currency, 'INR');
  assert.deepEqual(r.outstanding, { amount: 31000, count: 9 });
  assert.deepEqual(r.overdue, { amount: 15000, count: 2 });
  assert.deepEqual(r.dueToday, { amount: 5000, count: 1 });
  assert.deepEqual(r.dueNext7, { amount: 4500, count: 2 }, 'tomorrow through +7: R2 and what is left of R3');
  assert.deepEqual(r.dueNext30, { amount: 9500, count: 4 }, 'tomorrow through +30 includes the next 7; R6 (+31) and R9 (no date) are out');
  assert.deepEqual(r.partlyPaid, { count: 1, remaining: 1500 });
  assert.deepEqual(r.receivedThisMonth, { amount: 1700, count: 2 }, 'R3 500 and P1 1,200 in October; the voided 100 and last month do not count');
  assert.deepEqual(r.month, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(r.ageing.map((b) => [b.bucket, b.amount, b.count]), [
    ['not_due', 16000, 7],
    ['d1_30', 6000, 1],
    ['d31_60', 0, 0],
    ['d61_90', 0, 0],
    ['d90_plus', 9000, 1],
  ]);
  assert.equal(r.ageing.reduce((s, b) => s + b.amount, 0), r.outstanding.amount, 'the five buckets add up to outstanding');
  assert.deepEqual(r.upcoming.map((u) => [u.number, u.dueDate, u.balance]), [
    ['R1', '2026-10-27', 5000],
    ['R2', '2026-10-28', 3000],
    ['R3', '2026-11-03', 1500],
    ['R4', '2026-11-04', 4000],
    ['R5', '2026-11-26', 1000],
  ]);
  assert.deepEqual(r.recentPayments.map((p) => [p.number, p.amount, p.paidOn]), [
    ['R3', 500, '2026-10-20'],
    ['P1', 1200, '2026-10-10'],
    ['P2', 1500, '2026-09-30'],
  ], 'newest first, voided payments left out');
});

test('it agrees with the Payments & collections page, because it is built from it', async () => {
  const c = await getCollections(db, A, { currency: 'INR', from: '2026-10-01', to: '2026-10-31', today: TODAY });
  const r = await getReceivables(db, A, { today: TODAY, currency: 'INR' });
  assert.deepEqual([r.outstanding, r.overdue, r.receivedThisMonth], [c.summary.outstanding, c.summary.overdue, c.summary.received]);
  assert.deepEqual(r.ageing, c.ageing);
});

test('currencies stay apart, and another account is never visible', async () => {
  const usd = await getReceivables(db, A, { today: TODAY, currency: 'USD' });
  assert.deepEqual([usd.outstanding, usd.dueNext7, usd.overdue], [{ amount: 100, count: 1 }, { amount: 100, count: 1 }, { amount: 0, count: 0 }]);
  assert.deepEqual(usd.currencies.map((c) => c.code), ['INR', 'USD']);
  const b = await getReceivables(db, B, { today: TODAY });
  assert.deepEqual([b.outstanding.amount, b.dueToday.amount, b.upcoming.length, b.recentPayments.length], [99999, 99999, 1, 0]);
  const empty = await getReceivables(db, await user('recv-empty@example.test'), { today: TODAY });
  assert.deepEqual([empty.outstanding.amount, empty.upcoming.length, empty.recentPayments.length, empty.currency], [0, 0, 0, 'INR']);
});

test('opt-in: no row means off; turning it on and off is remembered', async () => {
  const u = await user('prefs@example.test');
  assert.equal(await getSummaryCadence(db, u), 'off');
  await setSummaryCadence(db, u, 'weekly');
  assert.equal(await getSummaryCadence(db, u), 'weekly');
  await setSummaryCadence(db, u, 'monthly');
  assert.equal(await getSummaryCadence(db, u), 'monthly');
  await setSummaryCadence(db, u, 'off');
  assert.equal(await getSummaryCadence(db, u), 'off');
});

test('scheduling queues each account once per period, only for what it chose, only in the window', async () => {
  const weekly = await user('sched-weekly@example.test', true);
  const monthly = await user('sched-monthly@example.test', true);
  const off = await user('sched-off@example.test', true);
  await setSummaryCadence(db, weekly, 'weekly');
  await setSummaryCadence(db, monthly, 'monthly');
  await setSummaryCadence(db, off, 'off');
  const jobsFor = async (id: string) => (await db.select().from(outbox).where(eq(outbox.kind, 'receivables_summary'))).filter((j) => (j.payload as { userId: string }).userId === id);

  assert.equal(await enqueueDueSummaries(db, new Date('2026-10-25T10:00:00Z')), 0, 'a Sunday: nothing is due');
  assert.equal(await enqueueDueSummaries(db, new Date('2026-10-26T03:00:00Z')), 0, 'Monday before 9 am');
  const monday = await enqueueDueSummaries(db, new Date('2026-10-26T04:00:00Z'));
  assert.ok(monday >= 1);
  assert.equal((await jobsFor(weekly)).length, 1);
  assert.equal((await jobsFor(monthly)).length, 0);
  assert.equal((await jobsFor(off)).length, 0);
  assert.equal(await enqueueDueSummaries(db, new Date('2026-10-26T09:00:00Z')), 0, 'the schedule runs every 15 minutes; the same Monday adds nothing');
  assert.equal(await enqueueDueSummaries(db, new Date('2026-11-02T04:00:00Z')) >= 1, true, 'next Monday is a new week');
  assert.equal((await jobsFor(weekly)).length, 2);
  await enqueueDueSummaries(db, new Date('2026-12-01T04:00:00Z'));
  assert.equal((await jobsFor(monthly)).length, 1);
  assert.equal((await jobsFor(monthly))[0].dedupeKey, `summary:${monthly}:2026-12`);
});

// ---- the email job --------------------------------------------------------------------------------------------

function job(userId: string) {
  return { id: randomUUID(), kind: 'receivables_summary', dedupeKey: `summary:${userId}:test`, payload: { userId, period: 'test' }, attempts: 1 };
}
const NOW = new Date('2026-10-27T05:00:00Z'); // 10:30 am on 27 Oct in India
const ok = (sent: { to: string; text: string; key?: string }[]) => async (email: { to: string; text: string }, _from?: string, key?: string) => (sent.push({ ...email, key }), { ok: true as const, id: 'r1' });

test('the summary job sends the opted-in, paying account its own figures — and nothing else', async () => {
  await setSummaryCadence(db, A, 'weekly');
  const sent: { to: string; text: string; key?: string }[] = [];
  const out = await summaryJob(db, job(A), { send: ok(sent), now: NOW, env: { NEXT_PUBLIC_SITE_URL: 'https://kaamsolv.test' } });
  assert.deepEqual(out, { result: 'sent', ref: 'r1' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'recv-a@example.test');
  assert.ok(sent[0].text.includes('Outstanding: ₹31,000.00 (9 invoices)') && sent[0].text.includes('Overdue: ₹15,000.00 (2 invoices)'));
  assert.ok(sent[0].text.includes('\nUSD\n') && sent[0].text.includes('Outstanding: $100.00'), 'each currency in its own block');
  assert.ok(sent[0].text.includes('https://kaamsolv.test/app/invoices/collections'));
  assert.ok(!sent[0].text.includes('99999'), "another account's money is nowhere in it");
  assert.equal(sent[0].key, job(A).dedupeKey.replace(/test$/, 'test'), 'the provider gets a stable idempotency key');
});

test('the job re-checks at send time: turned off, no longer on the plan, nothing to report', async () => {
  const sent: { to: string; text: string }[] = [];
  const deps = { send: ok(sent), now: NOW };

  const off = await user('job-off@example.test', true);
  await setSummaryCadence(db, off, 'off');
  assert.deepEqual(await summaryJob(db, job(off), deps), { result: 'sent', ref: 'skipped:turned_off' });

  const lapsed = await user('job-lapsed@example.test', false);
  await setSummaryCadence(db, lapsed, 'weekly');
  assert.deepEqual(await summaryJob(db, job(lapsed), deps), { result: 'sent', ref: 'skipped:no_plan' });

  const quiet = await user('job-quiet@example.test', true);
  await setSummaryCadence(db, quiet, 'weekly');
  assert.deepEqual(await summaryJob(db, job(quiet), deps), { result: 'sent', ref: 'skipped:nothing_to_report' });

  assert.deepEqual(await summaryJob(db, job(randomUUID()), deps), { result: 'sent', ref: 'skipped:turned_off' }, 'an account that never opted in (or is gone) gets nothing');
  assert.deepEqual(await summaryJob(db, { ...job(A), payload: {} }, deps), { result: 'sent', ref: 'skipped:no_account' });
  assert.equal(sent.length, 0, 'none of those sent anything');
});

test('a failed send retries; a missing email key waits as blocked', async () => {
  const fail = { now: NOW, send: async () => ({ ok: false as const, code: 'email_rejected_500' }) };
  assert.deepEqual(await summaryJob(db, job(A), fail), { result: 'retry', code: 'email_rejected_500' });
  const nokey = { now: NOW, send: async () => ({ ok: false as const, code: 'email_not_configured' }) };
  assert.deepEqual(await summaryJob(db, job(A), nokey), { result: 'blocked', code: 'email_not_configured' });
});

test('queued summary jobs are picked up by the same outbox as invoices', async () => {
  const due = await claimDue(db, 500);
  assert.ok(due.some((j) => j.kind === 'receivables_summary'));
});
