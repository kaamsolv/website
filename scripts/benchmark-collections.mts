/**
 * Benchmark for Payments & Collections (Stage D) — not part of `npm test`.
 *
 *   npx tsx scripts/benchmark-collections.mts
 *
 * Seeds one account with 5,000 invoices and 20,000 payments (plus three other accounts as background noise, so
 * the user scoping is exercised), then times the real queries — the whole dashboard and the drill-down lists —
 * repeatedly. It runs on an in-memory PGlite database with the real migrations, so the numbers show how the
 * *queries* scale with the data (and that they scan the right rows), not the network time of Neon — which adds
 * one round trip per query on top. Nothing here touches a real database.
 *
 * The seed goes in as bulk SQL with the ledger triggers switched off for speed, then the triggers are switched
 * back on and the cached totals are checked against the ledger before anything is timed.
 */

import { performance } from 'node:perf_hooks';
import { sql } from 'drizzle-orm';
import { makeTestDb } from '../test/helpers/test-db.mts';
import { getCollections } from '../db/collections.ts';
import { listInvoicesFiltered } from '../db/invoice-filters.ts';

const TODAY = '2026-10-26';
const FY = { from: '2026-04-01', to: '2027-03-31' };
const TWO_YEARS = { from: '2024-11-01', to: '2026-10-31' };
const RUNS = 25;

const { db, close } = await makeTestDb();
const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;

const mkUser = async (email: string) => (await rows<{ id: string }>(sql`insert into auth_users (name, email, email_verified) values ('', ${email}, true) returning id`))[0].id;

async function seed(user: string, prefix: string, invoices: number) {
  await db.execute(sql`
    insert into invoices (user_id, number, client_name, currency, total, issue_date, due_date, kind, status, data)
    select ${user}::uuid, ${prefix} || g, 'Client ' || (g % 200), case when g % 10 = 0 then 'USD' else 'INR' end,
           (1000 + (g % 50) * 100)::numeric(14,2),
           date '2025-04-01' + ((g * 7) % 570), date '2025-04-01' + ((g * 7) % 570) + 14, 'invoice', 'unpaid', '{}'::jsonb
    from generate_series(1, ${invoices}) g`);
  // 40% paid in 4 equal payments · 40% half paid in 4 payments · 20% unpaid, with 4 payments recorded and voided.
  await db.execute(sql`
    insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key, voided_at, void_reason)
    select i.user_id, i.id,
           case when i.g % 10 < 4 then i.total / 4 when i.g % 10 < 8 then i.total / 8 else i.total / 4 end,
           i.currency, least(i.issue_date + k * 10, date '2026-10-20'), 'bank', gen_random_uuid(),
           case when i.g % 10 >= 8 then now() end, case when i.g % 10 >= 8 then 'benchmark' else '' end
    from (select *, substring(number from char_length(${prefix}) + 1)::int as g from invoices where user_id = ${user}::uuid and number like ${prefix + '%'}) i
    cross join generate_series(1, 4) k`);
}

console.log('Seeding…');
const t0 = performance.now();
const main = await mkUser('bench-main@example.test');
await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
await db.execute(sql`alter table invoice_payments disable trigger invoice_payments_ai`);
await seed(main, 'B-', 5000);
for (const n of [1, 2, 3]) await seed(await mkUser(`bench-noise-${n}@example.test`), `N${n}-`, 1000);
await db.execute(sql`
  update invoices set
    amount_paid = coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = invoices.id and p.voided_at is null), 0)`);
await db.execute(sql`update invoices set status = case when amount_paid >= total and amount_paid > 0 then 'paid'::invoice_status else 'unpaid'::invoice_status end`);
await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
await db.execute(sql`alter table invoice_payments enable trigger invoice_payments_ai`);
await db.execute(sql`analyze invoices`);
await db.execute(sql`analyze invoice_payments`);

const counts = await rows<{ invoices: string; payments: string; main_invoices: string; main_payments: string; mismatched: string }>(sql`
  select (select count(*) from invoices)::text as invoices, (select count(*) from invoice_payments)::text as payments,
         (select count(*) from invoices where user_id = ${main}::uuid)::text as main_invoices,
         (select count(*) from invoice_payments where user_id = ${main}::uuid)::text as main_payments,
         (select count(*) from invoices i where i.amount_paid <> coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0))::text as mismatched`);
const c = counts[0];
console.log(`Seeded in ${((performance.now() - t0) / 1000).toFixed(1)} s: main account ${c.main_invoices} invoices / ${c.main_payments} payments; whole database ${c.invoices} / ${c.payments}.`);
if (c.mismatched !== '0') throw new Error(`${c.mismatched} invoices have amount_paid ≠ their ledger — the seed is wrong`);
console.log('Ledger check: every invoice’s amount_paid equals the sum of its non-voided payments.\n');

async function time(label: string, fn: () => Promise<unknown>) {
  for (let i = 0; i < 3; i++) await fn(); // warm up
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const s = performance.now();
    await fn();
    ms.push(performance.now() - s);
  }
  ms.sort((a, b) => a - b);
  const pick = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  console.log(`${label.padEnd(58)} median ${pick(0.5).toFixed(1).padStart(6)} ms   p95 ${pick(0.95).toFixed(1).padStart(6)} ms   max ${ms.at(-1)!.toFixed(1).padStart(6)} ms`);
  return pick(0.5);
}

const q = (range: { from: string; to: string }, currency: 'INR' | 'USD' = 'INR') => ({ currency, ...range, today: TODAY });
await time('dashboard — INR, this financial year (12 months)', () => getCollections(db, main, q(FY)));
await time('dashboard — INR, the 24-month maximum', () => getCollections(db, main, q(TWO_YEARS)));
await time('dashboard — USD, this financial year', () => getCollections(db, main, q(FY, 'USD')));
await time('list — outstanding, INR (capped at 200, totals over all)', () => listInvoicesFiltered(db, main, { state: 'outstanding', currency: 'INR' }, TODAY));
await time('list — overdue, INR', () => listInvoicesFiltered(db, main, { state: 'overdue', currency: 'INR' }, TODAY));
await time('list — ageing bucket 60+ days, INR', () => listInvoicesFiltered(db, main, { bucket: 'd60_plus', currency: 'INR' }, TODAY));
await time('list — paid in a month (received-in-period rows)', () => listInvoicesFiltered(db, main, { currency: 'INR', paidFrom: '2026-06-01', paidTo: '2026-06-30' }, TODAY));
await time('list — issued this financial year, INR', () => listInvoicesFiltered(db, main, { currency: 'INR', issuedFrom: FY.from, issuedTo: FY.to }, TODAY));

const big = await getCollections(db, main, q(FY));
console.log(`\nSample result: invoiced ${big.summary.invoiced.amount} (${big.summary.invoiced.count} invoices), received ${big.summary.received.amount} (${big.summary.received.count} payments), outstanding ${big.summary.outstanding.amount} (${big.summary.outstanding.count}), ageing buckets add up: ${big.ageing.reduce((s, b) => s + b.amount, 0) === big.summary.outstanding.amount}`);

const plan = await rows<{ 'QUERY PLAN': string }>(sql`
  explain select coalesce(sum(p.amount), 0) from invoice_payments p
  where p.user_id = ${main}::uuid and p.currency = 'INR' and p.voided_at is null and p.paid_on between date '2026-04-01' and date '2027-03-31'`);
console.log('\nReceived-in-range plan (uses the Stage C partial index on user_id, paid_on?):\n  ' + plan.map((r) => r['QUERY PLAN']).slice(0, 4).join('\n  '));
await close();
