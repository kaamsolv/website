import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emi, gst } from '../app/lib/calc/finance.ts';

test('GST add: 18% on ₹1,000', () => {
  assert.deepEqual(gst(1000, 18, 'add'), { base: 1000, gst: 180, total: 1180, cgst: 90, sgst: 90, igst: 180 });
});

test('GST remove: back out 18% from ₹1,180', () => {
  assert.deepEqual(gst(1180, 18, 'remove'), { base: 1000, gst: 180, total: 1180, cgst: 90, sgst: 90, igst: 180 });
});

test('GST: odd paise split so CGST + SGST always equals the GST', () => {
  const r = gst(99.99, 5, 'add')!;
  assert.equal(r.gst, 5);
  assert.equal(round(r.cgst + r.sgst), r.gst);
  const s = gst(100.03, 18, 'add')!;
  assert.equal(round(s.cgst + s.sgst), s.gst);
});

test('GST: 40% and custom rates; invalid input', () => {
  assert.deepEqual(gst(500, 40, 'add')?.total, 700);
  assert.deepEqual(gst(1030, 3, 'remove')?.base, 1000);
  assert.equal(gst(1000, 0, 'add')?.gst, 0);
  assert.equal(gst(-1, 18, 'add'), null);
  assert.equal(gst(100, 150, 'add'), null);
});

const round = (n: number) => Math.round(n * 100) / 100;

test('EMI: ₹10 lakh at 8.5% for 20 years', () => {
  const r = emi(1_000_000, 8.5, 240)!;
  assert.equal(r.emi, 8678.23);
  assert.equal(r.schedule.length, 240);
  assert.equal(r.schedule.at(-1)!.balance, 0);
  // Principal repaid adds back up to the loan exactly.
  assert.equal(round(r.schedule.reduce((s, x) => s + x.principal, 0)), 1_000_000);
  assert.equal(r.totalInterest, round(r.totalPayment - 1_000_000));
  assert.ok(Math.abs(r.totalInterest - 1_082_775) < 50);
  assert.equal(r.byYear.length, 20);
  assert.equal(r.byYear.at(-1)!.balance, 0);
});

test('EMI: first month interest and principal', () => {
  const r = emi(500_000, 12, 60)!;
  assert.equal(r.emi, 11122.22);
  assert.equal(r.schedule[0].interest, 5000);
  assert.equal(r.schedule[0].principal, 6122.22);
});

test('EMI: zero interest splits evenly; partial final year', () => {
  const r = emi(120_000, 0, 12)!;
  assert.equal(r.emi, 10000);
  assert.equal(r.totalInterest, 0);
  const p = emi(100_000, 10, 18)!;
  assert.equal(p.byYear.length, 2);
  assert.equal(p.byYear[1].balance, 0);
});

test('EMI: invalid inputs', () => {
  assert.equal(emi(0, 8, 12), null);
  assert.equal(emi(100_000, -1, 12), null);
  assert.equal(emi(100_000, 8, 0), null);
  assert.equal(emi(100_000, 8, 12.5), null);
  assert.equal(emi(100_000, 8, 481), null);
});

// ---------------------------------------------------------------- Prepayment

import { emiPrepay, loanForEmi } from '../app/lib/calc/finance.ts';

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('prepay: ₹10,000 extra a month on ₹50 lakh, 9%, 20 years finishes in 154 months and saves ₹23,65,7xx (matches a competitor calculator and an independent loop)', () => {
  const r = emiPrepay({ principal: 5_000_000, annualRatePercent: 9, months: 240, extraMonthly: 10_000 })!;
  assert.equal(r.emi, 44_986.3);
  assert.equal(r.months, 154);
  assert.equal(r.monthsSaved, 86);
  near(r.totalInterest, 3_430_965, 5);
  near(r.interestSaved, 2_365_746, 5);
  assert.equal(r.balanceByYear.length, 20);
  assert.equal(r.balanceByYear.at(-1)!.balance, 0);
  assert.ok(r.balanceByYear[0].balance < 5_000_000);
});

test('prepay: months to finish agree with the closed form −ln(1 − P·r / E) ÷ ln(1 + r)', () => {
  const E = 44_986.3 + 10_000;
  const r = 0.09 / 12;
  const closed = Math.ceil(-Math.log(1 - (5_000_000 * r) / E) / Math.log(1 + r));
  assert.equal(emiPrepay({ principal: 5_000_000, annualRatePercent: 9, months: 240, extraMonthly: 10_000 })!.months, closed);
});

test('prepay: no prepayment returns the plain loan', () => {
  const base = emi(1_000_000, 8.5, 240)!;
  const r = emiPrepay({ principal: 1_000_000, annualRatePercent: 8.5, months: 240 })!;
  assert.equal(r.months, 240);
  assert.equal(r.emi, base.emi);
  assert.equal(r.newEmi, base.emi);
  near(r.totalInterest, base.totalInterest, 0.05);
  near(r.interestSaved, 0, 0.05);
  assert.equal(r.monthsSaved, 0);
});

