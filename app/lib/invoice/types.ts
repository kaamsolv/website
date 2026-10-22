/**
 * Invoice Generator — data model. Framework-free. Numbers are kept as the
 * strings the user typed (so "1,25,000" or a half-typed "12." survive) and
 * parsed only when totals are computed.
 */

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export type DiscountType = 'percent' | 'flat';

export type LineItem = {
  id: string;
  description: string;
  qty: string;
  rate: string;
  /** HSN/SAC code — saved now, printed per line in Stage 2B. */
  hsn?: string;
  unit?: string;
};

export type Party = {
  name: string;
  address: string;
  email: string;
  phone?: string;
  /** GST state code, e.g. "27" (app/lib/invoice/india.ts). */
  state?: string;
  gstin?: string;
};

/** How to pay — printed as "Payment details" (from Settings, editable per invoice). */
export type PaymentDetails = {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  upiId: string;
  /** Print a "Scan to pay" UPI QR with the total (INR only). */
  showUpiQr: boolean;
};

export type Invoice = {
  number: string;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate: string;
  currency: CurrencyCode;
  seller: Party & { phone: string };
  client: Party;
  items: LineItem[];
  discountType: DiscountType;
  discountValue: string;
  /** "GST", "VAT", "Tax" — whatever the user wants printed. */
  taxLabel: string;
  taxRate: string;
  notes: string;
  /** Logo as a data URL, kept in memory only — never uploaded. */
  logo: string | null;
  /** Bank / UPI details; absent on invoices made before Settings existed. */
  payment?: PaymentDetails;
  /** The saved customer this invoice was billed to (signed-in only). */
  customerId?: string | null;
};

export const EMPTY_PAYMENT: PaymentDetails = { accountName: '', accountNumber: '', ifsc: '', bankName: '', upiId: '', showUpiQr: false };

export function hasPaymentDetails(p: PaymentDetails | undefined): p is PaymentDetails {
  return !!p && [p.accountName, p.accountNumber, p.ifsc, p.bankName, p.upiId].some((v) => v.trim() !== '');
}
