/**
 * Salary calculator: CTC → in-hand, India, FY 2026-27. Framework-free and pure.
 * An estimate for planning — not tax advice. Rules are in SALARY_RULES; keep
 * SALARY_RULES_CHECKED current when any of them change (Budget, EPFO ceiling,
 * labour-code rules). Sources: docs/DECISIONS.md (2026-10-25).
 *
 * Assumptions: resident individual under 60, salary income only, FY 2026-27
 * (Income-tax Act 2025; slabs unchanged from FY 2025-26). No ESI or NPS.
 */

export type Regime = 'new' | 'old';

type Slab = readonly [upTo: number, rate: number];

export const SALARY_RULES = {
  slabs: {
    new: [
      [400_000, 0],
      [800_000, 0.05],
      [1_200_000, 0.1],
      [1_600_000, 0.15],
      [2_000_000, 0.2],
      [2_400_000, 0.25],
      [Infinity, 0.3],
    ],
    // Under 60. Senior-citizen slabs are not used.
    old: [
      [250_000, 0],
      [500_000, 0.05],
      [1_000_000, 0.2],
      [Infinity, 0.3],
    ],
  } satisfies Record<Regime, readonly Slab[]>,
  standardDeduction: { new: 75_000, old: 50_000 },
  /** Tax is nil up to `limit` of taxable income. New regime has marginal relief above it. */
  rebate: { new: { limit: 1_200_000, max: 60_000 }, old: { limit: 500_000, max: 12_500 } },
  /** Surcharge on income above each threshold, with marginal relief at each one. */
  surcharge: {
    new: [
      [5_000_000, 0.1],
      [10_000_000, 0.15],
      [20_000_000, 0.25],
    ],
    old: [
      [5_000_000, 0.1],
      [10_000_000, 0.15],
      [20_000_000, 0.25],
      [50_000_000, 0.37],
    ],
  } satisfies Record<Regime, readonly (readonly [number, number])[]>,
  cess: 0.04,
  pf: {
    rate: 0.12,
    /** EPF wage ceiling, ₹25,000/month from 17 Sep 2026 (PIB). Used for the whole FY, not prorated. */
    wageCeilingMonthly: 25_000,
  },
  /** Constitutional cap on professional tax a year. */
  professionalTaxYearlyMax: 2_500,
} as const;

export const SALARY_RULES_CHECKED = 'October 2026';

export const SALARY_LIMITS = {
  ctc: { min: 1, max: 100_000_000 },
  basicPercent: { min: 30, max: 70 },
  professionalTaxMonthly: { min: 0, max: 300 },
};

const r0 = (n: number) => Math.round(n);

function slabTax(taxable: number, regime: Regime): number {
  let tax = 0;
  let from = 0;
  for (const [upTo, rate] of SALARY_RULES.slabs[regime]) {
    if (taxable <= from) break;
    tax += (Math.min(taxable, upTo) - from) * rate;
    from = upTo;
  }
  return tax;
}

/** Slab tax after the rebate (and, in the new regime, marginal relief just above the rebate limit). */
function taxAfterRebate(taxable: number, regime: Regime): number {
  const tax = slabTax(taxable, regime);
  const { limit, max } = SALARY_RULES.rebate[regime];
  if (taxable <= limit) return Math.max(0, tax - max);
  // New regime: tax can't exceed the income above the limit.
  return regime === 'new' ? Math.min(tax, taxable - limit) : tax;
}

/** Tax + surcharge, with marginal relief: crossing a threshold can't cost more than the income above it. */
function taxWithSurcharge(taxable: number, regime: Regime): number {
  const base = taxAfterRebate(taxable, regime);
  const bands = SALARY_RULES.surcharge[regime];
  for (let i = bands.length - 1; i >= 0; i--) {
    const [threshold, rate] = bands[i];
    if (taxable > threshold) {
      const atThreshold = taxWithSurcharge(threshold, regime);
      return Math.min(base * (1 + rate), atThreshold + (taxable - threshold));
    }
  }
  return base;
}

export type TaxResult = {
  taxable: number;
  /** Income tax + surcharge, after rebate and marginal relief, before cess. */
  taxBeforeCess: number;
  cess: number;
  /** Total tax for the year, cess included. */
  tax: number;
};

export function incomeTax(taxable: number, regime: Regime): TaxResult {
  const t = Math.max(0, taxable);
  const taxBeforeCess = r0(taxWithSurcharge(t, regime));
  const cess = r0(taxBeforeCess * SALARY_RULES.cess);
  return { taxable: t, taxBeforeCess, cess, tax: taxBeforeCess + cess };
}

