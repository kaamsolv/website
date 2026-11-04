/**
 * Customer payment reminders: who may be reminded, when, and what the email says. Pure (used by the API, the
 * outbox job, db/ and the tests).
 *
 * Eligibility reads the one payment model (app/lib/invoice/payments.ts `paymentSummary`): only an invoice that
 * still has a balance outstanding can be chased. A paid invoice, a legacy "marked paid" invoice, a quotation, a
 * zero-total invoice and an invoice with no usable customer email are never sent a reminder. A partly paid
 * invoice is chased for the balance only. Invoices have no "void" state in this product (only payments do), so
 * there is no voided-invoice case to handle.
 */

import { displayDate } from './defaults';
import { formatMoney } from './money';
import { paymentSummary } from './payments';
import type { CurrencyCode } from './types';

/** Reminders one account may queue per India calendar day, manual and scheduled together. */
export const DAILY_REMINDER_LIMIT = 25;
/** A manual reminder note (the owner's own words, added to the email). */
export const MAX_REMINDER_NOTE = 300;
/** Scheduled steps: how many an account may set, and how far after the due date. */
export const MAX_SCHEDULE_STEPS = 4;
export const MAX_SCHEDULE_DAY = 90;
export const DEFAULT_SCHEDULE_DAYS: readonly number[] = [3, 7, 14];
/**
 * A scheduled step is sent on the day it falls due, or up to this many days late (a skipped cron run). Later than
 * that it is skipped, never sent as a stale pile-up.
 */
export const SCHEDULE_GRACE_DAYS = 2;

export type ReminderKind = 'manual' | 'scheduled';

export type SkipReason =
  | 'not_invoice'
  | 'paid'
  | 'marked_paid'
  | 'nothing_owed'
  | 'no_email'
  | 'bad_email'
  | 'paused'
  | 'promised'
  | 'not_found'
  | 'no_plan';

export const SKIP_TEXT: Record<SkipReason, string> = {
  not_invoice: 'Quotations can’t be sent payment reminders.',
  paid: 'This invoice is paid, so there’s nothing to remind about.',
  marked_paid: 'This invoice is marked paid, so there’s nothing to remind about.',
  nothing_owed: 'Nothing is owed on this invoice.',
  no_email: 'Add your customer’s email address to this invoice first.',
  bad_email: 'The customer’s email address on this invoice doesn’t look right.',
  paused: 'Reminders are paused for this invoice.',
  promised: 'The customer promised a payment date that hasn’t passed yet.',
  not_found: 'We couldn’t find that invoice.',
  no_plan: 'Payment reminders are part of Pro.',
};

export type ReminderFacts = {
  kind: string;
  status: 'unpaid' | 'paid';
  total: number;
  amountPaid: number;
  dueDate: string | null;
  /** The customer's email as typed on the invoice. */
  email: string;
  paused?: boolean;
  promisedOn?: string | null;
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const isUsableEmail = (v: string): boolean => v.length <= 254 && EMAIL_RE.test(v.trim());

export type Eligibility = { ok: true; outstanding: number; overdue: boolean } | { ok: false; reason: SkipReason };

/**
 * May this invoice be reminded right now? Called when the owner asks, when a scheduled reminder is queued and again
 * just before it is sent, so a payment recorded in between always wins. `scheduled` also honours a pause and an
 * unexpired promised date; a manual reminder is the owner's decision and does not.
 */
export function reminderEligibility(f: ReminderFacts, today: string, scheduled: boolean): Eligibility {
  if (f.kind !== 'invoice') return { ok: false, reason: 'not_invoice' };
  const s = paymentSummary({ total: f.total, amountPaid: f.amountPaid, status: f.status, dueDate: f.dueDate }, today);
  if (s.state === 'paid') return { ok: false, reason: 'paid' };
  if (s.state === 'marked_paid') return { ok: false, reason: 'marked_paid' };
  if (s.outstanding <= 0) return { ok: false, reason: 'nothing_owed' };
  const email = f.email.trim();
  if (!email) return { ok: false, reason: 'no_email' };
  if (!isUsableEmail(email)) return { ok: false, reason: 'bad_email' };
  if (scheduled) {
    if (f.paused) return { ok: false, reason: 'paused' };
    if (f.promisedOn && f.promisedOn >= today) return { ok: false, reason: 'promised' };
  }
  return { ok: true, outstanding: s.outstanding, overdue: s.overdue };
}

/** One manual reminder per invoice per India day: a second click the same day is the same job. */
export const manualKey = (invoiceId: string, istDate: string): string => `reminder:manual:${invoiceId}:${istDate}`;
/** Each scheduled step goes out once per invoice, ever. */
export const scheduledKey = (invoiceId: string, step: number): string => `reminder:step:${invoiceId}:${step}`;

const DAY_MS = 86_400_000;
const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/**
 * Which scheduled step is due today for an invoice due on `dueDate`: the latest step whose day is today or within
 * the grace window, or null. Only one step is ever returned, so two steps can't fire on the same day.
 */
export function dueStep(dueDate: string, today: string, days: readonly number[]): number | null {
  const late = dayNumber(today) - dayNumber(dueDate);
  let hit: number | null = null;
  for (const step of [...days].sort((a, b) => a - b)) if (late >= step && late <= step + SCHEDULE_GRACE_DAYS) hit = step;
  return hit;
}

export type ScheduleCheck = { ok: true; days: number[] } | { ok: false; message: string };

/** Validates the owner's chosen days: 1 to 4 distinct whole days, 1 to 90 after the due date. Returns them sorted. */
export function checkSchedule(raw: unknown): ScheduleCheck {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SCHEDULE_STEPS) return { ok: false, message: `Choose 1 to ${MAX_SCHEDULE_STEPS} reminder days.` };
  const days: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_SCHEDULE_DAY) return { ok: false, message: `Each day must be a whole number from 1 to ${MAX_SCHEDULE_DAY}.` };
    if (!days.includes(v)) days.push(v);
  }
  return { ok: true, days: days.sort((a, b) => a - b) };
}

