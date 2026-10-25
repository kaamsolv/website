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
  /** This line's GST rate on a tax invoice (blank = the invoice's rate). Stage 2B. */
  gstRate?: string;
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
  /** GST state code of the place of supply ("96" = outside India). Blank = worked out from the client. */
  placeOfSupply?: string;
  /** "Tax payable on reverse charge" (tax invoices). */
  reverseCharge?: boolean;
  /** Delivery address, when it differs from the billing address. */
  shipTo?: string;
  /** "bill_of_supply" for composition-scheme sellers; otherwise an invoice. */
  docType?: 'invoice' | 'bill_of_supply';
  /** Signature image (data URL) — from the business profile, never stored in the invoice. */
  signature?: string | null;
  /** Invoice (default) or quotation (Pro: invoice_quote_mode). A quotation's `dueDate` is "Valid until". */
  kind?: 'invoice' | 'quote';
  /** PDF template and brand colour (Pro: invoice_templates / invoice_brand_color). */
  design?: { template: 'classic' | 'minimal' | 'bold'; color: string };
};

export const EMPTY_PAYMENT: PaymentDetails = { accountName: '', accountNumber: '', ifsc: '', bankName: '', upiId: '', showUpiQr: false };

export function hasPaymentDetails(p: PaymentDetails | undefined): p is PaymentDetails {
  return !!p && [p.accountName, p.accountNumber, p.ifsc, p.bankName, p.upiId].some((v) => v.trim() !== '');
}
