/**
 * Stage F — the browser exporter against a fake report server: progress, cancellation, retries, drift between
 * pages, the integrity check, and the file that comes out (BOM, CRLF, quoting, formula defusing).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReportExportError, exportReport } from '../app/lib/invoice/report-export.ts';
import { COLUMNS, outstandingCells, type OutstandingRow, type ReportTotals } from '../app/lib/invoice/reports.ts';
import { parseCsv } from '../app/lib/invoice/csv.ts';

const PARAMS = () => new URLSearchParams({ report: 'outstanding', currency: 'INR', today: new Date().toISOString().slice(0, 10) });
const row = (i: number, over: Partial<OutstandingRow> = {}): OutstandingRow => ({
  number: `INV-${i}`, client: `Client ${i}`, customer: '', issueDate: '2026-09-01', dueDate: '2026-09-15', currency: 'INR', total: 100.1, received: 0, balance: 100.1, daysOverdue: 3, bucket: 'd1_30', status: 'unpaid', ...over,
});

type Server = { fetcher: (u: string, init?: RequestInit) => Promise<Response>; calls: number[]; };
/** A fake /api/invoices/reports over `rows`, `size` per page. `hook(page, attempt)` can return a Response or throw to misbehave. */
function fakeServer(rows: OutstandingRow[], size: number, hook?: (page: number, attempt: number) => Response | void): Server {
  const calls: number[] = [];
  const attempts = new Map<number, number>();
  const totalsOf = (all: OutstandingRow[]): ReportTotals => ({ report: 'outstanding', count: all.length, balance: Math.round(all.reduce((n, r) => n + Math.round(r.balance * 100), 0)) / 100, overdue: 0 });
  return {
    calls,
    fetcher: async (url) => {
      const q = new URL(url, 'http://x').searchParams;
      const page = Number(q.get('page'));
      calls.push(page);
      const attempt = (attempts.get(page) ?? 0) + 1;
      attempts.set(page, attempt);
      const special = hook?.(page, attempt);
      if (special) return special;
      return Response.json({
        ok: true, report: 'outstanding', title: 'Outstanding invoices', currency: 'INR', today: q.get('today'), columns: COLUMNS.outstanding,
        rows: rows.slice((page - 1) * size, page * size).map(outstandingCells), totals: totalsOf(rows), matched: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / size)), pageSize: size, cap: 10000, blanked: 0,
      });
    },
  };
}
const reply = (status: number, body: object) => Response.json(body, { status });
const reject = async (p: Promise<unknown>, code: string) => {
  await assert.rejects(p, (e: unknown) => e instanceof ReportExportError && e.code === code, `expected ${code}`);
};

test('reads every page in order, reports progress after each, and produces a CSV with BOM, CRLF and the header', async () => {
  const rows = Array.from({ length: 23 }, (_, i) => row(i + 1));
  const s = fakeServer(rows, 5);
  const seen: string[] = [];
  const out = await exportReport(PARAMS(), { fetcher: s.fetcher, onProgress: (p) => seen.push(`${p.page}/${p.pages}:${p.rows}`) });
  assert.deepEqual(s.calls, [1, 2, 3, 4, 5], 'one request per page, in order, no repeats');
  assert.deepEqual(seen, ['1/5:5', '2/5:10', '3/5:15', '4/5:20', '5/5:23']);
  assert.equal(out.rows, 23);
  assert.match(out.filename, /^kaamsolv-outstanding-invoices-INR-as-of-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await out.blob.text();
  assert.deepEqual([...new Uint8Array(await out.blob.arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 byte-order mark');
  const parsed = parseCsv(text.replace(/^﻿/, ''));
  assert.equal(parsed.length, 24);
  assert.deepEqual(parsed[0], COLUMNS.outstanding.map((c) => c.label));
  assert.deepEqual(parsed[23].slice(0, 2), ['INV-23', 'Client 23']);
  assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text), 'CRLF line endings throughout');
  assert.equal(out.blob.type, 'text/csv;charset=utf-8');
});

test('an empty report is still a valid file: header only', async () => {
  const out = await exportReport(PARAMS(), { fetcher: fakeServer([], 5).fetcher });
  assert.equal(out.rows, 0);
  assert.equal(parseCsv((await out.blob.text()).replace(/^﻿/, '')).length, 1);
});

test('text that looks like a formula is defused, and quotes, commas, newlines and Unicode survive', async () => {
  const nasty = ['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\tTAB', '\rCR', 'He said "hi", then\nleft', 'नमस्ते — ₹ — 😀', '   =spaces first', '=1+1'];
  const rows = nasty.map((name, i) => row(i + 1, { client: name }));
  const out = await exportReport(PARAMS(), { fetcher: fakeServer(rows, 4).fetcher });
  const parsed = parseCsv((await out.blob.text()).replace(/^﻿/, ''));
  const client = COLUMNS.outstanding.findIndex((c) => c.key === 'client');
  const got = parsed.slice(1).map((r) => r[client]);
  assert.equal(got.length, nasty.length);
  nasty.forEach((original, i) => {
    if (/^[=+\-@\t\r]/.test(original)) assert.equal(got[i], `'${original}`, `defused: ${JSON.stringify(original)}`);
    else assert.equal(got[i], original, `unchanged: ${JSON.stringify(original)}`);
  });
  for (const cell of got) assert.ok(!/^[=+\-@\t\r]/.test(cell));
});

test('cancel stops before the next request and no file is made', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i + 1));
  const s = fakeServer(rows, 5);
  const ctl = new AbortController();
  const p = exportReport(PARAMS(), { fetcher: s.fetcher, signal: ctl.signal, onProgress: (x) => x.page === 2 && ctl.abort() });
  await assert.rejects(p, (e: unknown) => e instanceof DOMException && e.name === 'AbortError');
  assert.deepEqual(s.calls, [1, 2], 'nothing after the cancel');
});

