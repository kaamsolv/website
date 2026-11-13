/**
 * The coupon code engine and its files (Phase 1 of the Coupon product). The things that matter: codes are random and
 * secure (not Math.random), unbiased, readable (no look-alikes), unique, shaped as asked, and a request that cannot be met
 * is refused in plain words instead of looping or returning a short batch.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPrefix,
  CHARSETS,
  CouponError,
  COUPON_LIMITS,
  cleanPrefix,
  codeSpace,
  describeStrength,
  generateCoupons,
  type CouponErrorCode,
  type CouponOptions,
  type RandomBytes,
} from '../app/lib/coupons/generate.ts';
import { describeOdds, plainNumber } from '../app/lib/coupons/describe.ts';
import { checkDiscount, checkExpiryDate, COUPON_CSV_COLUMNS, couponFileName, couponsToCsv, couponsToTxt } from '../app/lib/coupons/export.ts';

const refuses = (code: CouponErrorCode) => (e: unknown) => e instanceof CouponError && e.code === code;
const CLEAR_RE = '[A-HJKMNP-Z2-9]';

test('the alphabets: the default leaves out I, L, O, 0 and 1, and every set has no repeated symbol', () => {
  assert.equal(CHARSETS.clear.length, 31);
  assert.equal(CHARSETS.letters.length, 23);
  assert.equal(CHARSETS.digits.length, 10);
  assert.equal(CHARSETS.all.length, 36);
  for (const set of Object.values(CHARSETS)) assert.equal(new Set(set).size, set.length);
  for (const bad of ['I', 'L', 'O', '0', '1']) assert.ok(!CHARSETS.clear.includes(bad), `clear must not contain ${bad}`);
  for (const bad of ['I', 'L', 'O']) assert.ok(!CHARSETS.letters.includes(bad));
});

test('a default batch: unique codes, XXXX-XXXX, only readable symbols', () => {
  const codes = generateCoupons({ count: 500 });
  assert.equal(codes.length, 500);
  assert.equal(new Set(codes).size, 500);
  const shape = new RegExp(`^${CLEAR_RE}{4}-${CLEAR_RE}{4}$`);
  for (const c of codes) assert.match(c, shape);
});

test('a prefix is cleaned to capital letters and digits, and joined with a dash', () => {
  assert.equal(cleanPrefix('diwali 25!'), 'DIWALI25');
  assert.equal(cleanPrefix('  सेल-sale '), 'SALE');
  assert.equal(cleanPrefix('!!!'), '');
  const codes = generateCoupons({ count: 20, prefix: 'diwali 25' });
  for (const c of codes) assert.match(c, new RegExp(`^DIWALI25-${CLEAR_RE}{4}-${CLEAR_RE}{4}$`));
  // Nothing left after cleaning means no prefix and no leading dash.
  for (const c of generateCoupons({ count: 5, prefix: '###' })) assert.ok(!c.startsWith('-'));
  assert.throws(() => generateCoupons({ count: 1, prefix: 'ABCDEFGHIJKLM' }), refuses('prefix'));
  assert.equal(generateCoupons({ count: 1, prefix: 'ABCDEFGHIJKL' })[0].startsWith('ABCDEFGHIJKL-'), true);
});

test('grouping: every N characters, none for 0 or when the group is as long as the code', () => {
  assert.match(generateCoupons({ count: 1, length: 8, groupSize: 3 })[0], new RegExp(`^${CLEAR_RE}{3}-${CLEAR_RE}{3}-${CLEAR_RE}{2}$`));
  assert.match(generateCoupons({ count: 1, length: 12, groupSize: 4 })[0], new RegExp(`^${CLEAR_RE}{4}-${CLEAR_RE}{4}-${CLEAR_RE}{4}$`));
  assert.match(generateCoupons({ count: 1, length: 8, groupSize: 0 })[0], new RegExp(`^${CLEAR_RE}{8}$`));
  assert.match(generateCoupons({ count: 1, length: 6, groupSize: 8 })[0], new RegExp(`^${CLEAR_RE}{6}$`));
});

test('character sets are honoured', () => {
  for (const c of generateCoupons({ count: 50, charset: 'digits', groupSize: 0 })) assert.match(c, /^\d{8}$/);
  for (const c of generateCoupons({ count: 50, charset: 'letters', groupSize: 0 })) assert.match(c, /^[A-HJKMNP-Z]{8}$/);
  for (const c of generateCoupons({ count: 50, charset: 'all', groupSize: 0 })) assert.match(c, /^[A-Z0-9]{8}$/);
});

test('it never touches Math.random', () => {
  const real = Math.random;
  Math.random = () => {
    throw new Error('Math.random must not be used for coupon codes');
  };
  try {
    assert.equal(generateCoupons({ count: 50 }).length, 50);
  } finally {
    Math.random = real;
  }
});

test('unbiased: bytes at or above 248 are thrown away, the rest map straight onto the alphabet', () => {
  // 31 symbols: 256 % 31 = 8, so 248 to 255 would favour the first symbols and must be rejected.
  const script = [255, 248, 0, 1, 30, 31];
  let n = 0;
  const fill: RandomBytes = (buffer) => {
    for (let i = 0; i < buffer.length; i++) buffer[i] = script[n++ % script.length];
  };
  // 255 and 248 are skipped; then 0=A, 1=B, 30=9 (last symbol), 31 wraps to A.
  assert.deepEqual(generateCoupons({ count: 1, length: 4, groupSize: 0 }, fill), ['AB9A']);
});

test('spread: over many draws every symbol turns up about equally often', () => {
  const counts = new Map<string, number>();
  for (const c of generateCoupons({ count: 2000, length: 16, groupSize: 0 })) for (const ch of c) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  assert.equal(counts.size, 31);
  // 32,000 draws over 31 symbols: about 1,032 each, a spread of about 32. Between 800 and 1,280 is a very wide net.
  for (const [ch, n] of counts) assert.ok(n > 800 && n < 1280, `${ch} came up ${n} times`);
});

test('a broken random source stops the batch instead of spinning', () => {
  const stuck: RandomBytes = (buffer) => buffer.fill(255);
  assert.throws(() => generateCoupons({ count: 1 }, stuck), /random source/);
});

test('uniqueness holds up to the limit, and a batch that cannot fit is refused', () => {
  // 4 digits: 10,000 possible codes. Half of that is the ceiling.
  const half = generateCoupons({ count: 5000, length: 4, groupSize: 0, charset: 'digits' });
  assert.equal(new Set(half).size, 5000);
  assert.throws(() => generateCoupons({ count: 5001, length: 4, groupSize: 0, charset: 'digits' }), refuses('too_many_for_length'));
  const big = generateCoupons({ count: COUPON_LIMITS.maxCount });
  assert.equal(new Set(big).size, COUPON_LIMITS.maxCount);
});

test('requests that cannot be met are refused with a plain message', () => {
  const bad = (o: Partial<CouponOptions>, code: CouponErrorCode) => assert.throws(() => generateCoupons({ count: 10, ...o }), refuses(code));
  bad({ count: 0 }, 'count');
  bad({ count: 1.5 }, 'count');
  bad({ count: Number.NaN }, 'count');
  bad({ count: COUPON_LIMITS.maxCount + 1 }, 'count');
  bad({ length: 3 }, 'length');
  bad({ length: 17 }, 'length');
  bad({ length: 8.5 }, 'length');
  bad({ groupSize: 1 }, 'group');
  bad({ groupSize: 9 }, 'group');
  bad({ groupSize: -2 }, 'group');
  bad({ groupSize: 2.5 }, 'group');
  bad({ charset: 'emoji' as never }, 'charset');
  try {
    generateCoupons({ count: 10_001 });
    assert.fail('should have thrown');
  } catch (e) {
    assert.match((e as Error).message, /1 and 10,000 codes/);
  }
});

test('strength: how many codes could exist and how lucky a guess would need to be', () => {
  assert.equal(codeSpace(8, 'clear'), 852_891_037_441);
  assert.equal(codeSpace(4, 'digits'), 10_000);
  const s = describeStrength(1000, 8, 'clear');
  assert.equal(s.possibilities, 852_891_037_441);
  assert.ok(Math.abs(s.oneIn - 852_891_037.441) < 1);
  assert.equal(describeStrength(0, 4, 'digits').oneIn, 10_000);
});

test('CSV: header, one row per code, label cells empty when not set, plain ASCII with no byte-order mark', () => {
  assert.deepEqual([...COUPON_CSV_COLUMNS], ['code', 'discount_type', 'discount_value', 'expires_on']);
  assert.equal(couponsToCsv(['A-1', 'B-2']), 'code,discount_type,discount_value,expires_on\r\nA-1,,,\r\nB-2,,,\r\n');
  const withLabels = couponsToCsv(['A-1', 'B-2'], { discount: { type: 'percent', value: 10 }, expiresOn: '2026-12-31' });
  assert.equal(withLabels, 'code,discount_type,discount_value,expires_on\r\nA-1,percent,10,2026-12-31\r\nB-2,percent,10,2026-12-31\r\n');
  assert.equal(couponsToCsv(['A-1'], { discount: { type: 'amount', value: 199.5 } }), 'code,discount_type,discount_value,expires_on\r\nA-1,amount,199.5,\r\n');
  assert.equal(couponsToCsv([]).charCodeAt(0), 'c'.charCodeAt(0));
  assert.equal(couponsToCsv(['A-1'], { expiresOn: '' }), 'code,discount_type,discount_value,expires_on\r\nA-1,,,\r\n');
});

test('CSV: a real batch makes count + 1 lines and a code that looks like a formula is defused', () => {
  const codes = generateCoupons({ count: 250, prefix: 'sale' });
  assert.equal(couponsToCsv(codes).trim().split('\r\n').length, 251);
  assert.match(couponsToCsv(['=1+1', '@x']), /\r\n'=1\+1,,,\r\n'@x,,,\r\n$/);
});

test('discount labels: a percentage is 0 to 100, an amount is above 0, at most two decimals', () => {
  for (const ok of [{ type: 'percent', value: 100 }, { type: 'percent', value: 12.5 }, { type: 'amount', value: 0.01 }, { type: 'amount', value: 10_000_000 }] as const) assert.doesNotThrow(() => checkDiscount(ok));
  for (const bad of [
    { type: 'percent', value: 0 },
    { type: 'percent', value: 100.01 },
    { type: 'percent', value: 10.005 },
    { type: 'amount', value: -5 },
    { type: 'amount', value: Number.NaN },
    { type: 'amount', value: 10_000_001 },
    { type: 'money', value: 5 },
  ] as const) assert.throws(() => checkDiscount(bad as never), refuses('discount'));
  assert.throws(() => couponsToCsv(['A'], { discount: { type: 'percent', value: 150 } }), refuses('discount'));
});

test('expiry labels must be real calendar dates', () => {
  for (const ok of ['2026-12-31', '2028-02-29', '2026-01-01']) assert.doesNotThrow(() => checkExpiryDate(ok));
  for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '31-12-2026', '2026-1-1', 'tomorrow', ' 2026-12-31']) assert.throws(() => checkExpiryDate(bad), refuses('expiry'));
  assert.throws(() => couponsToCsv(['A'], { expiresOn: '2026-02-30' }), refuses('expiry'));
});

test('TXT: one code per line with a closing newline; nothing for an empty batch', () => {
  assert.equal(couponsToTxt(['A-1', 'B-2']), 'A-1\nB-2\n');
  assert.equal(couponsToTxt([]), '');
});

test('applyPrefix and file names', () => {
  assert.equal(applyPrefix('diwali', 'AB-CD'), 'DIWALI-AB-CD');
  assert.equal(applyPrefix('', 'AB-CD'), 'AB-CD');
  assert.equal(applyPrefix('!!', 'AB-CD'), 'AB-CD');
  assert.equal(couponFileName('csv', 100), 'coupon-codes-100.csv');
  assert.equal(couponFileName('txt', 5, 'Diwali 25!'), 'coupon-codes-5-diwali25.txt');
});

test('slicing a pool and adding a prefix keeps codes unique and equal to what the engine would make', () => {
  const pool = generateCoupons({ count: 1000, length: 6, groupSize: 3 });
  const shown = pool.slice(0, 40).map((c) => applyPrefix('sale', c));
  assert.equal(new Set(shown).size, 40);
  for (const c of shown) assert.match(c, new RegExp(`^SALE-${CLEAR_RE}{3}-${CLEAR_RE}{3}$`));
});

test('big numbers in lakh and crore, and the guess sentence', () => {
  assert.equal(plainNumber(9500), '9,500');
  assert.equal(plainNumber(250_000), '2.5 lakh');
  assert.equal(plainNumber(8_528_910_374), '853 crore');
  assert.equal(plainNumber(15_000_000), '1.5 crore');
  assert.equal(plainNumber(3e12), 'a lakh crore');
  const strong = describeOdds(8_528_910_374);
  assert.equal(strong.phrase, 'about 1 time in 853 crore');
  assert.equal(strong.weak, false);
  assert.ok(strong.percent > 6 && strong.percent <= 100);
  assert.equal(describeOdds(50_000).weak, true);
  assert.equal(describeOdds(1e13).phrase, 'less than 1 time in a lakh crore');
  assert.equal(describeOdds(1e13).percent, 100);
  assert.equal(describeOdds(2).percent, 6);
});
