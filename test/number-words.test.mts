/**
 * Indian Number to Words (app/lib/invoice/words.ts): exact parsing of typed text,
 * lakh/crore wording, cheque style, and parity with the original float-based
 * functions the Invoice Generator has always used.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  amountWords,
  figuresIndian,
  groupIndian,
  indianNumberWords,
  indianWordsBig,
  MAX_AMOUNT_DIGITS,
  parseAmountText,
  rupeesInWords,
} from '../app/lib/invoice/words.ts';

const ok = (raw: string) => {
  const r = parseAmountText(raw);
  assert.equal(r.ok, true, `${raw} should parse: ${r.ok ? '' : r.message}`);
  return r.ok ? r.parts : { rupees: 0n, paise: 0 };
};
const bad = (raw: string) => {
  const r = parseAmountText(raw);
  assert.equal(r.ok, false, `${JSON.stringify(raw)} should be refused`);
  return r.ok ? { empty: false, message: '' } : r;
};
const cheque = (raw: string) => amountWords(ok(raw), 'cheque');
const plain = (raw: string) => amountWords(ok(raw), 'plain');

test('parsing: Indian and western commas, symbols, spaces, leading zeros, paise', () => {
  assert.deepEqual(ok('125000'), { rupees: 125000n, paise: 0 });
  assert.deepEqual(ok('1,25,000'), { rupees: 125000n, paise: 0 });
  assert.deepEqual(ok('125,000'), { rupees: 125000n, paise: 0 });
  assert.deepEqual(ok('1,234,567'), { rupees: 1234567n, paise: 0 });
  assert.deepEqual(ok('12,34,567'), { rupees: 1234567n, paise: 0 });
  assert.deepEqual(ok('₹ 1,180.5'), { rupees: 1180n, paise: 50 });
  assert.deepEqual(ok('Rs. 500'), { rupees: 500n, paise: 0 });
  assert.deepEqual(ok('rs 500'), { rupees: 500n, paise: 0 });
  assert.deepEqual(ok('INR 1,00,000.05'), { rupees: 100000n, paise: 5 });
  assert.deepEqual(ok('  1 25 000  '), { rupees: 125000n, paise: 0 }, 'spaces inside are ignored');
  assert.deepEqual(ok('007'), { rupees: 7n, paise: 0 });
  assert.deepEqual(ok('000'), { rupees: 0n, paise: 0 });
  assert.deepEqual(ok('.50'), { rupees: 0n, paise: 50 });
  assert.deepEqual(ok('5.'), { rupees: 5n, paise: 0 });
  assert.deepEqual(ok('100.00'), { rupees: 100n, paise: 0 });
  assert.deepEqual(ok('100.000'), { rupees: 100n, paise: 0 }, 'extra zeros after the paise change nothing');
  assert.deepEqual(ok('0.05'), { rupees: 0n, paise: 5 });
  assert.deepEqual(ok('1.9'), { rupees: 1n, paise: 90 });
});

test('parsing: anything that could change the amount is refused, not "fixed"', () => {
  assert.equal(bad('').empty, true, 'empty is not an error');
  assert.equal(bad('   ').empty, true);
  assert.equal(bad('₹').empty, true, 'a lone currency symbol is just a start, not an error');
  assert.equal(bad('Rs.').empty, true);
  for (const raw of ['-5', '−5', '- 5']) assert.match(bad(raw).message, /Negative/, raw);
  for (const raw of ['abc', '12a', '1e5', '1.2.3', '12 rupees', '१२३', '5-3', '$5', '1/2']) assert.match(bad(raw).message, /digits only/, raw);
  // a comma that isn't a thousands separator: 1,5 is NOT 15
  for (const raw of ['1,5', '12,34', '1,2,3', '1,234,56', ',500', '1,,000', '12,3456']) assert.match(bad(raw).message, /commas/, raw);
  // paise
  assert.match(bad('1.005').message, /2 decimal places/);
  assert.match(bad('10.999').message, /2 decimal places/);
  // size
  assert.match(bad('1'.repeat(MAX_AMOUNT_DIGITS + 1)).message, /bigger than/);
  assert.equal(ok('9'.repeat(MAX_AMOUNT_DIGITS)).rupees, BigInt('9'.repeat(MAX_AMOUNT_DIGITS)));
  assert.equal(parseAmountText('0'.repeat(30) + '5').ok, true, 'leading zeros do not count towards the size');
});

test('words: the edges of every group', () => {
  const cases: [bigint, string][] = [
    [0n, 'Zero'],
    [1n, 'One'],
    [10n, 'Ten'],
    [13n, 'Thirteen'],
    [19n, 'Nineteen'],
    [20n, 'Twenty'],
    [21n, 'Twenty-One'],
    [99n, 'Ninety-Nine'],
    [100n, 'One Hundred'],
    [101n, 'One Hundred One'],
    [110n, 'One Hundred Ten'],
    [999n, 'Nine Hundred Ninety-Nine'],
    [1000n, 'One Thousand'],
    [1001n, 'One Thousand One'],
    [10_000n, 'Ten Thousand'],
    [99_999n, 'Ninety-Nine Thousand Nine Hundred Ninety-Nine'],
    [100_000n, 'One Lakh'],
    [100_001n, 'One Lakh One'],
    [125_000n, 'One Lakh Twenty-Five Thousand'],
    [1_000_000n, 'Ten Lakh'],
    [9_999_999n, 'Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine'],
    [10_000_000n, 'One Crore'],
    [10_100_000n, 'One Crore One Lakh'],
    [12_500_000n, 'One Crore Twenty-Five Lakh'],
    [1_000_000_000n, 'One Hundred Crore'],
    [10_000_000_000n, 'One Thousand Crore'],
    [1_234_567_891n, 'One Hundred Twenty-Three Crore Forty-Five Lakh Sixty-Seven Thousand Eight Hundred Ninety-One'],
  ];
  for (const [n, words] of cases) assert.equal(indianWordsBig(n), words, String(n));
  assert.equal(indianWordsBig(-125_000n), 'One Lakh Twenty-Five Thousand', 'the sign is ignored (the parser refuses negatives before this)');
});

test('words: the largest amount (14 digits, one Crore only) and values beyond 2^53 stay exact', () => {
  assert.equal(
    cheque('9,99,99,99,99,99,999'),
    'Rupees Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine Only',
  );
  assert.match(cheque('9,99,99,99,99,99,999'), /^Rupees \w+-\w+ Lakh .* Crore \w+-\w+ Lakh/, 'only one Crore in the largest amount');
  assert.equal((cheque('9,99,99,99,99,99,999').match(/Crore/g) ?? []).length, 1);
  assert.match(bad('1'.repeat(MAX_AMOUNT_DIGITS + 1)).message, /up to 14 digits/);
  // 2^53 + 1 is not representable as a JS number; the BigInt path keeps every digit
  assert.match(indianWordsBig(9007199254740993n), /Forty Thousand Nine Hundred Ninety-Three$/, 'the last digit survives (a JS number would end ...992)');
  assert.notEqual(indianNumberWords(9007199254740993), indianWordsBig(9007199254740993n), 'a JS number cannot hold this value');
});

test('cheque style: paise, zero, and paise alone', () => {
  assert.equal(cheque('125000'), 'Rupees One Lakh Twenty-Five Thousand Only');
  assert.equal(cheque('1,180.50'), 'Rupees One Thousand One Hundred Eighty and Fifty Paise Only');
  assert.equal(cheque('53100'), 'Rupees Fifty-Three Thousand One Hundred Only');
  assert.equal(cheque('1.01'), 'Rupees One and One Paise Only');
  assert.equal(cheque('1.99'), 'Rupees One and Ninety-Nine Paise Only');
  assert.equal(cheque('100.00'), 'Rupees One Hundred Only', 'no paise, no "and"');
  assert.equal(cheque('0'), 'Rupees Zero Only');
  assert.equal(cheque('.50'), 'Fifty Paise Only');
  assert.equal(cheque('0.05'), 'Five Paise Only');
  assert.equal(cheque('0.00'), 'Rupees Zero Only');
  assert.equal(cheque('1.000'), 'Rupees One Only', 'extra zeros after the paise change nothing');
});

test('plain style: the number as words, decimals read digit by digit', () => {
  assert.equal(plain('125000'), 'One Lakh Twenty-Five Thousand');
  assert.equal(plain('0'), 'Zero');
  assert.equal(plain('1,25,000.50'), 'One Lakh Twenty-Five Thousand Point Five Zero');
  assert.equal(plain('2.05'), 'Two Point Zero Five');
  assert.equal(plain('.5'), 'Zero Point Five Zero');
});

test('figures: Indian grouping of what was typed', () => {
  assert.equal(groupIndian('0'), '0');
  assert.equal(groupIndian('999'), '999');
  assert.equal(groupIndian('1000'), '1,000');
  assert.equal(groupIndian('100000'), '1,00,000');
  assert.equal(groupIndian('12345678'), '1,23,45,678');
  assert.equal(groupIndian('999999999999999'), '99,99,99,99,99,99,999');
  assert.equal(figuresIndian(ok('125000')), '1,25,000');
  assert.equal(figuresIndian(ok('125,000.5')), '1,25,000.50');
  assert.equal(figuresIndian(ok('.05')), '0.05');
  assert.equal(figuresIndian(ok('007')), '7');
});

// ──────────────── parity with the original implementation the invoice has always used ────────────────
// A verbatim copy of the previous (number-based) functions, kept here as the oracle.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const oldBelowHundred = (n: number): string => (n < 20 ? ONES[n] : n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
const oldBelowThousand = (n: number): string => [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? oldBelowHundred(n % 100) : ''].filter(Boolean).join(' ');
function oldIndianNumberWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${oldIndianNumberWords(crore)} Crore`);
  if (lakh) parts.push(`${oldBelowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${oldBelowHundred(thousand)} Thousand`);
  if (n) parts.push(oldBelowThousand(n));
  return parts.join(' ');
}
function oldRupeesInWords(amount: number): string {
  const paise = Math.round((Math.abs(amount) % 1) * 100);
  const rupees = Math.floor(Math.abs(amount) + (paise === 100 ? 1 : 0));
  const p = paise === 100 ? 0 : paise;
  return `Rupees ${oldIndianNumberWords(rupees)}${p ? ` and ${oldBelowHundred(p)} Paise` : ''} Only`;
}

/** A small deterministic generator, so a failure is reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

test('the invoice is unchanged: indianNumberWords and rupeesInWords equal the original on thousands of values', () => {
  const rand = rng(20261027);
  const values: number[] = [0, 1, 9, 10, 19, 20, 99, 100, 999, 1000, 99_999, 100_000, 9_999_999, 10_000_000, 123_456_789, 99_99_99_999];
  for (let i = 0; i < 4000; i++) values.push(Math.floor(rand() ** 3 * 10 ** Math.floor(1 + rand() * 11)));
  for (const v of values) assert.equal(indianNumberWords(v), oldIndianNumberWords(v), `indianNumberWords(${v})`);

  const amounts: number[] = [0, 0.5, 0.01, 0.99, 1180.5, 53100, 99.995, 1234.56];
  for (let i = 0; i < 3000; i++) amounts.push(Math.round(rand() * 1e9) / 100);
  for (const a of amounts) assert.equal(rupeesInWords(a), oldRupeesInWords(a), `rupeesInWords(${a})`);
  assert.equal(indianNumberWords(-125000), oldIndianNumberWords(-125000), 'the sign is ignored, as before');
  assert.equal(indianNumberWords(12345.99), oldIndianNumberWords(12345.99), 'decimals are dropped, as before');
  assert.equal(indianNumberWords(Number.NaN), '', 'NaN is still an empty string');
});

test('the exact path agrees with the invoice path wherever floats are exact (whole rupees and clean paise)', () => {
  const rand = rng(7);
  for (let i = 0; i < 3000; i++) {
    const rupees = Math.floor(rand() ** 2 * 10 ** Math.floor(1 + rand() * 11));
    assert.equal(indianWordsBig(BigInt(rupees)), oldIndianNumberWords(rupees), String(rupees));
    const p = Math.floor(rand() * 100);
    const text = `${rupees}.${String(p).padStart(2, '0')}`;
    const viaTool = cheque(text);
    // the invoice wording for rupees + paise is identical except when rupees is 0 (invoice says "Rupees Zero and …")
    if (rupees > 0) assert.equal(viaTool, oldRupeesInWords(rupees + p / 100), text);
  }
});