test('a dropped connection or a server error is retried; success after a retry gives the same file', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
  const flaky = fakeServer(rows, 5, (page, attempt) => {
    if (page === 2 && attempt === 1) throw new TypeError('network down');
    if (page === 3 && attempt <= 2) return reply(503, { ok: false, message: 'busy' });
  });
  const out = await exportReport(PARAMS(), { fetcher: flaky.fetcher, retryDelayMs: 1 });
  const clean = await exportReport(PARAMS(), { fetcher: fakeServer(rows, 5).fetcher });
  assert.equal(await out.blob.text(), await clean.blob.text());
  assert.deepEqual(flaky.calls, [1, 2, 2, 3, 3, 3]);
});

test('retries stop after three tries, with a calm message', async () => {
  const s = fakeServer([row(1)], 5, () => reply(500, { ok: false, message: 'That report didn’t load. Try again.' }));
  await reject(exportReport(PARAMS(), { fetcher: s.fetcher, retryDelayMs: 1 }), 'server');
  assert.equal(s.calls.length, 3);
  const offline = { fetcher: async () => { throw new TypeError('offline'); } };
  await reject(exportReport(PARAMS(), { ...offline, retryDelayMs: 1 }), 'network');
});

test('not allowed, too many rows, rate limit and bad requests stop at once with the server’s words and are not retried', async () => {
  for (const [status, code] of [[403, 'forbidden'], [413, 'too_many'], [429, 'rate_limited'], [400, 'invalid']] as const) {
    const s = fakeServer([row(1)], 5, () => reply(status, { ok: false, message: `said ${status}` }));
    await assert.rejects(exportReport(PARAMS(), { fetcher: s.fetcher }), (e: unknown) => e instanceof ReportExportError && e.code === code && e.message === `said ${status}`);
    assert.equal(s.calls.length, 1, `${status} is not retried`);
  }
});

test('a bad request is refused before any network call', async () => {
  let called = false;
  const fetcher = async () => ((called = true), reply(200, {}));
  await reject(exportReport(new URLSearchParams({ report: 'outstanding', currency: 'INR' }), { fetcher }), 'invalid');
  await reject(exportReport(new URLSearchParams({ report: 'nope', currency: 'INR', today: '2026-10-26' }), { fetcher }), 'invalid');
  assert.equal(called, false);
});

test('if the data changes between pages the export stops and offers no file', async () => {
  const rows = Array.from({ length: 15 }, (_, i) => row(i + 1));
  const base = fakeServer(rows, 5);
  const changed = [...rows, row(99)];
  const later = fakeServer(changed, 5);
  const fetcher = (u: string, init?: RequestInit) => (new URL(u, 'http://x').searchParams.get('page') === '3' ? later.fetcher(u, init) : base.fetcher(u, init));
  await reject(exportReport(PARAMS(), { fetcher }), 'changed');
});

test('the integrity check catches a page that comes back wrong (dropped, repeated or altered rows)', async () => {
  const rows = Array.from({ length: 15 }, (_, i) => row(i + 1, { balance: 100 + i, total: 100 + i }));
  const alter = (mutate: (cells: string[][]) => string[][]) =>
    fakeServer(rows, 5, (page) => {
      if (page !== 2) return;
      const real = rows.slice(5, 10).map(outstandingCells);
      return Response.json({
        ok: true, report: 'outstanding', title: 't', currency: 'INR', today: PARAMS().get('today'), columns: COLUMNS.outstanding, rows: mutate(real),
        totals: { report: 'outstanding', count: 15, balance: rows.reduce((n, r) => n + r.balance, 0), overdue: 0 }, matched: 15, page: 2, pages: 3, pageSize: 5, cap: 10000, blanked: 0,
      });
    });
  const balance = COLUMNS.outstanding.findIndex((c) => c.key === 'balance');
  await reject(exportReport(PARAMS(), { fetcher: alter((c) => c.slice(1)).fetcher }), 'integrity');
  await reject(exportReport(PARAMS(), { fetcher: alter((c) => [...c.slice(0, 4), c[0]]).fetcher }), 'integrity');
  await reject(exportReport(PARAMS(), { fetcher: alter((c) => c.map((r, i) => (i === 0 ? r.map((v, j) => (j === balance ? '100.50' : v)) : r))).fetcher }), 'integrity');
  // An honest page passes.
  const ok = await exportReport(PARAMS(), { fetcher: alter((c) => c).fetcher });
  assert.equal(ok.rows, 15);
});
