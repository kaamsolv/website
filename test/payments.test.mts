/**
 * Invoice payments (Stage C): the ledger, partial payments, the status model, idempotency, ownership, the
 * database-level rules, void / re-record, legacy "marked paid" invoices and the dashboard formulas. Real
 * Postgres (PGlite) with the real migrations — the triggers are what's under test.
 *
 * Note: PGlite runs one statement at a time, so the "simultaneous" tests prove that two requests issued together
 * can't both win; the row lock that makes that hold on Neon's concurrent connections is the same trigger code.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, invoicePaymentEvents, invoicePayments, invoices } from '../db/schema.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { clearMarkedPaid, createInvoice, getDashboard, getInvoice, InvoiceLockedError, listForExport, listInvoices, updateInvoice } from '../db/invoices.ts';
import { editPayment, getInvoicePayments, recordPayment, voidPayment } from '../db/payments.ts';
import { entitlementsFrom } from '../app/lib/entitlements.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { invoicesCsv, parseCsv } from '../app/lib/invoice/csv.ts';
import {
  cleanPaymentEdit,
  cleanPaymentInput,
  cleanVoidReason,
  ledgerErrorOf,
  parseAmount,
  paymentSummary,
  type PaymentInput,
} from '../app/lib/invoice/payments.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

async function makeUser(email: string): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

function doc(number: string, rate: string, over: Partial<Invoice> = {}): Invoice {
  const inv = newInvoice(new Date(2026, 9, 10));
  return { ...inv, number, issueDate: '2026-10-10', dueDate: '2026-10-24', items: [{ id: 'a', description: 'Work', qty: '1', rate }], taxRate: '', ...over };
}
async function makeInvoice(user: string, number: string, rate = '20000', over: Partial<Invoice> = {}): Promise<string> {
  const r = await createInvoice(db, user, doc(number, rate, over), null);
  assert.ok(r.ok);
  return r.ok ? r.id : '';
}
const input = (amount: number, over: Partial<PaymentInput> = {}): PaymentInput => ({
  amountCents: Math.round(amount * 100),
  paidOn: ago(2),
  method: 'upi',
  reference: '',
  note: '',
  clientKey: randomUUID(),
  reconcile: false,
  ...over,
});
const pay = (user: string, invoice: string, amount: number, over: Partial<PaymentInput> = {}) => recordPayment(db, user, invoice, input(amount, over));
async function facts(user: string, id: string) {
  const r = await getInvoice(db, user, id);
  assert.ok(r);
  const total = Number((await db.select({ t: invoices.total }).from(invoices).where(eq(invoices.id, id)))[0].t);
  return { status: r.status, amountPaid: r.amountPaid, paidAt: r.paidAt, total };
}
const summaryOf = async (user: string, id: string) => {
  const f = await facts(user, id);
  return paymentSummary({ total: f.total, amountPaid: f.amountPaid, status: f.status, dueDate: '2026-10-24' }, '2026-10-26');
};
/** What a database written before the ledger existed looks like: 'paid' with nothing recorded. */
async function makeLegacyPaid(id: string) {
  await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
  try {
    await db.execute(sql`update invoices set status = 'paid', paid_at = now() where id = ${id}::uuid`);
  } finally {
    await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
  }
}
const rejectsWith = (fn: () => Promise<unknown>, rule: string) =>
  assert.rejects(fn, (e) => ledgerErrorOf(e) === rule, `expected ${rule}`);

// ─── The maths and the checks (no database) ─────────────────────────────────────────────────────────────

test('parseAmount: plain numbers with up to 2 decimals; Indian grouping and ₹ are fine; everything else is refused', () => {
  for (const [text, cents] of [['5000', 500000], ['4,999.50', 499950], ['₹1,25,000', 12500000], [' 0.05 ', 5], ['12.3', 1230], [250, 25000]] as const) {
    const r = parseAmount(text);
    assert.ok(r.ok, String(text));
    if (r.ok) assert.equal(r.cents, cents);
  }
  for (const bad of ['', '   ', '0', '0.00', '-5', '12.345', 'abc', '1e3', '5,00.0.0', null, undefined, NaN, Infinity, {}, '1'.repeat(14)]) {
    assert.equal(parseAmount(bad as never).ok, false, String(bad));
  }
});

