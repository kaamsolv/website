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

// ------------------------------------------------------------------ Prepayment

/** Monthly EMI before rounding: P r (1+r)^n / ((1+r)^n - 1); r is the monthly rate as a fraction. */
function rawEmi(principal: number, monthlyRate: number, months: number): number {
  return monthlyRate === 0 ? principal / months : (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
}

export type PrepayMode = 'shorter' | 'lower';

export type PrepayInput = {
  principal: number;
  annualRatePercent: number;
  months: number;
  /** Extra paid on top of every EMI, from the first month. */
  extraMonthly?: number;
  /** One lump sum paid right after the EMI of `lumpAfterMonth`. */
  lumpAmount?: number;
  lumpAfterMonth?: number;
  /** `shorter`: keep the EMI, finish sooner. `lower`: keep the end date, recalculate a lower EMI. */
  lumpMode?: PrepayMode;
};

export type PrepayResult = {
  /** The EMI at the start. */
  emi: number;
  /** The EMI after the lump sum (the same as `emi` unless the mode is `lower`). */
  newEmi: number;
  /** Months until the loan is cleared. */
  months: number;
  totalInterest: number;
  /** Every EMI, extra payment and the lump sum, added up. */
  totalPaid: number;
  interestSaved: number;
  monthsSaved: number;
  /** Outstanding balance at the end of each year, down to 0 once the loan is cleared. */
  balanceByYear: { year: number; balance: number }[];
  /** The lump sum actually paid (it is capped at what is still owed). */
  lumpPaid: number;
};

/**
 * The loan with an optional extra amount every month and/or one lump sum, compared with no prepayment. Month by month:
 * interest on the balance, the EMI (plus extra), then, after the chosen month, the lump sum. Returns null for invalid input.
 */
export function emiPrepay(input: PrepayInput): PrepayResult | null {
  const { principal, annualRatePercent, months, extraMonthly = 0, lumpAmount = 0, lumpAfterMonth = 0, lumpMode = 'shorter' } = input;
  const base = emi(principal, annualRatePercent, months);
  if (!base) return null;
  if (!finite(extraMonthly, lumpAmount, lumpAfterMonth) || extraMonthly < 0 || lumpAmount < 0) return null;
  if (extraMonthly > principal || lumpAmount > EMI_LIMITS.principal.max) return null;
  if (lumpAmount > 0 && !(Number.isInteger(lumpAfterMonth) && lumpAfterMonth >= 1 && lumpAfterMonth < months)) return null;

  const r = annualRatePercent / 12 / 100;
  let monthly = base.emi;
  let balance = principal;
  let interestTotal = 0;
  let paidTotal = 0;
  let lumpPaid = 0;
  let m = 0;
  const years = Math.ceil(months / 12);
  const balanceByYear: { year: number; balance: number }[] = [];
  while (balance > 0 && m < months) {
    m++;
    const interest = round2(balance * r);
    const last = m === months;
    const due = round2(balance + interest);
    const pay = last ? due : Math.min(round2(monthly + extraMonthly), due);
    interestTotal += interest;
    paidTotal += pay;
    balance = pay >= due ? 0 : round2(balance - (pay - interest));
    if (balance > 0 && lumpAmount > 0 && m === lumpAfterMonth) {
      lumpPaid = Math.min(lumpAmount, balance);
      paidTotal += lumpPaid;
      balance = round2(balance - lumpPaid);
      if (balance > 0 && lumpMode === 'lower') monthly = round2(rawEmi(balance, r, months - m));
    }
    if (m % 12 === 0 || balance === 0 || m === months) balanceByYear.push({ year: Math.ceil(m / 12), balance });
  }
  // Fill the years after the loan is cleared with 0, and carry the last balance across a year with no row.
  const rows: { year: number; balance: number }[] = [];
  for (let y = 1; y <= years; y++) {
    const hit = balanceByYear.find((b) => b.year === y);
    rows.push({ year: y, balance: hit ? hit.balance : 0 });
  }
  const totalInterest = round2(interestTotal);
  return {
    emi: base.emi,
    newEmi: monthly,
    months: m,
    totalInterest,
    totalPaid: round2(paidTotal),
    interestSaved: round2(base.totalInterest - totalInterest),
    monthsSaved: base.months - m,
    balanceByYear: rows,
    lumpPaid: round2(lumpPaid),
  };
}

/** The largest whole-rupee loan whose EMI stays within `emiBudget` for `months` at the yearly rate. Null if out of range. */
export function loanForEmi(emiBudget: number, annualRatePercent: number, months: number): number | null {
  const L = EMI_LIMITS;
  if (!finite(emiBudget, annualRatePercent, months) || !Number.isInteger(months) || emiBudget <= 0) return null;
  if (annualRatePercent < L.rate.min || annualRatePercent > L.rate.max || months < L.months.min || months > L.months.max) return null;
  const r = annualRatePercent / 12 / 100;
  const exact = r === 0 ? emiBudget * months : (emiBudget * ((1 + r) ** months - 1)) / (r * (1 + r) ** months);
  if (!Number.isFinite(exact) || exact > L.principal.max) return null;
  let loan = Math.floor(exact + 1e-9);
  let steps = 0;
  // Rounding in emi() is to the paisa, so step down until the EMI really fits the budget.
  while (loan >= 1 && steps++ < 50) {
    const e = emi(loan, annualRatePercent, months);
    if (e && e.emi <= emiBudget) break;
    loan -= 1;
  }
  return loan >= L.principal.min && loan <= L.principal.max ? loan : null;
}
