/**
 * Gratuity Calculator logic (app/lib/gratuity/): length of service, the "more than six months rounds
 * up" rule, eligibility, the formula, the rupee rounding and the Rs 20 lakh maximum, each at its edges.
 *
 * What these cannot show: that the rules themselves are right. They come from secondary sources and
 * the law changed on 21 Nov 2025 (docs/products/gratuity-calculator.md).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateGratuity, GRATUITY_CAP_RUPEES, MAX_MONTHLY_WAGES, serviceLabel, type GratuityInput, type GratuityOutcome } from '../app/lib/gratuity/calc.ts';
import { addDays, addMonths, compareYmd, countedYears, formatYmd, hasReached, parseYmd, reachedOn, servicePeriod, type Ymd } from '../app/lib/gratuity/service.ts';

const d = (text: string): Ymd => {
  const v = parseYmd(text);
  assert.ok(v, `${text} should be a date`);
  return v as Ymd;
};

// ───────────────────────────── dates ─────────────────────────────

test('dates: only real dates between 1950 and 2100', () => {
  assert.deepEqual(parseYmd('2026-10-27'), { year: 2026, month: 10, day: 27 });
  assert.deepEqual(parseYmd(' 2024-02-29 '), { year: 2024, month: 2, day: 29 });
  for (const bad of ['', '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-10-00', '1949-12-31', '2101-01-01', '2026-1-1', '27-10-2026', 'today']) assert.equal(parseYmd(bad), null, bad);
  assert.equal(compareYmd(d('2026-01-01'), d('2026-01-02')), -1);
  assert.equal(compareYmd(d('2026-01-01'), d('2026-01-01')), 0);
  assert.equal(formatYmd(d('2024-12-31')), '31 Dec 2024');
  assert.deepEqual(addDays(d('2024-12-31'), 1), d('2025-01-01'));
  assert.deepEqual(addDays(d('2024-03-01'), -1), d('2024-02-29'));
});

test('months clamp to the end of a shorter month', () => {
  assert.deepEqual(addMonths(d('2020-01-31'), 1), d('2020-02-29'));
  assert.deepEqual(addMonths(d('2021-01-31'), 1), d('2021-02-28'));
  assert.deepEqual(addMonths(d('2020-02-29'), 12), d('2021-02-28'));
  assert.deepEqual(addMonths(d('2020-11-15'), 3), d('2021-02-15'));
  assert.deepEqual(addMonths(d('2020-03-15'), -3), d('2019-12-15'));
});

// ───────────────────────────── service ─────────────────────────────

test('service: the last working day counts, so 1 Jan to 31 Dec five years on is exactly 5 years', () => {
  const s = servicePeriod(d('2020-01-01'), d('2024-12-31'));
  assert.deepEqual([s.years, s.months, s.days], [5, 0, 0]);
  assert.equal(s.totalDays, 1827);
  const s2 = servicePeriod(d('2020-01-01'), d('2024-12-30'));
  assert.deepEqual([s2.years, s2.months, s2.days], [4, 11, 30]);
  const one = servicePeriod(d('2026-10-27'), d('2026-10-27'));
  assert.deepEqual([one.years, one.months, one.days, one.totalDays], [0, 0, 1, 1], 'a single working day is one day');
});

test('service: years, months and days across month ends and a leap day', () => {
  const a = servicePeriod(d('2018-03-15'), d('2026-10-27'));
  assert.deepEqual([a.years, a.months, a.days], [8, 7, 13]);
  const b = servicePeriod(d('2020-01-31'), d('2020-03-30'));
  assert.deepEqual([b.years, b.months, b.days], [0, 2, 0], '31 Jan + 2 months = 31 Mar, the day after the last day');
  const c = servicePeriod(d('2020-01-31'), d('2020-03-29'));
  assert.deepEqual([c.years, c.months, c.days], [0, 1, 30]);
  const leap = servicePeriod(d('2020-02-29'), d('2021-02-27'));
  assert.deepEqual([leap.years, leap.months, leap.days], [1, 0, 0], '29 Feb + 1 year = 28 Feb');
  assert.deepEqual(servicePeriod(d('2026-06-01'), d('2026-05-31')), { years: 0, months: 0, days: 0, totalDays: 0 }, 'last day before joining: nothing');
});

test('service: reaching a number of years, and the day it is reached', () => {
  const j = d('2020-01-01');
  assert.equal(hasReached(j, d('2024-12-31'), 5), true, 'exactly 5 years');
  assert.equal(hasReached(j, d('2024-12-30'), 5), false, '5 years less one day');
  assert.equal(hasReached(j, d('2025-01-01'), 5), true);
  assert.deepEqual(reachedOn(j, 5), d('2024-12-31'));
  assert.deepEqual(reachedOn(j, 1), d('2020-12-31'));
  assert.deepEqual(reachedOn(d('2020-02-29'), 1), d('2021-02-27'));
  assert.equal(hasReached(d('2020-02-29'), d('2021-02-27'), 1), true);
  assert.equal(hasReached(d('2020-02-29'), d('2021-02-26'), 1), false);
});

test('counted years: MORE than six months of the last year rounds up; exactly six months does not', () => {
  const j = d('2020-01-01');
  assert.equal(countedYears(j, d('2026-06-30')), 6, 'exactly 6 years 6 months');
  assert.equal(countedYears(j, d('2026-07-01')), 7, '6 years 6 months and 1 day');
  assert.equal(countedYears(j, d('2026-12-31')), 7, '6 years 11 months');
  assert.equal(countedYears(j, d('2026-01-31')), 6, '6 years 1 month');
  assert.equal(countedYears(j, d('2025-12-31')), 6, 'exactly 6 years');
  assert.equal(countedYears(j, d('2024-12-30')), 5, '4 years 11 months 30 days rounds up to 5');
  assert.equal(countedYears(d('2018-03-15'), d('2026-10-27')), 9, '8 years 7 months 13 days');
  assert.equal(countedYears(j, d('2020-05-31')), 0, 'under six months: nothing');
  assert.equal(countedYears(j, d('2020-07-01')), 1, 'just over six months');
  assert.equal(countedYears(d('2026-06-01'), d('2026-05-31')), 0);
});

test('service wording', () => {
  assert.equal(serviceLabel({ years: 7, months: 8, days: 3, totalDays: 0 }), '7 years, 8 months, 3 days');
  assert.equal(serviceLabel({ years: 1, months: 1, days: 1, totalDays: 0 }), '1 year, 1 month, 1 day');
  assert.equal(serviceLabel({ years: 5, months: 0, days: 0, totalDays: 0 }), '5 years');
  assert.equal(serviceLabel({ years: 0, months: 0, days: 0, totalDays: 0 }), 'less than a day');
});

// ───────────────────────────── the calculation ─────────────────────────────

const BASE: GratuityInput = { wages: '50,000', joined: '2016-01-01', lastDay: '2025-12-31', employment: 'permanent', reason: 'leaving' };
const run = (over: Partial<GratuityInput> = {}): GratuityOutcome => {
  const r = calculateGratuity({ ...BASE, ...over });
  assert.ok(r.ok, JSON.stringify(r.ok ? '' : r.errors));
  return r.ok ? r.outcome : (null as never);
};
const errs = (over: Partial<GratuityInput>) => {
  const r = calculateGratuity({ ...BASE, ...over });
  assert.equal(r.ok, false, JSON.stringify(over));
  return r.ok ? {} : r.errors;
};

test('the worked example: ₹50,000 × 15 × 10 ÷ 26 = ₹2,88,461.54, shown as ₹2,88,462', () => {
  const o = run();
  assert.equal(o.eligible, true);
  assert.equal(o.counted, 10);
  assert.equal(o.service.years, 10);
  assert.equal(o.amount, BigInt(288462));
  assert.equal(o.uncapped, BigInt(288462));
  assert.equal(o.capped, false);
  assert.equal(o.working, '₹50,000 × 15 × 10 ÷ 26');
  assert.equal(o.wagesFigures, '₹50,000');
  assert.equal(o.joinedLabel, '1 Jan 2016');
  assert.equal(o.lastDayLabel, '31 Dec 2025');
});

test('rounding is to the nearest rupee, half up, on exact money', () => {
  // ₹13 × 15 × 1 ÷ 26 = 7.50 exactly
  assert.equal(run({ wages: '13', reason: 'death-disability', joined: '2025-10-28', lastDay: '2026-10-27' }).amount, BigInt(8));
  // ₹26 × 15 × 1 ÷ 26 = 15 exactly
  assert.equal(run({ wages: '26', reason: 'death-disability', joined: '2025-10-28', lastDay: '2026-10-27' }).amount, BigInt(15));
  // paise in the wages count: ₹52,500.50 × 15 × 10 ÷ 26 = 302,887.50 exactly, so half up gives 302,888
  assert.equal(run({ wages: '52,500.50' }).amount, BigInt(302888));
  assert.equal(run({ wages: '52,500.40' }).amount, BigInt(302887), '302,886.92… rounds down');
  assert.equal(run({ wages: '₹ 1,00,000' }).amount, BigInt(576923), '1,00,000 × 150 ÷ 26 = 576,923.08');
});

test('the ₹20 lakh maximum: at it, just under and just over', () => {
  const common = { joined: '2000-01-01', lastDay: '2025-12-31' }; // exactly 26 years, so the amount is wages × 15
  const under = run({ ...common, wages: '1,33,333' });
  assert.equal(under.uncapped, BigInt(1999995));
  assert.equal(under.capped, false);
  assert.equal(under.amount, BigInt(1999995));
  const at = run({ ...common, wages: '1,33,333.33' });
  assert.equal(at.uncapped, BigInt(GRATUITY_CAP_RUPEES), '1,999,999.95 rounds to 2,000,000: equal to the maximum, not over it');
  assert.equal(at.capped, false);
  const over = run({ ...common, wages: '1,33,334' });
  assert.equal(over.uncapped, BigInt(2000010));
  assert.equal(over.capped, true);
  assert.equal(over.amount, BigInt(GRATUITY_CAP_RUPEES));
});

test('eligibility: 5 years for permanent staff, to the day', () => {
  const ok = run({ joined: '2020-01-01', lastDay: '2024-12-31' });
  assert.equal(ok.eligible, true);
  assert.equal(ok.minYears, 5);
  assert.equal(ok.eligibleOn, null);
  const short = run({ joined: '2020-01-01', lastDay: '2024-12-30' });
  assert.equal(short.eligible, false);
  assert.equal(short.amount, null);
  assert.equal(short.uncapped, null);
  assert.equal(short.eligibleOn, '31 Dec 2024', 'the last working day on which 5 years are complete');
  assert.equal(short.counted, 5, 'the counted years are still worked out (4y 11m 30d rounds up)');
  const later = run({ joined: '2022-01-01', lastDay: '2026-10-27' });
  assert.equal(later.eligible, false);
  assert.equal(later.eligibleOn, '31 Dec 2026');
});

test('fixed-term: eligible after 1 year; a day short is not', () => {
  const exactly = run({ employment: 'fixed', joined: '2025-10-28', lastDay: '2026-10-27' });
  assert.equal(exactly.eligible, true);
  assert.equal(exactly.minYears, 1);
  assert.equal(exactly.counted, 1);
  const short = run({ employment: 'fixed', joined: '2025-10-29', lastDay: '2026-10-27' });
  assert.equal(short.eligible, false);
  assert.equal(short.eligibleOn, '28 Oct 2026');
  // the same service as a permanent employee is not eligible
  assert.equal(run({ employment: 'permanent', joined: '2022-01-01', lastDay: '2026-10-27' }).eligible, false);
  assert.equal(run({ employment: 'fixed', joined: '2022-01-01', lastDay: '2026-10-27' }).eligible, true);
});

test('death or disability: no minimum; under six months of service is ₹0, said plainly by the page', () => {
  const o = run({ reason: 'death-disability', joined: '2024-06-01', lastDay: '2026-10-27' });
  assert.equal(o.eligible, true);
  assert.equal(o.minYears, null);
  assert.equal(o.counted, 2, '2 years 4 months 27 days: only 4 months into the last year, so no round-up');
  assert.equal(o.amount, BigInt(57692), '50,000 × 15 × 2 ÷ 26 = 57,692.31');
  assert.equal(run({ reason: 'death-disability', joined: '2024-03-01', lastDay: '2026-10-27' }).counted, 3, '2 years 7 months 27 days rounds up');
  const tiny = run({ reason: 'death-disability', joined: '2026-08-01', lastDay: '2026-10-27' });
  assert.equal(tiny.eligible, true);
  assert.equal(tiny.counted, 0);
  assert.equal(tiny.amount, BigInt(0));
});

test('every wrong input is refused with its own plain message, several at once', () => {
  assert.equal(errs({ joined: '' }).joined, 'Enter your joining date.');
  assert.equal(errs({ lastDay: '' }).lastDay, 'Enter your last working day.');
  assert.match(errs({ joined: '2026-02-30' }).joined!, /real date/);
  assert.match(errs({ lastDay: '1949-01-01' }).lastDay!, /real date/);
  assert.match(errs({ joined: '2026-11-01', lastDay: '2026-10-27' }).lastDay!, /can’t be before the joining date/);
  assert.equal(calculateGratuity({ ...BASE, joined: '2026-10-27', lastDay: '2026-10-27' }).ok, true, 'one working day is fine');
  assert.equal(errs({ wages: '' }).wages, 'Enter your last drawn monthly wages.');
  assert.equal(errs({ wages: '0' }).wages, 'Enter your last drawn monthly wages.');
  assert.match(errs({ wages: '1,5' }).wages!, /commas/);
  assert.match(errs({ wages: '-500' }).wages!, /Negative/);
  assert.match(errs({ wages: '500.555' }).wages!, /2 decimal places/);
  assert.match(errs({ wages: 'fifty thousand' }).wages!, /digits only/);
  assert.match(errs({ wages: String(MAX_MONTHLY_WAGES + 1) }).wages!, /too high/);
  assert.equal(calculateGratuity({ ...BASE, wages: String(MAX_MONTHLY_WAGES) }).ok, true, 'the ceiling itself is fine');
  assert.deepEqual(Object.keys(errs({ wages: '', joined: '', lastDay: '' })).sort(), ['joined', 'lastDay', 'wages']);
});

test('a future last working day is allowed (planning ahead)', () => {
  const o = run({ joined: '2020-01-01', lastDay: '2031-06-30' });
  assert.equal(o.eligible, true);
  assert.equal(o.counted, 11, '11 years 6 months exactly does not round up');
  assert.equal(run({ joined: '2020-01-01', lastDay: '2031-07-01' }).counted, 12);
});