test('prepay: a lump sum after month 24 — finish sooner keeps the EMI, lower EMI keeps the end date, and finishing sooner saves more interest', () => {
  const input = { principal: 5_000_000, annualRatePercent: 9, months: 240, lumpAmount: 1_000_000, lumpAfterMonth: 24 };
  const shorter = emiPrepay({ ...input, lumpMode: 'shorter' })!;
  const lower = emiPrepay({ ...input, lumpMode: 'lower' })!;
  const base = emi(5_000_000, 9, 240)!;
  const afterLump = base.schedule[23].balance - 1_000_000;
  const r = 0.09 / 12;
  assert.equal(shorter.newEmi, base.emi);
  assert.equal(shorter.months, 24 + Math.ceil(-Math.log(1 - (afterLump * r) / base.emi) / Math.log(1 + r)));
  assert.equal(lower.months, 240);
  near(lower.newEmi, (afterLump * r * (1 + r) ** 216) / ((1 + r) ** 216 - 1), 0.01);
  assert.ok(lower.newEmi < base.emi);
  assert.ok(shorter.interestSaved > lower.interestSaved && lower.interestSaved > 0);
  assert.equal(shorter.lumpPaid, 1_000_000);
});

test('prepay: a lump sum bigger than what is owed closes the loan and is capped', () => {
  const r = emiPrepay({ principal: 100_000, annualRatePercent: 10, months: 60, lumpAmount: 1_000_000, lumpAfterMonth: 12 })!;
  assert.equal(r.months, 12);
  assert.ok(r.lumpPaid < 100_000 && r.lumpPaid > 0);
  assert.equal(r.balanceByYear.at(-1)!.balance, 0);
});

test('prepay: zero interest, ₹10,000 extra on a ₹1.2 lakh, 12-month loan takes 6 months with no interest', () => {
  const r = emiPrepay({ principal: 120_000, annualRatePercent: 0, months: 12, extraMonthly: 10_000 })!;
  assert.equal(r.months, 6);
  assert.equal(r.totalInterest, 0);
  assert.equal(r.interestSaved, 0);
});

test('prepay: refuses a lump sum with no valid month, negative amounts and bad loans', () => {
  const b = { principal: 1_000_000, annualRatePercent: 9, months: 120 };
  assert.equal(emiPrepay({ ...b, lumpAmount: 1000 }), null);
  assert.equal(emiPrepay({ ...b, lumpAmount: 1000, lumpAfterMonth: 0 }), null);
  assert.equal(emiPrepay({ ...b, lumpAmount: 1000, lumpAfterMonth: 120 }), null);
  assert.equal(emiPrepay({ ...b, lumpAmount: 1000, lumpAfterMonth: 1.5 }), null);
  assert.equal(emiPrepay({ ...b, extraMonthly: -1 }), null);
  assert.equal(emiPrepay({ ...b, extraMonthly: 2_000_000 }), null);
  assert.equal(emiPrepay({ ...b, principal: 0 }), null);
  assert.equal(emiPrepay({ ...b, lumpAmount: 0, lumpAfterMonth: 999 })!.months, 120);
});

test('how much can I borrow: the EMI of that loan fits the budget and one rupee more does not', () => {
  const loan = loanForEmi(44_986.3, 9, 240)!;
  assert.ok(loan >= 4_999_990 && loan <= 5_000_000);
  assert.ok(emi(loan, 9, 240)!.emi <= 44_986.3);
  assert.ok(emi(loan + 1, 9, 240)!.emi > 44_986.3);
  assert.equal(loanForEmi(10_000, 0, 120), 1_200_000);
  assert.equal(loanForEmi(0, 9, 120), null);
  assert.equal(loanForEmi(10_000, 90, 120), null);
  assert.equal(loanForEmi(10_000, 9, 12.5), null);
  assert.equal(loanForEmi(1e12, 9, 240), null);
});

test('numbers quoted on the EMI page', () => {
  assert.equal(emi(5_000_000, 9, 240)!.emi, 44_986.3);
  const extra = emiPrepay({ principal: 5_000_000, annualRatePercent: 9, months: 240, extraMonthly: 10_000 })!;
  assert.equal(extra.months, 154);
  near(extra.interestSaved, 2_365_746, 5); // "about ₹23.66 lakh"
  const lump = { principal: 5_000_000, annualRatePercent: 9, months: 240, lumpAmount: 1_000_000, lumpAfterMonth: 24 };
  const sooner = emiPrepay({ ...lump, lumpMode: 'shorter' })!;
  const lower = emiPrepay({ ...lump, lumpMode: 'lower' })!;
  assert.equal(sooner.months, 159);
  near(sooner.interestSaved, 2_662_496, 5); // "about ₹26.62 lakh"
  assert.equal(lower.newEmi, 35_621.85);
  assert.equal(lower.months, 240);
  near(lower.interestSaved, 1_022_721, 5); // "about ₹10.23 lakh"
  assert.equal(loanForEmi(50_000, 9, 240), 5_557_247);
});
