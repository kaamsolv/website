/**
 * Rehearsal of the payment ledger under real concurrency — NOT part of `npm test`, and never for production.
 *
 *   npx tsx scripts/rehearse-payments.mts --local
 *       Self-check of the scenarios on in-memory PGlite. PGlite runs one statement at a time, so this proves the
 *       script's own logic and the invariants, NOT concurrent behaviour. Safe anywhere.
 *
 *   DATABASE_URL=<a dedicated NON-PRODUCTION Neon branch> npx tsx scripts/rehearse-payments.mts --expect-host <host> --non-production
 *       Fires genuinely concurrent requests (separate HTTP connections, so separate transactions) at that branch
 *       through the app's own `recordPayment` / `voidPayment` code, then checks the ledger's invariants.
 *
 * Safety rails for the Neon mode (all must hold or it refuses before writing anything):
 *   • DATABASE_URL must be set in that command's environment (no .env file is read), --expect-host must equal its host, and
 *     --non-production states that you know this is not production (host only is ever printed — never the credentials);
 *   • the branch must already have migration 0010 applied (see docs/infra/deployment.md);
 *   • it must contain NO users at all — so it cannot be a copy of production or of anyone's data. Create it from a
 *     schema-only or empty branch, never as a data copy of production;
 *   • it only ever writes rows for one synthetic user it creates itself, and deletes that user (cascading) at the end.
 *
 * What it checks: 20 simultaneous payments against an invoice that can take 10 (exactly 10 win); one idempotency key
 * sent 10 times at once (one row); two payments racing for the last rupees (one wins); a void racing a new payment;
 * an invoice edit lowering the total racing a payment — and after every scenario, for every invoice:
 * amount_paid = the sum of its non-voided payments, never above the total, status 'paid' exactly when covered.
 */

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { recordPayment, voidPayment } from '../db/payments.ts';
import { redact } from '../db/atomic-migration.ts';
import type { Db } from '../db/links.ts';

const args = process.argv.slice(2);
const local = args.includes('--local');
const stop = (m: string): never => {
  console.error(redact(m, process.env.DATABASE_URL));
  process.exit(1);
};

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

let db: Db;
let close = async () => {};

if (local) {
  const { makeTestDb } = await import('../test/helpers/test-db.mts');
  ({ db, close } = await makeTestDb());
  console.log('Mode: local PGlite self-check (serial — proves the logic, not concurrency).');
} else {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) stop('Set DATABASE_URL to a dedicated NON-PRODUCTION Neon branch, or use --local.');
  const host = new URL(url as string).hostname;
  const i = args.indexOf('--expect-host');
  if (args[i + 1] !== host) stop(`Refusing: --expect-host must be exactly "${host}" (the host DATABASE_URL points at).`);
  if (!args.includes('--non-production')) stop('Refusing: add --non-production to confirm this database is a dedicated test branch, not production.');
  const { drizzle } = await import('drizzle-orm/neon-http');
  db = drizzle(url as string) as unknown as Db;
  console.log(`Mode: Neon — ${host} (real concurrent requests).`);
}

const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;

// ─── Safety gates ────────────────────────────────────────────────────────────────────────────────
if (!local) {
  const ready = await rows<{ ok: boolean }>(sql`select to_regclass('public.invoice_payments') is not null and exists (select 1 from information_schema.columns where table_name = 'invoices' and column_name = 'amount_paid') as ok`);
  if (!ready[0]?.ok) stop('Refusing: migration 0010 is not applied on this database.');
  const [{ n }] = await rows<{ n: string }>(sql`select count(*)::text as n from auth_users`);
  if (Number(n) !== 0) stop(`Refusing: this database already has ${n} user(s). The rehearsal only runs on an empty, non-production branch — never on a copy of real data.`);
}

const [{ id: user }] = await rows<{ id: string }>(sql`insert into auth_users (name, email, email_verified) values ('rehearsal', ${`rehearsal-${randomUUID()}@example.test`}, true) returning id`);

async function invoice(total: number, number: string): Promise<string> {
  const [{ id }] = await rows<{ id: string }>(sql`
    insert into invoices (user_id, number, client_name, currency, total, issue_date, due_date, kind, data)
    values (${user}::uuid, ${number}, 'Rehearsal Client', 'INR', ${total}, current_date - 10, current_date + 10, 'invoice', '{}'::jsonb)
    returning id`);
  return id;
}
const input = (amount: number, key: string = randomUUID()) => ({
  amountCents: Math.round(amount * 100),
  paidOn: new Date().toISOString().slice(0, 10),
  method: 'bank' as const,
  reference: '',
  note: '',
  clientKey: key,
  reconcile: false,
});
const pay = (id: string, amount: number, key?: string) => recordPayment(db, user, id, input(amount, key));
const state = async (id: string) =>
  (await rows<{ total: string; paid: string; status: string; live: string; n: string }>(sql`
    select i.total::text, i.amount_paid::text as paid, i.status::text,
           coalesce((select sum(amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0)::text as live,
           (select count(*) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null)::text as n
    from invoices i where i.id = ${id}::uuid`))[0];

