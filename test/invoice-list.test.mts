/**
 * Stage E — the invoice list: paging maths, request validation, and the paged list on real Postgres (PGlite):
 * search, type, sort, pages that add up, totals over every match that equal the Stage D filters and the
 * dashboard cards, user isolation, and the unchanged unfiltered response.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers } from '../db/schema.ts';
import { getCollections } from '../db/collections.ts';
import { createInvoice, listInvoices } from '../db/invoices.ts';
import { listInvoicesFiltered, listInvoicesPage } from '../db/invoice-filters.ts';
import { recordPayment } from '../db/payments.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { hasFilterParams } from '../app/lib/invoice/filters.ts';
import { isPagedRequest, parseListQuery, type ListQuery } from '../app/lib/invoice/list-query.ts';
import { DEFAULT_PAGE_SIZE, clampPage, pageCount, pageWindow, parsePaging, rangeText } from '../app/lib/paging.ts';
import type { CurrencyCode, Invoice } from '../app/lib/invoice/types.ts';

let db: Db;
let close: () => Promise<void>;
let A: string;
let B: string;
const TODAY = '2026-10-26';

const p = (o: Record<string, string>) => new URLSearchParams(o);
const NOW = new Date('2026-10-26T04:00:00Z');

// ─── Pure: paging and validation ──────────────────────────────────────────────────────────────────────

test('paging maths: defaults, bounds, clamping, the range text and the page window', () => {
  assert.deepEqual(parsePaging(p({})), { ok: true, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  assert.deepEqual(parsePaging(p({ page: '3', pageSize: '100' })), { ok: true, page: 3, pageSize: 100 });
  for (const bad of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'x' }, { page: '9999999' }, { pageSize: '0' }, { pageSize: '101' }, { pageSize: 'ten' }]) {
    assert.equal(parsePaging(p(bad)).ok, false, JSON.stringify(bad));
  }
  assert.equal(pageCount(0, 25), 1);
  assert.equal(pageCount(25, 25), 1);
  assert.equal(pageCount(26, 25), 2);
  assert.equal(clampPage(9, 3), 3);
  assert.equal(clampPage(0, 3), 1);
  assert.equal(rangeText(1, 25, 0), '0 results');
  assert.equal(rangeText(1, 25, 7), '1–7 of 7');
  assert.equal(rangeText(2, 25, 60), '26–50 of 60');
  assert.equal(rangeText(3, 25, 60), '51–60 of 60');
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(5, 12), [1, 'gap', 4, 5, 6, 'gap', 12]);
  assert.deepEqual(pageWindow(3, 12), [1, 2, 3, 4, 'gap', 12]);
  assert.deepEqual(pageWindow(4, 12), [1, 2, 3, 4, 5, 'gap', 12], 'a single missing page is shown, not hidden behind a gap');
  assert.deepEqual(pageWindow(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(6, 12), [1, 'gap', 5, 6, 7, 'gap', 12]);
});

test('list requests: which params make a paged request, and how they are validated', () => {
  assert.equal(isPagedRequest(p({})), false);
  assert.equal(isPagedRequest(p({ state: 'overdue' })), false, 'Stage D filters alone keep their own answer');
  assert.equal(hasFilterParams(p({ q: 'x' })), false);
  for (const k of ['q', 'kind', 'sort', 'page', 'pageSize', 'ids']) assert.equal(isPagedRequest(p({ [k]: '1' })), true, k);

  const ok = parseListQuery(p({ q: '  acme   traders ', sort: 'due', page: '2', pageSize: '10' }), NOW);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.value.q, ok.value.sort, ok.value.page, ok.value.pageSize, ok.value.kind], ['acme traders', 'due', 2, 10, 'all']);
  const filtered = parseListQuery(p({ state: 'outstanding' }), NOW);
  assert.ok(filtered.ok && filtered.value.kind === 'invoice', 'a payment filter means invoices only…');
  const explicit = parseListQuery(p({ state: 'outstanding', kind: 'all' }), NOW);
  assert.ok(explicit.ok && explicit.value.kind === 'all', '…unless a type is asked for');
  assert.equal(parseListQuery(p({ kind: 'quote', state: 'paid' }), NOW).ok, false, 'quotations have no payment status');
  assert.equal(parseListQuery(p({ kind: 'quote', currency: 'INR' }), NOW).ok, true);
  const id = randomUUID();
  const withIds = parseListQuery(p({ ids: `${id},${id.toUpperCase()}` }), NOW);
  assert.ok(withIds.ok && withIds.value.ids?.length === 1, 'duplicates collapse');
  for (const bad of [{ q: 'x'.repeat(81) }, { kind: 'all,invoice' }, { sort: 'random' }, { ids: 'nope' }, { ids: '' }, { ids: Array(51).fill(id).join(',').replace(/^/, '') + `,${randomUUID()}` }, { page: '0' }, { state: 'overdue' }]) {
    assert.equal(parseListQuery(p(bad as Record<string, string>), NOW).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.ok(parseListQuery(p({ state: 'overdue', today: TODAY }), new Date('2026-10-26T04:00:00Z')).ok);
});

// ─── Database ─────────────────────────────────────────────────────────────────────────────────────────

const NAMES = ['Acme Traders', 'Bright Co', 'Cobalt 100%', 'Delta_Works'];
const pad = (n: number, w = 3) => String(n).padStart(w, '0');
const day = (n: number) => new Date(Date.UTC(2026, 4, 1 + n)).toISOString().slice(0, 10);

type Made = { id: string; number: string; client: string; total: number; currency: CurrencyCode; issue: string; due: string; kind: 'invoice' | 'quote'; paid: number };
const made: Made[] = [];

before(async () => {
  ({ db, close } = await makeTestDb());
  const mk = async (email: string) => (await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id }))[0].id;
  A = await mk('list-a@example.test');
  B = await mk('list-b@example.test');
  const create = async (user: string, n: string, client: string, rate: number, currency: CurrencyCode, issue: string, due: string, kind?: 'quote') => {
    const doc: Invoice = {
      ...newInvoice(new Date(2026, 9, 10)),
      number: n,
      issueDate: issue,
      dueDate: due,
      currency,
      client: { name: client, address: '', email: '' },
      items: [{ id: 'a', description: 'Work', qty: '1', rate: String(rate) }],
      taxRate: '',
      ...(kind ? { kind } : {}),
    };
    const r = await createInvoice(db, user, doc, null);
    assert.ok(r.ok);
    return r.ok ? r.id : '';
  };
  for (let n = 1; n <= 24; n++) {
    const currency: CurrencyCode = n % 6 === 0 ? 'USD' : 'INR';
    const id = await create(A, `INV-${pad(n)}`, NAMES[n % 4], n * 100, currency, day(n), day(n + 14));
    // Every 4th is paid in full, every other 3rd half paid.
    let paid = 0;
    if (n % 4 === 0) paid = n * 100;
    else if (n % 3 === 0) paid = n * 50;
    if (paid) {
      const r = await recordPayment(db, A, id, { amountCents: paid * 100, paidOn: day(n + 2), method: 'bank', reference: '', note: '', clientKey: randomUUID(), reconcile: false });
      assert.ok(r.ok);
    }
    made.push({ id, number: `INV-${pad(n)}`, client: NAMES[n % 4], total: n * 100, currency, issue: day(n), due: day(n + 14), kind: 'invoice', paid });
  }
  for (let n = 1; n <= 4; n++) {
    const id = await create(A, `QT-${pad(n)}`, 'Acme Traders', 5000, 'INR', day(30 + n), day(60 + n), 'quote');
    made.push({ id, number: `QT-${pad(n)}`, client: 'Acme Traders', total: 5000, currency: 'INR', issue: day(30 + n), due: day(60 + n), kind: 'quote', paid: 0 });
  }
  // Someone else's, with the same words in it.
  await create(B, 'INV-001', 'Acme Traders', 99999, 'INR', day(1), day(15));
});
after(async () => close());

const q = (over: Partial<ListQuery> = {}): ListQuery => ({ filter: {}, today: TODAY, q: '', kind: 'all', sort: 'updated', page: 1, pageSize: 25, ...over });
const allPages = async (query: Partial<ListQuery>) => {
  const first = await listInvoicesPage(db, A, q({ ...query, page: 1 }));
  const rows = [...first.invoices];
  for (let page = 2; page <= first.pages; page++) rows.push(...(await listInvoicesPage(db, A, q({ ...query, page }))).invoices);
  return { first, rows };
};

test('pages add up: every sort, concatenated, equals the whole list once — no repeats, no gaps', async () => {
  for (const sort of ['updated', 'issued', 'due', 'total', 'number'] as const) {
    const { first, rows } = await allPages({ sort, pageSize: 7 });
    assert.equal(first.matched, 28, sort);
    assert.equal(first.pages, 4);
    assert.equal(rows.length, 28);
    assert.equal(new Set(rows.map((r) => r.id)).size, 28, `${sort}: no repeats`);
    assert.deepEqual([...rows.map((r) => r.id)].sort(), made.map((m) => m.id).sort(), `${sort}: nothing missing`);
  }
  // The order each sort promises.
  const byNumber = (await allPages({ sort: 'number', pageSize: 100 })).rows.map((r) => r.number);
  assert.deepEqual(byNumber, [...made.map((m) => m.number)].sort());
  const byTotal = (await allPages({ sort: 'total', pageSize: 100 })).rows.map((r) => r.total);
  assert.deepEqual(byTotal, [...byTotal].sort((a, b) => b - a));
  const byDue = (await allPages({ sort: 'due', pageSize: 100 })).rows.map((r) => r.dueDate!);
  assert.deepEqual(byDue, [...byDue].sort());
  const byIssued = (await allPages({ sort: 'issued', pageSize: 100 })).rows.map((r) => r.issueDate!);
  assert.deepEqual(byIssued, [...byIssued].sort().reverse());
  const updated = (await allPages({ sort: 'updated', pageSize: 100 })).rows.map((r) => r.number);
  assert.deepEqual(updated, made.map((m) => m.number).reverse(), 'most recently changed first — the order the list had before');
});

test('a page past the end is clamped to the last; an empty result is one empty page', async () => {
  const far = await listInvoicesPage(db, A, q({ page: 99, pageSize: 10 }));
  assert.deepEqual([far.page, far.pages, far.matched, far.invoices.length], [3, 3, 28, 8]);
  const none = await listInvoicesPage(db, A, q({ q: 'no-such-thing', page: 5 }));
  assert.deepEqual([none.page, none.pages, none.matched, none.invoices, none.totals], [1, 1, 0, [], []]);
});

test('search: invoice number or client name, any case, wildcards are plain characters, scoped to the user', async () => {
  const numbers = async (term: string, extra: Partial<ListQuery> = {}) => (await allPages({ q: term, pageSize: 100, sort: 'number', ...extra })).rows.map((r) => r.number);
  assert.deepEqual(await numbers('inv-010'), ['INV-010']);
  assert.deepEqual(await numbers('QT-00'), ['QT-001', 'QT-002', 'QT-003', 'QT-004'], 'quotations are searchable');
  const acme = made.filter((m) => m.client === 'Acme Traders').map((m) => m.number).sort();
  assert.deepEqual(await numbers('acme'), acme, 'client name, case-insensitive');
  assert.deepEqual(await numbers('TRADERS'), acme);
  assert.deepEqual(await numbers('100%'), made.filter((m) => m.client === 'Cobalt 100%').map((m) => m.number).sort(), 'a % is a % — not “anything”');
  assert.deepEqual(await numbers('%'), made.filter((m) => m.client === 'Cobalt 100%').map((m) => m.number).sort());
  assert.deepEqual(await numbers('Delta_W'), made.filter((m) => m.client === 'Delta_Works').map((m) => m.number).sort());
  assert.deepEqual(await numbers('Delta?W'), [], 'and an _ is an _');
  assert.deepEqual(await numbers("x'; drop table invoices; --"), [], 'injection is just text');
  assert.ok(!(await numbers('acme')).includes('99999'));
  const mine = await listInvoicesPage(db, A, q({ q: 'INV-001' }));
  assert.deepEqual(mine.invoices.map((r) => r.number), ['INV-001'], 'B’s INV-001 never appears');
  assert.equal(mine.invoices[0].total, 100);
  // Search plus a filter is the intersection.
  const both = await allPages({ q: 'acme', kind: 'invoice', pageSize: 100 });
  assert.deepEqual(both.rows.map((r) => r.number).sort(), made.filter((m) => m.client === 'Acme Traders' && m.kind === 'invoice').map((m) => m.number).sort());
});

test('type: all, invoices only, quotations only; a payment filter means invoices unless a type is asked for', async () => {
  const count = async (query: Partial<ListQuery>) => (await listInvoicesPage(db, A, q(query))).matched;
  assert.equal(await count({ kind: 'all' }), 28);
  assert.equal(await count({ kind: 'invoice' }), 24);
  assert.equal(await count({ kind: 'quote' }), 4);
  const quotes = await listInvoicesPage(db, A, q({ kind: 'quote' }));
  assert.ok(quotes.invoices.every((i) => i.kind === 'quote' && i.balance === 0), 'a quotation owes nothing');
  assert.deepEqual(quotes.totals, [], 'quotations are not in the money totals');
  const all = await listInvoicesPage(db, A, q({ kind: 'all', pageSize: 100 }));
  assert.equal(all.totals.reduce((n, t) => n + t.count, 0), 24, 'totals count invoices only, even when quotations are listed');
});

test('totals are over every match, per currency, and equal the Stage D filter totals (and so the dashboard cards)', async () => {
  const expected = (cur: CurrencyCode, pick: (m: Made) => boolean) => made.filter((m) => m.kind === 'invoice' && m.currency === cur && pick(m));
  const sum = (ms: Made[], f: (m: Made) => number) => ms.reduce((s, m) => s + f(m), 0);

  const page1 = await listInvoicesPage(db, A, q({ pageSize: 5 }));
  const inr = page1.totals.find((t) => t.currency === 'INR')!;
  const usd = page1.totals.find((t) => t.currency === 'USD')!;
  assert.deepEqual(page1.totals.map((t) => t.currency), ['INR', 'USD'], 'INR first, never added together');
  assert.equal(inr.total, sum(expected('INR', () => true), (m) => m.total), 'more than the five rows on the page');
  assert.equal(usd.count, 4);
  assert.equal(inr.balance, sum(expected('INR', () => true), (m) => m.total - m.paid));

  // Same conditions as Stage D's filtered list → same totals.
  for (const filter of [{ state: 'outstanding' }, { state: 'overdue' }, { state: 'partial' }, { state: 'paid' }, { bucket: 'd90_plus' }, { state: 'unpaid', currency: 'INR' }] as const) {
    const stageD = await listInvoicesFiltered(db, A, filter, TODAY);
    const paged = await listInvoicesPage(db, A, q({ filter, today: TODAY, kind: 'invoice', pageSize: 3 }));
    assert.deepEqual(paged.totals, stageD.totals, JSON.stringify(filter));
    assert.equal(paged.matched, stageD.totals.reduce((n, t) => n + t.count, 0));
  }

  // …and the dashboard card.
  const card = await getCollections(db, A, { currency: 'INR', from: '2026-01-01', to: '2026-12-31', today: TODAY });
  const outstanding = await listInvoicesPage(db, A, q({ filter: { state: 'outstanding', currency: 'INR' }, today: TODAY, kind: 'invoice' }));
  assert.equal(outstanding.totals[0].balance, card.summary.outstanding.amount);
  assert.equal(outstanding.totals[0].count, card.summary.outstanding.count);

  // The rows of all the pages add up to the totals.
  const { rows } = await allPages({ filter: { state: 'outstanding', currency: 'INR' }, today: TODAY, kind: 'invoice', pageSize: 4 });
  assert.equal(rows.reduce((s, r) => s + r.balance, 0), card.summary.outstanding.amount);
  assert.equal(rows.reduce((s, r) => s + r.total, 0), outstanding.totals[0].total);
});

test('received-in-period rows add up to the received total; ids narrow to exactly those invoices (and never to another user’s)', async () => {
  const filter = { currency: 'INR', paidFrom: '2026-05-01', paidTo: '2026-12-31' } as const;
  const { first, rows } = await allPages({ filter, kind: 'invoice', pageSize: 5 });
  const paidTotal = made.filter((m) => m.currency === 'INR' && m.kind === 'invoice').reduce((s, m) => s + m.paid, 0);
  assert.equal(first.totals[0].receivedInPeriod, paidTotal);
  assert.equal(rows.reduce((s, r) => s + (r.receivedInPeriod ?? 0), 0), paidTotal);
  assert.ok(rows.every((r) => (r.receivedInPeriod ?? 0) > 0), 'only invoices that took a payment');

  const pick = [made[0].id, made[5].id, made[27].id];
  const some = await listInvoicesPage(db, A, q({ ids: pick, pageSize: 50 }));
  assert.deepEqual(some.invoices.map((r) => r.id).sort(), [...pick].sort());
  const foreign = (await listInvoices(db, B))[0].id;
  const none = await listInvoicesPage(db, A, q({ ids: [foreign] }));
  assert.equal(none.matched, 0, 'someone else’s invoice id finds nothing');
});

test('rows carry what the list needs: the customer link, the balance and the payment fields', async () => {
  const row = (await listInvoicesPage(db, A, q({ q: 'INV-003' }))).invoices[0];
  assert.deepEqual([row.number, row.total, row.amountPaid, row.balance, row.status, row.customerId, row.kind], ['INV-003', 300, 150, 150, 'unpaid', null, 'invoice']);
  const paid = (await listInvoicesPage(db, A, q({ q: 'INV-004' }))).invoices[0];
  assert.deepEqual([paid.status, paid.balance], ['paid', 0]);
});

test('the unfiltered list is exactly what it was: every invoice and quotation, summary columns only', async () => {
  const all = await listInvoices(db, A);
  assert.equal(all.length, 28);
  assert.deepEqual(Object.keys(all[0]).sort(), ['amountPaid', 'clientName', 'currency', 'dueDate', 'id', 'issueDate', 'kind', 'number', 'recurEvery', 'recurNext', 'status', 'total', 'updatedAt']);
  assert.deepEqual(all.map((r) => r.number), made.map((m) => m.number).reverse(), 'newest-changed first, as before');
});
