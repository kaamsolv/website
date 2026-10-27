/**
 * "Share on WhatsApp" for an invoice (billing M2, D1: click-to-chat). Pure.
 *
 * It only builds a message and a wa.me address. The person opens WhatsApp themselves and presses send, so they
 * stay in control of who gets it; nothing is sent automatically and no WhatsApp account or API is involved.
 * Only fields the invoice already holds are used: the seller's name, the client's first name, number, amount,
 * due date and the private link.
 */

import { displayDate } from './defaults';
import { formatMoney } from './money';
import type { CurrencyCode } from './types';

export type ShareInput = {
  sellerName: string;
  clientName: string;
  number: string;
  total: number;
  currency: CurrencyCode;
  /** YYYY-MM-DD, or empty. */
  dueDate: string;
  url: string;
  /** Already paid: the message says so instead of asking for payment. */
  paid?: boolean;
};

export function whatsappMessage(i: ShareInput): string {
  const first = i.clientName.trim().split(/\s+/)[0];
  const seller = i.sellerName.trim();
  const lines = [
    `${first ? `Hi ${first}` : 'Hi'}, your invoice${seller ? ` from ${seller}` : ''} is ready.`,
    '',
    `Invoice: ${i.number}`,
    `Amount: ${formatMoney(i.total, i.currency)}`,
  ];
  if (i.paid) lines.push('Status: Paid');
  else if (i.dueDate) lines.push(`Due date: ${displayDate(i.dueDate)}`);
  lines.push('', `View invoice: ${i.url}`);
  return lines.join('\n');
}

/**
 * A phone number as wa.me wants it: digits only, with the country code. A 10-digit number is taken as Indian
 * (91); a leading 0 or +91 is handled; anything that can't be a phone number returns null (and the chat picker
 * opens instead of a specific chat).
 */
export function whatsappNumber(raw: string | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, '');
  if (raw.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** https://wa.me/<number>?text=… when the client's number is usable, else https://wa.me/?text=… */
export function whatsappHref(phone: string | undefined, message: string): string {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(message)}`;
}
