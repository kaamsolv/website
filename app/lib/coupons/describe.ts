/**
 * Plain-words helpers for the Coupon Code Generator page: big numbers in lakh and crore, and the "how hard is this to
 * guess" sentence. Framework-free, so the wording is tested like any other logic.
 */

const oneDecimalBelow100 = (x: number): string => (x < 100 ? String(Math.round(x * 10) / 10) : Math.round(x).toLocaleString('en-IN'));

/** 8528910374 → "853 crore", 250000 → "2.5 lakh", 9500 → "9,500". From a lakh crore up it is "a lakh crore". */
export function plainNumber(n: number): string {
  if (n < 1e5) return Math.round(n).toLocaleString('en-IN');
  if (n < 1e7) return `${oneDecimalBelow100(n / 1e5)} lakh`;
  if (n < 1e12) return `${oneDecimalBelow100(n / 1e7)} crore`;
  return 'a lakh crore';
}

export type GuessOdds = {
  /** "about 1 time in 853 crore" or "less than 1 time in a lakh crore". */
  phrase: string;
  /** Under 1 in 10 lakh: a guess could hit a code now and then. Worth a warning when codes are worth real money. */
  weak: boolean;
  /** 6 to 100: how full to draw the strength bar (log scale, 1 in 100 up to 1 in a lakh crore). */
  percent: number;
};

/** `oneIn` is how many guesses it takes, on average, to hit one of your codes by luck (see `describeStrength`). */
export function describeOdds(oneIn: number): GuessOdds {
  const phrase = oneIn >= 1e12 ? 'less than 1 time in a lakh crore' : `about 1 time in ${plainNumber(oneIn)}`;
  const percent = Math.round(Math.min(100, Math.max(6, ((Math.log10(Math.max(1, oneIn)) - 2) / 10) * 100)));
  return { phrase, weak: oneIn < 1e6, percent };
}
