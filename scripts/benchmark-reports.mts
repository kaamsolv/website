/**
 * Benchmark for the Stage F reports — not part of `npm test`.
 *
 *   npx tsx scripts/benchmark-reports.mts
 *
 * Seeds one account with 10,000 invoices (realistic GST documents, six lines each) and 50,000 payments (about 10% of
 * them voided), plus three other accounts as background, then times what an export actually does:
 *   • each kind of page request: the queries, turning rows into cells, and the JSON the Worker would send;
 *   • a whole export read page by page (what the browser loops over);
 *   • the browser's own part: integrity check and building the CSV.
 * In-memory PGlite with the real migrations: it shows how the *queries* scale and what a page costs in JavaScript.
 * It is a Node proxy for Worker CPU, not a measurement of it — Neon adds a network round trip per query, and the
 * Worker has its own CPU limit that only a deployed test can confirm. Nothing here touches a real database.
 */

import { performance } from 'node:perf_hooks';
import { sql } from 'drizzle-orm';
import { makeTestDb } from '../test/helpers/test-db.mts';
import { ageingSummary, outstandingPage, paymentsPage, registerPage } from '../db/invoice-reports.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import { toCsv } from '../app/lib/invoice/csv.ts';
import {
  ageingCells,
  COLUMNS,
  outstandingCells,
  PAGE_SIZE,
  parseReportQuery,
  paymentCells,
  registerCells,
  verifyRows,
  type ReportKind,
  type ReportQuery,
} from '../app/lib/invoice/reports.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';

const TODAY = '2026-10-26';
const NOW = new Date('2026-10-26T12:00:00Z');
const RUNS = 15;

const { db, close } = await makeTestDb();
const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;
const mkUser = async (email: string) => (await rows<{ id: string }>(sql`insert into auth_users (name, email, email_verified) values ('', ${email}, true) returning id`))[0].id;

const doc: Invoice = {
  ...newInvoice(new Date(2026, 9, 10)),
  number: 'X',
  seller: { name: 'Sharma Design Studio', address: '12 MG Road\nPune 411001', email: 'a@b.test', phone: '9999999999', state: '27', gstin: '27AAPFU0939F1ZV' },
  client: { name: 'Client', address: '221B Baker Street\nBengaluru 560001', email: 'c@d.test', state: '29', gstin: '29AAGCB7383J1Z4' },
  items: Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, description: `Service line ${i} with a fairly long description of the work done`, qty: '2', rate: String(1000 + i * 250), hsn: '998391', unit: 'hrs', gstRate: i % 2 ? '18' : '5' })),
  notes: 'Thank you for your business. Payment due within 14 days. Bank: HDFC 50100123456789.',
};
const docTotal = computeTotals(doc).total;
const docJson = JSON.stringify(doc);

async function seed(user: string, prefix: string, invoices: number) {
  // Issue dates spread over 24 months to 2026-10; the same realistic document (so tax columns are computed) on every row.
  await db.execute(sql`
    insert into invoices (user_id, number, client_name, currency, total, issue_date, due_date, kind, status, data)
    select ${user}::uuid, ${prefix} || g, 'Client ' || (g % 300), case when g % 10 = 0 then 'USD' else 'INR' end, ${docTotal}::numeric(14,2),
           date '2024-11-01' + ((g * 7) % 720), date '2024-11-01' + ((g * 7) % 720) + 14, 'invoice', 'unpaid', ${docJson}::jsonb
    from generate_series(1, ${invoices}) g`);
  await db.execute(sql`
    insert into invoice_payments (user_id, invoice_id, amount, currency, paid_on, method, reference, client_key, voided_at, void_reason)
    select i.user_id, i.id, (i.total / 8)::numeric(14,2), i.currency, least(i.issue_date + k * 7, date '2026-10-20'), (array['bank','upi','cash','card','cheque'])[1 + (k % 5)],
           'UTR' || i.number || '-' || k, gen_random_uuid(), case when (i.g + k) % 10 = 0 then now() end, case when (i.g + k) % 10 = 0 then 'benchmark' else '' end
    from (select *, substring(number from char_length(${prefix}) + 1)::int as g from invoices where user_id = ${user}::uuid and number like ${prefix + '%'}) i
    cross join generate_series(1, 5) k`);
}

