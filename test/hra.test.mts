import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityPercent, hra, regimeCheck, rentForMaxExemption, type HraInput } from '../app/lib/calc/hra.ts';

// Every figure is worked by hand from rule 279 (FY 2026-27) and rule 2A (FY 2025-26); see hra.ts.

const base: HraInput = { basic: 50_000, da: 0, hraReceived: 20_000, rent: 22_000, city: 'Delhi', year: '2026-27' };

test('monthly example: rent minus 10% of salary is the smallest, so it limits you', () => {
  const r = hra(base)!;
  assert.equal(r.salary, 50_000);
  assert.equal(r.percent, 50);
  assert.deepEqual(r.limits, { received: 20_000, rentOver: 17_000, cap: 25_000 });
  assert.equal(r.exempt, 17_000);
  assert.equal(r.taxable, 3_000);
  assert.deepEqual(r.binding, ['rent']);
});

test('yearly example in a metro: ₹6,00,000 basic, ₹2,40,000 HRA, ₹1,80,000 rent → ₹1,20,000', () => {
  const r = hra({ ...base, basic: 600_000, hraReceived: 240_000, rent: 180_000 })!;
  assert.deepEqual(r.limits, { received: 240_000, rentOver: 120_000, cap: 300_000 });
  assert.equal(r.exempt, 120_000);
  assert.equal(r.taxable, 120_000);
});

test('rent at or below 10% of salary gives no exemption', () => {
  assert.equal(hra({ ...base, rent: 5_000 })!.exempt, 0);
  assert.equal(hra({ ...base, rent: 0 })!.exempt, 0);
  assert.equal(hra({ ...base, rent: 0 })!.taxable, 20_000);
});

test('HRA of zero means no exemption and nothing taxable', () => {
  const r = hra({ ...base, hraReceived: 0 })!;
  assert.equal(r.exempt, 0);
  assert.equal(r.taxable, 0);
});

test('DA counts toward salary; it raises the 10% share and the percentage cap', () => {
  const r = hra({ ...base, basic: 40_000, da: 10_000 })!;
  assert.equal(r.salary, 50_000);
  assert.equal(r.limits.rentOver, 17_000);
  assert.equal(r.limits.cap, 25_000);
});

test('non-metro uses 40%; a tie across all three limits lists all three', () => {
  const r = hra({ basic: 600_000, da: 0, hraReceived: 240_000, rent: 300_000, city: 'Other', year: '2026-27' })!;
  assert.equal(r.percent, 40);
  assert.equal(r.exempt, 240_000);
  assert.deepEqual(r.binding, ['received', 'rent', 'cap']);
});

test('the eight cities of rule 279 get 50% from FY 2026-27; only four did before', () => {
  for (const c of ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad'] as const) {
    assert.equal(cityPercent(c, '2026-27'), 50, c);
  }
  for (const c of ['Delhi', 'Mumbai', 'Kolkata', 'Chennai'] as const) assert.equal(cityPercent(c, '2025-26'), 50, c);
  for (const c of ['Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad', 'Other'] as const) assert.equal(cityPercent(c, '2025-26'), 40, c);
  assert.equal(cityPercent('Other', '2026-27'), 40);
});

test('Bengaluru: cap ₹50,000 in 2026-27 but ₹40,000 in 2025-26', () => {
  const i: HraInput = { basic: 100_000, da: 0, hraReceived: 60_000, rent: 80_000, city: 'Bengaluru', year: '2026-27' };
  assert.equal(hra(i)!.exempt, 50_000);
  assert.deepEqual(hra(i)!.binding, ['cap']);
  assert.equal(hra({ ...i, year: '2025-26' })!.exempt, 40_000);
});

test('refuses blank, negative, non-finite, huge, zero-basic and unknown-year input', () => {
  assert.equal(hra({ ...base, basic: 0 }), null);
  assert.equal(hra({ ...base, basic: -1 }), null);
  assert.equal(hra({ ...base, rent: Number.NaN }), null);
  assert.equal(hra({ ...base, hraReceived: Infinity }), null);
  assert.equal(hra({ ...base, rent: 2_000_000_000 }), null);
  assert.equal(hra({ ...base, year: '2030-31' as never }), null);
});

test('rent for the largest exemption: ₹25,000 gets the full ₹20,000, ₹3,000 more than now', () => {
  const m = rentForMaxExemption(base)!;
  assert.deepEqual(m, { rent: 25_000, exempt: 20_000, extra: 3_000 });
  assert.equal(hra({ ...base, rent: m.rent })!.exempt, m.exempt);
  assert.ok(hra({ ...base, rent: m.rent - 1 })!.exempt < m.exempt);
});

test('rent for the largest exemption is null when you are already there, or the cap is the limit', () => {
  assert.equal(rentForMaxExemption({ ...base, rent: 30_000 }), null);
  const capLimited = { ...base, hraReceived: 40_000, rent: 28_000 };
  const m = rentForMaxExemption(capLimited)!;
  assert.equal(m.exempt, 25_000);
  assert.equal(m.rent, 30_000);
  assert.equal(m.extra, 2_000);
  assert.equal(rentForMaxExemption({ ...capLimited, rent: 50_000 }), null);
});

test('regime check: ₹12.75 lakh salary pays nothing in the new regime, so it wins', () => {
  const c = regimeCheck({ grossYearly: 1_275_000, hraExemptYearly: 204_000, otherDeductionsYearly: 150_000 })!;
  assert.equal(c.new.taxable, 1_200_000);
  assert.equal(c.new.tax, 0);
  assert.equal(c.old.taxable, 871_000);
  assert.equal(c.old.tax, 90_168);
  assert.equal(c.better, 'new');
  assert.equal(c.saving, 90_168);
});

test('regime check: with large deductions the old regime wins (₹30 lakh salary)', () => {
  const c = regimeCheck({ grossYearly: 3_000_000, hraExemptYearly: 600_000, otherDeductionsYearly: 500_000 })!;
  assert.equal(c.new.tax, 475_800);
  assert.equal(c.old.taxable, 1_850_000);
  assert.equal(c.old.tax, 382_200);
  assert.equal(c.better, 'old');
  assert.equal(c.saving, 93_600);
});

test('regime check: nil in both regimes is a tie, and bad input is refused', () => {
  assert.equal(regimeCheck({ grossYearly: 300_000, hraExemptYearly: 0, otherDeductionsYearly: 0 })!.better, 'same');
  assert.equal(regimeCheck({ grossYearly: 0, hraExemptYearly: 0, otherDeductionsYearly: 0 }), null);
  assert.equal(regimeCheck({ grossYearly: 1_000_000, hraExemptYearly: -1, otherDeductionsYearly: 0 }), null);
});
