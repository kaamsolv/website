/**
 * HRA exemption (old regime), India. Framework-free and pure. An estimate for planning, not tax advice.
 *
 * The exemption is the LEAST of three amounts (all for the same period, a month or a year):
 *   (a) the HRA you actually receive,
 *   (b) the rent you pay, minus one tenth of your salary,
 *   (c) 50% of salary if your home is in one of the named cities, else 40%.
 * "Salary" here is basic pay plus dearness allowance (DA) when DA is provided for under the terms of employment. Bonus,
 * other allowances and perquisites are left out.
 *
 * Rules (checked 4 Nov 2026):
 *   FY 2026-27 onward: Income-tax Rules 2026, rule 279 (in force from 1 April 2026): 50% for Mumbai, Kolkata, Delhi, Chennai,
 *   Hyderabad, Pune, Ahmedabad and Bengaluru. Source: incometaxindia.gov.in/w/rule-279-1 (read directly).
 *   Up to FY 2025-26: Income-tax Rules 1962, rule 2A: 50% for Delhi, Mumbai, Kolkata and Chennai only (per the Department's
 *   explanatory pages and ClearTax, not the rule text itself).
 * The new tax regime allows no HRA exemption. Not modelled: commission, part-year stays, rent paid to a relative, and
 * how a particular payroll applies the rule. Re-check HRA_RULES_CHECKED after every Budget or amendment to the Rules.
 */

import { incomeTax, SALARY_RULES } from './salary';

export const HRA_RULES_CHECKED = 'November 2026';

export type HraYear = '2026-27' | '2025-26';

export const HRA_CITIES = ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad'] as const;
export type HraCity = (typeof HRA_CITIES)[number] | 'Other';

export const HRA_RULES = {
  /** Cities at the higher percentage, by financial year. */
  highCities: {
    '2026-27': ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad'],
    '2025-26': ['Delhi', 'Mumbai', 'Kolkata', 'Chennai'],
  } satisfies Record<HraYear, readonly string[]>,
  highPercent: 50,
  lowPercent: 40,
  /** Rent is reduced by this share of salary. */
  rentSharePercent: 10,
} as const;

export const HRA_LIMITS = { maxAmount: 1_000_000_000 };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The percentage of salary that caps the exemption, for a city in a year. */
export function cityPercent(city: HraCity, year: HraYear): 50 | 40 {
  return (HRA_RULES.highCities[year] as readonly string[]).includes(city) ? 50 : 40;
}

export type HraLimit = 'received' | 'rent' | 'cap';

export type HraInput = {
  /** Basic pay for the period. */
  basic: number;
  /** DA that forms part of pay under the terms of employment (0 if none). */
  da: number;
  /** HRA you actually receive. */
  hraReceived: number;
  /** Rent you actually pay. */
  rent: number;
  city: HraCity;
  year: HraYear;
};

export type HraResult = {
  /** Basic + DA. */
  salary: number;
  /** 50 or 40. */
  percent: 50 | 40;
  limits: { received: number; rentOver: number; cap: number };
  /** The smallest limit(s); more than one when they tie. */
  binding: HraLimit[];
  exempt: number;
  taxable: number;
};

/** Every amount is for the same period (all monthly, or all yearly). Returns null for invalid input. */
export function hra(input: HraInput): HraResult | null {
  const { basic, da, hraReceived, rent, city, year } = input;
  const nums = [basic, da, hraReceived, rent];
  if (!nums.every((n) => Number.isFinite(n) && n >= 0 && n <= HRA_LIMITS.maxAmount)) return null;
  if (basic <= 0) return null;
  if (!(year in HRA_RULES.highCities)) return null;
  const percent = cityPercent(city, year);
  const salary = basic + da;
  const received = hraReceived;
  const rentOver = Math.max(0, rent - (salary * HRA_RULES.rentSharePercent) / 100);
  const cap = (salary * percent) / 100;
  const exempt = Math.min(received, rentOver, cap);
  const binding = (['received', 'rent', 'cap'] as const).filter((k) => ({ received, rent: rentOver, cap })[k] === exempt) as HraLimit[];
  return {
    salary: round2(salary),
    percent,
    limits: { received: round2(received), rentOver: round2(rentOver), cap: round2(cap) },
    binding,
    exempt: round2(exempt),
    taxable: round2(Math.max(0, hraReceived - exempt)),
  };
}

export type RentForMax = { rent: number; exempt: number; extra: number };

/**
 * The smallest whole-rupee rent that makes the exemption as large as it can get with your HRA and city, and what that adds.
 * Null when the rent you pay already gets you there (or the input is invalid). Information only: it is never a suggestion to
 * pay more rent than you really do.
 */
export function rentForMaxExemption(input: HraInput): RentForMax | null {
  const now = hra(input);
  if (!now) return null;
  const best = Math.min(now.limits.received, now.limits.cap);
  if (now.exempt >= best) return null;
  const needed = Math.ceil(best + (now.salary * HRA_RULES.rentSharePercent) / 100 - 1e-9);
  return { rent: needed, exempt: round2(best), extra: round2(best - now.exempt) };
}

export type RegimeCheckInput = {
  /** Yearly taxable salary before the standard deduction, HRA included. */
  grossYearly: number;
  /** Yearly HRA exemption from `hra()` (yearly). */
  hraExemptYearly: number;
  /** Other old-regime deductions a year: 80C, 80D, home-loan interest, and so on. */
  otherDeductionsYearly: number;
};

export type RegimeCheck = {
  old: { taxable: number; tax: number };
  new: { taxable: number; tax: number };
  better: 'old' | 'new' | 'same';
  /** How much less tax the better regime costs, ₹ a year. */
  saving: number;
};

/**
 * Old versus new regime tax on salary alone, using the same slab engine as the Salary Calculator (FY 2026-27 rules).
 * Excludes professional tax, other income and anything else outside salary. Returns null for invalid input.
 */
export function regimeCheck(input: RegimeCheckInput): RegimeCheck | null {
  const { grossYearly, hraExemptYearly, otherDeductionsYearly } = input;
  const nums = [grossYearly, hraExemptYearly, otherDeductionsYearly];
  if (!nums.every((n) => Number.isFinite(n) && n >= 0 && n <= HRA_LIMITS.maxAmount)) return null;
  if (grossYearly <= 0) return null;
  const sd = SALARY_RULES.standardDeduction;
  const oldTaxable = Math.max(0, grossYearly - Math.min(sd.old, grossYearly) - hraExemptYearly - otherDeductionsYearly);
  const newTaxable = Math.max(0, grossYearly - Math.min(sd.new, grossYearly));
  const oldTax = incomeTax(oldTaxable, 'old').tax;
  const newTax = incomeTax(newTaxable, 'new').tax;
  const better = oldTax === newTax ? 'same' : oldTax < newTax ? 'old' : 'new';
  return {
    old: { taxable: oldTaxable, tax: oldTax },
    new: { taxable: newTaxable, tax: newTax },
    better,
    saving: Math.abs(oldTax - newTax),
  };
}
