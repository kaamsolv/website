/**
 * Benchmark for the Stage E invoice workspace — not part of `npm test`.
 *
 *   npx tsx scripts/benchmark-workspace.mts
 *
 * Seeds one account with 1,000 customers, 5,000 invoices (about 60% connected to a saved customer, the rest typed in
 * — a quarter of those with a saved customer's exact name) and 20,000 payments, plus three other accounts as
 * background, then times what Stage E added: searching, sorting and deep paging the invoice list, the customers list
 * with per-customer figures, one customer's totals and its by-name suggestions. In-memory PGlite with the real
 * migrations: it shows how the *queries* scale and that no index is needed, not Neon's network time (one round trip
 * per query on top). Nothing here touches a real database.
 */

import { performance } from 'node:perf_hooks';
import { sql } from 'drizzle-orm';
import { makeTestDb } from '../test/helpers/test-db.mts';
import { findUnlinkedByName, getCustomerSummary, listCustomerStats } from '../db/customer-workspace.ts';
import { listCustomersPage } from '../db/directory.ts';
import { listInvoicesPage } from '../db/invoice-filters.ts';
import type { ListQuery } from '../app/lib/invoice/list-query.ts';

const TODAY = '2026-10-26';
const RUNS = 25;

const { db, close } = await makeTestDb();
const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;
const mkUser = async (email: string) => (await rows<{ id: string }>(sql`insert into auth_users (name, email, email_verified) values ('', ${email}, true) returning id`))[0].id;

async function seed(user: string, prefix: string, invoices: number, customers: number) {
  await db.execute(sql`
    insert into customers (user_id, name)
    select ${user}::uuid, 'Customer ' || lpad(g::text, 4, '0') from generate_series(1, ${customers}) g`);
  // g % 5 < 3 → connected to a customer; g % 5 = 3 → typed with a saved customer's exact name; else a free-typed name.
  await db.execute(sql`
    insert into invoices (user_id, number, client_name, customer_id, currency, total, issue_date, due_date, kind, status, data)
    select ${user}::uuid, ${prefix} || g,
           case when g % 5 < 4 then 'Customer ' || lpad((1 + g % ${customers})::text, 4, '0') else 'Typed Client ' || g end,
           case when g % 5 < 3 then (select c.id from customers c where c.user_id = ${user}::uuid and c.name = 'Customer ' || lpad((1 + g % ${customers})::text, 4, '0')) end,
           case when g % 10 = 0 then 'USD' else 'INR' end, (1000 + (g % 50) * 100)::numeric(14,2),
           date '2025-04-01' + ((g * 7) % 570), date '2025-04-01' + ((g * 7) % 570) + 14, case when g % 40 = 0 then 'quote' else 'invoice' end, 'unpaid', '{}'::jsonb
    from generate_series(1, ${invoices}) g`);
  await db.execute(sql`
    insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, client_key, voided_at, void_reason)
    select i.user_id, i.id, case when i.g % 10 < 4 then i.total / 4 else i.total / 8 end, i.currency, least(i.issue_date + k * 10, date '2026-10-20'), 'bank', gen_random_uuid(),
           case when i.g % 10 >= 8 then now() end, case when i.g % 10 >= 8 then 'benchmark' else '' end
    from (select *, substring(number from char_length(${prefix}) + 1)::int as g from invoices where user_id = ${user}::uuid and kind = 'invoice' and number like ${prefix + '%'}) i
    cross join generate_series(1, 4) k`);
}

console.log('Seeding…');
const t0 = performance.now();
const main = await mkUser('bench-ws-main@example.test');
await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
await db.execute(sql`alter table invoice_payments disable trigger invoice_payments_ai`);
await seed(main, 'B-', 5000, 1000);
for (const n of [1, 2, 3]) await seed(await mkUser(`bench-ws-noise-${n}@example.test`), `N${n}-`, 1000, 200);
await db.execute(sql`update invoices set amount_paid = coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = invoices.id and p.voided_at is null), 0)`);
await db.execute(sql`update invoices set status = case when kind = 'invoice' and amount_paid >= total and amount_paid > 0 then 'paid'::invoice_status else 'unpaid'::invoice_status end`);
await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
await db.execute(sql`alter table invoice_payments enable trigger invoice_payments_ai`);
await db.execute(sql`analyze invoices`);
await db.execute(sql`analyze invoice_payments`);
await db.execute(sql`analyze customers`);

