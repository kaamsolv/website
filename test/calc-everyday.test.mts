import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageOn,
  discount,
  formatNumber,
  formatRupees,
  parseAmount,
  parseDateInput,
  percentChange,
  percentOf,
  splitBill,
  whatPercent,
} from '../app/lib/calc/everyday.ts';

const d = (s: string) => parseDateInput(s)!;

test('percentage: of, what percent, change', () => {
  assert.equal(percentOf(18, 2500), 450);
  assert.equal(whatPercent(450, 2500), 18);
  assert.equal(whatPercent(1, 0), null);
  assert.equal(percentChange(80, 100), 25);
  assert.equal(percentChange(100, 80), -20);
  assert.equal(percentChange(-50, -25), 50);
  assert.equal(percentChange(0, 10), null);
  assert.equal(percentOf(Number.NaN, 5), null);
});

test('discount: single, stacked, invalid', () => {
  assert.deepEqual(discount(2499, 20), { final: 1999.2, saved: 499.8 });
  // 50% then another 20% = 60% total, not 70%.
  assert.deepEqual(discount(1000, 50, 20), { final: 400, saved: 600 });
  assert.equal(discount(1000, 120), null);
  assert.equal(discount(-5, 10), null);
});

test('tip and split bill, with round-up', () => {
  assert.deepEqual(splitBill(1850, 10, 4), { tip: 185, total: 2035, perPerson: 508.75, perPersonRoundedUp: 509 });
  assert.deepEqual(splitBill(1000, 0, 3), { tip: 0, total: 1000, perPerson: 333.33, perPersonRoundedUp: 334 });
  assert.equal(splitBill(1000, 10, 0), null);
  assert.equal(splitBill(1000, 10, 2.5), null);
});

test('age: exact years, months, days and next birthday', () => {
  const a = ageOn(d('1990-08-15'), d('2026-10-21'))!;
  assert.deepEqual([a.years, a.months, a.days], [36, 2, 6]);
  assert.equal(a.daysToNextBirthday, 298);
  assert.equal(a.nextBirthdayAge, 37);
  assert.equal(a.bornWeekday, 'Wednesday');
  assert.equal(a.totalMonths, 434);
});

test('age: birthday today, month-end borrow, and future dates', () => {
  const today = ageOn(d('2000-10-21'), d('2026-10-21'))!;
  assert.deepEqual([today.years, today.months, today.days, today.daysToNextBirthday], [26, 0, 0, 0]);
  const borrow = ageOn(d('2000-01-31'), d('2000-03-01'))!;
  assert.deepEqual([borrow.years, borrow.months, borrow.days], [0, 1, 1]);
  assert.equal(ageOn(d('2030-01-01'), d('2026-10-21')), null);
});

test('age: 29 Feb birthdays fall on 28 Feb in non-leap years', () => {
  const a = ageOn(d('2004-02-29'), d('2027-02-01'))!;
  assert.equal(a.daysToNextBirthday, 27); // 28 Feb 2027
  assert.equal(a.nextBirthdayAge, 23);
});

test('date input parsing rejects impossible dates', () => {
  assert.equal(parseDateInput('2026-02-30'), null);
  assert.equal(parseDateInput('21/10/2026'), null);
  assert.ok(parseDateInput('2024-02-29'));
});

test('Indian formatting and parsing', () => {
  assert.equal(formatNumber(125000), '1,25,000');
  assert.equal(formatNumber(12.345), '12.35');
  assert.equal(formatRupees(1999.2), '₹1,999.20');
  assert.equal(parseAmount('₹1,25,000'), 125000);
  assert.ok(Number.isNaN(parseAmount('  ')));
  assert.ok(Number.isNaN(parseAmount('12abc')));
});
