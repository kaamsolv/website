/**
 * The outbox: durable "do this later, and don't do it twice" jobs (billing M2). Framework-free; takes an
 * explicit `db`.
 *
 * A job is written first and attempted second, so a crash, a timeout or a provider outage leaves a row that the
 * next run picks up instead of a lost email. `dedupe_key` makes enqueueing the same thing twice a no-op. A job
 * that dies mid-attempt is claimable again after CLAIM_TIMEOUT_MINUTES. Retries back off, then stop as `dead`
 * where an operator can see them (listStuck). Nothing here stores an address or a message body.
 */

import { sql } from 'drizzle-orm';
import type { Db } from './links.ts';

export type OutboxKind = 'billing_invoice' | 'receivables_summary';

export type OutboxJob = { id: string; kind: string; dedupeKey: string; payload: Record<string, unknown>; attempts: number };

export type JobOutcome =
  /** Done. `ref` is the provider's id for it (kept so support can find the email). */
  | { result: 'sent'; ref?: string }
  /** Not possible until something is configured; do not count it as a failure, retry on the slow schedule. */
  | { result: 'blocked'; code: string }
  /** Try again later. */
  | { result: 'retry'; code: string };

/** Minutes between attempts after the 1st, 2nd, 3rd… failure; after the last the job is `dead`. */
export const BACKOFF_MINUTES = [1, 5, 30, 120, 360] as const;
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
/** A job claimed this long ago and never finished is assumed to have died with its worker. */
export const CLAIM_TIMEOUT_MINUTES = 10;
/** A blocked job (a setting is missing) is looked at again this often. */
export const BLOCKED_RECHECK_MINUTES = 30;

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

/** Adds a job; the same `dedupeKey` twice adds one. Returns true when this call added it. */
export async function enqueue(db: Db, kind: OutboxKind, dedupeKey: string, payload: Record<string, unknown>): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      insert into outbox (kind, dedupe_key, payload) values (${kind}, ${dedupeKey}, ${JSON.stringify(payload)}::jsonb)
      on conflict (dedupe_key) do nothing returning id`),
  );
  return rows.length > 0;
}

/**
 * Takes up to `limit` due jobs, marking them `sending` so a second runner skips them (FOR UPDATE SKIP LOCKED).
 * A job already `sending` is only taken again once its claim has timed out.
 */
export async function claimDue(db: Db, limit = 10): Promise<OutboxJob[]> {
  const rows = rowsOf<{ id: string; kind: string; dedupe_key: string; payload: Record<string, unknown>; attempts: number }>(
    await db.execute(sql`
      update outbox set status = 'sending', claimed_at = now(), attempts = attempts + 1, updated_at = now()
       where id in (
         select id from outbox
          where (status in ('pending', 'failed', 'blocked') and next_attempt_at <= now())
             or (status = 'sending' and claimed_at < now() - make_interval(mins => ${CLAIM_TIMEOUT_MINUTES}))
          order by next_attempt_at
          limit ${limit}
          for update skip locked)
      returning id, kind, dedupe_key, payload, attempts`),
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, dedupeKey: r.dedupe_key, payload: r.payload, attempts: r.attempts }));
}

/** Records how an attempt ended. */
export async function settle(db: Db, job: OutboxJob, outcome: JobOutcome): Promise<'sent' | 'failed' | 'blocked' | 'dead'> {
  if (outcome.result === 'sent') {
    await db.execute(sql`update outbox set status = 'sent', sent_at = now(), provider_ref = ${outcome.ref ?? ''}, last_error = '', claimed_at = null, updated_at = now() where id = ${job.id}::uuid`);
    return 'sent';
  }
  if (outcome.result === 'blocked') {
    await db.execute(sql`
      update outbox set status = 'blocked', attempts = 0, last_error = ${outcome.code.slice(0, 80)}, claimed_at = null,
             next_attempt_at = now() + make_interval(mins => ${BLOCKED_RECHECK_MINUTES}), updated_at = now()
       where id = ${job.id}::uuid`);
    return 'blocked';
  }
  if (job.attempts >= MAX_ATTEMPTS) {
    await db.execute(sql`update outbox set status = 'dead', last_error = ${outcome.code.slice(0, 80)}, claimed_at = null, updated_at = now() where id = ${job.id}::uuid`);
    return 'dead';
  }
  const wait = BACKOFF_MINUTES[Math.min(job.attempts, BACKOFF_MINUTES.length) - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
  await db.execute(sql`
    update outbox set status = 'failed', last_error = ${outcome.code.slice(0, 80)}, claimed_at = null,
           next_attempt_at = now() + make_interval(mins => ${wait}), updated_at = now()
     where id = ${job.id}::uuid`);
  return 'failed';
}

export type Handlers = Record<string, (job: OutboxJob) => Promise<JobOutcome>>;

/** Runs due jobs through their handlers. A handler that throws is a retry: one bad job never stops the rest. */
export async function runDue(db: Db, handlers: Handlers, limit = 10): Promise<{ claimed: number; sent: number; failed: number; blocked: number; dead: number }> {
  const jobs = await claimDue(db, limit);
  const tally = { claimed: jobs.length, sent: 0, failed: 0, blocked: 0, dead: 0 };
  for (const job of jobs) {
    let outcome: JobOutcome;
    try {
      const handler = handlers[job.kind];
      outcome = handler ? await handler(job) : { result: 'blocked', code: 'no_handler' };
    } catch {
      outcome = { result: 'retry', code: 'handler_threw' };
    }
    tally[await settle(db, job, outcome)]++;
  }
  return tally;
}

/** Support view: jobs that need a person (gave up, or waiting on a setting). */
export async function listStuck(db: Db, limit = 50) {
  return rowsOf<{ id: string; kind: string; dedupe_key: string; status: string; attempts: number; last_error: string; updated_at: string }>(
    await db.execute(sql`select id, kind, dedupe_key, status, attempts, last_error, updated_at from outbox where status in ('dead', 'blocked') order by updated_at desc limit ${limit}`),
  );
}
