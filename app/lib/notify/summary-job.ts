/**
 * The scheduled receivables summary email (billing M3). One job per account per period (queued by
 * db/notifications.ts `enqueueDueSummaries`). It re-checks everything at send time: the account still asked for it,
 * still has the plan that includes Payments & collections, and there is something to say. It sends to the account's
 * own address only, with the figures from the same code as the Payments & collections page.
 */

import { eq } from 'drizzle-orm';
import { getReceivables, listCurrencies } from '../../../db/collections';
import { getEntitlements } from '../../../db/entitlements';
import type { Db } from '../../../db/links';
import { getSummaryCadence } from '../../../db/notifications';
import type { JobOutcome, OutboxJob } from '../../../db/outbox';
import { authUsers } from '../../../db/schema';
import { SUMMARY_EMAIL_FROM, sendEmailChecked, type Email } from '../email';
import { entitlementsFrom } from '../entitlements';
import { hasSomethingToReport, receivablesMessage, type SummaryFigures } from '../invoice/receivables-summary';
import { siteOrigin } from '../site-origin';
import { istClock } from './schedule';

/** Currencies in one email: the account's main one and the next biggest. More is for the page, not the inbox. */
const MAX_CURRENCIES = 2;

export type SummaryDeps = { env?: Record<string, string | undefined>; send?: typeof sendEmailChecked; now?: Date };

export function summaryEmail(to: string, message: string, pageUrl: string): Email {
  const text = [message, '', 'You get this because you turned on the receivables summary. To change how often, or turn it off:', `${pageUrl}`].join('\n');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:520px">
<p style="font-size:20px;font-weight:700;margin:0 0 16px">Kaam<span style="color:#FE6336">Solv</span></p>
<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${esc(message)}</pre>
<p style="color:#5B6478;font-size:13px">You get this because you turned on the receivables summary. <a href="${esc(pageUrl)}">Change how often, or turn it off</a>.</p>
</div>`;
  return { to, subject: 'Your KaamSolv receivables summary', text, html };
}

export async function summaryJob(db: Db, job: OutboxJob, deps: SummaryDeps = {}): Promise<JobOutcome> {
  const env = deps.env ?? process.env;
  const send = deps.send ?? sendEmailChecked;
  const userId = typeof job.payload.userId === 'string' ? job.payload.userId : '';
  if (!userId) return { result: 'sent', ref: 'skipped:no_account' };

  if ((await getSummaryCadence(db, userId)) === 'off') return { result: 'sent', ref: 'skipped:turned_off' };
  if (!entitlementsFrom(await getEntitlements(db, userId)).can('invoice_dashboard')) return { result: 'sent', ref: 'skipped:no_plan' };
  const [user] = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, userId));
  if (!user) return { result: 'sent', ref: 'skipped:no_account' };

  const today = istClock(deps.now ?? new Date()).date;
  const currencies = (await listCurrencies(db, userId)).slice(0, MAX_CURRENCIES);
  const figures: SummaryFigures[] = [];
  for (const c of currencies) {
    const r = await getReceivables(db, userId, { today, currency: c.code });
    figures.push({ currency: r.currency, today, outstanding: r.outstanding, overdue: r.overdue, dueToday: r.dueToday, dueNext7: r.dueNext7, dueNext30: r.dueNext30, receivedThisMonth: r.receivedThisMonth });
  }
  if (!hasSomethingToReport(figures)) return { result: 'sent', ref: 'skipped:nothing_to_report' };

  const pageUrl = `${siteOrigin(env)}/app/invoices/collections`;
  const message = receivablesMessage(figures, pageUrl);
  if (!message) return { result: 'sent', ref: 'skipped:nothing_to_report' };
  const sent = await send(summaryEmail(user.email, message, pageUrl), SUMMARY_EMAIL_FROM, job.dedupeKey);
  if (sent.ok) return { result: 'sent', ref: sent.id };
  return sent.code === 'email_not_configured' ? { result: 'blocked', code: sent.code } : { result: 'retry', code: sent.code };
}
