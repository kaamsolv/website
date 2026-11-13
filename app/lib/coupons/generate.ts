/**
 * Coupon code engine (Coupon Code Generator, Phase 1: docs/products/coupons.md).
 *
 * Makes batches of random, readable discount codes. Framework-free: it runs in the browser (the tool makes codes on the
 * visitor's device, nothing is uploaded) and on the server (Phase 2 will use the same engine to create tracked codes).
 *
 * What a code is: PREFIX-XXXX-XXXX. The random part comes from the platform's secure random source (never Math.random),
 * and is drawn without modulo bias. The default alphabet leaves out the look-alikes (I, L, O, 0, 1), so a code can be read
 * out over the phone, printed on a card and typed without second-guessing.
 *
 * What this module does NOT do: it cannot tell whether a code has been used, or stop a code being used twice. A code is a
 * string; enforcing "once only" and "until this date" is the job of the store or till that accepts it (Phase 2 adds a
 * KaamSolv-hosted way to do that).
 */

/** The alphabets a batch can use. `clear` is the default. */
export const CHARSETS = {
  /** A–Z and 2–9 without I, L, O, 0 and 1 (31 symbols): safe to read aloud, print and type. */
  clear: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  /** The same letters, no digits (23 symbols). */
  letters: 'ABCDEFGHJKMNPQRSTUVWXYZ',
  /** 0–9 only (10 symbols), for tills and forms that take numbers only. */
  digits: '0123456789',
  /** Every A–Z and 0–9, look-alikes included (36 symbols). */
  all: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
} as const;

export type CharsetKey = keyof typeof CHARSETS;

export const COUPON_LIMITS = {
  /** A technical ceiling for one batch. What a visitor may ask for is a product decision made in the page, not here. */
  maxCount: 10_000,
  minLength: 4,
  maxLength: 16,
  maxPrefix: 12,
  /** 0 means "no dashes"; otherwise a dash after every this many random characters. */
  minGroup: 2,
  maxGroup: 8,
} as const;

export const COUPON_DEFAULTS = { length: 8, groupSize: 4, charset: 'clear' as CharsetKey, prefix: '' };

export type CouponOptions = {
  /** How many codes (1 to 10,000). */
  count: number;
  /** Random characters per code, not counting the prefix or the dashes (4 to 16). Default 8. */
  length?: number;
  /** Letters and digits, shown in capitals in front of the random part (up to 12). Anything else is dropped by `cleanPrefix`. */
  prefix?: string;
  /** A dash after every N random characters; 0 for none. Default 4, so 8 characters read XXXX-XXXX. */
  groupSize?: number;
  charset?: CharsetKey;
};

export type CouponErrorCode = 'count' | 'length' | 'prefix' | 'group' | 'charset' | 'too_many_for_length' | 'unique_failed' | 'discount' | 'expiry';

export class CouponError extends Error {
  constructor(
    readonly code: CouponErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CouponError';
  }
}

/** Fills the buffer with random bytes. The default is the platform's secure source; tests pass their own. */
export type RandomBytes = (buffer: Uint8Array) => void;

const secureRandom: RandomBytes = (buffer) => {
  crypto.getRandomValues(buffer);
};

