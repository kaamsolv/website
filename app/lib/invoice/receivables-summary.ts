/**
 * The short receivables summary (billing M3), as plain text for a WhatsApp message, an email or a copy. Pure.
 *
 * It only formats figures that db/collections.ts `getReceivables` already worked out from the payment ledger; it
 * calculates nothing. One block per currency (never summed or converted). Every figure says what it is and
 * what it covers: "as of" a date, and "received in <month>".
 */

import { displayDate } from './defaults';
import { formatMoney } from './money';
import type { CurrencyCode } from './types';

type Figure = { amount: number; count: number };

export type SummaryFigures = {
  currency: CurrencyCode;
  /** YYYY-MM-DD, the date the figures are as of. */
  today: string;
  outstanding: Figure;
  overdue: Figure;
  dueToday: Figure;
  dueNext7: Figure;
  dueNext30: Figure;
  receivedThisMonth: Figure;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const count = (n: number) => `${n} ${n === 1 ? 'invoice' : 'invoices'}`;

function block(f: SummaryFigures): string[] {
  const m = (n: number) => formatMoney(n, f.currency);
  return [
    `Outstanding: ${m(f.outstanding.amount)} (${count(f.outstanding.count)})`,
    `Overdue: ${m(f.overdue.amount)} (${count(f.overdue.count)})`,
    `Due today: ${m(f.dueToday.amount)}`,
    `Due in the next 7 days: ${m(f.dueNext7.amount)}`,
    `Due in the next 30 days: ${m(f.dueNext30.amount)}`,
    `Received in ${monthName(f.today)}: ${m(f.receivedThisMonth.amount)}`,
  ];
}

/**
 * The message. `url` is the private place to see more (the Payments & collections page); pass null to leave the
 * line out. Returns null when there is nothing to say (no figures at all).
 */
export function receivablesMessage(figures: SummaryFigures[], url: string | null): string | null {
  if (figures.length === 0) return null;
  const lines = [`KaamSolv receivables, as of ${displayDate(figures[0].today)}`, ''];
  figures.forEach((f, i) => {
    if (figures.length > 1) lines.push(`${f.currency}`);
    lines.push(...block(f));
    if (i < figures.length - 1) lines.push('');
  });
  lines.push('', 'Due dates count from today; "next 30 days" includes the next 7. Received covers payments recorded in the month.');
  if (url) lines.push('', `View receivables: ${url}`);
  return lines.join('\n');
}

/** Is there anything worth sending: money owed, money due soon, or money received this month. */
export function hasSomethingToReport(figures: SummaryFigures[]): boolean {
  return figures.some((f) => f.outstanding.amount > 0 || f.receivedThisMonth.amount > 0);
}
