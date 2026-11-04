/**
 * The outbox job that makes one automatic recurring invoice (Invoice Pro). Everything is decided again at run time:
 * the schedule is still on, not paused or ended, still due for exactly this period, and the owner still has Pro.
 * The copy is made by the same `recurInvoice` the "Due to repeat" button uses (same numbering, due date and plan
 * limit; the schedule moves on in one compare-and-set), after the period is claimed in `recurring_runs`, whose
 * unique key means a retry or an overlapping run cannot make it twice. A failure is recorded and shown, not retried
 * blindly. The new invoice is never emailed or shared by this job.
 */

import { sql } from 'drizzle-orm';
import { getEntitlements } from '../../../db/entitlements';
import { recurInvoice } from '../../../db/invoices';
import type { Db } from '../../../db/links';
import type { JobOutcome, OutboxJob } from '../../../db/outbox';
import { claimRun, countRun, finishRun } from '../../../db/recurring-auto';
import { entitlementsFrom } from '../entitlements';
import { isIsoDate } from '../invoice/recurring';
import { istClock } from './schedule';

export type RecurringDeps = { now?: Date };

const done = (ref: string): JobOutcome => ({ result: 'sent', ref });

export async function recurringJob(db: Db, job: OutboxJob, deps: RecurringDeps = {}): Promise<JobOutcome> {
  const invoiceId = typeof job.payload.invoiceId === 'string' ? job.payload.invoiceId : '';
  const dueOn = job.payload.dueOn;
  if (!invoiceId || !isIsoDate(dueOn)) return done('skipped:bad_job');
  const today = istClock(deps.now ?? new Date()).date;

  const t = (
    (await db.execute(sql`
      select i.user_id, i.kind, i.recur_every, i.recur_next::text as recur_next, a.auto_create, a.paused, a.ended_at, a.ends_on::text as ends_on, a.max_runs, a.runs_done
        from invoices i join recurring_automation a on a.invoice_id = i.id where i.id = ${invoiceId}::uuid`)) as unknown as {
      rows: { user_id: string; kind: string; recur_every: string | null; recur_next: string | null; auto_create: boolean; paused: boolean; ended_at: string | null; ends_on: string | null; max_runs: number | null; runs_done: number }[];
    }
  ).rows[0];
  if (!t || t.kind !== 'invoice') return done('skipped:gone');
  if (!t.auto_create || t.paused || t.ended_at || !t.recur_every) return done('skipped:off');
  // The period must still be exactly this one and due now: a click on "Create" or "Skip" meanwhile means nothing to do.
  if (t.recur_next !== dueOn || dueOn > today) return done('skipped:already_handled');
  if (t.ends_on && dueOn > t.ends_on) return done('skipped:past_end');
  if (t.max_runs !== null && t.runs_done >= t.max_runs) return done('skipped:run_limit');

  const ent = entitlementsFrom(await getEntitlements(db, t.user_id));
  const claim = await claimRun(db, t.user_id, invoiceId, dueOn);
  if ('skip' in claim) return done(`skipped:${claim.skip}`);
  if (!ent.can('invoice_recurring')) {
    await finishRun(db, claim.runId, { status: 'skipped', reason: 'no_plan' });
    return done('skipped:no_plan');
  }

  const r = await recurInvoice(db, t.user_id, invoiceId, 'create', today, ent.limit('invoice_save'));
  if (!r.ok) {
    await finishRun(db, claim.runId, { status: 'failed', reason: r.reason });
    return done(`failed:${r.reason}`);
  }
  await finishRun(db, claim.runId, { status: 'created', ...(r.id ? { createdInvoiceId: r.id } : {}) });
  await countRun(db, invoiceId, r.next);
  return done('created');
}