/** Keeps letters and digits, in capitals. Use it to clean what a visitor types into the prefix box. */
export function cleanPrefix(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** How many different random parts exist for this length and alphabet. A float: it passes 2^53 at the long end. */
export function codeSpace(length: number, charset: CharsetKey = COUPON_DEFAULTS.charset): number {
  return CHARSETS[charset].length ** length;
}

/**
 * Plain numbers for the "how hard is this to guess" note: how many codes could exist, and about how many guesses it
 * takes to hit one of your codes by luck ("1 in N" per guess).
 */
export function describeStrength(count: number, length: number, charset: CharsetKey = COUPON_DEFAULTS.charset): { possibilities: number; oneIn: number } {
  const possibilities = codeSpace(length, charset);
  return { possibilities, oneIn: possibilities / Math.max(1, count) };
}

type Settled = { count: number; length: number; prefix: string; groupSize: number; charset: CharsetKey };

function settle(options: CouponOptions): Settled {
  const { count } = options;
  const length = options.length ?? COUPON_DEFAULTS.length;
  const groupSize = options.groupSize ?? COUPON_DEFAULTS.groupSize;
  const charset = options.charset ?? COUPON_DEFAULTS.charset;
  const prefix = cleanPrefix(options.prefix ?? COUPON_DEFAULTS.prefix);

  if (!Number.isInteger(count) || count < 1 || count > COUPON_LIMITS.maxCount) {
    throw new CouponError('count', `Pick between 1 and ${COUPON_LIMITS.maxCount.toLocaleString('en-IN')} codes.`);
  }
  if (!Number.isInteger(length) || length < COUPON_LIMITS.minLength || length > COUPON_LIMITS.maxLength) {
    throw new CouponError('length', `Make the code ${COUPON_LIMITS.minLength} to ${COUPON_LIMITS.maxLength} characters long.`);
  }
  if (!(charset in CHARSETS)) throw new CouponError('charset', 'Pick one of the character sets on offer.');
  if (!Number.isInteger(groupSize) || (groupSize !== 0 && (groupSize < COUPON_LIMITS.minGroup || groupSize > COUPON_LIMITS.maxGroup))) {
    throw new CouponError('group', `Group size is 0 (no dashes) or ${COUPON_LIMITS.minGroup} to ${COUPON_LIMITS.maxGroup}.`);
  }
  if (prefix.length > COUPON_LIMITS.maxPrefix) {
    throw new CouponError('prefix', `Keep the prefix to ${COUPON_LIMITS.maxPrefix} letters or digits.`);
  }
  // Half the possible codes is the ceiling: past that, finding a fresh one keeps failing and the batch would barely be random.
  if (count > codeSpace(length, charset) / 2) {
    throw new CouponError('too_many_for_length', 'That many codes will not fit in a code this short. Make the code longer or ask for fewer.');
  }
  return { count, length, prefix, groupSize, charset };
}

/** Unbiased pick from the alphabet: bytes that would favour the first few symbols are thrown away (rejection sampling). */
function makeSampler(alphabet: string, fill: RandomBytes): () => string {
  const size = alphabet.length;
  const limit = 256 - (256 % size);
  const pool = new Uint8Array(256);
  let at = pool.length;
  return () => {
    for (let thrown = 0; ; ) {
      if (at >= pool.length) {
        fill(pool);
        at = 0;
      }
      const byte = pool[at++];
      if (byte < limit) return alphabet[byte % size];
      // A real random source throws away about 1 byte in 30. A long unbroken run means the source is broken: stop, do not spin.
      if (++thrown > 10_000) throw new Error('The random source is not producing usable values.');
    }
  };
}

/** Puts a prefix in front of a code as PREFIX-CODE. The prefix is cleaned first; an empty one leaves the code as it is. */
export function applyPrefix(prefix: string, code: string): string {
  const clean = cleanPrefix(prefix);
  return clean ? `${clean}-${code}` : code;
}

function layout(prefix: string, body: string, groupSize: number): string {
  let grouped = body;
  if (groupSize > 0 && groupSize < body.length) {
    const parts: string[] = [];
    for (let i = 0; i < body.length; i += groupSize) parts.push(body.slice(i, i + groupSize));
    grouped = parts.join('-');
  }
  return applyPrefix(prefix, grouped);
}

/**
 * Makes `count` different codes. Throws `CouponError` (with plain-English text) for a request that cannot be met.
 * The second argument exists for tests; leave it out to use the secure random source.
 */
export function generateCoupons(options: CouponOptions, fill: RandomBytes = secureRandom): string[] {
  const { count, length, prefix, groupSize, charset } = settle(options);
  const next = makeSampler(CHARSETS[charset], fill);
  const seen = new Set<string>();
  const codes: string[] = [];
  const budget = count * 20 + 1000;
  for (let tries = 0; codes.length < count; tries++) {
    if (tries > budget) throw new CouponError('unique_failed', 'Could not make that many different codes. Try a longer code.');
    let body = '';
    for (let i = 0; i < length; i++) body += next();
    if (seen.has(body)) continue;
    seen.add(body);
    codes.push(layout(prefix, body, groupSize));
  }
  return codes;
}
