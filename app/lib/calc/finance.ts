/**
 * GST and EMI calculators. Framework-free and pure; results are rounded to
 * paise only at the end. These are estimates for planning — not tax advice.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const finite = (...ns: number[]) => ns.every((n) => Number.isFinite(n));

// ----------------------------------------------------------------------- GST

/**
 * Main GST rates since 22 Sept 2025 (56th GST Council meeting, PIB release
 * PRID 2163555): 5% merit, 18% standard, 40% for a few demerit/luxury items.
 * Other rates (special items, or older invoices at 12% / 28%) go in "Custom".
 * Keep `GST_RATES_CHECKED` current when this list changes.
 */
export const GST_PRESET_RATES = [5, 18, 40] as const;
export const GST_RATES_CHECKED = 'October 2026';

export type GstMode = 'add' | 'remove';

export type GstResult = {
  /** Price before GST (taxable value). */
  base: number;
  gst: number;
  /** Price including GST. */
  total: number;
  /** Intra-state: CGST + SGST, half each. */
  cgst: number;
  sgst: number;
  /** Inter-state: IGST, the full amount. */
  igst: number;
};

/**
 * `add`: `amount` is the price before GST. `remove`: `amount` already includes
 * GST, and the base is backed out of it.
 */
export function gst(amount: number, ratePercent: number, mode: GstMode): GstResult | null {
  if (!finite(amount, ratePercent) || amount < 0 || ratePercent < 0 || ratePercent > 100) return null;
  const base = mode === 'add' ? amount : amount / (1 + ratePercent / 100);
  const tax = (base * ratePercent) / 100;
  const total = mode === 'add' ? amount + tax : amount;
  const half = round2(tax / 2);
  return {
    base: round2(base),
    gst: round2(tax),
    total: round2(total),
    cgst: half,
    sgst: round2(round2(tax) - half),
    igst: round2(tax),
  };
}

// ----------------------------------------------------------------------- EMI

export type EmiRow = {
  month: number;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
};

export type EmiYear = { year: number; principal: number; interest: number; balance: number };

export type EmiResult = {
  emi: number;
  totalInterest: number;
  totalPayment: number;
  months: number;
  schedule: EmiRow[];
  byYear: EmiYear[];
};

export const EMI_LIMITS = {
  principal: { min: 1, max: 1_000_000_000 },
  rate: { min: 0, max: 50 },
  months: { min: 1, max: 480 },
};

/**
 * Monthly reducing-balance EMI: EMI = P·r·(1+r)^n / ((1+r)^n − 1), r = annual
 * rate / 12 / 100. The last instalment absorbs rounding so the balance ends at 0.
 */
export function emi(principal: number, annualRatePercent: number, months: number): EmiResult | null {
  const L = EMI_LIMITS;
  if (!finite(principal, annualRatePercent, months) || !Number.isInteger(months)) return null;
  if (principal < L.principal.min || principal > L.principal.max) return null;
  if (annualRatePercent < L.rate.min || annualRatePercent > L.rate.max) return null;
  if (months < L.months.min || months > L.months.max) return null;

  const r = annualRatePercent / 12 / 100;
  const rawEmi = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const monthly = round2(rawEmi);

  const schedule: EmiRow[] = [];
  let balance = principal;
  for (let m = 1; m <= months; m++) {
    const interest = round2(balance * r);
    const last = m === months;
    const principalPart = last ? round2(balance) : round2(monthly - interest);
    const payment = last ? round2(principalPart + interest) : monthly;
    balance = last ? 0 : round2(balance - principalPart);
    schedule.push({ month: m, emi: payment, principal: principalPart, interest, balance });
  }

  const byYear: EmiYear[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const rows = schedule.slice(i, i + 12);
    byYear.push({
      year: i / 12 + 1,
      principal: round2(rows.reduce((s, x) => s + x.principal, 0)),
      interest: round2(rows.reduce((s, x) => s + x.interest, 0)),
      balance: rows[rows.length - 1].balance,
    });
  }

  const totalPayment = round2(schedule.reduce((s, x) => s + x.emi, 0));
  return {
    emi: monthly,
    totalInterest: round2(totalPayment - principal),
    totalPayment,
    months,
    schedule,
    byYear,
  };
}
