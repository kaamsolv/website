/**
 * Accountant Connect: the monthly accountant pack, framework-free and pure.
 *
 * The pack is an accountant HANDOVER of the sales invoices and payments recorded in KaamSolv for one completed
 * calendar month. It is not a GST return and does not claim to hold everything a filing needs: KaamSolv holds no
 * purchase bills, input tax credit records or credit notes (`PACK_COVERAGE`).
 *
 * All dates are India calendar dates (Asia/Kolkata, no daylight saving).
 */

import { isUsableEmail } from './reminders';

export const PACK_SECTIONS = ['register', 'tax_summary', 'payments', 'outstanding', 'ageing'] as const;
export type PackSection = (typeof PACK_SECTIONS)[number];

export const SECTION_LABELS: Record<PackSection, string> = {
  register: 'Invoice register (with CGST, SGST, IGST)',
  tax_summary: 'Tax summary for the month',
  payments: 'Payments received',
  outstanding: 'Outstanding invoices',
  ageing: 'Ageing summary',
};

export const isSection = (v: unknown): v is PackSection => typeof v === 'string' && (PACK_SECTIONS as readonly string[]).includes(v);

/** What the pack holds, and what it does not. Shown in the settings, the email and the README inside the ZIP. */
export const PACK_COVERAGE = [
  'Sales invoices and payments recorded in KaamSolv for the month, taken from the same records as your Reports.',
  'Quotations are not included.',
  'Outstanding and ageing show where things stand on the day the pack is opened, not at month end.',
  'KaamSolv holds no purchase bills, input tax credit records, credit or debit notes, or e-invoice / e-way bill data, so those are not here.',
  'This is a handover of your records for your accountant. It is not a GST return or filing, and it is not audited.',
] as const;

export const MAX_NAME = 80;
export const DEFAULT_DAY = 5;
export const DEFAULT_HOUR = 10;
/** Delivery day is 1 to 28, so every month has it. */
export const MAX_DAY = 28;
/** A pack link works this long after it is sent. */
export const LINK_DAYS = 7;
/** A confirmation link works this long. */
export const VERIFY_HOURS = 48;

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type Period = { period: string; from: string; to: string; label: string };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The calendar month of "YYYY-MM": its first and last day. Null if it isn't a real month. */
export function periodOf(period: unknown): Period | null {
  if (typeof period !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2000 || y > 2100) return null;
  return { period, from: `${period}-01`, to: `${period}-${pad(daysInMonth(y, mo))}`, label: `${MONTHS[mo - 1]} ${y}` };
}

/** The last completed calendar month before the India date `today` (YYYY-MM-DD). */
export function previousMonth(today: string): Period {
  const y = Number(today.slice(0, 4));
  const mo = Number(today.slice(5, 7));
  const py = mo === 1 ? y - 1 : y;
  const pm = mo === 1 ? 12 : mo - 1;
  return periodOf(`${py}-${pad(pm)}`)!;
}

export type Clock = { date: string; hour: number };

/**
 * Is this month's pack due? From the chosen day at the chosen hour (India time) until the end of the month. If the
 * cron was down, the pack still goes out later that month; the period's unique key means it goes out once.
 */
export function packDue(now: Clock, day: number, hour: number): boolean {
  const d = Number(now.date.slice(8, 10));
  return d > day || (d === day && now.hour >= hour);
}

/**
 * The next scheduled delivery as an India date and hour. If this month's pack is due now and not yet queued it is
 * "now" (the next cron run); once it has been queued, or while the day is still ahead, it is the chosen day.
 */
export function nextDelivery(now: Clock, day: number, hour: number, queuedThisMonth: boolean): { date: string; hour: number; now: boolean } {
  const y = Number(now.date.slice(0, 4));
  const mo = Number(now.date.slice(5, 7));
  if (!queuedThisMonth) {
    if (packDue(now, day, hour)) return { date: now.date, hour: now.hour, now: true };
    return { date: `${y}-${pad(mo)}-${pad(day)}`, hour, now: false };
  }
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { date: `${ny}-${pad(nm)}-${pad(day)}`, hour, now: false };
}

export const packKey = (userId: string, period: string): string => `accountant-pack:${userId}:${period}`;

