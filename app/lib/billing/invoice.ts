/**
 * The sales invoice KaamSolv issues when a subscription payment is verified (billing M2). Pure: it takes the
 * seller's saved business details, the buyer, what was bought and how tax is treated, and returns an invoice
 * document in the same shape the invoice generator already stores, or a short reason it can't be made yet.
 *
 * It never guesses an accounting fact. How GST applies to these sales is the owner's decision
 * (BILLING_TAX_TREATMENT, docs/products/billing.md): until it is set, or if it can't be honoured with the
 * seller's saved details, the invoice is NOT made and the job waits, visibly, as "blocked".
 */

import { GST_RATES, isListedGstRate } from '../invoice/gst';
import { computeTotals } from '../invoice/totals';
import type { Invoice } from '../invoice/types';
import { gstinProblem } from '../invoice/india';
import type { Settings } from '../invoice/settings';
import type { BillingPeriod } from './plans';

export type TaxTreatment = { mode: 'none' } | { mode: 'inclusive'; rate: string };

/** Reads the operator's billing settings. `problem` is a short code when they are missing or unsupported. */
export function billingConfig(env: Record<string, string | undefined> = process.env): {
  sellerEmail: string | null;
  sac: string;
  treatment: TaxTreatment | null;
  problem: string | null;
} {
  const sellerEmail = env.BILLING_SELLER_EMAIL?.trim().toLowerCase() || null;
  const sac = env.BILLING_SAC?.trim() ?? '';
  const mode = env.BILLING_TAX_TREATMENT?.trim().toLowerCase();
  if (!sellerEmail) return { sellerEmail, sac, treatment: null, problem: 'seller_account_not_set' };
  if (mode === 'none') return { sellerEmail, sac, treatment: { mode: 'none' }, problem: null };
  if (mode === 'inclusive') {
    const rate = env.BILLING_TAX_RATE?.trim() ?? '';
    if (!isListedGstRate(rate) || rate === '0') return { sellerEmail, sac, treatment: null, problem: 'tax_rate_not_set' };
    return { sellerEmail, sac, treatment: { mode: 'inclusive', rate }, problem: null };
  }
  // 'exclusive' (tax added on top of the price) would change what the checkout charges, so it isn't supported yet.
  return { sellerEmail, sac, treatment: null, problem: mode ? 'tax_treatment_unsupported' : 'tax_treatment_not_set' };
}

export type SellerDetails = Pick<Settings, 'name' | 'address' | 'email' | 'phone' | 'stateCode' | 'gstin' | 'composition' | 'bankAccountName' | 'bankAccountNumber' | 'bankIfsc' | 'bankName' | 'upiId'>;

export type BuildInput = {
  seller: SellerDetails;
  buyer: { name: string; email: string };
  planName: string;
  period: BillingPeriod;
  /** What Razorpay charged, in paise. */
  amountPaise: number;
  /** The date the payment was received, YYYY-MM-DD (India time). */
  paidOn: string;
  treatment: TaxTreatment;
  /** Optional SAC code printed on the line (BILLING_SAC). Never invented. */
  sac?: string;
};

export type BuildResult = { ok: true; doc: Invoice } | { ok: false; code: string };

const rupees = (paise: number) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;

/** An invoice for one subscription payment, with the number left for the database to allocate (it is concurrency-safe there). */
export function buildSubscriptionInvoice(input: BuildInput): BuildResult {
  const { seller, treatment } = input;
  if (!seller.name.trim() || !seller.address.trim()) return { ok: false, code: 'seller_not_configured' };
  const registered = seller.gstin.trim() !== '' && gstinProblem(seller.gstin) === null;
  if (treatment.mode === 'inclusive') {
    if (!registered) return { ok: false, code: 'seller_gstin_missing' };
    if (seller.composition) return { ok: false, code: 'composition_cannot_charge_gst' };
    if (!(GST_RATES as readonly string[]).includes(treatment.rate)) return { ok: false, code: 'tax_rate_not_set' };
  }

  const buyerName = input.buyer.name.trim() || input.buyer.email.trim();
  const doc: Invoice = {
    number: '',
    issueDate: input.paidOn,
    dueDate: input.paidOn,
    currency: 'INR',
    seller: { name: seller.name, address: seller.address, email: seller.email, phone: seller.phone, state: seller.stateCode, gstin: seller.gstin },
    client: { name: buyerName, address: '', email: input.buyer.email.trim() },
    items: [
      {
        id: 'subscription',
        description: `${input.planName} — ${input.period === 'year' ? 'yearly' : 'monthly'} plan`,
        qty: '1',
        rate: rupees(input.amountPaise),
        ...(input.sac ? { hsn: input.sac } : {}),
        unit: 'plan',
      },
    ],
    discountType: 'flat',
    discountValue: '',
    taxLabel: 'GST',
    taxRate: '',
    notes: 'Paid online through Razorpay. Thank you.',
    logo: null,
    ...(seller.bankAccountNumber || seller.upiId
      ? { payment: { accountName: seller.bankAccountName, accountNumber: seller.bankAccountNumber, ifsc: seller.bankIfsc, bankName: seller.bankName, upiId: seller.upiId, showUpiQr: false } }
      : {}),
  };

  if (treatment.mode === 'none') {
    return { ok: true, doc: seller.composition ? { ...doc, docType: 'bill_of_supply' } : doc };
  }

  // Tax included in the price: the line shows the amount before tax, the invoice adds tax back, and the total
  // must equal exactly what was charged. Try the nearest paise on each side; if none matches, don't guess.
  const factor = 100 + Number(treatment.rate);
  const base = Math.round((input.amountPaise * 100) / factor);
  for (const taxable of [base, base - 1, base + 1, base - 2, base + 2]) {
    const candidate: Invoice = { ...doc, taxRate: treatment.rate, placeOfSupply: seller.stateCode || undefined, items: [{ ...doc.items[0], rate: rupees(taxable) }] };
    const totals = computeTotals(candidate);
    if (totals.problems.length === 0 && Math.round(totals.total * 100) === input.amountPaise) return { ok: true, doc: candidate };
  }
  return { ok: false, code: 'rounding_mismatch' };
}
