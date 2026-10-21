import type { Invoice, LineItem } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

/** INV-20261021-4827 — date + 4 random digits; editable by the user. */
export function newInvoiceNumber(date: Date, random: () => number = Math.random): string {
  const digits = String(Math.floor(random() * 10_000)).padStart(4, '0');
  return `INV-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${digits}`;
}

let itemSeq = 0;
export function newLineItem(): LineItem {
  return { id: `item-${++itemSeq}`, description: '', qty: '1', rate: '' };
}

export const DEFAULT_DUE_DAYS = 14;

export function newInvoice(now: Date = new Date()): Invoice {
  const issueDate = isoDate(now);
  return {
    number: newInvoiceNumber(now),
    issueDate,
    dueDate: addDays(issueDate, DEFAULT_DUE_DAYS),
    currency: 'INR',
    seller: { name: '', address: '', email: '', phone: '' },
    client: { name: '', address: '', email: '' },
    items: [newLineItem()],
    discountType: 'percent',
    discountValue: '',
    taxLabel: 'GST',
    taxRate: '',
    notes: '',
    logo: null,
  };
}

/** Has the user typed anything worth warning about before leaving? */
export function hasContent(inv: Invoice): boolean {
  const filled = (s: string) => s.trim() !== '';
  return (
    [inv.seller.name, inv.seller.address, inv.seller.email, inv.seller.phone, inv.client.name, inv.client.address, inv.client.email, inv.notes].some(filled) ||
    inv.items.some((i) => filled(i.description) || filled(i.rate)) ||
    inv.logo !== null
  );
}

/** "21 Oct 2026" for the PDF and preview. */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d));
}
