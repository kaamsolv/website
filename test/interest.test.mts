/**
 * The interest and investment maths: hand-worked figures, an independent second method for each, invariants, and every refusal.
 * The worked examples on the calculator pages are these same numbers.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compound, INTEREST_LIMITS, rd, rdClosedForm, round2, simpleInterest, sip, sipClosedForm } from '../app/lib/calc/interest.ts';

const near = (a: number, b: number, tol = 0.011) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

// ─── Compound interest and FD ──────────────────────────────────────────────────────────────────────────

test('compound: textbook cases worked by hand', () => {
  assert.equal(compound(100000, 10, 24, 'yearly')?.maturity, 121000, '10% a year for 2 years: 1,00,000 x 1.1 x 1.1');
  assert.equal(compound(100000, 10, 12, 'half-yearly')?.maturity, 110250, '1.05 squared is 1.1025');
  assert.equal(compound(100000, 8, 12, 'quarterly')?.maturity, 108243.22, '1.02 to the 4th is 1.08243216');
  assert.equal(compound(100000, 12, 12, 'monthly')?.maturity, 112682.5, '1.01 to the 12th is 1.12682503');
  assert.equal(compound(100000, 7, 12, 'quarterly')?.maturity, 107185.9, 'the FD example on the page: 1.0175 to the 4th');
  const r = compound(100000, 10, 24, 'yearly')!;
  assert.deepEqual([r.principal, r.interest, r.maturity], [100000, 21000, 121000]);
});

test('compound: the year-by-year table ends at the maturity, and a part year is handled', () => {
  const r = compound(100000, 10, 30, 'yearly')!;
  assert.deepEqual(r.yearly.map((y) => y.year), [1, 2, 3]);
  assert.equal(r.yearly[0].balance, 110000);
  assert.equal(r.yearly[1].balance, 121000);
  assert.equal(r.yearly[2].balance, r.maturity, 'the last row is the maturity, at 30 months not 36');
  assert.ok(r.maturity > 121000 && r.maturity < 133100);
  assert.ok(r.yearly.every((y) => y.invested === 100000 && Math.abs(y.balance - y.invested - y.interest) < 0.011));
});

test('compound: 0% returns the principal; more time, more rate or more frequent compounding never lowers it', () => {
  assert.equal(compound(50000, 0, 36, 'quarterly')?.maturity, 50000);
  let last = 0;
  for (const m of [6, 12, 24, 60, 120]) {
    const v = compound(100000, 7.5, m, 'quarterly')!.maturity;
    assert.ok(v > last);
    last = v;
  }
  assert.ok(compound(100000, 8, 12, 'quarterly')!.maturity > compound(100000, 7, 12, 'quarterly')!.maturity);
  const order = (['yearly', 'half-yearly', 'quarterly', 'monthly', 'daily'] as const).map((c) => compound(100000, 9, 60, c)!.maturity);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'compounding more often is never worse');
});

// ─── Simple interest ───────────────────────────────────────────────────────────────────────────────────

test('simple interest: worked cases', () => {
  const a = simpleInterest(50000, 6, 3, 0, 0)!;
  assert.deepEqual([a.interest, a.total], [9000, 59000]);
  const b = simpleInterest(120000, 12, 0, 6, 0)!;
  assert.deepEqual([b.interest, b.total], [7200, 127200], 'six months at 12% is half a year of interest');
  const c = simpleInterest(36500, 10, 0, 0, 73)!;
  assert.equal(c.interest, 730, '73 days is a fifth of a 365-day year: 3,650 x 0.2');
  const d = simpleInterest(10000, 8, 1, 6, 0)!;
  assert.equal(d.interest, 1200, 'one and a half years at 8%');
  assert.equal(simpleInterest(10000, 0, 5, 0, 0)?.interest, 0);
});

// ─── SIP ────────────────────────────────────────────────────────────────────────────────────────────────

test('SIP: Rs 5,000 a month at 12% for a year, money in at the start of each month', () => {
  const r = sip(5000, 12, 12)!;
  assert.equal(r.invested, 60000);
  assert.equal(r.value, 64046.64, '5,000 x ((1.01^12 - 1)/0.01) x 1.01');
  assert.equal(r.returns, 4046.64);
  assert.equal(r.yearly.length, 1);
  assert.equal(r.yearly[0].balance, r.value);
});

test('SIP: the month-by-month result equals the closed form, for many inputs', () => {
  for (const [p, rate, months] of [[500, 12, 120], [10000, 8, 60], [2500, 15, 240], [100000, 6.5, 18], [1000, 0.25, 7], [750, 30, 360]] as const) {
    near(sip(p, rate, months)!.value, sipClosedForm(p, rate, months), 0.02);
  }
  assert.equal(sip(1000, 0, 24)?.value, 24000, '0% return: just what you put in');
});

test('SIP step-up: Rs 1,000 a month, 10% more each year, for two years', () => {
  const r = sip(1000, 12, 24, 10)!;
  assert.equal(r.invested, 25200, '12 x 1,000 + 12 x 1,100');
  const flat = sip(1000, 12, 24)!;
  assert.ok(r.value > flat.value && r.invested > flat.invested);
  assert.deepEqual(r.yearly.map((y) => y.invested), [12000, 25200]);
  // Independent check of year 2: year-1 balance grown a year, plus twelve 1,100 payments.
  const y1 = sip(1000, 12, 12)!.value;
  const grown = y1 * 1.01 ** 12;
  const second = 1100 * (((1.01 ** 12 - 1) / 0.01) * 1.01);
  near(r.value, grown + second, 0.02);
});

test('SIP: more money, more time or a higher return never lowers the value; the table adds up', () => {
  const base = sip(2000, 10, 60)!;
  assert.ok(sip(2500, 10, 60)!.value > base.value);
  assert.ok(sip(2000, 10, 72)!.value > base.value);
  assert.ok(sip(2000, 11, 60)!.value > base.value);
  assert.equal(base.yearly.length, 5);
  assert.deepEqual(base.yearly.map((y) => y.invested), [24000, 48000, 72000, 96000, 120000]);
  assert.ok(base.yearly.every((y, i, all) => i === 0 || y.balance > all[i - 1].balance));
  const part = sip(2000, 10, 30)!;
  assert.deepEqual(part.yearly.map((y) => y.year), [1, 2, 3], 'a part year still gets a row');
  assert.equal(part.yearly[2].invested, 60000);
});

// ─── RD ─────────────────────────────────────────────────────────────────────────────────────────────────

test('RD: three months at 4%, worked by hand', () => {
  // Deposits have 3, 2 and 1 months left: 1,000 x (1.01^(3/3) + 1.01^(2/3) + 1.01^(1/3)) = 3,019.98
  const r = rd(1000, 4, 3)!;
  assert.equal(r.invested, 3000);
  near(r.maturity, 3019.98);
  assert.equal(r.interest, round2(r.maturity - 3000));
});

test('RD: the month-by-month sum equals the published closed form, for many inputs', () => {
  for (const [p, rate, months] of [[1000, 4, 12], [5000, 6.5, 60], [2500, 7.25, 24], [10000, 8, 120], [300, 5.5, 7], [100000, 3, 36]] as const) {
    near(rd(p, rate, months)!.maturity, rdClosedForm(p, rate, months), 0.02);
  }
  assert.equal(rd(1000, 0, 12)?.maturity, 12000);
});

test('RD: grows with time and rate, never below what was deposited, table adds up', () => {
  const r = rd(5000, 6.5, 60)!;
  assert.ok(r.maturity > r.invested && r.interest > 0);
  assert.ok(rd(5000, 7.5, 60)!.maturity > r.maturity);
  assert.ok(rd(5000, 6.5, 72)!.maturity > r.maturity);
  assert.equal(r.yearly.length, 5);
  assert.equal(r.yearly[4].balance, r.maturity);
  assert.deepEqual(r.yearly.map((y) => y.invested), [60000, 120000, 180000, 240000, 300000]);
});

// ─── Refusals ───────────────────────────────────────────────────────────────────────────────────────────

test('nonsense input is refused as null, never NaN, never Infinity', () => {
  const L = INTEREST_LIMITS;
  for (const bad of [0, -1, NaN, Infinity, L.maxAmount + 1]) {
    assert.equal(compound(bad, 7, 12, 'yearly'), null, `principal ${bad}`);
    assert.equal(sip(bad, 12, 12), null);
    assert.equal(rd(bad, 7, 12), null);
    assert.equal(simpleInterest(bad, 7, 1, 0, 0), null);
  }
  for (const bad of [-0.1, NaN, Infinity, L.maxRate + 0.01]) {
    assert.equal(compound(1000, bad, 12, 'yearly'), null, `rate ${bad}`);
    assert.equal(rd(1000, bad, 12), null);
    assert.equal(simpleInterest(1000, bad, 1, 0, 0), null);
  }
  assert.equal(sip(1000, L.maxSipRate + 0.01, 12), null);
  assert.ok(sip(1000, L.maxSipRate, 12));
  assert.equal(sip(1000, 12, 12, L.maxStepUp + 1), null);
  assert.equal(sip(1000, 12, 12, -1), null);
  for (const bad of [0, -5, 1.5, NaN, L.maxYears * 12 + 1]) {
    assert.equal(compound(1000, 7, bad, 'yearly'), null, `months ${bad}`);
    assert.equal(sip(1000, 12, bad), null);
    assert.equal(rd(1000, 7, bad), null);
  }
  assert.equal(simpleInterest(1000, 7, 0, 0, 0), null, 'no time at all');
  assert.equal(simpleInterest(1000, 7, -1, 0, 0), null);
  assert.equal(simpleInterest(1000, 7, 51, 0, 0), null);
  assert.equal(simpleInterest(1000, 7, 1.5, 0, 0), null);
  const biggest = compound(L.maxAmount, L.maxRate, L.maxYears * 12, 'daily')!;
  assert.ok(Number.isFinite(biggest.maturity), 'the largest allowed input stays a finite number');
});

test('every number quoted in the calculator pages is what the maths gives', () => {
  const sipA = sip(5000, 12, 120)!;
  assert.deepEqual([sipA.invested, sipA.value], [600000, 1161695.38]);
  const stepped = sip(5000, 12, 120, 10)!;
  assert.deepEqual([stepped.invested, stepped.value], [956245.48, 1687163.13]);
  assert.equal(compound(100000, 7, 12, 'quarterly')?.maturity, 107185.9);
  assert.equal(compound(100000, 7, 12, 'quarterly')?.interest, 7185.9);
  assert.equal(compound(500000, 7, 60, 'quarterly')?.maturity, 707389.1);
  const rd5 = rd(5000, 6.5, 60)!;
  assert.deepEqual([rd5.invested, rd5.interest, rd5.maturity], [300000, 54954.1, 354954.1]);
  assert.equal(rd(1000, 6, 12)?.maturity, 12395.23);
  assert.equal(compound(100000, 10, 36, 'yearly')?.maturity, 133100);
  assert.equal(simpleInterest(100000, 10, 3, 0, 0)?.interest, 30000);
  assert.equal(compound(100000, 8, 120, 'yearly')?.maturity, 215892.5);
  assert.equal(compound(100000, 8, 120, 'monthly')?.maturity, 221964.02);
  assert.equal(simpleInterest(25000, 9, 0, 8, 0)?.interest, 1500);
  assert.equal(simpleInterest(50000, 6, 3, 0, 0)?.interest, 9000);
  assert.ok(Math.abs(72 / 8 - 9) < 0.01 && compound(1, 8, 12 * 9, 'yearly')!.maturity > 0);
});
