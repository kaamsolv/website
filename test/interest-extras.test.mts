import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { afterTax, compound, goalCompound, goalRd, goalSip, rd, realValue, sip } from '../app/lib/calc/interest.ts';
import { readShare, writeShare } from '../app/lib/calc/share-state.ts';

describe('reach a goal', () => {
  it('SIP: the answer reaches the goal and one rupee less falls short', () => {
    for (const [target, rate, months, step] of [[10_000_000, 12, 180, 0], [2_500_000, 10, 120, 10], [100_000, 6, 12, 0]] as const) {
      const need = goalSip(target, rate, months, step)!;
      assert.ok(Number.isInteger(need) && need >= 1);
      assert.ok(sip(need, rate, months, step)!.value >= target);
      if (need > 1) assert.ok(sip(need - 1, rate, months, step)!.value < target);
    }
  });
  it('SIP: a worked case (₹1 crore in 15 years at 12%: 1e7 ÷ 504.58 = 19,818.6, rounded up)', () => {
    assert.equal(goalSip(10_000_000, 12, 180), 19_819);
  });
  it('RD and FD/compound reach the goal, and one rupee less falls short', () => {
    const r = goalRd(500_000, 6.5, 60)!;
    assert.ok(rd(r, 6.5, 60)!.maturity >= 500_000 && rd(r - 1, 6.5, 60)!.maturity < 500_000);
    const c = goalCompound(1_000_000, 7, 60, 'quarterly')!;
    assert.ok(compound(c, 7, 60, 'quarterly')!.maturity >= 1_000_000 && compound(c - 1, 7, 60, 'quarterly')!.maturity < 1_000_000);
  });
  it('refuses nonsense', () => {
    assert.equal(goalSip(0, 12, 120), null);
    assert.equal(goalSip(1e12, 12, 120), null);
    assert.equal(goalSip(100000, 99, 120), null);
    assert.equal(goalRd(100000, 6, 0), null);
  });
});

describe("today's money", () => {
  it('discounts by inflation', () => {
    assert.equal(realValue(1_000_000, 6, 10), 558_394.78);
    assert.equal(realValue(1_000_000, 0, 10), 1_000_000);
  });
  it('refuses nonsense', () => {
    assert.equal(realValue(100, 20, 10), null);
    assert.equal(realValue(100, 6, 0), null);
    assert.equal(realValue(-1, 6, 10), null);
  });
});

describe('tax estimate', () => {
  it('takes the chosen share of the interest', () => {
    assert.deepEqual(afterTax(100_000, 7_185.9, 30), { tax: 2155.77, afterTaxInterest: 5030.13, afterTaxTotal: 105_030.13 });
    assert.equal(afterTax(100_000, 5000, 0)!.tax, 0);
  });
  it('refuses nonsense', () => {
    assert.equal(afterTax(1, 1, 90), null);
    assert.equal(afterTax(1, -1, 10), null);
  });
});

describe('share links', () => {
  it('round-trips', () => {
    const q = writeShare({ a: 5000, r: 12, y: 10, s: 10 });
    assert.deepEqual(readShare(q), { a: 5000, r: 12, y: 10, s: 10 });
    assert.deepEqual(readShare(`?${q}`), { a: 5000, r: 12, y: 10, s: 10 });
  });
  it('drops hostile and out-of-range values', () => {
    assert.deepEqual(readShare('a=-5&r=999&y=1.5&m=12&t=abc&i=<script>&z=1&f=2'), { f: 2 });
    assert.deepEqual(readShare('a=1e9&a=5'), {});
    assert.deepEqual(readShare(''), {});
    assert.deepEqual(readShare('r=12.345'), {});
  });
});

describe('numbers quoted on the compare page', () => {
  it('match the maths', () => {
    assert.equal(sip(10000, 12, 120)!.value, 2_323_390.76);
    assert.equal(rd(10000, 6.5, 120)!.maturity, 1_689_879.52);
    assert.equal(compound(100000, 7, 120, 'quarterly')!.maturity, 200_159.73);
    assert.equal(compound(100000, 12, 120, 'yearly')!.maturity, 310_584.82);
  });
});
