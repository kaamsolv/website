/**
 * Interest and investment maths for the SIP, FD, RD, simple-interest and compound-interest calculators.
 * Framework-free and pure. Every convention is stated on the page that uses it:
 *
 *   SIP      money goes in at the START of each month, monthly rate = annual rate / 12:
 *              value = P x ((1+i)^n - 1) / i x (1+i)        (with an optional yearly step-up, worked month by month)
 *   FD       A = P (1 + r/n)^(n t), compounding n times a year (quarterly is the usual bank default)
 *   RD       monthly deposits, interest compounded QUARTERLY, each deposit growing for its own remaining months:
 *              M = R x sum over k of (1 + r/4)^(months left / 3)
 *   Simple   I = P r t / 100, time = years + months/12 + days/365
 *   Compound A = P (1 + r/n)^(n t)
 *
 * Money is rounded to the paisa only at the very end; nothing is rounded in between. Banks round and count days a
 * little differently, so a bank's own figure can differ by a few rupees (the pages say so). Invalid input returns
 * null, never NaN.
 */

export const INTEREST_LIMITS = {
  /** Largest amount accepted: Rs 100 crore. */
  maxAmount: 1_000_000_000,
  maxYears: 50,
  /** Highest annual rate, in percent, for deposits and plain interest. */
  maxRate: 25,
  /** Highest assumed annual return for a SIP, in percent. */
  maxSipRate: 50,
  maxStepUp: 50,
  /** Highest yearly inflation, in percent, for the today's-money view. */
  maxInflation: 12,
  /** Highest tax rate, in percent, for the tax estimate. */
  maxTax: 40,
} as const;

export type Compounding = 'daily' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';

/** Times a year interest is added. */
export const COMPOUNDING_PER_YEAR: Record<Compounding, number> = { daily: 365, monthly: 12, quarterly: 4, 'half-yearly': 2, yearly: 1 };

export const COMPOUNDING_LABELS: Record<Compounding, string> = {
  daily: 'Daily',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  yearly: 'Yearly',
};

/** Round to the nearest paisa (half away from zero). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const okAmount = (n: number) => Number.isFinite(n) && n > 0 && n <= INTEREST_LIMITS.maxAmount;
const okRate = (n: number, max: number) => Number.isFinite(n) && n >= 0 && n <= max;
const okMonths = (n: number) => Number.isInteger(n) && n >= 1 && n <= INTEREST_LIMITS.maxYears * 12;

/** One row of a year-by-year table. `balance` is what the money is worth at the end of that year. */
export type YearRow = { year: number; invested: number; balance: number; interest: number };

// ─── SIP ────────────────────────────────────────────────────────────────────────────────────────────

export type SipResult = { invested: number; value: number; returns: number; months: number; yearly: YearRow[] };

/**
 * A monthly SIP. `stepUpPercent` raises the monthly amount by that percent at the start of each new year (0 = flat).
 * Worked month by month: add the month's amount, then let the whole balance earn one month of return.
 */
export function sip(monthly: number, annualRatePercent: number, months: number, stepUpPercent = 0): SipResult | null {
  if (!okAmount(monthly) || !okRate(annualRatePercent, INTEREST_LIMITS.maxSipRate) || !okMonths(months) || !okRate(stepUpPercent, INTEREST_LIMITS.maxStepUp)) return null;
  const i = annualRatePercent / 100 / 12;
  let balance = 0;
  let invested = 0;
  let amount = monthly;
  const yearly: YearRow[] = [];
  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % 12 === 0) amount = amount * (1 + stepUpPercent / 100);
    balance = (balance + amount) * (1 + i);
    invested += amount;
    if (m % 12 === 0 || m === months) {
      yearly.push({ year: Math.ceil(m / 12), invested: round2(invested), balance: round2(balance), interest: round2(balance - invested) });
    }
  }
  return { invested: round2(invested), value: round2(balance), returns: round2(balance - invested), months, yearly };
}

/** The closed form for a flat SIP: P x ((1+i)^n - 1) / i x (1+i). Used to check `sip`. */
export function sipClosedForm(monthly: number, annualRatePercent: number, months: number): number {
  const i = annualRatePercent / 100 / 12;
  return i === 0 ? monthly * months : round2(monthly * (((1 + i) ** months - 1) / i) * (1 + i));
}

// ─── Compound growth (FD, compound interest) ────────────────────────────────────────────────────────────

export type GrowthResult = { principal: number; maturity: number; interest: number; months: number; yearly: YearRow[] };

/** A = P (1 + r/n)^(n t) for `months` months, with interest added `timesPerYear` times a year. */
export function compound(principal: number, annualRatePercent: number, months: number, compounding: Compounding): GrowthResult | null {
  if (!okAmount(principal) || !okRate(annualRatePercent, INTEREST_LIMITS.maxRate) || !okMonths(months)) return null;
  const n = COMPOUNDING_PER_YEAR[compounding];
  const r = annualRatePercent / 100;
  const at = (m: number) => principal * (1 + r / n) ** (n * (m / 12));
  const yearly: YearRow[] = [];
  for (let y = 1; y <= Math.ceil(months / 12); y++) {
    const m = Math.min(y * 12, months);
    yearly.push({ year: y, invested: round2(principal), balance: round2(at(m)), interest: round2(at(m) - principal) });
  }
  const maturity = at(months);
  return { principal: round2(principal), maturity: round2(maturity), interest: round2(maturity - principal), months, yearly };
}

// ─── RD ─────────────────────────────────────────────────────────────────────────────────────────────────

export type RdResult = { invested: number; maturity: number; interest: number; months: number; yearly: YearRow[] };