export type AccountantInput = { name: unknown; email: unknown; enabled: unknown; day: unknown; hour: unknown; sections: unknown };
export type AccountantSettings = { name: string; email: string; enabled: boolean; day: number; hour: number; sections: PackSection[] };
export type SettingsCheck = { ok: true; value: AccountantSettings } | { ok: false; message: string };

export function checkAccountant(i: AccountantInput): SettingsCheck {
  const name = typeof i.name === 'string' ? i.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > MAX_NAME) return { ok: false, message: `Add your accountant’s name (up to ${MAX_NAME} characters).` };
  if (/[<>\r\n]/.test(name)) return { ok: false, message: 'The name has characters we can’t use.' };
  const email = typeof i.email === 'string' ? i.email.trim().toLowerCase() : '';
  if (!isUsableEmail(email)) return { ok: false, message: 'That email address doesn’t look right.' };
  if (typeof i.enabled !== 'boolean') return { ok: false, message: 'Choose whether to send the pack each month.' };
  if (typeof i.day !== 'number' || !Number.isInteger(i.day) || i.day < 1 || i.day > MAX_DAY) return { ok: false, message: `Pick a day from 1 to ${MAX_DAY}.` };
  if (typeof i.hour !== 'number' || !Number.isInteger(i.hour) || i.hour < 0 || i.hour > 23) return { ok: false, message: 'Pick an hour of the day.' };
  if (!Array.isArray(i.sections) || i.sections.length < 1 || !i.sections.every(isSection)) return { ok: false, message: 'Choose at least one thing to include.' };
  const sections = PACK_SECTIONS.filter((s) => (i.sections as PackSection[]).includes(s));
  return { ok: true, value: { name, email, enabled: i.enabled, day: i.day, hour: i.hour, sections } };
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SIG = 'Sent through KaamSolv on behalf of the business above. You are getting this because they asked for it.';

export type MailBody = { subject: string; text: string; html: string };

export function verifyEmail(i: { accountantName: string; businessName: string; url: string }): MailBody {
  const biz = i.businessName || 'A KaamSolv user';
  const text = [
    `Hi ${i.accountantName},`,
    '',
    `${biz} would like to send you a monthly pack of their sales invoices and payments from KaamSolv, as a handover for your books.`,
    '',
    `If that is right, confirm this address: ${i.url}`,
    '',
    'The link works once and expires in 48 hours. If you were not expecting this, ignore it and nothing will be sent.',
  ].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:520px">
<p>Hi ${esc(i.accountantName)},</p>
<p>${esc(biz)} would like to send you a monthly pack of their sales invoices and payments from KaamSolv, as a handover for your books.</p>
<p><a href="${esc(i.url)}" style="display:inline-block;background:#FE6336;color:#0C2248;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">Confirm this address</a></p>
<p style="color:#5B6478;font-size:13px">The link works once and expires in 48 hours. If you were not expecting this, ignore it and nothing will be sent.</p></div>`;
  return { subject: `${biz} wants to send you a monthly pack (please confirm)`, text, html };
}

export function packEmail(i: { accountantName: string; businessName: string; periodLabel: string; url: string; expires: string; replyHint: string }): MailBody {
  const biz = i.businessName || 'Your client';
  const text = [
    `Hi ${i.accountantName},`,
    '',
    `Here is the ${i.periodLabel} pack from ${biz}: invoices, tax totals and payments recorded in KaamSolv.`,
    '',
    `Download (ZIP): ${i.url}`,
    `The link works until ${i.expires}.`,
    '',
    ...PACK_COVERAGE.map((c) => `- ${c}`),
    '',
    i.replyHint,
    SIG,
  ].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:520px">
<p>Hi ${esc(i.accountantName)},</p>
<p>Here is the <b>${esc(i.periodLabel)}</b> pack from ${esc(biz)}: invoices, tax totals and payments recorded in KaamSolv.</p>
<p><a href="${esc(i.url)}" style="display:inline-block;background:#FE6336;color:#0C2248;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">Download the ZIP</a></p>
<p style="color:#5B6478;font-size:13px">The link works until ${esc(i.expires)}.</p>
<ul style="color:#5B6478;font-size:13px">${PACK_COVERAGE.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
<p style="color:#5B6478;font-size:13px">${esc(i.replyHint)}</p>
<p style="color:#5B6478;font-size:12px">${esc(SIG)}</p></div>`;
  return { subject: `${biz}: ${i.periodLabel} accountant pack`, text, html };
}