test('paymentSummary: ₹20,000 with ₹5,000 received is 25% collected, ₹15,000 outstanding; never 100% until it is', () => {
  const partial = paymentSummary({ total: 20000, amountPaid: 5000, status: 'unpaid', dueDate: '2026-10-24' }, '2026-10-20');
  assert.deepEqual(partial, { state: 'partial', received: 5000, outstanding: 15000, percent: 25, overdue: false });
  assert.equal(paymentSummary({ total: 20000, amountPaid: 5000, status: 'unpaid', dueDate: '2026-10-24' }, '2026-10-25').overdue, true, 'owed and past due');
  assert.equal(paymentSummary({ total: 20000, amountPaid: 5000, status: 'unpaid', dueDate: '2026-10-24' }, '2026-10-24').overdue, false, 'due today is not overdue');
  assert.equal(paymentSummary({ total: 10000, amountPaid: 9999.99, status: 'unpaid' }, '2026-10-20').percent, 99, '99.99% shows as 99%');
  assert.equal(paymentSummary({ total: 3, amountPaid: 0.01, status: 'unpaid' }, '2026-10-20').percent, 0);
  const paid = paymentSummary({ total: 20000, amountPaid: 20000, status: 'paid', dueDate: '2026-10-01' }, '2026-10-26');
  assert.deepEqual(paid, { state: 'paid', received: 20000, outstanding: 0, percent: 100, overdue: false });
  assert.deepEqual(paymentSummary({ total: 20000, amountPaid: 0, status: 'unpaid' }, '2026-10-20'), { state: 'unpaid', received: 0, outstanding: 20000, percent: 0, overdue: false });
  // Legacy: marked paid, nothing on record — settled, but no money counted as received and no percentage invented.
  assert.deepEqual(paymentSummary({ total: 20000, amountPaid: 0, status: 'paid', dueDate: '2026-10-01' }, '2026-10-26'), { state: 'marked_paid', received: 0, outstanding: 0, percent: null, overdue: false });
  // Pennies don't drift.
  assert.equal(paymentSummary({ total: 0.3, amountPaid: 0.1 + 0.2, status: 'unpaid' }, 'x').outstanding, 0);
});

test('cleanPaymentInput: amount, date, method, key — and what it normalises', () => {
  const ok = { amount: '5,000', paidOn: '2026-10-20', method: 'cash', reference: '  UTR 123 ', note: ' half now ', clientKey: randomUUID().toUpperCase(), today: '2026-10-26' };
  const good = cleanPaymentInput(ok, '2026-10-26');
  assert.ok(good.ok);
  if (good.ok) {
    assert.equal(good.value.amountCents, 500000);
    assert.equal(good.value.reference, 'UTR 123');
    assert.equal(good.value.clientKey, ok.clientKey.toLowerCase());
    assert.equal(good.value.reconcile, false);
  }
  const bad = (patch: Record<string, unknown>) => cleanPaymentInput({ ...ok, ...patch }, '2026-10-26');
  assert.equal(bad({ amount: '0' }).ok, false);
  assert.equal(bad({ amount: '-100' }).ok, false);
  assert.equal(bad({ paidOn: '2026-10-27' }).ok, false, 'future date');
  assert.equal(bad({ paidOn: '1999-12-31' }).ok, false);
  assert.equal(bad({ paidOn: '2026-02-30' }).ok, false, 'not a real date');
  assert.equal(bad({ method: 'bitcoin' }).ok, false);
  assert.equal(bad({ clientKey: 'nope' }).ok, false);
  assert.equal(bad({ reference: 'x'.repeat(101) }).ok, false);
  assert.equal(bad({ note: 'x'.repeat(401) }).ok, false);
  assert.equal(cleanPaymentInput(null, '2026-10-26').ok, false);
  assert.equal(cleanPaymentEdit({ reference: 'a', note: 'b' }).ok, true);
  assert.equal(cleanPaymentEdit({ reference: 1, note: 'b' }).ok, false);
  assert.equal(cleanVoidReason({}).ok, true);
  assert.equal(cleanVoidReason({ reason: 'x'.repeat(201) }).ok, false);
});

// ─── Recording payments ─────────────────────────────────────────────────────────────────────────────────

test('a payment against an unpaid invoice: received, outstanding, collection % and status follow the ledger', async () => {
  const user = await makeUser('one@example.test');
  const id = await makeInvoice(user, 'P-1');
  assert.deepEqual(await summaryOf(user, id), { state: 'unpaid', received: 0, outstanding: 20000, percent: 0, overdue: true });

  const r = await pay(user, id, 5000, { method: 'bank', reference: 'UTR9', note: 'advance' });
  assert.ok(r.ok && !r.duplicate);
  if (r.ok) assert.deepEqual([r.payment.amount, r.payment.currency, r.payment.method, r.payment.reference, r.payment.note, r.payment.voidedAt], [5000, 'INR', 'bank', 'UTR9', 'advance', null]);

  const f = await facts(user, id);
  assert.deepEqual([f.status, f.amountPaid, f.paidAt], ['unpaid', 5000, null], 'partly paid is "unpaid" with money received');
  assert.deepEqual(await summaryOf(user, id), { state: 'partial', received: 5000, outstanding: 15000, percent: 25, overdue: true });
  const list = (await listInvoices(db, user)).find((x) => x.id === id)!;
  assert.equal(list.amountPaid, 5000, 'the list carries what was received');
});