/**
 * A recurring deposit: `monthly` paid at the start of each month, interest compounded quarterly. The deposit made in
 * month k earns for the months that remain, as (1 + r/4)^(months left / 3).
 */
export function rd(monthly: number, annualRatePercent: number, months: number): RdResult | null {
  if (!okAmount(monthly) || !okRate(annualRatePercent, INTEREST_LIMITS.maxRate) || !okMonths(months)) return null;
  const q = 1 + annualRatePercent / 100 / 4;
  const valueAt = (m: number) => {
    let total = 0;
    for (let k = 1; k <= m; k++) total += monthly * q ** ((m - k + 1) / 3);
    return total;
  };
  const yearly: YearRow[] = [];
  for (let y = 1; y <= Math.ceil(months / 12); y++) {
    const m = Math.min(y * 12, months);
    const v = valueAt(m);
    yearly.push({ year: y, invested: round2(monthly * m), balance: round2(v), interest: round2(v - monthly * m) });
  }
  const maturity = valueAt(months);
  return { invested: round2(monthly * months), maturity: round2(maturity), interest: round2(maturity - monthly * months), months, yearly };
}

/** The closed form for an RD: R x ((1+i)^(N/3) - 1) / (1 - (1+i)^(-1/3)), i = r/4. Used to check `rd`. */
export function rdClosedForm(monthly: number, annualRatePercent: number, months: number): number {
  const i = annualRatePercent / 100 / 4;
  return i === 0 ? monthly * months : round2((monthly * ((1 + i) ** (months / 3) - 1)) / (1 - (1 + i) ** (-1 / 3)));
}

// ─── Simple interest ───────────────────────────────────────────────────────────────────────────────────

export type SimpleResult = { principal: number; interest: number; total: number; years: number };

/** I = P r t / 100, where t = years + months/12 + days/365. */
export function simpleInterest(principal: number, annualRatePercent: number, years: number, months: number, days: number): SimpleResult | null {
  if (!okAmount(principal) || !okRate(annualRatePercent, INTEREST_LIMITS.maxRate)) return null;
  if (![years, months, days].every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (years > INTEREST_LIMITS.maxYears || months > 11 * 12 || days > 365 * 50) return null;
  const t = years + months / 12 + days / 365;
  if (t <= 0 || t > INTEREST_LIMITS.maxYears) return null;
  const interest = (principal * annualRatePercent * t) / 100;
  return { principal: round2(principal), interest: round2(interest), total: round2(principal + interest), years: t };
}

// ─── Value-adds: reach a goal, today's money, tax estimate ───────────────────────────────────────────────

/**
 * The smallest whole-rupee amount whose `valueOf(amount)` reaches `target`. Every result here grows in a straight line
 * with the amount, so a first estimate from a large test amount is nearly exact; it is then nudged up or down until it is
 * the smallest amount that does not fall short. Null if the target or the answer is out of range.
 */
function solveGoal(valueOf: (amount: number) => number | null, target: number): number | null {
  if (!okAmount(target)) return null;
  const probe = 1_000_000;
  const at = valueOf(probe);
  if (at === null || at <= 0) return null;
  let amount = Math.max(1, Math.ceil((target / at) * probe));
  const reaches = (a: number) => {
    const v = valueOf(a);
    return v !== null && v >= target;
  };
  for (let i = 0; i < 5 && !reaches(amount); i++) amount += 1;
  while (amount > 1 && reaches(amount - 1)) amount -= 1;
  return okAmount(amount) && reaches(amount) ? amount : null;
}

/** Monthly SIP needed to reach `target` after `months`, whole rupees, rounded up so it never falls short. */
export const goalSip = (target: number, annualRatePercent: number, months: number, stepUpPercent = 0): number | null =>
  solveGoal((a) => sip(a, annualRatePercent, months, stepUpPercent)?.value ?? null, target);

/** Monthly RD deposit needed to reach `target` at maturity. */
export const goalRd = (target: number, annualRatePercent: number, months: number): number | null =>
  solveGoal((a) => rd(a, annualRatePercent, months)?.maturity ?? null, target);

/** One-time deposit (FD or compound interest) needed today to reach `target` at maturity. */
export const goalCompound = (target: number, annualRatePercent: number, months: number, compounding: Compounding): number | null =>
  solveGoal((a) => compound(a, annualRatePercent, months, compounding)?.maturity ?? null, target);

/** What `nominal` rupees, received after `years`, buy in today's money at `inflationPercent` a year. */
export function realValue(nominal: number, inflationPercent: number, years: number): number | null {
  if (!Number.isFinite(nominal) || nominal < 0 || !okRate(inflationPercent, INTEREST_LIMITS.maxInflation) || !Number.isFinite(years) || years <= 0 || years > INTEREST_LIMITS.maxYears) return null;
  return round2(nominal / (1 + inflationPercent / 100) ** years);
}

export type TaxResult = { tax: number; afterTaxInterest: number; afterTaxTotal: number };

/** A plain estimate: `taxPercent` of the interest, nothing else (no TDS, rebate, surcharge or cess). */
export function afterTax(principalOrInvested: number, interest: number, taxPercent: number): TaxResult | null {
  if (!Number.isFinite(principalOrInvested) || principalOrInvested < 0 || !Number.isFinite(interest) || interest < 0 || !okRate(taxPercent, INTEREST_LIMITS.maxTax)) return null;
  const tax = round2((interest * taxPercent) / 100);
  return { tax, afterTaxInterest: round2(interest - tax), afterTaxTotal: round2(principalOrInvested + interest - tax) };
}