/** The ledger's promises, for one invoice, whatever order things happened in. */
async function invariants(name: string, id: string) {
  const s = await state(id);
  const total = Number(s.total);
  const paid = Number(s.paid);
  const live = Number(s.live);
  const consistent = Math.abs(paid - live) < 0.005 && paid <= total + 0.005 && (s.status === 'paid') === (paid > 0 && paid >= total - 0.005);
  check(`${name}: ledger invariants`, consistent, `total ${total}, amount_paid ${paid}, live payments ${live} (${s.n}), status ${s.status}`);
  return s;
}

try {
  // 1 — 20 payments of 100 at once against an invoice that can take 10.
  {
    const id = await invoice(1000, 'R-OVERPAY');
    const out = await Promise.all(Array.from({ length: 20 }, () => pay(id, 100)));
    const won = out.filter((r) => r.ok).length;
    const refused = out.filter((r) => !r.ok && r.reason === 'exceeds').length;
    const s = await invariants('20 simultaneous payments on a 1,000 invoice', id);
    check('exactly 10 payments accepted, 10 refused as "exceeds"', won === 10 && refused === 10 && Number(s.paid) === 1000 && s.status === 'paid', `accepted ${won}, exceeds ${refused}, other ${20 - won - refused}`);
  }

  // 2 — one idempotency key, ten requests at once.
  {
    const id = await invoice(500, 'R-IDEMP');
    const key = randomUUID();
    const out = await Promise.all(Array.from({ length: 10 }, () => pay(id, 50, key)));
    const s = await invariants('one idempotency key sent 10 times at once', id);
    const originals = out.filter((r) => r.ok && !r.duplicate).length;
    const dupes = out.filter((r) => r.ok && r.duplicate).length;
    check('exactly one payment recorded; the rest answered as the same payment', Number(s.n) === 1 && Number(s.paid) === 50 && originals === 1 && dupes === 9, `rows ${s.n}, original ${originals}, duplicates ${dupes}, failures ${10 - originals - dupes}`);
  }

  // 3 — two payments racing for the same last money.
  {
    const id = await invoice(100, 'R-LAST');
    const [a, b] = await Promise.all([pay(id, 60), pay(id, 60)]);
    const s = await invariants('two payments of 60 racing on a 100 invoice', id);
    check('one wins, one is refused', [a, b].filter((r) => r.ok).length === 1 && Number(s.paid) === 60, `results: ${[a, b].map((r) => (r.ok ? 'ok' : r.reason)).join(', ')}`);
  }

  // 4 — a void racing a fresh payment on a fully paid invoice.
  {
    const id = await invoice(100, 'R-VOID');
    const first = await pay(id, 100);
    if (!first.ok) throw new Error('setup payment refused');
    const [v, p] = await Promise.all([voidPayment(db, user, id, first.payment.id, 'rehearsal'), pay(id, 100)]);
    const s = await invariants('void racing a new payment', id);
    check('either order is acceptable, but never more than the total received', v.ok && Number(s.paid) <= 100, `void ok=${v.ok}; new payment ${p.ok ? 'accepted' : p.reason}; live ${s.live}`);
  }

  // 5 — lowering the invoice total racing a payment.
  {
    const id = await invoice(1000, 'R-EDIT');
    const base = await pay(id, 600);
    if (!base.ok) throw new Error('setup payment refused');
    const [edit, p] = await Promise.all([
      db.execute(sql`update invoices set total = 650 where id = ${id}::uuid`).then(() => 'edited', (e: unknown) => String((e as Error).message ?? e)),
      pay(id, 100),
    ]);
    const s = await invariants('total lowered while a payment lands', id);
    const editRefused = edit !== 'edited';
    const payRefused = !p.ok;
    check('never a total below what was received (one of the two gives way, or both fit)', Number(s.total) >= Number(s.paid), `edit ${editRefused ? 'refused' : 'applied'}, payment ${payRefused ? 'refused' : 'accepted'}, total ${s.total}, received ${s.paid}`);
  }

  // Everything this run made, once more.
  const bad = await rows<{ number: string }>(sql`
    select i.number from invoices i
    where i.user_id = ${user}::uuid
      and (i.amount_paid <> coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0) or i.amount_paid > i.total)`);
  check('final sweep: every invoice reconciles with its ledger', bad.length === 0, bad.length ? `mismatched: ${bad.map((b) => b.number).join(', ')}` : 'all consistent');
} finally {
  await db.execute(sql`delete from auth_users where id = ${user}::uuid`); // cascades to invoices, payments and their audit rows
  await close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed. Synthetic data removed.`);
process.exit(failed.length ? 1 : 0);
