/**
 * Server-side cleaning of an invoice document sent by the browser (saving).
 * Framework-free and shared, so the server enforces exactly the limits the
 * editor shows. Strings are cut to `MAX_LEN`; structure errors are rejected.
 * The logo is always dropped — it lives on the business profile, not the invoice.
 */

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
    };
  });

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
      },
      client: {
        name: str(client.name, MAX_LEN.name),
        address: str(client.address, MAX_LEN.address),
        email: str(client.email, MAX_LEN.email),
      },
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

/** `INV-0001` from a sequence number. */
export function formatSequentialNumber(n: number): string {
  return `INV-${String(Math.max(1, Math.floor(n))).padStart(4, '0')}`;
}