export type SalaryInput = {
  /** Annual CTC, ₹. */
  ctc: number;
  /** Variable pay / bonus included in the CTC, ₹ a year. */
  variable?: number;
  /** Basic as % of fixed CTC. Default 50 (labour codes: wages ≥ 50% of pay). */
  basicPercent?: number;
  /** PF on basic capped at the EPF wage ceiling (default) or on the full basic. */
  pfCapped?: boolean;
  /** Employer PF is part of the CTC (default). */
  employerPfInCtc?: boolean;
  /** Gratuity is part of the CTC (default). */
  gratuityInCtc?: boolean;
  professionalTaxMonthly?: number;
  /** Old regime only: 80C (incl. your PF), 80D, HRA exemption, home-loan interest… ₹ a year. */
  oldRegimeDeductions?: number;
};

export type RegimeResult = {
  regime: Regime;
  /** Tax on the whole year's salary, variable pay included. */
  tax: TaxResult;
  /** Tax that belongs to the variable pay: tax(with it) − tax(without it). */
  variableTax: number;
  /** Fixed take-home a month, excluding the tax attributable to variable pay. */
  monthlyInHand: number;
  /** Variable pay after its tax. */
  variableInHand: number;
  /** Everything you take home in the year. */
  yearlyInHand: number;
};

export type SalaryResult = {
  ctc: number;
  variable: number;
  /** Annual figures. */
  basic: number;
  allowances: number;
  employerPf: number;
  gratuity: number;
  /** CTC − employer PF − gratuity (what your payslip calls gross, variable included). */
  gross: number;
  employeePf: number;
  professionalTax: number;
  new: RegimeResult;
  old: RegimeResult;
};

/** CTC → in-hand for both regimes. Returns null for invalid input. */
export function salary(input: SalaryInput): SalaryResult | null {
  const {
    ctc,
    variable = 0,
    basicPercent = 50,
    pfCapped = true,
    employerPfInCtc = true,
    gratuityInCtc = true,
    professionalTaxMonthly = 200,
    oldRegimeDeductions = 0,
  } = input;
  const nums = [ctc, variable, basicPercent, professionalTaxMonthly, oldRegimeDeductions];
  if (!nums.every(Number.isFinite)) return null;
  const L = SALARY_LIMITS;
  if (ctc < L.ctc.min || ctc > L.ctc.max) return null;
  if (variable < 0 || variable >= ctc) return null;
  if (basicPercent < L.basicPercent.min || basicPercent > L.basicPercent.max) return null;
  if (professionalTaxMonthly < L.professionalTaxMonthly.min || professionalTaxMonthly > L.professionalTaxMonthly.max) return null;
  if (oldRegimeDeductions < 0) return null;

  const fixed = ctc - variable;
  const basic = r0((fixed * basicPercent) / 100);
  const monthlyBasic = basic / 12;
  const pfWage = pfCapped ? Math.min(monthlyBasic, SALARY_RULES.pf.wageCeilingMonthly) : monthlyBasic;
  const pfMonthly = r0(pfWage * SALARY_RULES.pf.rate);
  const employeePf = pfMonthly * 12;
  const employerPf = employerPfInCtc ? pfMonthly * 12 : 0;
  // `basic` is ANNUAL basic: 15 days' wages per year of service, a month taken as
  // 26 working days → annual basic × 15/26 ÷ 12 (≈ 4.81%) = monthly basic × 15/26.
  const gratuity = gratuityInCtc ? r0((basic * 15) / 26 / 12) : 0;
  const allowances = fixed - basic - employerPf - gratuity;
  if (allowances < 0) return null;

  const gross = ctc - employerPf - gratuity;
  const grossFixed = gross - variable;
  const professionalTax = Math.min(r0(professionalTaxMonthly) * 12, SALARY_RULES.professionalTaxYearlyMax);

  const forRegime = (regime: Regime): RegimeResult => {
    // Professional tax is cash paid ONCE (subtracted from in-hand below). In the
    // old regime it also lowers taxable income — a tax deduction, not a second payment.
    const deductions =
      regime === 'old' ? professionalTax + oldRegimeDeductions : 0;
    const taxable = (g: number) => g - Math.min(SALARY_RULES.standardDeduction[regime], g) - deductions;
    const tax = incomeTax(taxable(gross), regime);
    const fixedTax = incomeTax(taxable(grossFixed), regime);
    const variableTax = tax.tax - fixedTax.tax;
    const yearlyInHand = gross - employeePf - professionalTax - tax.tax;
    const variableInHand = variable - variableTax;
    return {
      regime,
      tax,
      variableTax,
      monthlyInHand: (yearlyInHand - variableInHand) / 12,
      variableInHand,
      yearlyInHand,
    };
  };

  return {
    ctc,
    variable,
    basic,
    allowances,
    employerPf,
    gratuity,
    gross,
    employeePf,
    professionalTax,
    new: forRegime('new'),
    old: forRegime('old'),
  };
}