test('several partial payments take an invoice unpaid → partially paid → paid; paid_at is the last payment date', async () => {
  const user = await makeUser('multi@example.test');
  const id = await makeInvoice(user, 'M-1');
  assert.ok((await pay(user, id, 5000, { paidOn: ago(5) })).ok);
  assert.equal((await summaryOf(user, id)).state, 'partial');
  assert.ok((await pay(user, id, 7500.5, { paidOn: ago(4) })).ok);
  let s = await summaryOf(user, id);
  assert.deepEqual([s.state, s.received, s.outstanding, s.percent], ['partial', 12500.5, 7499.5, 62]);
  assert.ok((await pay(user, id, 7499.5, { paidOn: ago(3) })).ok);

  const f = await facts(user, id);
  assert.deepEqual([f.status, f.amountPaid], ['paid', 20000]);
  assert.equal(f.paidAt?.toISOString().slice(0, 10), ago(3), 'settled on the date of the last payment');
  s = await summaryOf(user, id);
  assert.deepEqual([s.state, s.outstanding, s.percent], ['paid', 0, 100]);
  const detail = await getInvoicePayments(db, user, id);
  assert.deepEqual(detail?.payments.map((p) => p.amount), [5000, 7500.5, 7499.5], 'oldest first');
});

test('too much is refused — to the paisa — and so is anything once the invoice is paid; exactly the balance is fine', async () => {
  const user = await makeUser('excess@example.test');
  const id = await makeInvoice(user, 'X-1', '1000');
  assert.ok((await pay(user, id, 400)).ok);
  const over = await pay(user, id, 600.01);
  assert.deepEqual(over, { ok: false, reason: 'exceeds', outstanding: 600 });
  assert.equal((await facts(user, id)).amountPaid, 400, 'nothing was recorded');
  assert.ok((await pay(user, id, 600)).ok);
  assert.deepEqual(await pay(user, id, 0.01), { ok: false, reason: 'exceeds', outstanding: 0 }, 'already paid in full');
  assert.equal((await getInvoicePayments(db, user, id))?.payments.length, 2, 'refused payments leave no trace');
});

test('a payment dated well into the future is refused by the database as well', async () => {
  const user = await makeUser('date@example.test');
  const id = await makeInvoice(user, 'D-1', '1000');
  assert.deepEqual(await pay(user, id, 100, { paidOn: ago(-5) }), { ok: false, reason: 'date' });
  assert.ok((await pay(user, id, 100, { paidOn: ago(-1) })).ok, 'tomorrow is allowed (time zones)');
  await rejectsWith(
    () => db.execute(sql`insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key) values (${user}::uuid, ${id}::uuid, 1, 'INR', '1999-12-31', 'upi', ${randomUUID()}::uuid)`),
    'payment_date',
  );
});

// ─── Idempotency ────────────────────────────────────────────────────────────────────────────────────────

test('the same form submitted twice — one after the other or at once — records one payment', async () => {
  const user = await makeUser('idem@example.test');
  const id = await makeInvoice(user, 'I-1');
  const body = input(2500);
  const first = await recordPayment(db, user, id, body);
  const second = await recordPayment(db, user, id, body);
  assert.ok(first.ok && !first.duplicate);
  assert.ok(second.ok && second.duplicate);
  if (first.ok && second.ok) assert.equal(second.payment.id, first.payment.id, 'the retry returns the original');
  assert.equal((await facts(user, id)).amountPaid, 2500);

  const burst = input(1000);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => recordPayment(db, user, id, burst)));
  assert.ok(results.every((r) => r.ok));
  assert.equal(results.filter((r) => r.ok && !r.duplicate).length, 1, 'exactly one was recorded');
  assert.equal((await facts(user, id)).amountPaid, 3500);
  assert.equal((await getInvoicePayments(db, user, id))?.payments.length, 2);
});

test('a retry of a payment that already settled the invoice still returns it, instead of "more than is owed"', async () => {
  const user = await makeUser('retry@example.test');
  const id = await makeInvoice(user, 'R-1', '1000');
  const body = input(1000);
  assert.ok((await recordPayment(db, user, id, body)).ok);
  const again = await recordPayment(db, user, id, body);
  assert.ok(again.ok && again.duplicate);
});

