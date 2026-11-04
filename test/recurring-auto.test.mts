/**
 * Automatic recurring invoices, on real Postgres (PGlite, real migrations): the schedule arithmetic at month ends and
 * leap years, the India-date boundary, one invoice per period however often the queue runs, pause / end date / run
 * count, the plan gate and the plan's save limit, "Create"/"Skip" clicks racing the cron, and other accounts.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, invoices, outbox, subscriptions } from '../db/schema.ts';
import { createInvoice, recurInvoice, setRecurring, saveProfile } from '../db/invoices.ts';
import { runDue, claimDue } from '../db/outbox.ts';
import { claimRun, enqueueDueRecurring, getAutomation, saveAutomation } from '../db/recurring-auto.ts';
import { recurringJob } from '../app/lib/notify/recurring-job.ts';
import { istClock } from '../app/lib/notify/schedule.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { nextRecurAfter, nextRecurDate, type RecurEvery } from '../app/lib/invoice/recurring.ts';
import { autoState, checkAutoSettings, hasEnded } from '../app/lib/invoice/recurring-auto.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());
beforeEach(async () => {
  await db.execute(sql`delete from outbox`);
});

const TODAY = '2026-11-10';
const NOW = new Date('2026-11-10T04:00:00Z'); // 9:30 am India time on 10 Nov

async function user(email: string, pro = true): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: 'Owner', email, emailVerified: true }).returning({ id: authUsers.id });
  if (pro) await db.insert(subscriptions).values({ userId: u.id, provider: 'manual', providerRef: `manual:${email}`, planKey: 'invoice_pro', status: 'active' });
  return u.id;
}
async function template(userId: string, o: { n?: string; every?: RecurEvery; next: string; auto?: Partial<{ paused: boolean; endsOn: string | null; maxRuns: number | null }> | null; limit?: number | null }): Promise<string> {
  const doc: Invoice = {
    ...newInvoice(new Date(2026, 9, 1)),
    number: o.n ?? 'T-1',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    items: [{ id: 'a', description: 'Retainer', qty: '1', rate: '5000' }],
    taxRate: '18',
    seller: { name: 'ABC Studio', address: '', email: '', phone: '' },
    client: { name: 'Rahul Sharma', address: 'Pune', email: 'rahul@example.test' },
  };
  const r = await createInvoice(db, userId, doc, o.limit ?? null);
  assert.ok(r.ok);
  const id = r.ok ? r.id : '';
  assert.ok(await setRecurring(db, userId, id, { every: o.every ?? 'month', next: o.next }));
  if (o.auto !== null) assert.deepEqual(await saveAutomation(db, userId, id, { autoCreate: true, paused: o.auto?.paused ?? false, endsOn: o.auto?.endsOn ?? null, maxRuns: o.auto?.maxRuns ?? null }), { ok: true });
  return id;
}
const drain = (now = NOW) => runDue(db, { recurring_invoice: (job) => recurringJob(db, job, { now }) }, 20);
const count = async (userId: string) => ((await db.select().from(invoices).where(eq(invoices.userId, userId))) as unknown[]).length;

// ---- pure ---------------------------------------------------------------------------------------------------

test('schedule dates: month ends clamp, leap years count, catch-up lands after today', () => {
  assert.equal(nextRecurDate('2026-01-31', 'month'), '2026-02-28');
  assert.equal(nextRecurDate('2028-01-31', 'month'), '2028-02-29');
  assert.equal(nextRecurDate('2028-02-29', 'year'), '2029-02-28');
  assert.equal(nextRecurDate('2026-11-30', 'quarter'), '2027-02-28');
  assert.equal(nextRecurDate('2026-12-28', 'week'), '2027-01-04');
  assert.equal(nextRecurAfter('2026-08-10', 'month', TODAY), '2026-12-10', 'a missed run catches up to the next future date');
});

test('state, validation and the end rule', () => {
  assert.equal(autoState({ hasSchedule: false, autoCreate: true, paused: false, endedAt: null }), 'off');
  assert.equal(autoState({ hasSchedule: true, autoCreate: false, paused: false, endedAt: null }), 'off');
  assert.equal(autoState({ hasSchedule: true, autoCreate: true, paused: false, endedAt: null }), 'active');
  assert.equal(autoState({ hasSchedule: true, autoCreate: true, paused: true, endedAt: null }), 'paused');
  assert.equal(autoState({ hasSchedule: true, autoCreate: true, paused: false, endedAt: '2026-11-10' }), 'ended');
  assert.deepEqual(checkAutoSettings({ autoCreate: true, endsOn: '2027-03-31', maxRuns: 12 }, TODAY), { ok: true, value: { autoCreate: true, paused: false, endsOn: '2027-03-31', maxRuns: 12 } });
  for (const bad of [{}, { autoCreate: 'yes' }, { autoCreate: true, endsOn: '2026-11-09' }, { autoCreate: true, endsOn: '2026-02-30' }, { autoCreate: true, endsOn: '2099-01-01' }, { autoCreate: true, maxRuns: 0 }, { autoCreate: true, maxRuns: 501 }, { autoCreate: true, maxRuns: 1.5 }, { autoCreate: true, paused: 'no' }]) {
    assert.equal(checkAutoSettings(bad, TODAY).ok, false, JSON.stringify(bad));
  }
  assert.equal(hasEnded({ endsOn: null, maxRuns: 3, runsDone: 3 }, '2027-01-01'), true);
  assert.equal(hasEnded({ endsOn: '2026-12-31', maxRuns: null, runsDone: 1 }, '2027-01-10'), true);
  assert.equal(hasEnded({ endsOn: '2026-12-31', maxRuns: null, runsDone: 1 }, '2026-12-10'), false);
});

// ---- generation ---------------------------------------------------------------------------------------------

test('a due schedule makes one invoice that is a copy, does not repeat itself, and moves the schedule on', async () => {
  const u = await user('a1@example.test');
  await saveProfile(db, u, { name: 'ABC Studio', address: '', email: '', phone: '', logo: null });
  const id = await template(u, { next: TODAY });
  assert.equal(await enqueueDueRecurring(db, TODAY), 1);
  assert.equal((await drain()).sent, 1);
  const all = await db.select().from(invoices).where(eq(invoices.userId, u));
  assert.equal(all.length, 2);
  const copy = all.find((i) => i.id !== id)!;
  assert.equal(copy.issueDate, TODAY);
  assert.equal(copy.clientName, 'Rahul Sharma');
  assert.equal(copy.total, 5900, 'same line and 18% tax');
  assert.equal(copy.recurEvery, null, 'the copy does not repeat');
  assert.equal(copy.status, 'unpaid');
  assert.equal(copy.amountPaid, 0);
  assert.notEqual(copy.number, 'T-1');
  const a = await getAutomation(db, u, id);
  assert.equal(a?.recurNext, '2026-12-10');
  assert.equal(a?.runsDone, 1);
  assert.equal(a?.runs[0].status, 'created');
  assert.equal(a?.runs[0].createdNumber, copy.number);
  const mail = (await db.execute(sql`select count(*)::int as n from outbox where kind <> 'recurring_invoice'`)).rows as { n: number }[];
  assert.equal(mail[0].n, 0, 'nothing is emailed');
});

test('running the queue again, replaying a job, or two runners at once never makes a second invoice for the period', async () => {
  const u = await user('a2@example.test');
  const id = await template(u, { next: TODAY });
  await enqueueDueRecurring(db, TODAY);
  await drain();
  assert.equal(await enqueueDueRecurring(db, TODAY), 0, 'the schedule moved on, nothing is due');
  // Replay the very same job.
  await db.execute(sql`update outbox set status = 'pending', next_attempt_at = now()`);
  await drain();
  assert.equal(await count(u), 2);
  // Two runners claiming the same period: one wins.
  const [x, y] = await Promise.all([claimRun(db, u, id, '2027-01-10'), claimRun(db, u, id, '2027-01-10')]);
  assert.equal([x, y].filter((c) => 'runId' in c).length, 1);
  // Two runners claiming the queue together.
  const u2 = await user('a2b@example.test');
  await template(u2, { next: TODAY });
  await enqueueDueRecurring(db, TODAY);
  const [p, q] = await Promise.all([claimDue(db, 10), claimDue(db, 10)]);
  assert.equal(p.length + q.length, 1);
});

test('a missed schedule makes one invoice now and moves to the next future date, not a pile of back-dated ones', async () => {
  const u = await user('a3@example.test');
  const id = await template(u, { next: '2026-08-10' });
  await enqueueDueRecurring(db, TODAY);
  await drain();
  assert.equal(await count(u), 2);
  assert.equal((await getAutomation(db, u, id))?.recurNext, '2026-12-10');
});

test('the India date decides: 10 Nov starts at 6:30 pm UTC on the 9th, not at 00:00 UTC', async () => {
  const u = await user('a4@example.test');
  await template(u, { next: '2026-11-10' });
  const before = new Date('2026-11-09T18:00:00Z'); // 11:30 pm on the 9th in India
  assert.equal(istClock(before).date, '2026-11-09');
  assert.equal(await enqueueDueRecurring(db, istClock(before).date), 0);
  const after = new Date('2026-11-09T18:31:00Z'); // 12:01 am on the 10th in India
  assert.equal(istClock(after).date, '2026-11-10');
  assert.equal(await enqueueDueRecurring(db, istClock(after).date), 1);
  await drain(after);
  assert.equal(await count(u), 2);
});

test('off, paused, ended, past its end date or run count: nothing is made', async () => {
  const u = await user('a5@example.test');
  await template(u, { next: TODAY, n: 'OFF', auto: null }); // schedule only, no automation
  await template(u, { next: TODAY, n: 'PAUSED', auto: { paused: true } });
  await template(u, { next: TODAY, n: 'ENDED', auto: { endsOn: TODAY } }); // allowed today...
  const pastEnd = await template(u, { next: TODAY, n: 'PASTEND', auto: {} });
  await db.execute(sql`update recurring_automation set ends_on = '2026-11-01' where invoice_id = ${pastEnd}::uuid`);
  const capped = await template(u, { next: TODAY, n: 'CAPPED', auto: { maxRuns: 1 } });
  await db.execute(sql`update recurring_automation set runs_done = 1 where invoice_id = ${capped}::uuid`);
  assert.equal(await enqueueDueRecurring(db, TODAY), 1, 'only the one ending today is still inside its end date');
});

test('the last run ends the schedule by itself: run count, then end date; saving again restarts it', async () => {
  const u = await user('a6@example.test');
  const id = await template(u, { next: TODAY, auto: { maxRuns: 1 } });
  await enqueueDueRecurring(db, TODAY);
  await drain();
  let a = await getAutomation(db, u, id);
  assert.equal(a?.state, 'ended');
  await enqueueDueRecurring(db, '2026-12-10');
  assert.equal(((await db.execute(sql`select count(*)::int as n from outbox where dedupe_key like ${'recur:' + id + ':%'}`)).rows as { n: number }[])[0].n, 1, 'only the first period was ever queued');
  const id2 = await template(u, { next: TODAY, n: 'E2', auto: { endsOn: '2026-11-30' } });
  await enqueueDueRecurring(db, TODAY);
  await drain();
  a = await getAutomation(db, u, id2);
  assert.equal(a?.state, 'ended', 'the next one (10 Dec) is past the end date');
  assert.deepEqual(await saveAutomation(db, u, id2, { autoCreate: true, paused: false, endsOn: null, maxRuns: null }), { ok: true });
  assert.equal((await getAutomation(db, u, id2))?.state, 'active');
});

test('a Create or Skip click that lands first leaves nothing for the cron to do', async () => {
  const u = await user('a7@example.test');
  const id = await template(u, { next: TODAY });
  await enqueueDueRecurring(db, TODAY);
  assert.equal((await recurInvoice(db, u, id, 'skip', TODAY, null)).ok, true);
  await drain();
  assert.equal(await count(u), 1, 'skipped by hand: no invoice');
  assert.equal((await getAutomation(db, u, id))?.runs.length, 0);
});

test('no Pro plan: the run is recorded as skipped and nothing is made', async () => {
  const u = await user('a8@example.test');
  const id = await template(u, { next: TODAY });
  await db.execute(sql`delete from subscriptions where user_id = ${u}::uuid`);
  await enqueueDueRecurring(db, TODAY);
  await drain();
  assert.equal(await count(u), 1);
  const run = (await getAutomation(db, u, id))?.runs[0];
  assert.equal(run?.status, 'skipped');
  assert.equal(run?.reason, 'no_plan');
});

test('hitting the plan save limit is a visible failure and leaves the schedule where it was', async () => {
  const u = await user('a9@example.test');
  const id = await template(u, { next: TODAY });
  await db.execute(sql`update plan_features set limit_value = 1 where feature_key = 'invoice_save'`);
  try {
    await enqueueDueRecurring(db, TODAY);
    await drain();
    const a = await getAutomation(db, u, id);
    assert.equal(a?.runs[0].status, 'failed');
    assert.equal(a?.runs[0].reason, 'limit');
    assert.equal(a?.recurNext, TODAY, 'still due: the "Due to repeat" prompt can still make it');
    assert.equal(await count(u), 1);
  } finally {
    await db.execute(sql`update plan_features set limit_value = 20 where plan_key = 'free_account' and feature_key = 'invoice_save'`);
    await db.execute(sql`update plan_features set limit_value = null where plan_key = 'invoice_pro' and feature_key = 'invoice_save'`);
  }
});

test('a run that started and never finished is shown as failed (interrupted), not as still going', async () => {
  const u = await user('b1@example.test');
  const id = await template(u, { next: TODAY });
  const c = await claimRun(db, u, id, TODAY);
  assert.ok('runId' in c);
  const run = (await getAutomation(db, u, id))?.runs[0];
  assert.equal(run?.status, 'failed');
  assert.equal(run?.reason, 'interrupted');
});

test('settings: needs a schedule, belongs to its owner, and quotations are not recurring invoices', async () => {
  const u = await user('b2@example.test');
  const other = await user('b2b@example.test');
  const plain = await createInvoice(db, u, { ...newInvoice(new Date(2026, 9, 1)), number: 'P-1', items: [{ id: 'a', description: 'x', qty: '1', rate: '10' }] }, null);
  assert.ok(plain.ok);
  const pid = plain.ok ? plain.id : '';
  assert.deepEqual(await saveAutomation(db, u, pid, { autoCreate: true, paused: false, endsOn: null, maxRuns: null }), { ok: false, reason: 'no_schedule' });
  const id = await template(u, { next: TODAY, auto: null });
  assert.deepEqual(await saveAutomation(db, other, id, { autoCreate: true, paused: false, endsOn: null, maxRuns: null }), { ok: false, reason: 'not_found' });
  assert.equal(await getAutomation(db, other, id), null);
  const quote = await createInvoice(db, u, { ...newInvoice(new Date(2026, 9, 1)), number: 'Q-1', kind: 'quote', items: [{ id: 'a', description: 'x', qty: '1', rate: '10' }] }, null);
  assert.ok(quote.ok);
  assert.equal(await getAutomation(db, u, quote.ok ? quote.id : ''), null);
  assert.equal(randomUUID().length, 36);
});
