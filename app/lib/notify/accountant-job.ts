/**
 * The outbox job that emails one month's accountant pack link (Invoice Pro). It decides again at send time: the pack
 * is still waiting, the account still has Pro, still sends to this accountant, and the address is still confirmed.
 * A month with no invoices and no payments is skipped with a reason, not sent as an empty pack. The email carries a
 * link that expires (7 days), never an attachment; the ZIP is built when the link is opened. Reply goes to the owner.
 * Nothing here logs an address or report content.
 */

import { eq, sql } from 'drizzle-orm';
import { getEntitlements } from '../../../db/entitlements';
import { issueLink, markPackSent, markPackSkipped } from '../../../db/accountant';
import type { Db } from '../../../db/links';
import type { JobOutcome, OutboxJob } from '../../../db/outbox';
import { authUsers } from '../../../db/schema';
import { BILLING_EMAIL_FROM, sendEmailChecked } from '../email';
import { entitlementsFrom } from '../entitlements';
import { packEmail, periodOf } from '../invoice/accountant';
import { displayDate } from '../invoice/defaults';
import { linkSecret } from '../links/token';
import { siteOrigin } from '../site-origin';

export const PACK_EMAIL_FROM = BILLING_EMAIL_FROM.replace('KaamSolv Billing <billing@', 'KaamSolv Reports <reports@');

export type PackDeps = { env?: Record<string, string | undefined>; send?: typeof sendEmailChecked; secret?: string };

const skipped = (ref: string): JobOutcome => ({ result: 'sent', ref: `skipped:${ref}` });
type Rows<T> = { rows: T[] };

export async function accountantPackJob(db: Db, job: OutboxJob, deps: PackDeps = {}): Promise<JobOutcome> {
  const env = deps.env ?? process.env;
  const send = deps.send ?? sendEmailChecked;
  const packId = typeof job.payload.packId === 'string' ? job.payload.packId : '';
  if (!packId) return skipped('no_pack');

  const pack = ((await db.execute(sql`select id, user_id, period, status from accountant_packs where id = ${packId}::uuid`)) as unknown as Rows<{ id: string; user_id: string; period: string; status: string }>).rows[0];
  if (!pack) return skipped('pack_gone');
  if (pack.status !== 'queued') return skipped('already_done');
  const skip = async (reason: string): Promise<JobOutcome> => {
    await markPackSkipped(db, packId, reason);
    return skipped(reason);
  };

  const s = ((await db.execute(sql`select accountant_name, accountant_email, enabled, verified_at is not null as verified from accountant_settings where user_id = ${pack.user_id}::uuid`)) as unknown as Rows<{ accountant_name: string; accountant_email: string; enabled: boolean; verified: boolean }>).rows[0];
  if (!s || !s.enabled) return skip('turned_off');
  if (!s.verified || !s.accountant_email) return skip('not_confirmed');
  if (!entitlementsFrom(await getEntitlements(db, pack.user_id)).can('invoice_csv_export')) return skip('no_plan');
  const p = periodOf(pack.period);
  if (!p) return skip('bad_period');

  const any = ((await db.execute(sql`
    select (exists (select 1 from invoices where user_id = ${pack.user_id}::uuid and kind = 'invoice' and issue_date between ${p.from}::date and ${p.to}::date)
         or exists (select 1 from invoice_payments where user_id = ${pack.user_id}::uuid and voided_at is null and paid_on between ${p.from}::date and ${p.to}::date)) as any`)) as unknown as Rows<{ any: boolean }>).rows[0];
  if (!any?.any) return skip('nothing_to_report');

  const [owner] = await db.select({ email: authUsers.email, name: authUsers.name }).from(authUsers).where(eq(authUsers.id, pack.user_id));
  if (!owner) return skip('account_gone');
  const biz = ((await db.execute(sql`select name from business_profiles where user_id = ${pack.user_id}::uuid`)) as unknown as Rows<{ name: string }>).rows[0]?.name?.trim() || owner.name;

  const link = await issueLink(db, deps.secret ?? linkSecret(), packId);
  const mail = packEmail({
    accountantName: s.accountant_name,
    businessName: biz,
    periodLabel: p.label,
    url: `${siteOrigin(env)}/api/accountant/download?t=${link.token}`,
    expires: displayDate(link.expiresAt.toISOString().slice(0, 10)),
    replyHint: `Questions about the figures? Reply to this email and ${biz} will see it.`,
  });
  const sent = await send({ to: s.accountant_email, ...mail, replyTo: owner.email }, PACK_EMAIL_FROM, job.dedupeKey);
  if (sent.ok) {
    await markPackSent(db, packId);
    return { result: 'sent', ref: sent.id };
  }
  return sent.code === 'email_not_configured' ? { result: 'blocked', code: sent.code } : { result: 'retry', code: sent.code };
}
