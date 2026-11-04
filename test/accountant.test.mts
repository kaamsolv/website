/**
 * Accountant Connect on real Postgres (PGlite, real migrations): the previous-month range, the India schedule, the
 * confirmed-address rule, one pack per account per month, the send-time re-checks, the expiring link, and the ZIP's
 * contents, including that it holds only the owner's own data. No email is sent: the job gets a stand-in sender.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, subscriptions } from '../db/schema.ts';
import { createInvoice, saveProfile } from '../db/invoices.ts';
import { recordPayment } from '../db/payments.ts';
import { runDue } from '../db/outbox.ts';
import { confirmVerification, enqueueDuePacks, getSettings, listPacks, peekVerification, resolvePackLink, retryPack, revokeLinks, saveSettings, startVerification } from '../db/accountant.ts';
import { buildPack } from '../db/accountant-pack.ts';
import { accountantPackJob } from '../app/lib/notify/accountant-job.ts';
import { checkAccountant, nextDelivery, packDue, periodOf, previousMonth, PACK_COVERAGE, type PackSection } from '../app/lib/invoice/accountant.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';
import type { Email, SendResult } from '../app/lib/email.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());
beforeEach(async () => {
  await db.execute(sql`delete from outbox`);
});

const SECRET = 'accountant-test-secret';
const ENV = { NEXT_PUBLIC_SITE_URL: 'https://kaamsolv.test' } as Record<string, string | undefined>;
const ALL: PackSection[] = ['register', 'tax_summary', 'payments', 'outstanding', 'ageing'];
const NOV5_10AM_IST = { date: '2026-11-05', hour: 10 };

async function user(email: string, pro = true): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: 'Owner', email, emailVerified: true }).returning({ id: authUsers.id });
  if (pro) await db.insert(subscriptions).values({ userId: u.id, provider: 'manual', providerRef: `manual:${email}`, planKey: 'invoice_pro', status: 'active' });
  return u.id;
}
async function invoice(userId: string, o: { n: string; issue: string; rate?: string; client?: string }): Promise<string> {
  const doc: Invoice = {
    ...newInvoice(new Date(2026, 9, 1)),
    number: o.n,
    issueDate: o.issue,
    dueDate: '2026-10-25',
    items: [{ id: 'a', description: 'Work', qty: '1', rate: o.rate ?? '1000' }],
    taxLabel: 'GST',
    taxRate: '18',
    seller: { name: 'ABC Studio', address: '', email: '', phone: '' },
    client: { name: o.client ?? 'Rahul Sharma', address: '', email: '' },
  };
  const r = await createInvoice(db, userId, doc, null);
  assert.ok(r.ok);
  return r.ok ? r.id : '';
}
const pay = async (userId: string, id: string, amount: number, paidOn: string) => {
  const r = await recordPayment(db, userId, id, { amountCents: Math.round(amount * 100), paidOn, method: 'upi', reference: '', note: '', clientKey: randomUUID(), reconcile: false });
  assert.ok(r.ok, JSON.stringify(r));
};
async function connect(userId: string, o: { email?: string; enabled?: boolean; confirmed?: boolean } = {}) {
  await saveSettings(db, userId, { name: 'CA Mehta', email: o.email ?? `ca-${userId.slice(0, 6)}@example.test`, enabled: false, day: 5, hour: 10, sections: ALL });
  if (o.confirmed !== false) {
    const token = await startVerification(db, userId, SECRET);
    assert.ok(token);
    assert.equal(await confirmVerification(db, token!), true);
  }
  if (o.enabled !== false) await saveSettings(db, userId, { name: 'CA Mehta', email: (await getSettings(db, userId))!.email, enabled: true, day: 5, hour: 10, sections: ALL });
}
const sender = (sent: Email[], result: SendResult = { ok: true, id: 'test-id' }) => async (e: Email) => {
  if (result.ok) sent.push(e);
  return result;
};
const drain = (sent: Email[], result?: SendResult) => runDue(db, { accountant_pack: (job) => accountantPackJob(db, job, { env: ENV, send: sender(sent, result), secret: SECRET }) }, 10);
const tokenOf = (e: Email) => /download\?t=([A-Za-z0-9_-]{22})/.exec(e.text)![1];

// ---- pure ----------------------------------------------------------------------------------------------------

test('the previous completed month: year turn, leap February, and bad input', () => {
  assert.deepEqual(previousMonth('2026-11-05'), { period: '2026-10', from: '2026-10-01', to: '2026-10-31', label: 'October 2026' });
  assert.equal(previousMonth('2026-01-03').period, '2025-12');
  assert.equal(previousMonth('2028-03-01').to, '2028-02-29');
  assert.equal(previousMonth('2027-03-01').to, '2027-02-28');
  assert.equal(periodOf('2026-13'), null);
  assert.equal(periodOf('2026-10-01'), null);
  assert.equal(periodOf(null), null);
});

test('the schedule is India time: due from the chosen day and hour, and still due later that month', () => {
  assert.equal(packDue({ date: '2026-11-05', hour: 9 }, 5, 10), false);
  assert.equal(packDue({ date: '2026-11-05', hour: 10 }, 5, 10), true);
  assert.equal(packDue({ date: '2026-11-04', hour: 23 }, 5, 10), false);
  assert.equal(packDue({ date: '2026-11-20', hour: 3 }, 5, 10), true, 'a missed run is made up later in the month');
  assert.deepEqual(nextDelivery({ date: '2026-11-02', hour: 8 }, 5, 10, false), { date: '2026-11-05', hour: 10, now: false });
  assert.deepEqual(nextDelivery({ date: '2026-11-05', hour: 12 }, 5, 10, false), { date: '2026-11-05', hour: 12, now: true });
  assert.deepEqual(nextDelivery({ date: '2026-11-05', hour: 12 }, 5, 10, true), { date: '2026-12-05', hour: 10, now: false });
  assert.deepEqual(nextDelivery({ date: '2026-12-06', hour: 12 }, 5, 10, true), { date: '2027-01-05', hour: 10, now: false });
});

test('settings are checked: a name, a real email, day 1 to 28, an hour, at least one section', () => {
  const good = { name: '  CA   Mehta ', email: ' CA@Example.TEST ', enabled: true, day: 5, hour: 10, sections: ['payments', 'register'] };
  assert.deepEqual(checkAccountant(good), { ok: true, value: { name: 'CA Mehta', email: 'ca@example.test', enabled: true, day: 5, hour: 10, sections: ['register', 'payments'] } });
  for (const bad of [{ name: '' }, { name: '<b>x</b>' }, { email: 'nope' }, { day: 0 }, { day: 29 }, { hour: 24 }, { hour: 1.5 }, { sections: [] }, { sections: ['everything'] }, { enabled: 'yes' }]) {
    assert.equal(checkAccountant({ ...good, ...bad }).ok, false, JSON.stringify(bad));
  }
});

// ---- confirming the address ----------------------------------------------------------------------------------

test('the accountant confirms once; a used, wrong or expired link does nothing; a new address starts unconfirmed and ends old links', async () => {
  const u = await user('own1@example.test');
  await saveSettings(db, u, { name: 'CA', email: 'ca1@example.test', enabled: false, day: 5, hour: 10, sections: ALL });
  assert.equal(await startVerification(db, await user('own1b@example.test'), SECRET), null, 'nothing to confirm for an account with no accountant');
  const token = (await startVerification(db, u, SECRET))!;
  assert.deepEqual(await peekVerification(db, token), { accountantName: 'CA', businessName: '' });
  assert.equal((await getSettings(db, u))?.verified, false, 'opening the link page changes nothing');
  assert.equal(await confirmVerification(db, 'x'.repeat(22)), false);
  assert.equal(await confirmVerification(db, token), true);
  assert.equal(await confirmVerification(db, token), false, 'works once');
  assert.equal((await getSettings(db, u))?.verified, true);

  const expired = (await startVerification(db, (await user('own1c@example.test')), SECRET));
  assert.equal(expired, null);
  const u2 = await user('own1d@example.test');
  await saveSettings(db, u2, { name: 'CA', email: 'ca2@example.test', enabled: false, day: 5, hour: 10, sections: ALL });
  const t2 = (await startVerification(db, u2, SECRET))!;
  await db.execute(sql`update accountant_settings set verify_expires_at = now() - interval '1 minute' where user_id = ${u2}::uuid`);
  assert.equal(await confirmVerification(db, t2), false, 'expired');

  // A confirmed, enabled account that changes the address: unconfirmed, off, old links ended.
  await connect(u);
  await invoice(u, { n: 'C-1', issue: '2026-10-05' });
  await enqueueDuePacks(db, NOV5_10AM_IST);
  const sent: Email[] = [];
  await drain(sent);
  const old = tokenOf(sent[0]);
  assert.ok(await resolvePackLink(db, old));
  await saveSettings(db, u, { name: 'New CA', email: 'new-ca@example.test', enabled: true, day: 5, hour: 10, sections: ALL });
  const s = await getSettings(db, u);
  assert.equal(s?.verified, false);
  assert.equal(s?.enabled, false);
  assert.equal(await resolvePackLink(db, old), null, 'the old address’s link is dead');
});

// ---- queueing and sending -----------------------------------------------------------------------------------

test('queueing: only an enabled, confirmed account, from its day and hour (India), one pack per month', async () => {
  const on = await user('q1@example.test');
  await connect(on);
  const unconfirmed = await user('q2@example.test');
  await connect(unconfirmed, { confirmed: false, enabled: false });
  const off = await user('q3@example.test');
  await connect(off, { enabled: false });

  assert.equal(await enqueueDuePacks(db, { date: '2026-11-05', hour: 9 }), 0, 'before the hour');
  assert.equal(await enqueueDuePacks(db, { date: '2026-11-05', hour: 10 }), 1);
  assert.equal(await enqueueDuePacks(db, { date: '2026-11-05', hour: 11 }), 0, 'queued once');
  assert.equal(await enqueueDuePacks(db, { date: '2026-11-28', hour: 0 }), 0, 'still the same month');
  const [p] = await listPacks(db, on);
  assert.equal(p.period, '2026-10', 'on 5 Nov the pack is October');
  assert.equal(await enqueueDuePacks(db, { date: '2026-12-05', hour: 10 }), 1, 'next month, a new pack (for November)');
  assert.equal((await listPacks(db, on))[0].period, '2026-11');
  assert.equal((await listPacks(db, unconfirmed)).length + (await listPacks(db, off)).length, 0);
});

test('sending: one email to the accountant with an expiring link and no attachment; replies to the owner; once only', async () => {
  const u = await user('s1@example.test');
  await saveProfile(db, u, { name: 'ABC Studio', address: '', email: '', phone: '', logo: null });
  await connect(u, { email: 'ca-s1@example.test' });
  const id = await invoice(u, { n: 'S-1', issue: '2026-10-05' });
  await pay(u, id, 500, '2026-10-20');
  await enqueueDuePacks(db, NOV5_10AM_IST);
  const sent: Email[] = [];
  assert.equal((await drain(sent)).sent, 1);
  assert.equal(sent.length, 1);
  const e = sent[0];
  assert.equal(e.to, 'ca-s1@example.test');
  assert.equal(e.replyTo, 's1@example.test');
  assert.match(e.subject, /ABC Studio: October 2026 accountant pack/);
  assert.match(e.text, /https:\/\/kaamsolv\.test\/api\/accountant\/download\?t=[A-Za-z0-9_-]{22}/);
  assert.match(e.text, /not a GST return/i);
  assert.equal(Object.keys(e).includes('attachments'), false);
  assert.equal((await listPacks(db, u))[0].state, 'sent');
  await db.execute(sql`update outbox set status = 'pending', next_attempt_at = now()`);
  await drain(sent);
  assert.equal(sent.length, 1, 'a replayed job sends nothing more');
});

test('send-time checks: switched off, address changed, no plan, and an empty month are skipped with a reason', async () => {
  const off = await user('s2@example.test');
  await connect(off);
  await invoice(off, { n: 'X-1', issue: '2026-10-05' });
  const empty = await user('s3@example.test');
  await connect(empty);
  const lapsed = await user('s4@example.test');
  await connect(lapsed);
  await invoice(lapsed, { n: 'X-2', issue: '2026-10-05' });
  await enqueueDuePacks(db, NOV5_10AM_IST);
  await db.execute(sql`update accountant_settings set enabled = false where user_id = ${off}::uuid`);
  await db.execute(sql`delete from subscriptions where user_id = ${lapsed}::uuid`);
  const sent: Email[] = [];
  await drain(sent);
  assert.equal(sent.length, 0);
  assert.equal((await listPacks(db, off))[0].reason, 'turned_off');
  assert.equal((await listPacks(db, empty))[0].reason, 'nothing_to_report');
  assert.equal((await listPacks(db, lapsed))[0].reason, 'no_plan');
});

test('failures are retried and visible; "try again" re-queues; a missing provider waits instead of failing', async () => {
  const u = await user('s5@example.test');
  await connect(u);
  await invoice(u, { n: 'F-1', issue: '2026-10-05' });
  await enqueueDuePacks(db, NOV5_10AM_IST);
  const sent: Email[] = [];
  assert.equal((await drain(sent, { ok: false, code: 'email_rejected_500' })).failed, 1);
  let p = (await listPacks(db, u))[0];
  assert.equal(p.state, 'retrying');
  assert.equal(p.reason, 'email_rejected_500');
  for (let i = 0; i < 5; i++) {
    await db.execute(sql`update outbox set next_attempt_at = now()`);
    await drain(sent, { ok: false, code: 'email_rejected_500' });
  }
  p = (await listPacks(db, u))[0];
  assert.equal(p.state, 'failed');
  const stranger = await user('s5b@example.test');
  assert.equal(await retryPack(db, stranger, p.id), 'not_found');
  assert.equal(await retryPack(db, u, p.id), 'queued');
  assert.equal((await drain(sent)).sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(await retryPack(db, u, p.id), 'not_retryable');

  const u2 = await user('s6@example.test');
  await connect(u2);
  await invoice(u2, { n: 'F-2', issue: '2026-10-05' });
  await enqueueDuePacks(db, { date: '2026-12-05', hour: 10 }).catch(() => 0);
  const t = await drain([], { ok: false, code: 'email_not_configured' });
  assert.ok(t.blocked >= 0);
});

// ---- the link ------------------------------------------------------------------------------------------------

test('the download link works until it expires or is ended, counts downloads, and a wrong token is just null', async () => {
  const u = await user('l1@example.test');
  await connect(u);
  await invoice(u, { n: 'L-1', issue: '2026-10-05' });
  await enqueueDuePacks(db, NOV5_10AM_IST);
  const sent: Email[] = [];
  await drain(sent);
  const token = tokenOf(sent[0]);
  const link = await resolvePackLink(db, token);
  assert.equal(link?.userId, u);
  assert.equal(link?.period, '2026-10');
  await resolvePackLink(db, token);
  assert.equal((await listPacks(db, u))[0].downloads, 2);
  assert.equal(await resolvePackLink(db, 'a'.repeat(22)), null);
  assert.equal(await resolvePackLink(db, '../../etc/passwd'), null);
  const exp = (await listPacks(db, u))[0].expiresAt!;
  const days = (new Date(exp).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days <= 7.01, `expires in about 7 days, got ${days}`);
  assert.equal(await revokeLinks(db, u), 1);
  assert.equal(await resolvePackLink(db, token), null, 'ended at once');
  assert.equal((await listPacks(db, u))[0].linkLive, false);
});

test('an expired link, and a link after the owner turned the accountant off by removing confirmation, do not open', async () => {
  const u = await user('l2@example.test');
  await connect(u);
  await invoice(u, { n: 'L-2', issue: '2026-10-05' });
  await enqueueDuePacks(db, NOV5_10AM_IST);
  const sent: Email[] = [];
  await drain(sent);
  const token = tokenOf(sent[0]);
  await db.execute(sql`update accountant_packs set expires_at = now() - interval '1 second' where user_id = ${u}::uuid`);
  assert.equal(await resolvePackLink(db, token), null);
});

// ---- the ZIP -------------------------------------------------------------------------------------------------

test('the pack: the previous month only, the owner’s data only, files named and dated, totals that add up, and the coverage said plainly', async () => {
  const a = await user('z1@example.test');
  const b = await user('z2@example.test');
  const inOct1 = await invoice(a, { n: 'A-OCT-1', issue: '2026-10-05', rate: '1000', client: 'Rahul' });
  await invoice(a, { n: 'A-OCT-2', issue: '2026-10-31', rate: '2000', client: '=cmd|calc' });
  await invoice(a, { n: 'A-SEP', issue: '2026-09-30', rate: '3000' });
  await invoice(a, { n: 'A-NOV', issue: '2026-11-01', rate: '4000' });
  await invoice(b, { n: 'B-OCT', issue: '2026-10-10', rate: '9000' });
  await pay(a, inOct1, 400, '2026-10-20');
  await pay(a, inOct1, 100, '2026-09-01').catch(() => undefined);

  const built = await buildPack(db, a, '2026-10', ALL, '2026-11-05', 'ABC Studio');
  assert.ok(built);
  assert.equal(built!.filename, 'kaamsolv-accountant-pack-2026-10.zip');
  const files = unzipSync(built!.zip);
  const names = Object.keys(files);
  const dir = 'kaamsolv-accountant-pack-2026-10/';
  for (const n of ['README.txt', 'invoice-register-INR-2026-10.csv', 'tax-summary-INR-2026-10.csv', 'payments-received-INR-2026-10.csv', 'outstanding-as-of-2026-11-05-INR.csv', 'ageing-summary-as-of-2026-11-05-INR.csv']) {
    assert.ok(names.includes(dir + n), `${n} in ${names.join(', ')}`);
  }
  const text = (n: string) => strFromU8(files[dir + n]);
  const register = text('invoice-register-INR-2026-10.csv');
  assert.match(register, /A-OCT-1/);
  assert.match(register, /A-OCT-2/);
  const everything = Object.values(files).map((f) => strFromU8(f)).join('|');
  assert.doesNotMatch(everything, /B-OCT/, 'another account’s invoice is nowhere in the pack');
  for (const other of ['A-SEP', 'A-NOV']) {
    for (const n of ['invoice-register-INR-2026-10.csv', 'tax-summary-INR-2026-10.csv', 'payments-received-INR-2026-10.csv']) assert.doesNotMatch(text(n), new RegExp(other), `${other} is outside the month`);
  }
  assert.match(text('outstanding-as-of-2026-11-05-INR.csv'), /A-SEP/, 'a still-unpaid September invoice is owed today, so it is in the outstanding list');
  assert.match(register, /'=cmd\|calc/, 'a spreadsheet formula in a client name is defused');
  const tax = text('tax-summary-INR-2026-10.csv').replace(/^﻿/, '').split('\r\n');
  assert.equal(tax[1].split(',')[1], '2', 'two October invoices');
  assert.match(tax[1], /,540\.00,/, 'GST on 1000 + 2000 at 18% is 540.00');
  assert.match(tax[1], /,3540\.00,/, 'invoice total 1180 + 2360');
  assert.match(text('payments-received-INR-2026-10.csv'), /400\.00/);
  const readme = text('README.txt');
  assert.match(readme, /Period: 2026-10-01 to 2026-10-31/);
  for (const line of PACK_COVERAGE) assert.ok(readme.includes(line), line);
  assert.match(readme, /not GST returns/i);
  assert.ok(built!.summary.files.every((f) => f.name.length > 0));
});

test('only the sections chosen are built; a user with no invoices still gets a README and no data files', async () => {
  const u = await user('z3@example.test');
  const built = await buildPack(db, u, '2026-10', ['payments'], '2026-11-05', '');
  const names = Object.keys(unzipSync(built!.zip)).map((n) => n.split('/')[1]);
  assert.deepEqual(names, ['README.txt']);
  const id = await user('z4@example.test');
  await invoice(id, { n: 'Z-1', issue: '2026-10-05' });
  const only = await buildPack(db, id, '2026-10', ['register'], '2026-11-05', '');
  assert.deepEqual(Object.keys(unzipSync(only!.zip)).map((n) => n.split('/')[1]).sort(), ['README.txt', 'invoice-register-INR-2026-10.csv']);
  assert.equal(await buildPack(db, id, '2026-13', ALL, '2026-11-05', ''), null);
});
