/**
 * Settings (business details, getting paid, invoice defaults) and saved
 * customers/items — cleaning and validation shared by the API and the forms.
 * Framework-free. Field problems come back keyed by field so forms can show
 * them inline.
 */

import { CURRENCIES, type CurrencyCode } from './types';
import { gstinProblem, hsnProblem, ifscProblem, isStateCode, normalizeGstin, normalizeIfsc, upiProblem } from './india';
import { MAX_LEN } from './limits';
import { cleanPrefix } from './validate';

export type Settings = {
  name: string;
  address: string;
  email: string;
  phone: string;
  stateCode: string;
  gstin: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  upiId: string;
  showUpiQr: boolean;
  invoicePrefix: string;
  /** The next sequence number (1 → INV-0001). */
  nextSequence: number;
  defaultCurrency: CurrencyCode;
  defaultTaxLabel: string;
  defaultTaxRate: string;
  defaultDueDays: number;
  defaultNotes: string;
};

export type Customer = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  stateCode: string;
  gstin: string;
};

export type Item = { name: string; hsnSac: string; unit: string; rate: string; gstRate: string };

export type Cleaned<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function checkGstin(errors: Record<string, string>, raw: string): string {
  if (!raw) return '';
  const problem = gstinProblem(raw);
  if (problem) errors.gstin = problem;
  return normalizeGstin(raw);
}

function checkRate(errors: Record<string, string>, field: string, raw: string, what: string): string {
  if (!raw) return '';
  const n = Number(raw.replace(/[,\s₹$€£]/g, ''));
  if (!Number.isFinite(n) || n < 0) errors[field] = `${what} must be a number, 0 or more.`;
  return raw.slice(0, 24);
}

export function cleanSettings(input: unknown): Cleaned<Settings> {
  const r = rec(input);
  const errors: Record<string, string> = {};

  const stateCode = text(r.stateCode, 2);
  if (stateCode && !isStateCode(stateCode)) errors.stateCode = 'Pick your state from the list.';
  const gstin = checkGstin(errors, text(r.gstin, 20));
  if (gstin && stateCode && !errors.gstin && gstin.slice(0, 2) !== stateCode) {
    errors.gstin = 'This GSTIN is registered in a different state from the one you picked.';
  }

  const bankIfsc = normalizeIfsc(text(r.bankIfsc, 20));
  if (bankIfsc && ifscProblem(bankIfsc)) errors.bankIfsc = ifscProblem(bankIfsc)!;
  const bankAccountNumber = text(r.bankAccountNumber, 30).replace(/\s+/g, '');
  if (bankAccountNumber && !/^[0-9A-Za-z]{6,20}$/.test(bankAccountNumber)) errors.bankAccountNumber = 'Account numbers are 6–20 letters or digits.';
  const upiId = text(r.upiId, MAX_LEN.upiId);
  if (upiId && upiProblem(upiId)) errors.upiId = upiProblem(upiId)!;
  const showUpiQr = r.showUpiQr === true;
  if (showUpiQr && !upiId) errors.upiId = 'Add your UPI ID to show a QR code.';

  const rawPrefix = typeof r.invoicePrefix === 'string' ? r.invoicePrefix : 'INV-';
  const invoicePrefix = cleanPrefix(rawPrefix);
  if (invoicePrefix !== rawPrefix.trim()) errors.invoicePrefix = 'Use letters, digits, - or / (up to 10).';
  const nextSequence = Number(r.nextSequence ?? 1);
  if (!Number.isInteger(nextSequence) || nextSequence < 1 || nextSequence > 999_999_999) errors.nextSequence = 'The next number must be a whole number, 1 or more.';

  const defaultCurrency = CURRENCIES.includes(r.defaultCurrency as CurrencyCode) ? (r.defaultCurrency as CurrencyCode) : 'INR';
  const defaultTaxLabel = typeof r.defaultTaxLabel === 'string' ? r.defaultTaxLabel.trim().slice(0, MAX_LEN.taxLabel) : 'GST';
  const defaultTaxRate = checkRate(errors, 'defaultTaxRate', text(r.defaultTaxRate, 24), 'Tax rate');
  const defaultDueDays = Number(r.defaultDueDays ?? 14);
  if (!Number.isInteger(defaultDueDays) || defaultDueDays < 0 || defaultDueDays > 365) errors.defaultDueDays = 'Days to pay must be between 0 and 365.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: text(r.name, MAX_LEN.name),
      address: text(r.address, MAX_LEN.address),
      email: text(r.email, MAX_LEN.email),
      phone: text(r.phone, MAX_LEN.phone),
      stateCode,
      gstin,
      bankAccountName: text(r.bankAccountName, MAX_LEN.bankAccountName),
      bankAccountNumber,
      bankIfsc,
      bankName: text(r.bankName, MAX_LEN.bankName),
      upiId,
      showUpiQr,
      invoicePrefix,
      nextSequence,
      defaultCurrency,
      defaultTaxLabel,
      defaultTaxRate,
      defaultDueDays,
      defaultNotes: text(r.defaultNotes, MAX_LEN.notes),
    },
  };
}

export function cleanCustomer(input: unknown): Cleaned<Customer> {
  const r = rec(input);
  const errors: Record<string, string> = {};
  const name = text(r.name, MAX_LEN.name);
  if (!name) errors.name = 'Add the customer’s name.';
  const stateCode = text(r.stateCode, 2);
  if (stateCode && !isStateCode(stateCode)) errors.stateCode = 'Pick a state from the list.';
  const gstin = checkGstin(errors, text(r.gstin, 20));
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      contactName: text(r.contactName, MAX_LEN.name),
      email: text(r.email, MAX_LEN.email),
      phone: text(r.phone, MAX_LEN.phone),
      address: text(r.address, MAX_LEN.address),
      // A GSTIN already says which state; use it when no state was picked.
      stateCode: stateCode || (gstin && isStateCode(gstin.slice(0, 2)) ? gstin.slice(0, 2) : ''),
      gstin,
    },
  };
}

export function cleanItem(input: unknown): Cleaned<Item> {
  const r = rec(input);
  const errors: Record<string, string> = {};
  const name = text(r.name, MAX_LEN.description);
  if (!name) errors.name = 'Add a name for the item.';
  const hsnSac = text(r.hsnSac, 12).replace(/\s+/g, '');
  if (hsnSac && hsnProblem(hsnSac)) errors.hsnSac = hsnProblem(hsnSac)!;
  const rate = checkRate(errors, 'rate', text(r.rate, 24), 'Rate');
  const gstRate = checkRate(errors, 'gstRate', text(r.gstRate, 8), 'GST rate');
  if (gstRate && Number(gstRate) > 100) errors.gstRate = 'GST rate must be 100% or less.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, hsnSac, unit: text(r.unit, MAX_LEN.unit), rate, gstRate } };
}
