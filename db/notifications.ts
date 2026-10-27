/**
 * Email preferences and the queueing of scheduled summaries (billing M3). Framework-free; takes an explicit `db`.
 * A row in `notification_prefs` is an account's opt-in: no row, no email. Summaries go only to the account's own
 * address, only while the account still has the plan, and only when there is something to report (the job checks).
 */

import { eq, sql } from 'drizzle-orm';
import { dueCadences, type Cadence } from '../app/lib/notify/schedule.ts';
import type { Db } from './links.ts';
import { notificationPrefs } from './schema.ts';

export async function getSummaryCadence(db: Db, userId: string): Promise<Cadence> {
  const [row] = await db.select({ c: notificationPrefs.summaryCadence }).from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  return row?.c === 'weekly' || row?.c === 'monthly' ? row.c : 'off';
}

export async function setSummaryCadence(db: Db, userId: string, cadence: Cadence): Promise<void> {
  await db
    .insert(notificationPrefs)
    .values({ userId, summaryCadence: cadence })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: { summaryCadence: cadence, updatedAt: new Date() } });
}

/**
 * Queues this period's summary for every account that opted in to what is due now (India time). Safe to call on
 * every scheduled run: the duplicate key means each account gets each period's job once. Returns how many were added.
 * Costs no query at all outside the delivery windows.
 */
export async function enqueueDueSummaries(db: Db, now: Date = new Date()): Promise<number> {
  let added = 0;
  for (const { cadence, key } of dueCadences(now)) {
    const result = (await db.execute(sql`
      insert into outbox (kind, dedupe_key, payload)
      select 'receivables_summary', 'summary:' || user_id::text || ':' || ${key}::text, jsonb_build_object('userId', user_id, 'period', ${key}::text)
        from notification_prefs where summary_cadence = ${cadence}
      on conflict (dedupe_key) do nothing
      returning id`)) as unknown as { rows: unknown[] };
    added += result.rows.length;
  }
  return added;
}