test('an idempotency key reused for a different payment is refused, not silently merged', async () => {
  const user = await makeUser('reuse@example.test');
  const a = await makeInvoice(user, 'K-1');
  const b = await makeInvoice(user, 'K-2');
  const key = randomUUID();
  assert.ok((await pay(user, a, 100, { clientKey: key })).ok);
  assert.deepEqual(await pay(user, a, 200, { clientKey: key }), { ok: false, reason: 'key_reused' });
  assert.deepEqual(await pay(user, b, 100, { clientKey: key }), { ok: false, reason: 'key_reused' });
  assert.equal((await facts(user, b)).amountPaid, 0);
});

test('two payments at the same instant that together exceed the invoice: one is recorded, one refused', async () => {
  const user = await makeUser('race@example.test');
  const id = await makeInvoice(user, 'C-1', '20000');
  const [a, b] = await Promise.all([pay(user, id, 15000), pay(user, id, 15000)]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  const lost = [a, b].find((r) => !r.ok);
  assert.deepEqual(lost, { ok: false, reason: 'exceeds', outstanding: 5000 });
  assert.equal((await facts(user, id)).amountPaid, 15000);
});

// ─── Ownership ──────────────────────────────────────────────────────────────────────────────────────────

test("another user can't see, record against, void or edit someone else's invoice or payment", async () => {
  const owner = await makeUser('owner@example.test');
  const intruder = await makeUser('intruder@example.test');
  const id = await makeInvoice(owner, 'O-1');
  const made = await pay(owner, id, 1000);
  assert.ok(made.ok);
  const paymentId = made.ok ? made.payment.id : '';

  assert.equal(await getInvoicePayments(db, intruder, id), null);
  assert.deepEqual(await pay(intruder, id, 100), { ok: false, reason: 'not_found' });
  assert.deepEqual(await voidPayment(db, intruder, id, paymentId, 'x'), { ok: false, reason: 'not_found' });
  assert.deepEqual(await editPayment(db, intruder, id, paymentId, { reference: 'x', note: 'x' }), { ok: false, reason: 'not_found' });
  // Right payment id, wrong invoice id (an invoice of the intruder's own) is also nothing.
  const mine = await makeInvoice(intruder, 'O-2');
  assert.deepEqual(await voidPayment(db, intruder, mine, paymentId, ''), { ok: false, reason: 'not_found' });
  assert.deepEqual(await voidPayment(db, owner, mine, paymentId, ''), { ok: false, reason: 'not_found' }, 'the payment belongs to a different invoice');

  const f = await facts(owner, id);
  assert.equal(f.amountPaid, 1000, 'the owner’s ledger is untouched');
  assert.equal((await getInvoicePayments(db, owner, id))?.payments.length, 1);
});

test('even a hand-written insert for another user’s invoice is refused by the database', async () => {
  const owner = await makeUser('db-owner@example.test');
  const intruder = await makeUser('db-intruder@example.test');
  const id = await makeInvoice(owner, 'DB-1', '1000');
  await rejectsWith(
    () => db.execute(sql`insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key) values (${intruder}::uuid, ${id}::uuid, 10, 'INR', ${ago(1)}::date, 'upi', ${randomUUID()}::uuid)`),
    'payment_owner',
  );
  assert.equal((await facts(owner, id)).amountPaid, 0);
  assert.equal((await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, id))).length, 0, 'the refused row left nothing behind');
});

test('quotations take no payments; a mismatched currency is refused by the database', async () => {
  const user = await makeUser('kinds@example.test');
  const quote = await makeInvoice(user, 'QT-1', '1000', { kind: 'quote' });
  assert.deepEqual(await pay(user, quote, 10), { ok: false, reason: 'not_found' });
  assert.equal(await getInvoicePayments(db, user, quote), null);
  await rejectsWith(
    () => db.execute(sql`insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key) values (${user}::uuid, ${quote}::uuid, 10, 'INR', ${ago(1)}::date, 'upi', ${randomUUID()}::uuid)`),
    'payment_quote',
  );
  const usd = await makeInvoice(user, 'USD-1', '100', { currency: 'USD' });
  await rejectsWith(
    () => db.execute(sql`insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key) values (${user}::uuid, ${usd}::uuid, 10, 'INR', ${ago(1)}::date, 'upi', ${randomUUID()}::uuid)`),
    'payment_currency',
  );
  const ok = await pay(user, usd, 10);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.payment.currency, 'USD', 'the payment takes the invoice’s currency');
});