console.log('Seeding…');
const t0 = performance.now();
const main = await mkUser('bench-rp-main@example.test');
await db.execute(sql`alter table invoices disable trigger invoices_ledger_guard`);
await db.execute(sql`alter table invoice_payments disable trigger invoice_payments_ai`);
await seed(main, 'B-', 10000);
for (const n of [1, 2, 3]) await seed(await mkUser(`bench-rp-noise-${n}@example.test`), `N${n}-`, 1000);
await db.execute(sql`update invoices set amount_paid = coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = invoices.id and p.voided_at is null), 0)`);
await db.execute(sql`update invoices set status = case when amount_paid >= total and amount_paid > 0 then 'paid'::invoice_status else 'unpaid'::invoice_status end`);
await db.execute(sql`alter table invoices enable trigger invoices_ledger_guard`);
await db.execute(sql`alter table invoice_payments enable trigger invoice_payments_ai`);
await db.execute(sql`analyze invoices`);
await db.execute(sql`analyze invoice_payments`);

const c = (await rows<{ invoices: string; payments: string; voided: string; bad: string }>(sql`
  select (select count(*) from invoices where user_id = ${main}::uuid)::text as invoices,
         (select count(*) from invoice_payments where user_id = ${main}::uuid)::text as payments,
         (select count(*) from invoice_payments where user_id = ${main}::uuid and voided_at is not null)::text as voided,
         (select count(*) from invoices i where i.amount_paid <> coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0))::text as bad`))[0];
console.log(`Seeded in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${c.invoices} invoices, ${c.payments} payments (${c.voided} voided), plus 3 background accounts.`);
if (c.bad !== '0') throw new Error('ledger totals are inconsistent — the seed is wrong');
console.log(`One invoice document is ${(docJson.length / 1000).toFixed(1)} kB of JSON.\n`);

function query(report: ReportKind, extra: Record<string, string> = {}): ReportQuery {
  const p = new URLSearchParams({ report, currency: 'INR', today: TODAY, ...(report === 'register' || report === 'payments' ? { from: '2024-11-01', to: '2026-10-31' } : {}), ...extra });
  const r = parseReportQuery(p, NOW);
  if (!r.ok) throw new Error(r.message);
  return r.value;
}
type Fn = (q: ReportQuery) => Promise<{ rows: unknown[]; totals: unknown; matched: number }>;
const RUN: Record<ReportKind, { fn: Fn; cells: (r: never) => string[] }> = {
  register: { fn: (q) => registerPage(db, main, q), cells: registerCells as never },
  payments: { fn: (q) => paymentsPage(db, main, q), cells: paymentCells as never },
  outstanding: { fn: (q) => outstandingPage(db, main, q), cells: outstandingCells as never },
  ageing: { fn: (q) => ageingSummary(db, main, q), cells: ageingCells as never },
};