export type ReminderEmailInput = {
  to: string;
  sellerName: string;
  /** The seller's account email: where the customer's reply goes. */
  replyTo: string;
  clientName: string;
  number: string;
  currency: CurrencyCode;
  total: number;
  outstanding: number;
  dueDate: string | null;
  overdue: boolean;
  /** The private invoice link, if the owner has one for the customer to open. */
  url: string;
  /** Optional words from the owner, shown above the details. */
  note?: string;
};

export type ReminderEmail = { to: string; subject: string; text: string; html: string; replyTo: string };

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The reminder: polite, specific about the amount still owed, and honest about who sent it. Plain text and a simple HTML twin. */
export function reminderEmail(i: ReminderEmailInput): ReminderEmail {
  const first = i.clientName.trim().split(/\s+/)[0];
  const seller = i.sellerName.trim() || 'your supplier';
  const owed = formatMoney(i.outstanding, i.currency);
  const partly = i.outstanding < i.total;
  const subject = `${i.overdue ? 'Payment reminder' : 'Friendly reminder'}: invoice ${i.number} from ${seller}`;
  const note = (i.note ?? '').trim().slice(0, MAX_REMINDER_NOTE);
  const intro = `${first ? `Hi ${first}` : 'Hi'}, this is a ${i.overdue ? 'reminder' : 'friendly reminder'} from ${seller} about an invoice that is still open.`;
  const rows: [string, string][] = [
    ['Invoice', i.number],
    ['Balance due', owed],
  ];
  if (partly) rows.push(['Invoice total', formatMoney(i.total, i.currency)]);
  if (i.dueDate) rows.push(['Due date', displayDate(i.dueDate)]);
  const text = [
    intro,
    ...(note ? ['', note] : []),
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(i.url ? ['', `View invoice: ${i.url}`] : []),
    '',
    `If you have already paid, please ignore this email and accept our thanks. Questions? Reply to this email and ${seller} will see it.`,
    '',
    `Sent through KaamSolv on behalf of ${seller}.`,
  ].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:520px">
<p style="font-size:20px;font-weight:700;margin:0 0 16px">${esc(seller)}</p>
<p>${esc(intro)}</p>
${note ? `<p style="white-space:pre-wrap">${esc(note)}</p>` : ''}
<table role="presentation" style="border-collapse:collapse;margin:12px 0">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5B6478">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`)
    .join('')}</table>
${i.url ? `<p><a href="${esc(i.url)}" style="display:inline-block;background:#FE6336;color:#0C2248;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">View invoice</a></p>` : ''}
<p style="color:#5B6478;font-size:13px">If you have already paid, please ignore this email and accept our thanks. Questions? Reply to this email and ${esc(seller)} will see it.</p>
<p style="color:#5B6478;font-size:12px">Sent through KaamSolv on behalf of ${esc(seller)}.</p>
</div>`;
  return { to: i.to, subject, text, html, replyTo: i.replyTo };
}