// ─── Rules the database keeps whoever asks ──────────────────────────────────────────────────────────────

test('an invoice can’t be flipped to paid with a balance outstanding — by any caller', async () => {
  const user = await makeUser('flip@example.test');
  const id = await makeInvoice(user, 'F-1');
  await rejectsWith(() => db.execute(sql`update invoices set status = 'paid' where id = ${id}::uuid`), 'invoice_unsettled');
  assert.ok((await pay(user, id, 5000)).ok);
  // Whatever status a caller writes, a ledger invoice's status is derived from its payments.
  await db.execute(sql`update invoices set status = 'paid' where id = ${id}::uuid`);
  assert.equal((await facts(user, id)).status, 'unpaid');
  // And its received total can't be set by hand beyond the total.
  await rejectsWith(() => db.execute(sql`update invoices set amount_paid = 99999 where id = ${id}::uuid`), 'invoice_total_below_paid');
  assert.ok((await pay(user, id, 15000)).ok);
  await db.execute(sql`update invoices set status = 'unpaid' where id = ${id}::uuid`);
  assert.equal((await facts(user, id)).status, 'paid', 'and a settled one stays settled');
});

test('amount, date, method and owner of a recorded payment can’t be changed; a voided payment is frozen', async () => {
  const user = await makeUser('frozen@example.test');
  const id = await makeInvoice(user, 'Z-1');
  const r = await pay(user, id, 1000);
  assert.ok(r.ok);
  const pid = r.ok ? r.payment.id : '';
  for (const set of [sql`amount = 5`, sql`paid_on = '2026-01-01'`, sql`method = 'cash'`, sql`currency = 'USD'`, sql`invoice_id = ${randomUUID()}::uuid`]) {
    await assert.rejects(() => db.execute(sql`update invoice_payments set ${set} where id = ${pid}::uuid`));
  }
  assert.equal((await facts(user, id)).amountPaid, 1000);
  assert.deepEqual(await editPayment(db, user, id, pid, { reference: 'UTR1', note: 'cleared' }), { ok: true });
  assert.ok((await voidPayment(db, user, id, pid, 'wrong invoice')).ok);
  await rejectsWith(() => db.execute(sql`update invoice_payments set voided_at = null where id = ${pid}::uuid`), 'payment_voided');
  await rejectsWith(() => db.execute(sql`update invoice_payments set note = 'sneaky' where id = ${pid}::uuid`), 'payment_voided');
  assert.deepEqual(await editPayment(db, user, id, pid, { reference: 'x', note: 'x' }), { ok: false, reason: 'voided' });
});

test('an invoice holds at most 200 ledger entries, voided ones included', async () => {
  const user = await makeUser('cap@example.test');
  const id = await makeInvoice(user, 'CAP-1', '1000');
  for (let i = 0; i < 200; i++) assert.ok((await pay(user, id, 1)).ok, `entry ${i + 1}`);
  assert.deepEqual(await pay(user, id, 1), { ok: false, reason: 'cap' });
  assert.equal((await facts(user, id)).amountPaid, 200);
});

// ─── Void and re-record; the audit trail ────────────────────────────────────────────────────────────────

test('voiding a payment gives the amount back; the entry stays in the history; the right amount can be recorded after', async () => {
  const user = await makeUser('void@example.test');
  const id = await makeInvoice(user, 'V-1', '20000');
  const wrong = await pay(user, id, 20000, { paidOn: ago(3), reference: 'typo' });
  assert.ok(wrong.ok);
  assert.equal((await summaryOf(user, id)).state, 'paid');
  const wrongId = wrong.ok ? wrong.payment.id : '';

  assert.deepEqual(await voidPayment(db, user, id, wrongId, 'meant ₹2,000'), { ok: true, alreadyVoided: false });
  assert.deepEqual(await voidPayment(db, user, id, wrongId, 'again'), { ok: true, alreadyVoided: true }, 'repeating it is harmless');
  let f = await facts(user, id);
  assert.deepEqual([f.status, f.amountPaid, f.paidAt], ['unpaid', 0, null]);
  assert.equal((await summaryOf(user, id)).state, 'unpaid', 'back to unpaid — not "marked paid"');

  const right = await pay(user, id, 2000, { paidOn: ago(3) });
  assert.ok(right.ok);
  assert.deepEqual((await summaryOf(user, id)).state, 'partial');
  const history = (await getInvoicePayments(db, user, id))!.payments;
  assert.equal(history.length, 2);
  const voided = history.find((p) => p.id === wrongId)!;
  assert.ok(voided.voidedAt);
  assert.equal(voided.voidReason, 'meant ₹2,000', 'the first void reason is kept');
  assert.equal(voided.reference, 'typo');
  f = await facts(user, id);
  assert.equal(f.amountPaid, 2000, 'voided money is not counted');

  // The balance really is free again: a second full-size payment now fits, then nothing more.
  assert.deepEqual(await pay(user, id, 18001), { ok: false, reason: 'exceeds', outstanding: 18000 });
});

