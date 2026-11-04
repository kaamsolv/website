/**
 * Invoice Pro payment reminders and promises, on real Postgres (PGlite, real migrations): who may be reminded,
 * the queue's duplicate protection, the checks repeated at send time, retries, the daily limit, scheduled
 * queueing, the plan gate, other accounts' invoices, and promises beside the payment ledger. No email is sent:
 * the job is given a stand-in sender.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, invoices, outbox, subscriptions } from '../db/schema.ts';
import { createInvoice } from '../db/invoices.ts';
import { recordPayment } from '../db/payments.ts';
import { claimDue, runDue, settle, MAX_ATTEMPTS } from '../db/outbox.ts';
import { clearPromise, getFollowup, setPromise, setRemindersPaused } from '../db/followups.ts';
import { enqueueScheduledReminders, getReminderSettings, listReminders, requestManualReminder, retryReminder, saveReminderSettings } from '../db/reminders.ts';
import { istClock } from '../app/lib/notify/schedule.ts';
import { reminderJob } from '../app/lib/notify/reminder-job.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { checkPromise, promiseStatus } from '../app/lib/invoice/followup.ts';
import { checkSchedule, dueStep, DAILY_REMINDER_LIMIT, manualKey, reminderEligibility, reminderEmail, scheduledKey } from '../app/lib/invoice/reminders.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';
import type { SendResult, Email } from '../app/lib/email.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
// The queue is shared by every test in this file, so each starts with it empty and scheduled sending off for everyone.
beforeEach(async () => {
  await db.execute(sql`delete from outbox`);
  await db.execute(sql`delete from invoice_reminders`);
  await db.execute(sql`update reminder_prefs set scheduled_enabled = false`);
});
after(async () => close());

const TODAY = '2026-11-10';
const ENV = { NEXT_PUBLIC_SITE_URL: 'https://kaamsolv.test' } as Record<string, string | undefined>;
const SECRET = 'reminder-test-secret';

async function user(email: string, pro = true): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: 'Owner', email, emailVerified: true }).returning({ id: authUsers.id });
  if (pro) await db.insert(subscriptions).values({ userId: u.id, provider: 'manual', providerRef: `manual:${email}`, planKey: 'invoice_pro', status: 'active' });
  return u.id;
}
async function invoice(userId: string, o: { n: string; rate?: string; due?: string; email?: string; quote?: boolean }): Promise<string> {
  const doc: Invoice = {
    ...newInvoice(new Date(2026, 9, 1)),
    number: o.n,
    issueDate: '2026-10-01',
    dueDate: o.due ?? '2026-11-05',
    items: [{ id: 'a', description: 'Work', qty: '1', rate: o.rate ?? '1000' }],
    taxRate: '',
    seller: { name: 'ABC Studio', address: '', email: '', phone: '' },
    client: { name: 'Rahul Sharma', address: '', email: o.email ?? 'rahul@example.test' },
    ...(o.quote ? { kind: 'quote' as const } : {}),
  };
  const r = await createInvoice(db, userId, doc, null);
  assert.ok(r.ok);
  return r.ok ? r.id : '';
}
const pay = async (userId: string, id: string, amount: number) => {
  const r = await recordPayment(db, userId, id, { amountCents: Math.round(amount * 100), paidOn: '2026-11-03', method: 'bank', reference: '', note: '', clientKey: randomUUID(), reconcile: false });
  assert.ok(r.ok, JSON.stringify(r));
};
const sender = (sent: Email[], result: SendResult = { ok: true, id: 'test-id' }) => async (e: Email) => {
  if (result.ok) sent.push(e);
  return result;
};
const deps = (sent: Email[], result?: SendResult) => ({ env: ENV, send: sender(sent, result), now: new Date('2026-11-10T06:00:00Z'), secret: SECRET });
const handlers = (sent: Email[], result?: SendResult) => ({ invoice_reminder: (job: Parameters<typeof reminderJob>[1]) => reminderJob(db, job, deps(sent, result)) });
const drain = (sent: Email[], result?: SendResult) => runDue(db, handlers(sent, result), 10);

// ---- pure rules --------------------------------------------------------------------------------------------------

const facts = { kind: 'invoice', status: 'unpaid' as const, total: 1000, amountPaid: 0, dueDate: '2026-11-05', email: 'a@b.test' };

test('eligibility: only an invoice with a balance and a usable email may be reminded', () => {
  assert.deepEqual(reminderEligibility(facts, TODAY, false), { ok: true, outstanding: 1000, overdue: true });
  assert.deepEqual(reminderEligibility({ ...facts, kind: 'quote' }, TODAY, false), { ok: false, reason: 'not_invoice' });
  assert.deepEqual(reminderEligibility({ ...facts, status: 'paid', amountPaid: 1000 }, TODAY, false), { ok: false, reason: 'paid' });
  assert.deepEqual(reminderEligibility({ ...facts, status: 'paid', amountPaid: 0 }, TODAY, false), { ok: false, reason: 'marked_paid' });
  assert.deepEqual(reminderEligibility({ ...facts, total: 0 }, TODAY, false), { ok: false, reason: 'nothing_owed' });
  assert.deepEqual(reminderEligibility({ ...facts, email: '  ' }, TODAY, false), { ok: false, reason: 'no_email' });
  assert.deepEqual(reminderEligibility({ ...facts, email: 'not-an-email' }, TODAY, false), { ok: false, reason: 'bad_email' });
  // A part payment is chased for the balance only.
  assert.deepEqual(reminderEligibility({ ...facts, amountPaid: 400 }, TODAY, false), { ok: true, outstanding: 600, overdue: true });
  // Not yet due is still allowed (a friendly nudge), and not overdue.
  assert.deepEqual(reminderEligibility({ ...facts, dueDate: '2026-11-20' }, TODAY, false), { ok: true, outstanding: 1000, overdue: false });
});

test('eligibility: pause and an unexpired promise stop scheduled reminders but not a manual one', () => {
  assert.deepEqual(reminderEligibility({ ...facts, paused: true }, TODAY, true), { ok: false, reason: 'paused' });
  assert.equal(reminderEligibility({ ...facts, paused: true }, TODAY, false).ok, true);
  assert.deepEqual(reminderEligibility({ ...facts, promisedOn: TODAY }, TODAY, true), { ok: false, reason: 'promised' });
  assert.deepEqual(reminderEligibility({ ...facts, promisedOn: '2026-11-15' }, TODAY, true), { ok: false, reason: 'promised' });
  assert.equal(reminderEligibility({ ...facts, promisedOn: '2026-11-09' }, TODAY, true).ok, true, 'a broken promise no longer holds reminders back');
  assert.equal(reminderEligibility({ ...facts, promisedOn: '2026-11-15' }, TODAY, false).ok, true);
});

test('dueStep: the latest step due today or within the grace window, never two, never a stale pile-up', () => {
  const days = [3, 7, 14];
  assert.equal(dueStep('2026-11-05', '2026-11-08', days), 3);
  assert.equal(dueStep('2026-11-05', '2026-11-10', days), 3, 'two days late is still inside the grace window');
  assert.equal(dueStep('2026-11-05', '2026-11-11', days), null, 'three days late: skipped, not sent');
  assert.equal(dueStep('2026-11-05', '2026-11-12', days), 7);
  assert.equal(dueStep('2026-11-05', '2026-11-07', days), null, 'before the first step');
  assert.equal(dueStep('2026-02-28', '2026-03-03', [3]), 3, 'across a month end');
});

test('schedule days: 1 to 4 whole days, 1 to 90, sorted and de-duplicated', () => {
  assert.deepEqual(checkSchedule([14, 3, 3, 7]), { ok: true, days: [3, 7, 14] });
  for (const bad of [[], [0], [91], [1.5], ['3'], [1, 2, 3, 4, 5], 'x', null]) assert.equal(checkSchedule(bad).ok, false, JSON.stringify(bad));
});

test('the email names the amount still owed, the seller, and where replies go; the owner’s note is escaped', () => {
  const e = reminderEmail({ to: 'a@b.test', sellerName: 'ABC <Studio>', replyTo: 'me@abc.test', clientName: 'Rahul Sharma', number: 'INV-1', currency: 'INR', total: 1000, outstanding: 600, dueDate: '2026-11-05', overdue: true, url: 'https://kaamsolv.test/i/x', note: 'Thanks <b>so</b> much' });
  assert.equal(e.replyTo, 'me@abc.test');
  assert.match(e.subject, /^Payment reminder: invoice INV-1 from ABC <Studio>$/);
  assert.match(e.text, /Balance due: ₹600\.00/);
  assert.match(e.text, /Invoice total: ₹1,000\.00/);
  assert.match(e.text, /Due date: 5 Nov 2026/);
  assert.match(e.text, /View invoice: https:\/\/kaamsolv\.test\/i\/x/);
  assert.doesNotMatch(e.html, /<b>so<\/b>/);
  assert.match(e.html, /&lt;b&gt;so&lt;\/b&gt;/);
  assert.match(e.html, /ABC &lt;Studio&gt;/);
  assert.doesNotMatch(reminderEmail({ to: 'a@b.test', sellerName: 'X', replyTo: 'r@x.test', clientName: '', number: '1', currency: 'INR', total: 5, outstanding: 5, dueDate: null, overdue: false, url: '' }).text, /View invoice/, 'no link, no promise of one');
});

test('promises: today to a year ahead, a real date, a short note; status follows the balance', () => {
  assert.deepEqual(checkPromise('2026-11-15', '  will pay  ', TODAY), { ok: true, date: '2026-11-15', note: 'will pay' });
  assert.equal(checkPromise('2026-11-10', '', TODAY).ok, true);
  for (const bad of ['2026-11-09', '2026-02-30', '2028-01-01', 'soon', null]) assert.equal(checkPromise(bad, '', TODAY).ok, false, String(bad));
  assert.equal(checkPromise('2026-11-15', 'x'.repeat(201), TODAY).ok, false);
  assert.equal(promiseStatus(null, 500, TODAY), 'none');
  assert.equal(promiseStatus('2026-11-10', 500, TODAY), 'upcoming');
  assert.equal(promiseStatus('2026-11-09', 500, TODAY), 'overdue');
  assert.equal(promiseStatus('2026-11-09', 0, TODAY), 'settled');
});

// ---- manual reminders ----------------------------------------------------------------------------------------------

test('a manual reminder is queued once per invoice per day however often it is requested', async () => {
  const u = await user('owner1@example.test');
  const id = await invoice(u, { n: 'M-1' });
  const first = await requestManualReminder(db, u, id, TODAY, 'Hello');
  assert.ok(first.ok && !first.alreadyQueued);
  const again = await requestManualReminder(db, u, id, TODAY);
  assert.ok(again.ok && again.alreadyQueued && again.reminderId === (first.ok ? first.reminderId : ''));
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from outbox where dedupe_key = ${manualKey(id, TODAY)}`)).rows as { n: number }[];
  assert.equal(n, 1);
  const next = await requestManualReminder(db, u, id, '2026-11-11');
  assert.ok(next.ok && !next.alreadyQueued, 'a new day is a new reminder');
});

test('sending: one email to the customer’s address with the balance, replies to the owner, the reminder marked sent', async () => {
  const u = await user('owner2@example.test');
  const id = await invoice(u, { n: 'S-1', rate: '2000' });
  await pay(u, id, 500);
  const r = await requestManualReminder(db, u, id, TODAY, 'Please pay soon');
  assert.ok(r.ok);
  const sent: Email[] = [];
  const t = await drain(sent);
  assert.equal(t.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'rahul@example.test');
  assert.equal(sent[0].replyTo, 'owner2@example.test');
  assert.match(sent[0].text, /Balance due: ₹1,500\.00/, 'the balance after the part payment, not the total');
  assert.match(sent[0].text, /Please pay soon/);
  assert.match(sent[0].text, /https:\/\/kaamsolv\.test\/i\/[A-Za-z0-9_-]{22}/);
  const list = await listReminders(db, u, id);
  assert.equal(list[0].state, 'sent');
  // Running the queue again sends nothing more.
  const again = await drain(sent);
  assert.equal(again.claimed, 0);
  assert.equal(sent.length, 1);
});

test('a retried job after the email went out does not send a second one', async () => {
  const u = await user('owner3@example.test');
  const id = await invoice(u, { n: 'R-1' });
  const r = await requestManualReminder(db, u, id, TODAY);
  assert.ok(r.ok);
  const sent: Email[] = [];
  await drain(sent);
  // Pretend the job was claimed again (a crash after sending, before it was settled).
  await db.execute(sql`update outbox set status = 'pending', next_attempt_at = now() where dedupe_key = ${manualKey(id, TODAY)}`);
  await drain(sent);
  assert.equal(sent.length, 1);
});

test('eligibility is checked again at send time: a payment made after queueing means no reminder', async () => {
  const u = await user('owner4@example.test');
  const id = await invoice(u, { n: 'P-1' });
  const r = await requestManualReminder(db, u, id, TODAY);
  assert.ok(r.ok);
  await pay(u, id, 1000);
  const sent: Email[] = [];
  await drain(sent);
  assert.equal(sent.length, 0);
  const [row] = await listReminders(db, u, id);
  assert.equal(row.state, 'skipped');
  assert.equal(row.reason, 'paid');
});

test('an invoice that has no customer email, a quotation, a paid invoice and another account’s invoice are refused up front', async () => {
  const u = await user('owner5@example.test');
  const other = await user('owner5b@example.test');
  const noEmail = await invoice(u, { n: 'N-1', email: '' });
  const quote = await invoice(u, { n: 'Q-1', quote: true });
  const paid = await invoice(u, { n: 'D-1' });
  await pay(u, paid, 1000);
  assert.deepEqual(await requestManualReminder(db, u, noEmail, TODAY), { ok: false, reason: 'no_email' });
  assert.deepEqual(await requestManualReminder(db, u, quote, TODAY), { ok: false, reason: 'not_invoice' });
  assert.deepEqual(await requestManualReminder(db, u, paid, TODAY), { ok: false, reason: 'paid' });
  const mine = await invoice(u, { n: 'X-1' });
  assert.deepEqual(await requestManualReminder(db, other, mine, TODAY), { ok: false, reason: 'not_found' }, 'another account sees the same not-found');
  assert.equal((await listReminders(db, other, mine)).length, 0);
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from outbox where kind = 'invoice_reminder' and dedupe_key like ${'%' + mine + '%'}`)).rows as { n: number }[];
  assert.equal(n, 0);
});

test('a legacy "marked paid" invoice is never reminded', async () => {
  const u = await user('owner6@example.test');
  const id = await invoice(u, { n: 'L-1' });
  await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
  try {
    await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, id));
  } finally {
    await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
  }
  assert.deepEqual(await requestManualReminder(db, u, id, TODAY), { ok: false, reason: 'marked_paid' });
});

test('without the Pro plan a reminder that was queued is skipped, not sent', async () => {
  const u = await user('free1@example.test', false);
  const id = await invoice(u, { n: 'F-1' });
  const r = await requestManualReminder(db, u, id, TODAY);
  assert.ok(r.ok, 'the API gate is separate; the job protects the send itself');
  const sent: Email[] = [];
  await drain(sent);
  assert.equal(sent.length, 0);
  assert.equal((await listReminders(db, u, id))[0].reason, 'no_plan');
});

test('failures: a provider error is retried with back-off and shows as retrying, then failed; try again re-queues it', async () => {
  const u = await user('owner7@example.test');
  const id = await invoice(u, { n: 'E-1' });
  const r = await requestManualReminder(db, u, id, TODAY);
  assert.ok(r.ok);
  const sent: Email[] = [];
  const fail: SendResult = { ok: false, code: 'email_rejected_500' };
  assert.equal((await drain(sent, fail)).failed, 1);
  let row = (await listReminders(db, u, id))[0];
  assert.equal(row.state, 'retrying');
  assert.equal(row.reason, 'email_rejected_500');
  assert.equal(row.attempts, 1);
  assert.ok(row.nextAttemptAt);
  // Exhaust the attempts.
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    await db.execute(sql`update outbox set next_attempt_at = now() where dedupe_key = ${manualKey(id, TODAY)}`);
    await drain(sent, fail);
  }
  row = (await listReminders(db, u, id))[0];
  assert.equal(row.state, 'failed');
  // Another account can't retry it.
  const stranger = await user('stranger@example.test');
  assert.equal(await retryReminder(db, stranger, row.id), 'not_found');
  assert.equal(await retryReminder(db, u, row.id), 'queued');
  assert.equal((await drain(sent)).sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(await retryReminder(db, u, row.id), 'not_retryable', 'already sent');
});

test('with no email provider configured the job waits as blocked, and does not count as a failure', async () => {
  const u = await user('owner8@example.test');
  const id = await invoice(u, { n: 'B-1' });
  await requestManualReminder(db, u, id, TODAY);
  const t = await drain([], { ok: false, code: 'email_not_configured' });
  assert.equal(t.blocked, 1);
  assert.equal((await listReminders(db, u, id))[0].state, 'waiting');
});

test('the daily limit stops an account at its cap, and only counts distinct reminders', async () => {
  const u = await user('owner9@example.test');
  const TODAY = istClock(new Date()).date; // the limit counts rows made today, by the real clock
  const ids: string[] = [];
  for (let i = 0; i < DAILY_REMINDER_LIMIT + 1; i++) ids.push(await invoice(u, { n: `LIM-${i}` }));
  for (let i = 0; i < DAILY_REMINDER_LIMIT; i++) assert.ok((await requestManualReminder(db, u, ids[i], TODAY)).ok, `reminder ${i}`);
  assert.deepEqual(await requestManualReminder(db, u, ids[DAILY_REMINDER_LIMIT], TODAY), { ok: false, reason: 'daily_limit' });
  const repeat = await requestManualReminder(db, u, ids[0], TODAY);
  assert.ok(repeat.ok && repeat.alreadyQueued, 'asking again for one already queued is not a new reminder');
});

// ---- scheduled reminders ----------------------------------------------------------------------------------------------

test('scheduled: queued once per step, only for open invoices that are due, with an email, not paused, not promised', async () => {
  const u = await user('sched1@example.test');
  await saveReminderSettings(db, u, { enabled: true, days: [3, 7] });
  const due = await invoice(u, { n: 'SC-1', due: '2026-11-07' }); // 3 days late today
  const notYet = await invoice(u, { n: 'SC-2', due: '2026-11-09' }); // 1 day late
  const paused = await invoice(u, { n: 'SC-3', due: '2026-11-07' });
  const promised = await invoice(u, { n: 'SC-4', due: '2026-11-07' });
  const noMail = await invoice(u, { n: 'SC-5', due: '2026-11-07', email: '' });
  const paid = await invoice(u, { n: 'SC-6', due: '2026-11-07' });
  await pay(u, paid, 1000);
  await setRemindersPaused(db, u, paused, true);
  assert.deepEqual(await setPromise(db, u, promised, '2026-11-12', 'next week', TODAY), { ok: true });

  assert.equal(await enqueueScheduledReminders(db, TODAY), 1);
  assert.equal(await enqueueScheduledReminders(db, TODAY), 0, 'a second run the same day adds nothing');
  for (const id of [notYet, paused, promised, noMail, paid]) assert.equal((await listReminders(db, u, id)).length, 0, id);
  const [row] = await listReminders(db, u, due);
  assert.equal(row.kind, 'scheduled');
  assert.equal(row.step, 3);
  const keyRow = (await db.execute(sql`select dedupe_key from outbox where dedupe_key = ${scheduledKey(due, 3)}`)).rows;
  assert.equal(keyRow.length, 1);
  const sent: Email[] = [];
  assert.equal((await drain(sent)).sent, 1);
  assert.equal(sent[0].to, 'rahul@example.test');
});

test('scheduled: off by default, and turning it off stops new ones', async () => {
  const u = await user('sched2@example.test');
  const id = await invoice(u, { n: 'OFF-1', due: '2026-11-07' });
  assert.deepEqual(await getReminderSettings(db, u), { enabled: false, days: [3, 7, 14] });
  assert.equal(await enqueueScheduledReminders(db, TODAY), 0);
  await saveReminderSettings(db, u, { enabled: false, days: [3] });
  assert.equal(await enqueueScheduledReminders(db, TODAY), 0);
  assert.equal((await listReminders(db, u, id)).length, 0);
});

test('scheduled: pausing after it was queued skips it at send time', async () => {
  const u = await user('sched3@example.test');
  await saveReminderSettings(db, u, { enabled: true, days: [3] });
  const id = await invoice(u, { n: 'PS-1', due: '2026-11-07' });
  assert.equal(await enqueueScheduledReminders(db, TODAY), 1);
  await setRemindersPaused(db, u, id, true);
  const sent: Email[] = [];
  await drain(sent);
  assert.equal(sent.length, 0);
  assert.equal((await listReminders(db, u, id))[0].reason, 'paused');
});

test('scheduled: an account never queues more than the daily limit in one run', async () => {
  const u = await user('sched4@example.test');
  await saveReminderSettings(db, u, { enabled: true, days: [3] });
  for (let i = 0; i < DAILY_REMINDER_LIMIT + 5; i++) await invoice(u, { n: `BIG-${i}`, due: '2026-11-07' });
  assert.equal(await enqueueScheduledReminders(db, TODAY), DAILY_REMINDER_LIMIT);
  const left = await enqueueScheduledReminders(db, TODAY);
  assert.equal(left, 0, 'the rest wait for another day, they are not queued past the cap');
});

// ---- promises ----------------------------------------------------------------------------------------------------

test('a promise is a note beside the ledger: it never changes the balance or status, and follows payments', async () => {
  const u = await user('prom1@example.test');
  const id = await invoice(u, { n: 'PR-1', rate: '1000' });
  const before = await db.select({ total: invoices.total, paid: invoices.amountPaid, status: invoices.status }).from(invoices).where(eq(invoices.id, id));
  assert.deepEqual(await setPromise(db, u, id, '2026-11-15', 'by UPI', TODAY), { ok: true });
  assert.deepEqual(await db.select({ total: invoices.total, paid: invoices.amountPaid, status: invoices.status }).from(invoices).where(eq(invoices.id, id)), before);
  let f = await getFollowup(db, u, id, TODAY);
  assert.equal(f?.status, 'upcoming');
  assert.equal(f?.promiseNote, 'by UPI');
  assert.equal(f?.outstanding, 1000);
  f = await getFollowup(db, u, id, '2026-11-16');
  assert.equal(f?.status, 'overdue', 'the date has passed with money outstanding');
  await pay(u, id, 400);
  assert.equal((await getFollowup(db, u, id, '2026-11-16'))?.status, 'overdue', 'a part payment does not settle it');
  await pay(u, id, 600);
  assert.equal((await getFollowup(db, u, id, '2026-11-16'))?.status, 'settled');
  assert.deepEqual(await setPromise(db, u, id, '2026-11-20', '', TODAY), { ok: false, reason: 'not_open' });
  assert.equal(await clearPromise(db, u, id), true);
  assert.equal((await getFollowup(db, u, id, TODAY))?.status, 'none');
});

test('promises: update replaces, invalid dates are refused, and another account can neither read nor change one', async () => {
  const u = await user('prom2@example.test');
  const other = await user('prom2b@example.test');
  const id = await invoice(u, { n: 'PR-2' });
  await setPromise(db, u, id, '2026-11-15', 'first', TODAY);
  await setPromise(db, u, id, '2026-11-18', 'second', TODAY);
  const f = await getFollowup(db, u, id, TODAY);
  assert.equal(f?.promisedOn, '2026-11-18');
  assert.equal(f?.promiseNote, 'second');
  assert.equal((await setPromise(db, u, id, '2026-11-01', '', TODAY)).ok, false);
  assert.equal(await getFollowup(db, other, id, TODAY), null);
  assert.deepEqual(await setPromise(db, other, id, '2026-11-20', 'hijack', TODAY), { ok: false, reason: 'not_found' });
  assert.equal(await clearPromise(db, other, id), false);
  assert.equal(await setRemindersPaused(db, other, id, true), false);
  assert.equal((await getFollowup(db, u, id, TODAY))?.promisedOn, '2026-11-18');
  const quote = await invoice(u, { n: 'PR-Q', quote: true });
  assert.deepEqual(await setPromise(db, u, quote, '2026-11-20', '', TODAY), { ok: false, reason: 'not_open' });
});

test('two runners claiming the queue together never process the same reminder twice', async () => {
  const u = await user('owner10@example.test');
  const id = await invoice(u, { n: 'C-1' });
  await requestManualReminder(db, u, id, TODAY);
  const [a, b] = await Promise.all([claimDue(db, 10), claimDue(db, 10)]);
  assert.equal(a.length + b.length, 1);
  for (const job of [...a, ...b]) await settle(db, job, { result: 'sent' });
  assert.equal((await db.select().from(outbox).where(eq(outbox.dedupeKey, manualKey(id, TODAY))))[0].status, 'sent');
});
