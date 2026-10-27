/**
 * The Gratuity Calculator's rules, in one place. Framework-free.
 *
 * What it computes: the formula amount under the Payment of Gratuity Act (carried into the Code on
 * Social Security): last drawn wages x 15 x counted years / 26, up to the Rs 20,00,000 maximum. Whether an
 * employer owes it, how an employer outside the Act pays, and tax are NOT computed (notes on the page).
 *
 * The rules are from secondary sources and the law changed on 21 November 2025; see
 * docs/products/gratuity-calculator.md for what is and isn't certain. Money is whole paise as BigInt, so
 * nothing is rounded until the final rupee.
 */

import { figuresIndian, parseAmountText } from '../invoice/words';
import { compareYmd, countedYears, formatYmd, hasReached, parseYmd, reachedOn, servicePeriod, type Service, type Ymd } from './service';

export type Employment = 'permanent' | 'fixed';
export type Reason = 'leaving' | 'death-disability';

/** The maximum gratuity under the Act, in rupees. An employer may pay more by choice. */
export const GRATUITY_CAP_RUPEES = 2_000_000;
/** Whole years of service needed: permanent employees, and fixed-term employees under the new codes. */
export const MIN_YEARS: Record<Employment, number> = { permanent: 5, fixed: 1 };
/** A sanity ceiling on monthly wages in rupees (not a rule): above it is almost certainly a typing slip. */
export const MAX_MONTHLY_WAGES = 10_000_000;
/** When the rules in this file were last checked, shown on the page. */
export const RULES_AS_OF = '27 October 2026';

export type GratuityInput = {
  /** Monthly wages as typed: "50000", "50,000", "₹ 52,500.50". */
  wages: string;
  /** "YYYY-MM-DD" (a date input's value). */
  joined: string;
  lastDay: string;
  employment: Employment;
  reason: Reason;
};

export type Field = 'wages' | 'joined' | 'lastDay';

export type GratuityOutcome = {
  service: Service;
  /** Years that count for the formula (more than six months of the last year rounds up). */
  counted: number;
  /** Whole years of service needed, or null on death or disability (no minimum). */
  minYears: number | null;
  eligible: boolean;
  /** When not yet eligible: the last working day on which the minimum is complete. */
  eligibleOn: string | null;
  /** Rupees, rounded to the nearest rupee (half up); null when not eligible. */
  amount: bigint | null;
  /** The formula amount before the maximum, in rupees; null when not eligible. */
  uncapped: bigint | null;
  capped: boolean;
  /** "₹50,000 × 15 × 10 ÷ 26" */
  working: string;
  wagesFigures: string;
  joinedLabel: string;
  lastDayLabel: string;
};

export type GratuityResult = { ok: true; outcome: GratuityOutcome } | { ok: false; errors: Partial<Record<Field, string>> };

const PAISE = BigInt(100);

/** Rounds a paise amount x counted years x 15 / 26 to the nearest rupee, half up. */
function formulaRupees(wagesPaise: bigint, counted: number): bigint {
  const numerator = wagesPaise * BigInt(15) * BigInt(counted);
  const denominator = BigInt(26) * PAISE;
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
}

export function calculateGratuity(input: GratuityInput): GratuityResult {
  const errors: Partial<Record<Field, string>> = {};

  const joined = parseYmd(input.joined);
  const lastDay = parseYmd(input.lastDay);
  if (!input.joined.trim()) errors.joined = 'Enter your joining date.';
  else if (!joined) errors.joined = 'Use a real date between 1950 and 2100.';
  if (!input.lastDay.trim()) errors.lastDay = 'Enter your last working day.';
  else if (!lastDay) errors.lastDay = 'Use a real date between 1950 and 2100.';
  if (joined && lastDay && compareYmd(lastDay, joined) < 0) errors.lastDay = 'The last working day can’t be before the joining date.';

  const parsed = parseAmountText(input.wages);
  let wagesPaise: bigint | null = null;
  let wagesFigures = '';
  if (!parsed.ok) errors.wages = parsed.empty ? 'Enter your last drawn monthly wages.' : parsed.message;
  else if (parsed.parts.rupees === BigInt(0) && parsed.parts.paise === 0) errors.wages = 'Enter your last drawn monthly wages.';
  else if (parsed.parts.rupees > BigInt(MAX_MONTHLY_WAGES)) errors.wages = 'That looks too high for monthly wages. Check the amount.';
  else {
    wagesPaise = parsed.parts.rupees * PAISE + BigInt(parsed.parts.paise);
    wagesFigures = `₹${figuresIndian(parsed.parts)}`;
  }

  if (Object.keys(errors).length || !joined || !lastDay || wagesPaise === null) return { ok: false, errors };

  const minYears = input.reason === 'death-disability' ? null : MIN_YEARS[input.employment];
  const eligible = minYears === null || hasReached(joined, lastDay, minYears);
  const counted = countedYears(joined, lastDay);
  const uncapped = eligible ? formulaRupees(wagesPaise, counted) : null;
  const cap = BigInt(GRATUITY_CAP_RUPEES);
  const capped = uncapped !== null && uncapped > cap;

  return {
    ok: true,
    outcome: {
      service: servicePeriod(joined, lastDay),
      counted,
      minYears,
      eligible,
      eligibleOn: !eligible && minYears !== null ? formatYmd(reachedOn(joined, minYears) as Ymd) : null,
      amount: uncapped === null ? null : capped ? cap : uncapped,
      uncapped,
      capped,
      working: `${wagesFigures} × 15 × ${counted} ÷ 26`,
      wagesFigures,
      joinedLabel: formatYmd(joined),
      lastDayLabel: formatYmd(lastDay),
    },
  };
}

/** "7 years, 8 months, 3 days" (zero parts left out; "less than a day" for none). */
export function serviceLabel(s: Service): string {
  const part = (n: number, unit: string) => (n ? `${n} ${unit}${n === 1 ? '' : 's'}` : '');
  return [part(s.years, 'year'), part(s.months, 'month'), part(s.days, 'day')].filter(Boolean).join(', ') || 'less than a day';
}
