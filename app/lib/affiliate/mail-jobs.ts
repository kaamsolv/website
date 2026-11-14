/**
 * The outbox jobs behind the affiliate emails. A job holds only an application id; the people, names and address are
 * looked up here, when it runs (db/affiliate-mail.ts). The job row is written in the same SQL statement as the
 * application or the decision (db/affiliate-scope.ts, db/merchant-scope.ts), so an email can't be lost to a crash
 * between the two, and a retry can't send it twice (the dedupe key, and the provider's idempotency key).
 * A failure here never touches the application or the decision, which are already saved.
 */

import { loadMailContext } from '../../../db/affiliate-mail';
import type { Db } from '../../../db/links';
import type { JobOutcome, OutboxJob } from '../../../db/outbox';
import { sendEmailChecked, AFFILIATE_EMAIL_FROM, type Email } from '../email';
import { siteOrigin } from '../site-origin';
import { applicationDecisionEmail, applicationReceivedEmail } from './email';

type Send = (email: Email, from?: string, idempotencyKey?: string) => ReturnType<typeof sendEmailChecked>;
export type MailDeps = { env?: Record<string, string | undefined>; send?: Send };

const applicationId = (job: OutboxJob) => (typeof job.payload.applicationId === 'string' ? job.payload.applicationId : '');

async function deliver(send: Send, email: Email, key: string): Promise<JobOutcome> {
  const sent = await send(email, AFFILIATE_EMAIL_FROM, key);
  if (sent.ok) return { result: 'sent', ref: sent.id };
  return sent.code === 'email_not_configured' ? { result: 'blocked', code: sent.code } : { result: 'retry', code: sent.code };
}

/** "Someone applied": tells the merchant's owner, with a link to the inbox. */
export async function affiliateReceivedJob(db: Db, job: OutboxJob, deps: MailDeps = {}): Promise<JobOutcome> {
  const id = applicationId(job);
  const ctx = id ? await loadMailContext(db, id) : null;
  if (!ctx) return { result: 'sent', ref: 'skipped:application_gone' };
  const origin = siteOrigin(deps.env ?? process.env);
  const email = applicationReceivedEmail({
    to: ctx.ownerEmail,
    ownerName: ctx.ownerName,
    applicantName: ctx.applicantName,
    programmeName: ctx.programmeName,
    reviewUrl: `${origin}/app/affiliate/applications?status=pending`,
  });
  return deliver(deps.send ?? sendEmailChecked, email, job.dedupeKey);
}

/** "Approved" or "not approved": tells the applicant, with the merchant's reason if they gave one. */
export async function affiliateDecisionJob(db: Db, job: OutboxJob, deps: MailDeps = {}): Promise<JobOutcome> {
  const id = applicationId(job);
  const ctx = id ? await loadMailContext(db, id) : null;
  if (!ctx) return { result: 'sent', ref: 'skipped:application_gone' };
  if (ctx.status !== 'approved' && ctx.status !== 'rejected') return { result: 'sent', ref: 'skipped:not_decided' };
  const origin = siteOrigin(deps.env ?? process.env);
  const email = applicationDecisionEmail({
    to: ctx.applicantEmail,
    name: ctx.applicantName,
    merchantName: ctx.merchantName,
    programmeName: ctx.programmeName,
    approved: ctx.status === 'approved',
    note: ctx.decisionNote,
    programmesUrl: `${origin}/app/affiliate/programmes`,
    portalUrl: `${origin}/affiliate/${ctx.slug}`,
  });
  return deliver(deps.send ?? sendEmailChecked, email, job.dedupeKey);
}