test('the audit trail records each payment, edit and void with the old and new values', async () => {
  const user = await makeUser('audit@example.test');
  const id = await makeInvoice(user, 'A-1', '1000');
  const r = await pay(user, id, 300, { reference: 'first' });
  assert.ok(r.ok);
  const pid = r.ok ? r.payment.id : '';
  await editPayment(db, user, id, pid, { reference: 'second', note: 'n' });
  await editPayment(db, user, id, pid, { reference: 'second', note: 'n' }); // no change: no event
  await voidPayment(db, user, id, pid, 'oops');
  const events = await db.select().from(invoicePaymentEvents).where(eq(invoicePaymentEvents.paymentId, pid)).orderBy(invoicePaymentEvents.at);
  assert.deepEqual(events.map((e) => e.action), ['recorded', 'edited', 'voided']);
  assert.deepEqual((events[0].detail as { amount: number }).amount, 300);
  assert.deepEqual((events[1].detail as { reference: string[] }).reference, ['first', 'second']);
  assert.equal((events[2].detail as { reason: string }).reason, 'oops');
  assert.ok(events.every((e) => e.userId === user && e.invoiceId === id));
});

test('invoices.amount_paid always equals the sum of the non-voided ledger, through any sequence', async () => {
  const user = await makeUser('sum@example.test');
  const id = await makeInvoice(user, 'S-1', '1000');
  const ids: string[] = [];
  for (const a of [100, 250.25, 99.75, 300]) {
    const r = await pay(user, id, a);
    if (r.ok) ids.push(r.payment.id);
  }
  await voidPayment(db, user, id, ids[1], '');
  await pay(user, id, 10.1);
  await voidPayment(db, user, id, ids[3], '');
  const [row] = (await db.execute<{ cached: string; ledger: string }>(sql`
    select i.amount_paid::text as cached,
           coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0)::text as ledger
    from invoices i where i.id = ${id}::uuid`)).rows as { cached: string; ledger: string }[];
  assert.equal(Number(row.cached), Number(row.ledger));
  assert.equal(Number(row.cached), 100 + 99.75 + 10.1);
});

// ─── Editing an invoice that has payments ───────────────────────────────────────────────────────────────

test('an invoice with payments: the total can rise or fall to what was received, never below; its currency is fixed', async () => {
  const user = await makeUser('edit@example.test');
  const id = await makeInvoice(user, 'E-1', '20000');
  assert.ok((await pay(user, id, 8000)).ok);

  assert.equal(await updateInvoice(db, user, id, doc('E-1', '20000', { notes: 'autosave with the same total' })), true);
  await assert.rejects(() => updateInvoice(db, user, id, doc('E-1', '7999.99')), (e) => e instanceof InvoiceLockedError && e.code === 'below_paid' && e.amountPaid === 8000);
  await assert.rejects(() => updateInvoice(db, user, id, doc('E-1', '20000', { currency: 'USD' })), (e) => e instanceof InvoiceLockedError && e.code === 'has_payments');
  await assert.rejects(() => updateInvoice(db, user, id, doc('E-1', '20000', { kind: 'quote' })), (e) => e instanceof InvoiceLockedError && e.code === 'has_payments');
  assert.equal((await facts(user, id)).total, 20000, 'the refused saves changed nothing');

  // Lowering it to exactly what was received settles it; raising it opens a balance again.
  assert.equal(await updateInvoice(db, user, id, doc('E-1', '8000')), true);
  assert.deepEqual([(await facts(user, id)).status, (await summaryOf(user, id)).state], ['paid', 'paid']);
  assert.equal(await updateInvoice(db, user, id, doc('E-1', '9000')), true);
  assert.deepEqual([(await facts(user, id)).status, (await facts(user, id)).paidAt], ['unpaid', null]);
  const s = await summaryOf(user, id);
  assert.deepEqual([s.state, s.outstanding], ['partial', 1000]);

  // The database says the same if a save slips past the app's own check.
  await rejectsWith(() => db.execute(sql`update invoices set total = 100 where id = ${id}::uuid`), 'invoice_total_below_paid');
  await rejectsWith(() => db.execute(sql`update invoices set currency = 'USD' where id = ${id}::uuid`), 'invoice_has_payments');
});

