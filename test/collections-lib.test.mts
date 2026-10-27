/**
 * Payments & Collections (Stage D) — the pure parts: the Indian financial year, ranges, the ageing rule, the
 * collection rate, and request validation. Includes the time boundaries: IST just after midnight, 31 March →
 * 1 April, and the server/browser date plausibility rule.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGEING_BUCKETS,
  ageingBucket,
  collectionRate,
  daysOverdue,
  financialYearEnd,
  financialYearLabel,
  financialYearStart,
  monthEnd,
  monthLabel,
  monthsBetween,
  parseCollectionsQuery,
  resolvePreset,
  validateRange,
} from '../app/lib/invoice/collections.ts';
import { filterToParams, hasFilter, hasFilterParams, invoicesHref, parseInvoiceFilter } from '../app/lib/invoice/filters.ts';
import { clientTodayOk } from '../app/lib/invoice/recurring.ts';

const at = (iso: string) => new Date(iso);
const params = (o: Record<string, string>) => new URLSearchParams(o);

// ─── The Indian financial year, and the 31 March / 1 April boundary ──────────────────────────────────

test('financial year: 1 April – 31 March, by the calendar date alone', () => {
  assert.equal(financialYearStart('2026-04-01'), '2026-04-01', '1 April starts the new year');
  assert.equal(financialYearStart('2026-03-31'), '2025-04-01', '31 March is still the old year');
  assert.equal(financialYearStart('2026-10-26'), '2026-04-01');
  assert.equal(financialYearStart('2027-01-01'), '2026-04-01');
  assert.equal(financialYearEnd('2026-03-31'), '2026-03-31');
  assert.equal(financialYearEnd('2026-04-01'), '2027-03-31');
  assert.equal(financialYearLabel('2026-03-31'), '2025-26');
  assert.equal(financialYearLabel('2026-04-01'), '2026-27');
  assert.equal(financialYearLabel('2099-04-01'), '2099-00', 'wraps the century cleanly');
});

test('presets: this FY, last FY, whole-month rolling ranges, leap years and year ends', () => {
  assert.deepEqual(resolvePreset('fy', '2026-03-31'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(resolvePreset('fy', '2026-04-01'), { from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(resolvePreset('fy-1', '2026-04-01'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(resolvePreset('fy-1', '2026-03-31'), { from: '2024-04-01', to: '2025-03-31' });
  assert.deepEqual(resolvePreset('month', '2024-02-10'), { from: '2024-02-01', to: '2024-02-29' }, 'leap February');
  assert.deepEqual(resolvePreset('month', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(resolvePreset('3m', '2026-01-15'), { from: '2025-11-01', to: '2026-01-31' }, 'crosses a year end');
  assert.deepEqual(resolvePreset('6m', '2026-02-10'), { from: '2025-09-01', to: '2026-02-28' });
  assert.deepEqual(resolvePreset('6m', '2026-10-26'), { from: '2026-05-01', to: '2026-10-31' });
  assert.equal(monthEnd('2026-12-05'), '2026-12-31');
  // Every preset is a valid range.
  for (const p of ['month', '3m', '6m', 'fy', 'fy-1'] as const) {
    for (const today of ['2026-03-31', '2026-04-01', '2024-02-29', '2026-12-31', '2026-01-01']) {
      const r = resolvePreset(p, today);
      assert.equal(validateRange(r.from, r.to).ok, true, `${p} on ${today}`);
    }
  }
});

test('months: every month in the range, across years, inclusive; labels', () => {
  assert.deepEqual(monthsBetween('2025-11-15', '2026-02-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthsBetween('2026-04-01', '2026-04-30'), ['2026-04']);
  assert.equal(monthsBetween('2026-04-01', '2027-03-31').length, 12);
  assert.equal(monthLabel('2026-04'), 'Apr 26');
  assert.equal(monthLabel('2025-12'), 'Dec 25');
});

test('validateRange: real dates, in order, within 24 months and sane years', () => {
  assert.equal(validateRange('2026-04-01', '2026-04-01').ok, true, 'a single day');
  assert.equal(validateRange('2024-04-01', '2026-03-31').ok, true, 'exactly 24 months');
  assert.equal(validateRange('2024-03-31', '2026-03-31').ok, false, '25 months');
  assert.equal(validateRange('2026-04-02', '2026-04-01').ok, false, 'backwards');
  assert.equal(validateRange('2026-02-30', '2026-03-01').ok, false, 'not a real date');
  assert.equal(validateRange('1999-12-31', '2000-01-31').ok, false);
  assert.equal(validateRange('2100-12-01', '2101-01-01').ok, false);
  assert.equal(validateRange(null, '2026-03-01').ok, false);
  assert.equal(validateRange('2026-3-1', '2026-03-31').ok, false, 'must be zero-padded');
});

// ─── Overdue and ageing ──────────────────────────────────────────────────────────────────────────────

test('overdue: due today is not overdue; one day later is 1 day; no due date is never overdue', () => {
  assert.equal(daysOverdue('2026-03-31', '2026-03-31'), 0);
  assert.equal(daysOverdue('2026-03-31', '2026-04-01'), 1, 'across the financial-year boundary');
  assert.equal(daysOverdue('2026-04-01', '2026-03-31'), 0, 'due in the future');
  assert.equal(daysOverdue(null, '2026-04-01'), 0);
  assert.equal(daysOverdue('2024-02-28', '2024-03-01'), 2, 'leap day counted');
  assert.equal(daysOverdue('2025-02-28', '2025-03-01'), 1);
  assert.equal(daysOverdue('2025-12-31', '2026-01-01'), 1, 'across a year end');
});

test('ageing buckets: not yet due · 1–30 · 31–60 · 61–90 · over 90, on the exact boundary days', () => {
  assert.deepEqual(AGEING_BUCKETS.map((b) => b.key), ['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']);
  const today = '2026-04-30';
  const bucket = (due: string | null) => ageingBucket(due, today);
  assert.equal(bucket(null), 'not_due', 'no due date');
  assert.equal(bucket('2026-05-01'), 'not_due');
  assert.equal(bucket('2026-04-30'), 'not_due', 'due today');
  assert.equal(bucket('2026-04-29'), 'd1_30', '1 day');
  assert.equal(bucket('2026-03-31'), 'd1_30', '30 days');
  assert.equal(bucket('2026-03-30'), 'd31_60', '31 days');
  assert.equal(bucket('2026-03-01'), 'd31_60', '60 days');
  assert.equal(bucket('2026-02-28'), 'd61_90', '61 days');
  assert.equal(bucket('2026-01-31'), 'd61_90', '89 days');
  assert.equal(bucket('2026-01-30'), 'd61_90', '90 days');
  assert.equal(bucket('2026-01-29'), 'd90_plus', '91 days');
  assert.equal(bucket('2020-01-01'), 'd90_plus');
});

// ─── Collection rate ─────────────────────────────────────────────────────────────────────────────────

test('collection rate (invoice cohort): whole percent, rounded down, never 100 until fully collected, null when nothing to measure', () => {
  assert.equal(collectionRate(0, 0), null);
  assert.equal(collectionRate(500, 0), null);
  assert.equal(collectionRate(0, 100000), 0);
  assert.equal(collectionRate(333, 1000), 33);
  assert.equal(collectionRate(500000, 2000000), 25);
  assert.equal(collectionRate(99999, 100000), 99, '99.999% is not 100%');
  assert.equal(collectionRate(100000, 100000), 100);
  assert.equal(collectionRate(150000, 100000), 100, 'never above 100');
});

// ─── "Today": what the server accepts (the IST midnight boundary) ─────────────────────────────────────

test('today from the browser: accepted within a day of the server’s UTC date, never beyond — across midnight and 1 April', () => {
  // 23:59:59 IST on 31 March = 18:29:59 UTC the same day.
  assert.equal(clientTodayOk('2026-03-31', at('2026-03-31T18:29:59Z')), true);
  // 00:00:00 IST on 1 April = 18:30:00 UTC on 31 March: the browser already says 1 April.
  assert.equal(clientTodayOk('2026-04-01', at('2026-03-31T18:30:00Z')), true, 'IST just after midnight');
  assert.equal(clientTodayOk('2026-04-01', at('2026-03-31T23:59:59Z')), true);
  // UTC−12 browser late on 31 March while the server is already on 1 April UTC.
  assert.equal(clientTodayOk('2026-03-31', at('2026-04-01T00:00:00Z')), true);
  // UTC+14 browser (Kiribati) a day ahead of UTC.
  assert.equal(clientTodayOk('2026-04-02', at('2026-04-01T10:00:00Z')), true);
  // Two days off in either direction: refused.
  assert.equal(clientTodayOk('2026-04-02', at('2026-03-31T12:00:00Z')), false, '2 days ahead');
  assert.equal(clientTodayOk('2026-03-29', at('2026-03-31T12:00:00Z')), false, '2 days behind');
  assert.equal(clientTodayOk('2026-04-01', at('2026-03-30T23:59:59Z')), false);
  assert.equal(clientTodayOk('2026-02-30', at('2026-03-01T00:00:00Z')), false, 'not a real date');
  assert.equal(clientTodayOk(undefined, at('2026-03-01T00:00:00Z')), false);
});

test('the financial year follows the browser’s date, not the server’s clock, around 1 April IST', () => {
  // The server is still on 31 March UTC; the visitor in India is already on 1 April: new financial year.
  const serverNow = at('2026-03-31T20:00:00Z');
  const q = parseCollectionsQuery(params({ today: '2026-04-01', ...resolvePreset('fy', '2026-04-01') }), serverNow);
  assert.ok(q.ok);
  if (q.ok) assert.deepEqual([q.value.from, q.value.to, q.value.today], ['2026-04-01', '2027-03-31', '2026-04-01']);
  // Someone further behind (UTC−5) is still on 31 March: the old year, same server instant.
  const behind = parseCollectionsQuery(params({ today: '2026-03-31', ...resolvePreset('fy', '2026-03-31') }), serverNow);
  assert.ok(behind.ok);
  if (behind.ok) assert.deepEqual([behind.value.from, behind.value.to], ['2025-04-01', '2026-03-31']);
});

// ─── Request validation ──────────────────────────────────────────────────────────────────────────────

test('collections request: today is required (no fallback), range checked, currency and customer validated', () => {
  const now = at('2026-10-26T04:00:00Z');
  const base = { today: '2026-10-26', from: '2026-04-01', to: '2027-03-31' };
  const parse = (o: Record<string, string>) => parseCollectionsQuery(params(o), now);
  const ok = parse({ ...base, currency: 'USD', customer: '11111111-1111-4111-8111-111111111111' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value, { currency: 'USD', from: '2026-04-01', to: '2027-03-31', today: '2026-10-26', customerId: '11111111-1111-4111-8111-111111111111' });
  const noCurrency = parse(base);
  assert.ok(noCurrency.ok && noCurrency.value.currency === undefined, 'the server picks the main currency');
  assert.equal(parse({ from: base.from, to: base.to }).ok, false, 'no today');
  assert.equal(parse({ ...base, today: '2026-10-20' }).ok, false, 'a week off');
  assert.equal(parse({ ...base, to: '2029-03-31' }).ok, false, 'more than 24 months');
  assert.equal(parse({ ...base, from: '2027-04-01' }).ok, false, 'backwards');
  assert.equal(parse({ ...base, currency: 'BTC' }).ok, false);
  assert.equal(parse({ ...base, customer: 'not-a-uuid' }).ok, false);
});

test('invoice filters: parsed, validated, round-tripped to a link; overdue and ageing need today', () => {
  const now = at('2026-10-26T04:00:00Z');
  const f = parseInvoiceFilter(params({ state: 'overdue', currency: 'INR', today: '2026-10-26' }), now);
  assert.ok(f.ok);
  if (f.ok) assert.deepEqual([f.filter, f.today], [{ state: 'overdue', currency: 'INR' }, '2026-10-26']);
  assert.equal(parseInvoiceFilter(params({ state: 'overdue' }), now).ok, false, 'overdue without today');
  assert.equal(parseInvoiceFilter(params({ bucket: 'd1_30' }), now).ok, false, 'ageing without today');
  const plain = parseInvoiceFilter(params({ state: 'paid' }), now);
  assert.ok(plain.ok && plain.today === null, 'paid needs no date');
  for (const bad of [{ state: 'nope' }, { currency: 'XXX' }, { bucket: 'd999' }, { issuedFrom: '2026-13-01' }, { customer: 'x' }, { paidFrom: '2026-05-02', paidTo: '2026-05-01' }]) {
    assert.equal(parseInvoiceFilter(params(bad), now).ok, false, JSON.stringify(bad));
  }
  const filter = { state: 'outstanding', currency: 'USD', bucket: 'd31_60', issuedFrom: '2026-04-01', paidTo: '2026-04-30' } as const;
  assert.equal(invoicesHref(filter), '/app/invoices?state=outstanding&currency=USD&bucket=d31_60&issuedFrom=2026-04-01&paidTo=2026-04-30');
  assert.equal(invoicesHref({}), '/app/invoices');
  assert.equal(hasFilter({}), false);
  assert.equal(hasFilter(filter), true);
  assert.equal(hasFilterParams(params({ select: 'a,b' })), false, 'the batch “select” param is not a filter');
  assert.equal(hasFilterParams(filterToParams(filter)), true);
});
