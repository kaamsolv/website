import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomeTax, salary, type SalaryResult } from '../app/lib/calc/salary.ts';

// Figures below are worked by hand from the FY 2026-27 rules in salary.ts.

test('new regime: ₹12,00,000 taxable → ₹0 (rebate)', () => {
  assert.deepEqual(incomeTax(1_200_000, 'new'), { taxable: 1_200_000, taxBeforeCess: 0, cess: 0, tax: 0 });
});

test('new regime: ₹12,10,000 taxable → marginal relief ₹10,000 before cess, ₹10,400 total after 4% cess', () => {
  // Slab tax would be ₹61,500; relief caps it at the ₹10,000 earned above ₹12 lakh.
  const t = incomeTax(1_210_000, 'new');
  assert.equal(t.taxBeforeCess, 10_000);
  assert.equal(t.cess, 400);
  assert.equal(t.tax, 10_400);
});

test('new regime: marginal relief ends — ₹13,00,000 taxable → ₹75,000 + ₹3,000 cess', () => {
  assert.equal(incomeTax(1_300_000, 'new').tax, 78_000);
});

test('old regime (under 60): ₹5,00,000 → ₹0 (rebate); ₹10,00,000 → ₹1,12,500 + cess', () => {
  assert.equal(incomeTax(500_000, 'old').tax, 0);
  assert.equal(incomeTax(1_000_000, 'old').tax, 117_000);
});

test('surcharge marginal relief: ₹50,50,000 taxable (new) → ₹11,30,000 before cess, ₹11,75,200 total', () => {
  // ₹10,95,000 + 10% would be ₹12,04,500; capped at tax on ₹50 lakh (₹10,80,000) + the ₹50,000 above it.
  const t = incomeTax(5_050_000, 'new');
  assert.equal(t.taxBeforeCess, 1_130_000);
  assert.equal(t.tax, 1_175_200);
});

test('₹12 lakh CTC, defaults: breakdown, both regimes', () => {
  const r = salary({ ctc: 1_200_000 })!;
  assert.equal(r.basic, 600_000); // 50% of fixed
  assert.equal(r.employerPf, 36_000); // 12% of the ₹25,000 PF wage ceiling × 12
  assert.equal(r.employeePf, 36_000);
  assert.equal(r.gratuity, 28_846); // annual basic × 15/26 ÷ 12
  assert.equal(r.allowances, 535_154);
  assert.equal(r.gross, 1_135_154);
  assert.equal(r.professionalTax, 2_400);

  assert.equal(r.new.tax.taxable, 1_060_154);
  assert.equal(r.new.tax.tax, 0);
  assert.equal(r.new.yearlyInHand, 1_096_754);
  assert.equal(round2(r.new.monthlyInHand), 91_396.17);

  // Old: taxable = gross − ₹50,000 − professional tax.
  assert.equal(r.old.tax.taxable, 1_082_754);
  assert.equal(r.old.tax.tax, 142_819);
  assert.equal(r.old.yearlyInHand, 953_935);
});

test('professional tax is counted once: it lowers old-regime taxable income but leaves in-hand only once', () => {
  for (const input of [
    { ctc: 1_200_000 },
    { ctc: 900_000, oldRegimeDeductions: 150_000, professionalTaxMonthly: 300 },
    { ctc: 4_000_000, variable: 400_000, pfCapped: false, basicPercent: 40 },
    { ctc: 600_000, employerPfInCtc: false, gratuityInCtc: false, professionalTaxMonthly: 0 },
  ]) {
    const r = salary(input)!;
    for (const reg of [r.new, r.old]) {
      // Every rupee of CTC goes to exactly one place. A double-counted
      // professional tax would make this short by its amount.
      assert.equal(reg.yearlyInHand + r.employeePf + r.professionalTax + reg.tax.tax + r.employerPf + r.gratuity, r.ctc);
      assert.equal(round2(reg.monthlyInHand * 12 + reg.variableInHand), reg.yearlyInHand);
    }
    assert.equal(r.basic + r.allowances + r.employerPf + r.gratuity + r.variable, r.ctc);
  }
  // Professional tax is capped at ₹2,500 a year.
  assert.equal(salary({ ctc: 900_000, professionalTaxMonthly: 300 })!.professionalTax, 2_500);
});

test('PF on full basic instead of the ₹25,000 ceiling', () => {
  const r = salary({ ctc: 1_200_000, pfCapped: false })!;
  assert.equal(r.employeePf, 72_000); // 12% of ₹50,000 × 12
  assert.equal(r.employerPf, 72_000);
  // Below the ceiling, capped and full are the same.
  assert.equal(salary({ ctc: 400_000 })!.employeePf, salary({ ctc: 400_000, pfCapped: false })!.employeePf);
});

test('variable pay: monthly in-hand excludes the tax that belongs to it', () => {
  const r = salary({ ctc: 1_500_000, variable: 150_000 })!;
  assert.equal(r.gross, 1_431_548);
  // Tax on all: ₹86,821. Tax without the variable pay: ₹6,810 (marginal relief).
  assert.equal(r.new.tax.tax, 86_821);
  assert.equal(r.new.variableTax, 80_011);
  assert.equal(r.new.variableInHand, 69_989);
  assert.equal(round2(r.new.monthlyInHand), 103_028.17);
});

test('invalid input → null', () => {
  const bad: Parameters<typeof salary>[0][] = [
    { ctc: Number.NaN },
    { ctc: 0 },
    { ctc: -5 },
    { ctc: 200_000_000 },
    { ctc: 500_000, variable: 500_000 },
    { ctc: 500_000, basicPercent: 80 },
    { ctc: 500_000, professionalTaxMonthly: 500 },
    { ctc: 500_000, oldRegimeDeductions: -1 },
  ];
  for (const input of bad) assert.equal(salary(input), null as SalaryResult | null, JSON.stringify(input));
});

const round2 = (n: number) => Math.round(n * 100) / 100;