test('an invoice with no payments edits exactly as before', async () => {
  const user = await makeUser('plain@example.test');
  const id = await makeInvoice(user, 'N-1', '500');
  assert.equal(await updateInvoice(db, user, id, doc('N-1', '700', { currency: 'USD' })), true);
  assert.deepEqual([(await facts(user, id)).total, (await facts(user, id)).status], [700, 'unpaid']);
});

test('deleting an invoice (or the whole account) removes its payments and audit trail with it', async () => {
  const { deleteAccount } = await import('../db/accounts.ts');
  const { deleteInvoice } = await import('../db/invoices.ts');
  const user = await makeUser('gone@example.test');
  const a = await makeInvoice(user, 'G-1', '1000');
  const b = await makeInvoice(user, 'G-2', '1000');
  await pay(user, a, 100);
  await pay(user, b, 100);
  const count = async (table: string) => Number(((await db.execute<{ n: string }>(sql.raw(`select count(*)::text as n from ${table} where user_id = '${user}'`))).rows as { n: string }[])[0].n);
  assert.deepEqual([await count('invoice_payments'), await count('invoice_payment_events')], [2, 2]);
  assert.equal(await deleteInvoice(db, user, a), true);
  assert.deepEqual([await count('invoice_payments'), await count('invoice_payment_events')], [1, 1]);
  await deleteAccount(db, user, 'gone@example.test');
  assert.deepEqual([await count('invoice_payments'), await count('invoice_payment_events')], [0, 0]);
});

// ─── Legacy "marked paid" invoices ──────────────────────────────────────────────────────────────────────

test('legacy: marked paid with nothing on record is settled but not "received", and nothing is invented', async () => {
  const user = await makeUser('legacy@example.test');
  const id = await makeInvoice(user, 'L-1', '20000');
  await makeLegacyPaid(id);
  const f = await facts(user, id);
  assert.deepEqual([f.status, f.amountPaid], ['paid', 0]);
  assert.deepEqual(await summaryOf(user, id), { state: 'marked_paid', received: 0, outstanding: 0, percent: null, overdue: false });
  assert.deepEqual((await getInvoicePayments(db, user, id))?.payments, [], 'no entries were fabricated');
  // Editing it keeps the mark (the existing behaviour).
  assert.equal(await updateInvoice(db, user, id, doc('L-1', '20000', { notes: 'edited' })), true);
  assert.equal((await facts(user, id)).status, 'paid');
});

test('legacy: recording needs the caller to say it is replacing the mark; the first entries become the ledger', async () => {
  const user = await makeUser('reconcile@example.test');
  const id = await makeInvoice(user, 'L-2', '20000');
  await makeLegacyPaid(id);

  assert.deepEqual(await pay(user, id, 5000), { ok: false, reason: 'legacy' }, 'without reconcile: asks first');
  assert.equal((await facts(user, id)).amountPaid, 0);
  assert.deepEqual(await pay(user, id, 20000.01, { reconcile: true }), { ok: false, reason: 'exceeds', outstanding: 20000 }, 'still capped at the total');

  // Only part of it was ever paid: the invoice honestly becomes partially paid.
  assert.ok((await pay(user, id, 5000, { reconcile: true })).ok);
  let s = await summaryOf(user, id);
  assert.deepEqual([s.state, s.received, s.outstanding, s.percent], ['partial', 5000, 15000, 25]);
  assert.equal((await facts(user, id)).status, 'unpaid');
  // From here it is an ordinary ledger invoice — no flag needed.
  assert.ok((await pay(user, id, 15000)).ok);
  assert.equal((await summaryOf(user, id)).state, 'paid');
});

test('legacy: the whole amount in one entry makes it a fully recorded, paid invoice; "mark unpaid" only works on a legacy mark', async () => {
  const user = await makeUser('reconcile2@example.test');
  const full = await makeInvoice(user, 'L-3', '1000');
  const wrong = await makeInvoice(user, 'L-4', '1000');
  const ledger = await makeInvoice(user, 'L-5', '1000');
  await makeLegacyPaid(full);
  await makeLegacyPaid(wrong);
  assert.ok((await pay(user, full, 1000, { reconcile: true, paidOn: ago(9) })).ok);
  const f = await facts(user, full);
  assert.deepEqual([f.status, f.amountPaid, f.paidAt?.toISOString().slice(0, 10)], ['paid', 1000, ago(9)]);
  assert.equal((await summaryOf(user, full)).state, 'paid');

  assert.equal(await clearMarkedPaid(db, user, wrong), 'cleared');
  assert.equal((await summaryOf(user, wrong)).state, 'unpaid');
  assert.equal(await clearMarkedPaid(db, user, wrong), 'not_marked', 'it is not marked any more');
  assert.equal(await clearMarkedPaid(db, user, full), 'not_marked', 'a ledger-paid invoice is changed by voiding, not by this');
  assert.equal(await clearMarkedPaid(db, user, ledger), 'not_marked');
  assert.equal((await facts(user, full)).status, 'paid');
});

