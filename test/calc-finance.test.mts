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
