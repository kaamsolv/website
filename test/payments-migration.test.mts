/**
 * Migration 0010 on a database that already holds invoices. Builds a database as production is today (migrations
 * 0000–0009) with unpaid, paid, partly-edited and quotation rows, applies 0010 with the real migrator, and checks
 * that nothing that existed has changed — in particular that invoices already marked paid stay exactly as they were
 * (status 'paid', nothing invented in a ledger). Then runs the rollback SQL **taken from the docs**
 * (docs/infra/deployment.md), checks the data again, and applies 0010 a second time. Runs on a throwaway in-memory
 * PGlite — never against Neon.
 */

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const REAL = resolve(import.meta.dirname, '../db/migrations');
const journal = JSON.parse(readFileSync(join(REAL, 'meta/_journal.json'), 'utf8')) as { version: string; dialect: string; entries: { idx: number; tag: string }[] };
const tmp = mkdtempSync(join(tmpdir(), 'kk-mig-pay-'));
const folder = join(tmp, 'migrations');

let client: PGlite;
before(() => {
  mkdirSync(join(folder, 'meta'), { recursive: true });
});
after(async () => {
  await client?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const upTo = (tag: string) => journal.entries.filter((e) => e.idx <= journal.entries.find((x) => x.tag === tag)!.idx);
function stage(tag: string) {
  for (const e of upTo(tag)) cpSync(join(REAL, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
  writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: upTo(tag) }));
}
const rows = async <T,>(q: string, params: unknown[] = []) => (await client.query<T>(q, params)).rows;
const count = async (q: string) => (await rows<{ n: number }>(q))[0].n;

test('0010 on a database that already has invoices: nothing existing changes; legacy paid stays paid; rollback and re-apply work', async () => {
  client = new PGlite();
  const db = drizzle(client);

  // Production today: everything up to and including 0009.
  stage('0009_qr_campaigns');
  await migrate(db, { migrationsFolder: folder });
  assert.equal(await count(`select count(*)::int as n from information_schema.columns where table_name = 'invoices' and column_name = 'amount_paid'`), 0, 'no ledger column yet');

  const [{ id: user }] = await rows<{ id: string }>(`insert into auth_users (name, email, email_verified) values ('', 'mig-pay@example.test', true) returning id`);
  const make = async (number: string, total: number, status: 'unpaid' | 'paid', kind: 'invoice' | 'quote' = 'invoice') => {
    const [{ id }] = await rows<{ id: string }>(
      `insert into invoices (user_id, number, client_name, currency, total, issue_date, due_date, status, paid_at, kind, data)
       values ($1, $2, 'Acme', 'INR', $3, '2026-09-01', '2026-09-15', $4::invoice_status, $5, $6, '{"n":1}'::jsonb) returning id`,
      [user, number, total, status, status === 'paid' ? '2026-09-20T10:00:00Z' : null, kind],
    );
    return id;
  };
  const unpaid = await make('MIG-1', 20000, 'unpaid');
  const legacyPaid = await make('MIG-2', 5000, 'paid');
  await make('MIG-3', 700, 'unpaid', 'quote');

  const snapshot = async () => ({
    invoices: await rows(`select id, user_id, number, client_name, currency, total, issue_date, due_date, customer_id, status, kind, recur_every, recur_next, paid_at, data, created_at, updated_at from invoices order by number`),
    plans: await rows(`select plan_key, feature_key, limit_value from plan_features where feature_key <> 'invoice_payments' order by plan_key, feature_key`),
  });
  const before = await snapshot();
  assert.equal(before.invoices.length, 3);

  // Production gets 0010.
  stage('0010_invoice_payments');
  await migrate(db, { migrationsFolder: folder });

  assert.deepEqual(await snapshot(), before, 'every existing invoice and plan row is exactly as it was');
  assert.deepEqual((await rows<{ number: string; amount_paid: string; status: string }>(`select number, amount_paid::text, status::text from invoices order by number`)), [
    { number: 'MIG-1', amount_paid: '0.00', status: 'unpaid' },
    { number: 'MIG-2', amount_paid: '0.00', status: 'paid' },
    { number: 'MIG-3', amount_paid: '0.00', status: 'unpaid' },
  ], 'amount_paid starts at 0 everywhere; the already-paid invoice is still paid, with no ledger entry made up for it');
  assert.equal(await count(`select count(*)::int as n from invoice_payments`), 0);
  assert.equal(await count(`select count(*)::int as n from invoice_payment_events`), 0);
  assert.equal(await count(`select count(*)::int as n from plan_features where feature_key = 'invoice_payments' and plan_key in ('free_account','invoice_pro') and limit_value is null`), 2, 'free and Pro both get payments, unlimited');

  // Existing behaviour on migrated rows: editing a legacy-paid invoice's total keeps it paid; an unpaid one edits freely.
  await client.query(`update invoices set total = 5500 where id = $1`, [legacyPaid]);
  assert.equal((await rows<{ status: string }>(`select status::text from invoices where id = $1`, [legacyPaid]))[0].status, 'paid');
  await client.query(`update invoices set total = 21000, currency = 'USD' where id = $1`, [unpaid]);
  await client.query(`update invoices set total = 20000, currency = 'INR' where id = $1`, [unpaid]);
  await assert.rejects(client.query(`update invoices set status = 'paid' where id = $1`, [unpaid]), /invoice_unsettled/);

  // The ledger works on migrated data.
  const key = '11111111-1111-4111-8111-111111111111';
  await client.query(`insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key) values ($1, $2, 5000, 'INR', '2026-10-01', 'upi', $3)`, [user, unpaid, key]);
  assert.deepEqual((await rows(`select amount_paid::text, status::text from invoices where id = $1`, [unpaid]))[0], { amount_paid: '5000.00', status: 'unpaid' });
  await client.query(`update invoice_payments set voided_at = now(), void_reason = 'test' where invoice_id = $1`, [unpaid]);
  assert.equal((await rows<{ a: string }>(`select amount_paid::text as a from invoices where id = $1`, [unpaid]))[0].a, '0.00');
  await client.query(`update invoices set total = 20000 where id = $1`, [unpaid]);

  // ─── The rollback SQL from the docs ───────────────────────────────────────
  const doc = readFileSync(resolve(import.meta.dirname, '../docs/infra/deployment.md'), 'utf8').replace(/\r\n/g, '\n');
  const block = /\*\*Rolling back 0010\.\*\*[\s\S]*?```sql\n([\s\S]*?)```/.exec(doc)?.[1];
  assert.ok(block, 'the rollback block is in the deployment doc');
  assert.match(block, /DROP TRIGGER invoices_ledger_guard/);
  for (const statement of block.split(';').map((s) => s.trim()).filter(Boolean)) await client.query(statement);

  for (const table of ['invoice_payments', 'invoice_payment_events']) {
    assert.equal(await count(`select count(*)::int as n from information_schema.tables where table_name = '${table}'`), 0, `${table} gone`);
  }
  assert.equal(await count(`select count(*)::int as n from information_schema.columns where table_name = 'invoices' and column_name = 'amount_paid'`), 0, 'column gone');
  assert.equal(await count(`select count(*)::int as n from pg_trigger where tgname like 'invoice%ledger%' or tgname like 'invoice_payments%'`), 0, 'triggers gone');
  assert.equal(await count(`select count(*)::int as n from pg_proc where proname like 'invoice_payments%' or proname = 'invoices_ledger_guard'`), 0, 'functions gone');
  assert.equal(await count(`select count(*)::int as n from plan_features where feature_key = 'invoice_payments'`), 0);
  const afterRollback = await snapshot();
  assert.deepEqual(afterRollback.plans, before.plans, 'plans are as they were');
  assert.deepEqual(
    afterRollback.invoices.map((r) => [(r as { number: string }).number, (r as { status: string }).status, (r as { total: string }).total]),
    [['MIG-1', 'unpaid', '20000.00'], ['MIG-2', 'paid', '5500.00'], ['MIG-3', 'unpaid', '700.00']],
    'every invoice keeps its number and status, and the totals edited after the migration (MIG-2: 5,500)',
  );
  assert.equal((await rows<{ n: number }>(`select count(*)::int as n from drizzle.__drizzle_migrations`))[0].n, upTo('0009_qr_campaigns').length, '0009 is still recorded as applied; only 0010’s row went');

  // …and the migration can be applied again from there.
  stage('0010_invoice_payments');
  await migrate(db, { migrationsFolder: folder });
  assert.equal(await count(`select count(*)::int as n from information_schema.tables where table_name = 'invoice_payments'`), 1);
  assert.equal((await rows<{ status: string }>(`select status::text from invoices where id = $1`, [legacyPaid]))[0].status, 'paid');
});
