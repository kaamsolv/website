/**
 * Server-side cleaning of an invoice document sent by the browser (saving).
 * Framework-free and shared, so the server enforces exactly the limits the
 * editor shows. Strings are cut to `MAX_LEN`; structure errors are rejected.
 * The logo is always dropped — it lives on the business profile, not the invoice.
 */

import { isPlaceOfSupply } from './gst-tax';
import { gstinProblem, isStateCode, normalizeGstin } from './india';
import { MAX_LEN } from './limits';
import { CURRENCIES, type CurrencyCode, type Invoice, type LineItem } from './types';

/** Hard ceiling even for Pro (multi-page). Keeps one row well under the size check. */
export const MAX_ITEMS_ANY_PLAN = 200;

export type CleanResult = { ok: true; invoice: Invoice } | { ok: false; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Numbers stay as the typed strings (see types.ts); they're only short text. */
function numText(value: unknown): string {
  return str(value, 24);
}

function isoDateOrEmpty(value: unknown): string {
  return typeof value === 'string' && DATE_RE.test(value) ? value : '';
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function cleanInvoice(input: unknown, opts: { maxItems: number }): CleanResult {
  const raw = obj(input);
  if (!Array.isArray(raw.items)) return { ok: false, message: 'That invoice is missing its items.' };
  const max = Math.min(opts.maxItems, MAX_ITEMS_ANY_PLAN);
  if (raw.items.length > max) {
    return { ok: false, message: `That invoice has ${raw.items.length} items — the limit is ${max}.` };
  }

  const currency = CURRENCIES.includes(raw.currency as CurrencyCode) ? (raw.currency as CurrencyCode) : null;
  if (!currency) return { ok: false, message: 'Pick a currency.' };

  const seller = obj(raw.seller);
  const client = obj(raw.client);
  const items: LineItem[] = raw.items.map((value, i) => {
    const it = obj(value);
    return {
      id: str(it.id, 40) || `item-${i + 1}`,
      description: str(it.description, MAX_LEN.description),
      qty: numText(it.qty),
      rate: numText(it.rate),
      ...(typeof it.hsn === 'string' && it.hsn.trim() ? { hsn: it.hsn.replace(/\D/g, '').slice(0, MAX_LEN.hsn) } : {}),
      ...(typeof it.unit === 'string' && it.unit.trim() ? { unit: str(it.unit, MAX_LEN.unit) } : {}),
      ...(typeof it.gstRate === 'string' && it.gstRate.trim() ? { gstRate: numText(it.gstRate) } : {}),
    };
  });
  // Format problems in these fields are shown in the editor; the server only
  // keeps well-formed values (and drops the rest) so a bad GSTIN never prints.
  const gstin = (v: unknown) => (typeof v === 'string' && v.trim() && !gstinProblem(v) ? { gstin: normalizeGstin(v) } : {});
  const state = (v: unknown) => (isStateCode(v) ? { state: v } : {});
  const pay = obj(raw.payment);
  const payment = raw.payment
    ? {
        payment: {
          accountName: str(pay.accountName, MAX_LEN.bankAccountName),
          accountNumber: str(pay.accountNumber, MAX_LEN.bankAccountNumber).replace(/[^\dA-Za-z]/g, ''),
          ifsc: str(pay.ifsc, MAX_LEN.ifsc).toUpperCase(),
          bankName: str(pay.bankName, MAX_LEN.bankName),
          upiId: str(pay.upiId, MAX_LEN.upiId).trim(),
          showUpiQr: pay.showUpiQr === true,
        },
      }
    : {};
  const customerId = typeof raw.customerId === 'string' && UUID_RE.test(raw.customerId) ? { customerId: raw.customerId } : {};
  // Stage 2B: GST particulars.
  const gstExtras = {
    ...(isPlaceOfSupply(raw.placeOfSupply) ? { placeOfSupply: raw.placeOfSupply } : {}),
    ...(raw.reverseCharge === true ? { reverseCharge: true } : {}),
    ...(typeof raw.shipTo === 'string' && raw.shipTo.trim() ? { shipTo: str(raw.shipTo, MAX_LEN.address) } : {}),
    ...(raw.docType === 'bill_of_supply' ? { docType: 'bill_of_supply' as const } : {}),
  };

  return {
    ok: true,
    invoice: {
      number: str(raw.number, MAX_LEN.number),
      issueDate: isoDateOrEmpty(raw.issueDate),
      dueDate: isoDateOrEmpty(raw.dueDate),
      currency,
      seller: {
        name: str(seller.name, MAX_LEN.name),
        address: str(seller.address, MAX_LEN.address),
        email: str(seller.email, MAX_LEN.email),
        phone: str(seller.phone, MAX_LEN.phone),
        ...state(seller.state),
        ...gstin(seller.gstin),
      },
      client: {
        name: str(client.name, MAX_LEN.name),
        address: str(client.address, MAX_LEN.address),
        email: str(client.email, MAX_LEN.email),
        ...state(client.state),
        ...gstin(client.gstin),
      },
      ...payment,
      ...customerId,
      ...gstExtras,
      items: items.length ? items : [{ id: 'item-1', description: '', qty: '1', rate: '' }],
      discountType: raw.discountType === 'flat' ? 'flat' : 'percent',
      discountValue: numText(raw.discountValue),
      taxLabel: str(raw.taxLabel, MAX_LEN.taxLabel),
      taxRate: numText(raw.taxRate),
      notes: str(raw.notes, MAX_LEN.notes),
      logo: null,
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Invoice-number prefixes: letters, digits, `-`, `/` (e.g. "INV-", "KS/25-26/"). */
export function cleanPrefix(input: unknown): string {
  return typeof input === 'string' ? input.replace(/[^A-Za-z0-9/-]/g, '').slice(0, MAX_LEN.prefix) : '';
}

/** `INV-0001` from a sequence number and prefix. */
export function formatSequentialNumber(n: number, prefix = 'INV-'): string {
  return `${prefix}${String(Math.max(1, Math.floor(n))).padStart(4, '0')}`;
}

/** The sequence number in a number made with `prefix` (INV-0007 → 7), or null. */
export function sequenceOf(number: string, prefix: string): number | null {
  const n = number.trim();
  if (!n.startsWith(prefix)) return null;
  const rest = n.slice(prefix.length);
  return /^\d{1,9}$/.test(rest) ? Number(rest) : null;
}
