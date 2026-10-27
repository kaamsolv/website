/**
 * Recording a payment must lock the invoice row FIRST, inside the insert statement itself.
 *
 * The reason (found by the first real Neon rehearsal): the foreign-key check on `invoice_payments.invoice_id` runs before the
 * ledger trigger and takes a KEY SHARE lock on the invoice row; the trigger then asks for FOR UPDATE on the same row. With
 * two or more payments in flight each holds KEY SHARE and waits to upgrade — a deadlock (SQLSTATE 40P01), seen on Neon with
 * 20 simultaneous payments. PGlite has a single connection, so NO test here can reproduce a deadlock; what this protects is
 * the shape of the statement that prevents one, and that it still records payments exactly as before.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers } from '../db/schema.ts';
import { createInvoice } from '../db/invoices.ts';
import { insertPaymentStatement, recordPayment } from '../db/payments.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

const input = (key: string = randomUUID()) => ({ amountCents: 12_345, paidOn: '2026-10-01', method: 'bank' as const, reference: 'UTR1', note: '', clientKey: key, reconcile: false });

test('the insert statement takes FOR UPDATE on the invoice row before it inserts, and before ON CONFLICT', () => {
  const user = randomUUID();
  const invoice = randomUUID();
  const { sql: text, params } = new PgDialect().sqlToQuery(insertPaymentStatement(user, invoice, input()));
  const flat = text.replace(/\s+/g, ' ').toLowerCase();
  const lock = flat.indexOf('for update of i');
  assert.ok(lock > 0, 'it locks the invoice row (alias i)');
  assert.ok(flat.indexOf('from "invoices" i') < lock && flat.indexOf('where i.id') < lock, 'the lock belongs to the select that finds the invoice');
  assert.ok(lock < flat.indexOf('on conflict'), 'and comes before ON CONFLICT');
  assert.match(flat, /^ ?insert into "invoice_payments"/, 'it is still one statement: a single insert … select');
  assert.ok(params.includes(user) && params.includes(invoice) && params.includes('123.45'), 'the same parameters as before: owner, invoice, amount as exact decimal text');
});

test('it still records, repeats and refuses exactly as before (the ledger rules are untouched)', async () => {
  const [{ id: user }] = await db.insert(authUsers).values({ name: '', email: 'lock@example.test', emailVerified: true }).returning({ id: authUsers.id });
  const doc = { ...newInvoice(new Date(2026, 9, 10)), number: 'LCK-1', issueDate: '2026-09-01', dueDate: '2026-09-15', items: [{ id: 'a', description: 'Work', qty: '1', rate: '300' }], taxRate: '' };
  const created = await createInvoice(db, user, doc, null);
  assert.ok(created.ok);
  const id = created.ok ? created.id : '';

  const key = randomUUID();
  const first = await recordPayment(db, user, id, { ...input(key), amountCents: 10_000 });
  assert.ok(first.ok && !first.duplicate);
  const again = await recordPayment(db, user, id, { ...input(key), amountCents: 10_000 });
  assert.ok(again.ok && again.duplicate, 'the same idempotency key is answered as the same payment');
  const tooMuch = await recordPayment(db, user, id, { ...input(), amountCents: 25_000 });
  assert.deepEqual([tooMuch.ok, tooMuch.ok ? '' : tooMuch.reason], [false, 'exceeds'], 'the database trigger still refuses an overpayment');
  const rest = await recordPayment(db, user, id, { ...input(), amountCents: 20_000 });
  assert.ok(rest.ok, 'the remainder is accepted');
  // Someone else's invoice, and a missing one, are still "not found" — the statement inserts nothing.
  const [{ id: other }] = await db.insert(authUsers).values({ name: '', email: 'lock-other@example.test', emailVerified: true }).returning({ id: authUsers.id });
  assert.deepEqual((await recordPayment(db, other, id, input())) as { ok: boolean; reason?: string }, { ok: false, reason: 'not_found' });
  assert.deepEqual((await recordPayment(db, user, randomUUID(), input())) as { ok: boolean; reason?: string }, { ok: false, reason: 'not_found' });
});