// ─── Dashboard and exports use the same numbers ─────────────────────────────────────────────────────────

test('dashboard: what is owed is the remaining balance, per currency, with legacy-paid owing nothing and nothing added across currencies', async () => {
  const user = await makeUser('dash@example.test');
  const mk = (n: string, issue: string, due: string, rate: string, currency: 'INR' | 'USD' = 'INR') => makeInvoice(user, n, rate, { issueDate: issue, dueDate: due, currency });
  const part = await mk('DA-1', '2026-10-05', '2026-10-19', '20000'); // overdue, ₹5,000 received
  const unpaid = await mk('DA-2', '2026-10-10', '2026-10-30', '2000'); // not due
  const paidFull = await mk('DA-3', '2026-10-02', '2026-10-16', '3000'); // paid through the ledger
  const legacy = await mk('DA-4', '2026-09-01', '2026-09-15', '700'); // marked paid, nothing on record
  const usdPart = await mk('DA-5', '2026-10-12', '2026-10-26', '100', 'USD'); // $40 received
  const usdUnpaid = await mk('DA-6', '2026-10-13', '2026-10-15', '60', 'USD'); // overdue
  await makeLegacyPaid(legacy);
  assert.ok((await pay(user, part, 5000)).ok);
  assert.ok((await pay(user, paidFull, 3000)).ok);
  assert.ok((await pay(user, usdPart, 40)).ok);

  const { totals } = await getDashboard(db, user, '2026-10-22', '2026-10-01');
  const inr = totals.find((t) => t.currency === 'INR')!;
  const usd = totals.find((t) => t.currency === 'USD')!;
  assert.deepEqual(totals.map((t) => t.currency), ['INR', 'USD'], 'one block per currency, INR first');
  assert.deepEqual([inr.unpaid, inr.overdue, inr.overdueCount], [15000 + 2000, 15000, 1], 'owed = 20,000−5,000 plus 2,000; the settled and the marked-paid owe nothing');
  assert.deepEqual([usd.unpaid, usd.overdue, usd.overdueCount], [60 + 60, 60, 1]);
  assert.equal(inr.billedThisMonth, 20000 + 2000 + 3000, 'billed is invoice value, not money received');
  void unpaid; void usdUnpaid;
});

test('CSV status: Paid, Partially paid, Unpaid, Marked paid come from the ledger', async () => {
  const user = await makeUser('csv@example.test');
  const mk = (n: string) => makeInvoice(user, n, '1000');
  const [paid, partial, none, legacy] = [await mk('CS-1'), await mk('CS-2'), await mk('CS-3'), await mk('CS-4')];
  await makeLegacyPaid(legacy);
  assert.ok((await pay(user, paid, 1000)).ok);
  assert.ok((await pay(user, partial, 400)).ok);
  const [head, ...rows] = parseCsv(invoicesCsv(await listForExport(db, user, {})));
  const status = Object.fromEntries(rows.map((r) => [r[head.indexOf('Number')], r[head.indexOf('Status')]]));
  assert.deepEqual(status, { 'CS-1': 'Paid', 'CS-2': 'Partially paid', 'CS-3': 'Unpaid', 'CS-4': 'Marked paid' });
  const paidOn = Object.fromEntries(rows.map((r) => [r[head.indexOf('Number')], r[head.indexOf('Paid on')]]));
  assert.equal(paidOn['CS-1'], ago(2), 'paid on the date the money came in');
  assert.equal(paidOn['CS-2'], '');
});

// ─── Plans ──────────────────────────────────────────────────────────────────────────────────────────────

test('every signed-in account can record and view payments; an anonymous visitor has nothing', async () => {
  const user = await makeUser('plan@example.test');
  assert.equal(entitlementsFrom(await getEntitlements(db, user)).can('invoice_payments'), true, 'free account');
  assert.equal(entitlementsFrom(await getEntitlements(db, user)).can('invoice_dashboard'), false, 'collection analytics stay Pro');
  assert.equal(entitlementsFrom(await getEntitlements(db, null)).can('invoice_payments'), false, 'anonymous');
});
