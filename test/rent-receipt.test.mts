/**
 * Rent Receipt Generator logic (app/lib/rent-receipt/): months and financial years, the PAN and
 * revenue-stamp rules with their exact edges, and how a form becomes receipts.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReceipts, LIMITS, MAX_MONTHLY_RENT, type ReceiptInput } from '../app/lib/rent-receipt/build.ts';
import {
  currentFinancialYear,
  daysInMonth,
  financialYearLabel,
  financialYearStart,
  formatYearMonth,
  MAX_RECEIPT_MONTHS,
  monthLabel,
  parseYearMonth,
  receiptDate,
  receiptMonths,
} from '../app/lib/rent-receipt/months.ts';
import { cleanPan, cleanText, isValidPan, needsLandlordPan, needsRevenueStamp, rentByFinancialYear, toPaise } from '../app/lib/rent-receipt/rules.ts';

const ym = (year: number, month: number) => ({ year, month });
const months = (from: [number, number], to: [number, number]) => {
  const r = receiptMonths(ym(...from), ym(...to));
  assert.ok(r.ok, r.ok ? '' : r.message);
  return r.ok ? r.months : [];
};

// ───────────────────────────── months ─────────────────────────────

test('year-months: parsing and labels', () => {
  assert.deepEqual(parseYearMonth('2026-10'), ym(2026, 10));
  assert.deepEqual(parseYearMonth(' 2027-03 '), ym(2027, 3));
  for (const bad of ['', '2026-13', '2026-00', '2026-1', '26-10', 'abc', '2026/10', '1989-12', '2101-01']) assert.equal(parseYearMonth(bad), null, bad);
  assert.equal(formatYearMonth(ym(2026, 4)), '2026-04');
  assert.equal(monthLabel(ym(2026, 10)), 'October 2026');
});

test('financial years run April to March', () => {
  assert.equal(financialYearStart(ym(2026, 4)), 2026);
  assert.equal(financialYearStart(ym(2026, 12)), 2026);
  assert.equal(financialYearStart(ym(2027, 3)), 2026);
  assert.equal(financialYearStart(ym(2026, 3)), 2025);
  assert.equal(financialYearLabel(ym(2026, 10)), '2026-27');
  assert.equal(financialYearLabel(ym(2027, 2)), '2026-27');
  assert.equal(financialYearLabel(ym(2026, 3)), '2025-26');
  assert.equal(financialYearLabel(ym(2099, 6)), '2099-00');
  for (const today of [ym(2026, 4), ym(2026, 10), ym(2027, 2), ym(2027, 3)]) {
    assert.deepEqual(currentFinancialYear(today), { from: ym(2026, 4), to: ym(2027, 3) }, formatYearMonth(today));
  }
  assert.deepEqual(currentFinancialYear(ym(2027, 4)), { from: ym(2027, 4), to: ym(2028, 3) });
});

test('receipt dates: last day (leap years right) or the 1st', () => {
  assert.equal(daysInMonth(ym(2024, 2)), 29);
  assert.equal(daysInMonth(ym(2025, 2)), 28);
  assert.equal(daysInMonth(ym(2100, 2)), 28, '2100 is not a leap year');
  assert.equal(daysInMonth(ym(2026, 4)), 30);
  assert.equal(daysInMonth(ym(2026, 12)), 31);
  assert.equal(receiptDate(ym(2026, 10), 'last'), '31 Oct 2026');
  assert.equal(receiptDate(ym(2024, 2), 'last'), '29 Feb 2024');
  assert.equal(receiptDate(ym(2026, 4), 'last'), '30 Apr 2026');
  assert.equal(receiptDate(ym(2026, 4), 'first'), '1 Apr 2026');
});

test('month ranges: inclusive, across year ends, and refused when wrong', () => {
  const fy = months([2026, 4], [2027, 3]);
  assert.equal(fy.length, 12);
  assert.deepEqual([fy[0], fy[11]], [ym(2026, 4), ym(2027, 3)]);
  assert.deepEqual(months([2026, 12], [2027, 2]), [ym(2026, 12), ym(2027, 1), ym(2027, 2)], 'across December');
  assert.deepEqual(months([2026, 7], [2026, 7]), [ym(2026, 7)], 'one month');
  assert.equal(months([2026, 4], [2028, 3]).length, MAX_RECEIPT_MONTHS, 'exactly 24 is fine');

  const back = receiptMonths(ym(2026, 5), ym(2026, 4));
  assert.equal(back.ok, false);
  assert.match(back.ok ? '' : back.message, /can’t be before/);
  const tooMany = receiptMonths(ym(2026, 4), ym(2028, 4));
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.ok ? '' : tooMany.message, /25 months/);
  assert.equal(receiptMonths(null, ym(2026, 4)).ok, false);
  assert.equal(receiptMonths(ym(2026, 4), null).ok, false);
  assert.equal(receiptMonths(ym(2026, 13), ym(2026, 4)).ok, false);
});

// ───────────────────────────── rules ─────────────────────────────

test('the landlord-PAN rule: MORE than ₹1,00,000 in one financial year, per year', () => {
  const rent = (r: number, p = 0) => toPaise(BigInt(r), p);
  // 99,996 a year: under
  assert.equal(needsLandlordPan(months([2026, 4], [2027, 3]), rent(8333)), false);
  // 1,00,008 a year: over
  assert.equal(needsLandlordPan(months([2026, 4], [2027, 3]), rent(8334)), true);
  // exactly ₹1,00,000 (4 x 25,000) is NOT over; one paisa more is
  assert.equal(needsLandlordPan(months([2026, 4], [2026, 7]), rent(25000)), false);
  assert.equal(needsLandlordPan(months([2026, 4], [2026, 7]), rent(25000, 1)), true);
  // the limit is per financial year: 12 months over two financial years at 15,000 = 90,000 + 90,000, so no
  assert.equal(needsLandlordPan(months([2026, 10], [2027, 9]), rent(15000)), false);
  assert.equal(needsLandlordPan(months([2026, 10], [2027, 9]), rent(17000)), true, '1,02,000 in the first financial year');
  assert.deepEqual(rentByFinancialYear(months([2027, 1], [2027, 6]), rent(20000)), { '2026-27': rent(60000), '2027-28': rent(60000) });
});

test('the revenue-stamp rule: cash only, MORE than ₹5,000 a receipt', () => {
  const rent = (r: number, p = 0) => toPaise(BigInt(r), p);
  assert.equal(needsRevenueStamp('cash', rent(5000)), false, 'exactly 5,000 is not over');
  assert.equal(needsRevenueStamp('cash', rent(5000, 1)), true);
  assert.equal(needsRevenueStamp('cash', rent(25000)), true);
  for (const mode of ['upi', 'bank', 'cheque'] as const) assert.equal(needsRevenueStamp(mode, rent(50000)), false, mode);
});

test('PAN: format only, spaces and case forgiven', () => {
  assert.equal(cleanPan(' abcde 1234 f '), 'ABCDE1234F');
  assert.equal(isValidPan('ABCDE1234F'), true);
  assert.equal(isValidPan('abcde1234f'), true);
  assert.equal(isValidPan('abcde 1234 f'), true);
  for (const bad of ['', 'ABCD1234EF', 'ABCDE12345', 'ABCDE1234', 'ABCDEF1234', '1234567890', 'ABCDE1234FG', 'ABC-E1234F']) assert.equal(isValidPan(bad), false, bad);
});

test('form text is cleaned: controls out, spaces collapsed, length capped, nothing throws', () => {
  assert.equal(cleanText('  Priya \n  Sharma\t', 80), 'Priya Sharma');
  assert.equal(cleanText('a\u0000b\u0007c', 80), 'abc');
  assert.equal(cleanText('x'.repeat(500), 40).length, 40);
  assert.equal(cleanText(undefined as unknown as string, 10), '');
  assert.equal(cleanText('   ', 10), '');
});

// ───────────────────────────── receipts from a form ─────────────────────────────

const FORM: ReceiptInput = {
  tenant: 'Priya Sharma',
  landlord: 'Rakesh Gupta',
  landlordPan: '',
  address: 'Flat 4B, Green Park Apartments, Koramangala, Bengaluru 560034',
  rent: '25,000',
  mode: 'upi',
  reference: '',
  dateRule: 'last',
  from: ym(2026, 4),
  to: ym(2027, 3),
};
const ok = (over: Partial<ReceiptInput> = {}) => {
  const r = buildReceipts({ ...FORM, ...over });
  assert.ok(r.ok, JSON.stringify(r.ok ? '' : r.errors));
  return r.ok ? r.set : (null as never);
};
const errs = (over: Partial<ReceiptInput>) => {
  const r = buildReceipts({ ...FORM, ...over });
  assert.equal(r.ok, false, JSON.stringify(over));
  return r.ok ? {} : r.errors;
};

test('a financial year of receipts: 12, in order, with the right words, dates and totals', () => {
  const set = ok();
  assert.equal(set.receipts.length, 12);
  assert.equal(set.receipts[0].monthLabel, 'April 2026');
  assert.equal(set.receipts[11].monthLabel, 'March 2027');
  assert.equal(set.receipts[0].dateLabel, '30 Apr 2026');
  assert.equal(set.receipts[10].dateLabel, '28 Feb 2027');
  assert.equal(set.receipts[0].figures, '₹25,000');
  assert.equal(set.receipts[0].words, 'Rupees Twenty-Five Thousand Only');
  assert.equal(set.receipts[0].received, 'Received with thanks from Priya Sharma the sum of ₹25,000 (Rupees Twenty-Five Thousand Only) as rent for April 2026, for the property at Flat 4B, Green Park Apartments, Koramangala, Bengaluru 560034.');
  assert.equal(set.receipts[0].paidBy, 'Paid by UPI.');
  assert.equal(set.totalFigures, '₹3,00,000');
  assert.equal(set.stamp, false);
  assert.equal(set.landlordPan, '');
  assert.equal(set.panMissing, true, 'over ₹1,00,000 in the year and no PAN given');
  assert.equal(ok({ dateRule: 'first' }).receipts[0].dateLabel, '1 Apr 2026');
});

test('PAN: given → upper-cased and no warning; invalid → refused; small rent → no warning', () => {
  const set = ok({ landlordPan: 'abcde 1234 f' });
  assert.equal(set.landlordPan, 'ABCDE1234F');
  assert.equal(set.panMissing, false);
  assert.match(errs({ landlordPan: 'ABCD1234' }).landlordPan!, /ABCDE1234F/);
  assert.equal(ok({ rent: '8,000' }).panMissing, false, '96,000 a year');
});

test('cash: the stamp box, and the reference shows on every receipt', () => {
  const set = ok({ mode: 'cash', reference: 'Receipt book 12' });
  assert.equal(set.stamp, true);
  assert.equal(set.receipts[0].paidBy, 'Paid by Cash (Ref: Receipt book 12).');
  assert.equal(ok({ mode: 'cash', rent: '5,000' }).stamp, false);
  assert.equal(ok({ mode: 'bank' }).receipts[3].paidBy, 'Paid by Bank transfer.');
  assert.equal(ok({ mode: 'cheque', reference: '000123' }).receipts[0].paidBy, 'Paid by Cheque (Ref: 000123).');
});

test('paise in the rent are exact, in figures and in words', () => {
  const set = ok({ rent: '8,333.50', from: ym(2026, 4), to: ym(2026, 6) });
  assert.equal(set.receipts[0].figures, '₹8,333.50');
  assert.equal(set.receipts[0].words, 'Rupees Eight Thousand Three Hundred Thirty-Three and Fifty Paise Only');
  assert.equal(set.totalFigures, '₹25,000.50');
});

test('every wrong input is refused with its own plain message, several at once', () => {
  assert.match(errs({ tenant: '' }).tenant!, /tenant/);
  assert.match(errs({ tenant: ' a ' }).tenant!, /tenant/);
  assert.match(errs({ landlord: '' }).landlord!, /landlord/);
  assert.match(errs({ address: '  ' }).address!, /address/);
  assert.equal(errs({ rent: '' }).rent, 'Enter the monthly rent.');
  assert.equal(errs({ rent: '0' }).rent, 'Enter the monthly rent.');
  assert.equal(errs({ rent: '0.00' }).rent, 'Enter the monthly rent.');
  assert.match(errs({ rent: '1,5' }).rent!, /commas/);
  assert.match(errs({ rent: '-500' }).rent!, /Negative/);
  assert.match(errs({ rent: '25000.555' }).rent!, /2 decimal places/);
  assert.match(errs({ rent: 'twenty thousand' }).rent!, /digits only/);
  assert.match(errs({ rent: String(MAX_MONTHLY_RENT + 1) }).rent!, /too high/);
  assert.equal(buildReceipts({ ...FORM, rent: String(MAX_MONTHLY_RENT) }).ok, true, 'the ceiling itself is fine');
  assert.match(errs({ from: ym(2027, 3), to: ym(2026, 4) }).months!, /can’t be before/);
  assert.match(errs({ from: null }).months!, /Pick/);
  const many = errs({ tenant: '', landlord: '', address: '', rent: '', from: null });
  assert.deepEqual(Object.keys(many).sort(), ['address', 'landlord', 'months', 'rent', 'tenant']);
});

test('text is cleaned before it is printed: no stray spaces, line breaks or control characters', () => {
  const set = ok({ tenant: '  Priya   Sharma  ', address: 'Flat 4B,\nGreen Park\u0000 Apartments', landlord: 'Rakesh\tGupta' });
  assert.equal(set.tenant, 'Priya Sharma');
  assert.equal(set.address, 'Flat 4B, Green Park Apartments');
  assert.equal(set.landlord, 'Rakesh Gupta');
  const long = ok({ tenant: 'N'.repeat(300), address: 'A'.repeat(900), reference: 'R'.repeat(200), mode: 'cheque' });
  assert.equal(long.tenant.length, LIMITS.name);
  assert.equal(long.address.length, LIMITS.address);
  assert.ok(long.receipts[0].paidBy.length <= 'Paid by Cheque (Ref: )'.length + LIMITS.reference + 1);
});

test('nothing in a receipt can be mistaken for markup or break the sentence', () => {
  const set = ok({ tenant: 'A & B <Sharma>', address: '12 "Rose" Lane' });
  assert.ok(set.receipts[0].received.includes('A & B <Sharma>'), 'kept as text; the PDF and the page escape it themselves');
});
