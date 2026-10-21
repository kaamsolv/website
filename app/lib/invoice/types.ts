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
};

export type Party = { name: string; address: string; email: string; phone?: string };

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
};