const c = (await rows<{ invoices: string; payments: string; customers: string; linked: string; bad: string }>(sql`
  select (select count(*) from invoices where user_id = ${main}::uuid)::text as invoices,
         (select count(*) from invoice_payments where user_id = ${main}::uuid)::text as payments,
         (select count(*) from customers where user_id = ${main}::uuid)::text as customers,
         (select count(*) from invoices where user_id = ${main}::uuid and customer_id is not null)::text as linked,
         (select count(*) from invoices i where i.amount_paid <> coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0))::text as bad`))[0];
console.log(`Seeded in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${c.invoices} invoices (${c.linked} connected), ${c.payments} payments, ${c.customers} customers.`);
if (c.bad !== '0') throw new Error('ledger totals are inconsistent — the seed is wrong');
console.log('Ledger check: every invoice’s amount_paid equals the sum of its non-voided payments.\n');

async function time(label: string, fn: () => Promise<unknown>) {
  for (let i = 0; i < 3; i++) await fn();
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const s = performance.now();
    await fn();
    ms.push(performance.now() - s);
  }
  ms.sort((a, b) => a - b);
  const pick = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  console.log(`${label.padEnd(60)} median ${pick(0.5).toFixed(1).padStart(6)} ms   p95 ${pick(0.95).toFixed(1).padStart(6)} ms   max ${ms.at(-1)!.toFixed(1).padStart(6)} ms`);
}

const q = (over: Partial<ListQuery> = {}): ListQuery => ({ filter: {}, today: TODAY, q: '', kind: 'all', sort: 'updated', page: 1, pageSize: 25, ...over });
await time('list — page 1, newest first (no search)', () => listInvoicesPage(db, main, q()));
await time('list — search a client name ("Customer 04")', () => listInvoicesPage(db, main, q({ q: 'Customer 04' })));
await time('list — search an invoice number ("B-12")', () => listInvoicesPage(db, main, q({ q: 'B-12' })));
await time('list — search with no result', () => listInvoicesPage(db, main, q({ q: 'zzzzzz' })));
await time('list — sort by amount, page 1', () => listInvoicesPage(db, main, q({ sort: 'total' })));
await time('list — sort by due date, page 100 (deep)', () => listInvoicesPage(db, main, q({ sort: 'due', page: 100 })));
await time('list — outstanding + search + page 2', () => listInvoicesPage(db, main, q({ filter: { state: 'outstanding' }, kind: 'invoice', q: 'Customer 1', page: 2 })));
await time('list — one customer’s invoices (history)', async () => {
  const [{ id }] = await rows<{ id: string }>(sql`select id from customers where user_id = ${main}::uuid and name = 'Customer 0007'`);
  return listInvoicesPage(db, main, q({ filter: { customer: id }, kind: 'invoice', pageSize: 10 }));
});

const [{ id: cust }] = await rows<{ id: string }>(sql`select id from customers where user_id = ${main}::uuid and name = 'Customer 0007'`);
await time('customers — page 1 of 40 (25 rows)', () => listCustomersPage(db, main, '', 1, 25));
await time('customers — search "Customer 09"', () => listCustomersPage(db, main, 'Customer 09', 1, 25));
await time('customers — figures for a page of 25 (one grouped query)', async () => {
  const page = await listCustomersPage(db, main, '', 7, 25);
  return listCustomerStats(db, main, page.rows.map((r) => r.id), TODAY);
});
await time('customer — totals per currency (one customer)', () => getCustomerSummary(db, main, cust, TODAY));
await time('customer — typed-in invoices with this exact name', () => findUnlinkedByName(db, main, cust));

const page = await listInvoicesPage(db, main, q({ q: 'Customer 04' }));
console.log(`\nSample: "Customer 04" matches ${page.matched} documents over ${page.pages} pages; totals per currency over every match: ${page.totals.map((t) => `${t.currency} ${t.count} invoices`).join(', ')}.`);
const plan = await rows<{ 'QUERY PLAN': string }>(sql`
  explain select id from invoices where user_id = ${main}::uuid and (number ilike '%Customer 04%' or client_name ilike '%Customer 04%') order by updated_at desc limit 25`);
console.log('\nSearch plan:\n  ' + plan.map((r) => r['QUERY PLAN']).slice(0, 5).join('\n  '));
await close();
