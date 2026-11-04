/**
 * The outbox job that sends one customer payment reminder (Invoice Pro). It decides everything again at send time:
 * the reminder is still waiting, the owner still has Pro, the invoice still has a balance and a usable customer
 * email (and, for a scheduled one, is not paused or covered by a promised date). A payment recorded after the
 * reminder was queued therefore always wins. An ineligible reminder is marked skipped with the reason, not sent.
 *
 * The email goes out through the provider with the job's key as its idempotency key, and the reply goes to the
 * owner's own account address. Nothing here logs an address or a message.
 */

import { eq, sql } from 'drizzle-orm';
import { getEntitlements } from '../../../db/entitlements';
import { ensureLink } from '../../../db/invoice-links';
import type { Db } from '../../../db/links';
import type { JobOutcome, OutboxJob } from '../../../db/outbox';
import { markReminderSent, markReminderSkipped, reminderFacts } from '../../../db/reminders';
import { authUsers } from '../../../db/schema';
import { BILLING_EMAIL_FROM, sendEmailChecked } from '../email';
import { entitlementsFrom } from '../entitlements';
import { reminderEmail, reminderEligibility } from '../invoice/reminders';
import { CURRENCIES, type CurrencyCode } from '../invoice/types';
import { linkSecret } from '../links/token';
import { siteOrigin } from '../site-origin';
import { istClock } from './schedule';

export type ReminderDeps = { env?: Record<string, string | undefined>; send?: typeof sendEmailChecked; now?: Date; secret?: string };

/** Sender for customer reminders: the same verified sending subdomain, a separate mailbox so replies/complaints are traceable. */
export const REMINDER_EMAIL_FROM = BILLING_EMAIL_FROM.replace('KaamSolv Billing <billing@', 'KaamSolv Reminders <reminders@');

const skipped = (ref: string): JobOutcome => ({ result: 'sent', ref: `skipped:${ref}` });

export async function reminderJob(db: Db, job: OutboxJob, deps: ReminderDeps = {}): Promise<JobOutcome> {
  const env = deps.env ?? process.env;
  const send = deps.send ?? sendEmailChecked;
  const reminderId = typeof job.payload.reminderId === 'string' ? job.payload.reminderId : '';
  if (!reminderId) return skipped('no_reminder');
  const note = typeof job.payload.note === 'string' ? job.payload.note : '';

  const rows = (
    (await db.execute(sql`select id, user_id, invoice_id, kind, status from invoice_reminders where id = ${reminderId}::uuid`)) as unknown as {
      rows: { id: string; user_id: string; invoice_id: string; kind: string; status: string }[];
    }
  ).rows;
  const rem = rows[0];
  if (!rem) return skipped('reminder_gone');
  // Already sent or skipped (a retry after the provider accepted it): do nothing, and never send twice.
  if (rem.status !== 'queued') return skipped('already_done');

  const skip = async (reason: string): Promise<JobOutcome> => {
    await markReminderSkipped(db, reminderId, reason);
    return skipped(reason);
  };

  if (!entitlementsFrom(await getEntitlements(db, rem.user_id)).can('invoice_reminders')) return skip('no_plan');
  const facts = await reminderFacts(db, rem.user_id, rem.invoice_id);
  if (!facts) return skip('not_found');
  const today = istClock(deps.now ?? new Date()).date;
  const e = reminderEligibility(facts, today, rem.kind === 'scheduled');
  if (!e.ok) return skip(e.reason);

  const [owner] = await db.select({ email: authUsers.email, name: authUsers.name }).from(authUsers).where(eq(authUsers.id, rem.user_id));
  if (!owner) return skip('account_gone');
  const currency = (CURRENCIES as readonly string[]).includes(facts.currency) ? (facts.currency as CurrencyCode) : null;
  if (!currency) return skip('bad_currency');

  const link = await ensureLink(db, deps.secret ?? linkSecret(), { invoiceId: rem.invoice_id, userId: rem.user_id, purpose: 'share' });
  const email = reminderEmail({
    to: facts.email.trim(),
    sellerName: facts.sellerName || owner.name,
    replyTo: owner.email,
    clientName: facts.clientName,
    number: facts.number,
    currency,
    total: facts.total,
    outstanding: e.outstanding,
    dueDate: facts.dueDate,
    overdue: e.overdue,
    url: `${siteOrigin(env)}/i/${link.token}`,
    note,
  });
  const sent = await send(email, REMINDER_EMAIL_FROM, job.dedupeKey);
  if (sent.ok) {
    await markReminderSent(db, reminderId);
    return { result: 'sent', ref: sent.id };
  }
  return sent.code === 'email_not_configured' ? { result: 'blocked', code: sent.code } : { result: 'retry', code: sent.code };
}