/** One page the way the route does it: queries → cells → the JSON body. Returns the milliseconds and the body size. */
async function onePage(q: ReportQuery) {
  const r = await RUN[q.report].fn(q);
  const body = JSON.stringify({ ok: true, report: q.report, columns: COLUMNS[q.report], rows: r.rows.map((x) => RUN[q.report].cells(x as never)), totals: r.totals, matched: r.matched, page: q.page, pageSize: q.pageSize });
  return body.length;
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function time(label: string, q: ReportQuery) {
  for (let i = 0; i < 2; i++) await onePage(q);
  const ms: number[] = [];
  let bytes = 0;
  for (let i = 0; i < RUNS; i++) {
    const s = performance.now();
    bytes = await onePage(q);
    ms.push(performance.now() - s);
  }
  ms.sort((a, b) => a - b);
  console.log(`${label.padEnd(54)} median ${ms[Math.floor(ms.length / 2)].toFixed(1).padStart(6)} ms   p95 ${ms[Math.min(ms.length - 1, Math.floor(0.95 * ms.length))].toFixed(1).padStart(6)} ms   body ${(bytes / 1000).toFixed(0).padStart(4)} kB`);
}

console.log('— One page request (queries + cells + JSON), in-memory Postgres —');
await time(`register — page 1 (${PAGE_SIZE.register} rows)`, query('register'));
await time('register — page 50', query('register', { page: '50' }));
await time('register — page 100 (deepest allowed)', query('register', { page: '100' }));
await time('register — preview (1 row: count and totals)', query('register', { pageSize: '1' }));
await time(`payments — page 1 (${PAGE_SIZE.payments} rows)`, query('payments'));
await time('payments — page 50', query('payments', { page: '50' }));
await time('payments — page 100 (deepest allowed)', query('payments', { page: '100' }));
await time('payments — with voided, page 1', query('payments', { includeVoided: '1' }));
await time('payments — preview (1 row)', query('payments', { pageSize: '1' }));
await time(`outstanding — page 1 (${PAGE_SIZE.outstanding} rows)`, query('outstanding'));
await time('outstanding — preview (1 row)', query('outstanding', { pageSize: '1' }));
await time('ageing summary', query('ageing'));

// The JavaScript part of a register page alone: what the Worker runs on top of the database's answer.
{
  const q = query('register');
  const page = await registerPage(db, main, q);
  const raw = await rows<{ data: unknown }>(sql`select data from invoices where user_id = ${main}::uuid limit ${PAGE_SIZE.register}`);
  const t: number[] = [];
  for (let i = 0; i < 25; i++) {
    const s = performance.now();
    for (const r of raw) computeTotals(r.data as Invoice);
    page.rows.map(registerCells);
    t.push(performance.now() - s);
  }
  console.log(`\nJavaScript alone for one register page (${raw.length} documents: totals + GST split + cells): median ${median(t).toFixed(1)} ms`);
}

console.log('\n— A whole export, read page by page (what the browser loops over) —');
async function whole(report: ReportKind, extra: Record<string, string> = {}) {
  const size = PAGE_SIZE[report];
  const q = query(report, extra);
  const first = await RUN[report].fn({ ...q, page: 1, pageSize: size });
  const pages = Math.ceil(first.matched / size);
  const all: string[][] = [];
  const s = performance.now();
  let bytes = 0;
  let worst = 0;
  for (let page = 1; page <= pages; page++) {
    const p0 = performance.now();
    const r = await RUN[report].fn({ ...q, page, pageSize: size });
    const cells = r.rows.map((x) => RUN[report].cells(x as never));
    bytes += JSON.stringify({ rows: cells, totals: r.totals }).length;
    all.push(...cells);
    worst = Math.max(worst, performance.now() - p0);
  }
  const readMs = performance.now() - s;
  const v0 = performance.now();
  const ok = verifyRows(COLUMNS[report], all, first.totals as never);
  const verifyMs = performance.now() - v0;
  const c0 = performance.now();
  const csv = toCsv([COLUMNS[report].map((x) => x.label), ...all]);
  const csvMs = performance.now() - c0;
  console.log(
    `${report.padEnd(12)} ${all.length.toLocaleString('en-IN').padStart(7)} rows in ${String(pages).padStart(3)} pages: read ${(readMs / 1000).toFixed(1)} s (slowest page ${worst.toFixed(0)} ms, ${(bytes / 1e6).toFixed(1)} MB over the wire) · ` +
      `check ${verifyMs.toFixed(0)} ms (${ok.ok ? 'passes' : 'FAILS'}) · build CSV ${csvMs.toFixed(0)} ms → ${(csv.length / 1e6).toFixed(1)} MB`,
  );
}
await whole('register', { from: '2025-11-01', to: '2026-10-31' });
await whole('register');
await whole('payments');
await whole('payments', { includeVoided: '1' });
await whole('outstanding');
await whole('ageing');

await close();
