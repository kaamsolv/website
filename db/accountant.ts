/**
 * Accountant Connect: settings, confirming the accountant's address, queueing the monthly pack, its history, and
 * the expiring download link. Framework-free; takes an explicit `db`; every query is scoped to the owner, except
 * the two token lookups, which find one row by the hash of a one-time or expiring token.
 *
 * The ZIP is never stored (db/accountant-pack.ts builds it from the live records when the link is opened), and
 * nothing here holds report content.
 */

import { sql } from 'drizzle-orm';
import { deriveToken, hashToken, isTokenShape } from '../app/lib/links/token.ts';
import { LINK_DAYS, VERIFY_HOURS, isSection, nextDelivery, packKey, previousMonth, type AccountantSettings, type PackSection } from '../app/lib/invoice/accountant.ts';
import type { Clock } from '../app/lib/invoice/accountant.ts';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export type SettingsView = {
  name: string;
  email: string;
  enabled: boolean;
  day: number;
  hour: number;
  timezone: string;
  sections: PackSection[];
  /** The address has been confirmed by its owner. */
  verified: boolean;
  /** A confirmation email is out and its link has not expired. */
  confirmationPending: boolean;
};

export async function getSettings(db: Db, userId: string): Promise<SettingsView | null> {
  const r = rowsOf<Record<string, unknown>>(
    await db.execute(sql`select accountant_name, accountant_email, enabled, day_of_month, send_hour, timezone, sections, verified_at, verify_hash, verify_expires_at > now() as pending from accountant_settings where user_id = ${userId}::uuid`),
  )[0];
  if (!r) return null;
  return {
    name: String(r.accountant_name),
    email: String(r.accountant_email),
    enabled: r.enabled === true,
    day: Number(r.day_of_month),
    hour: Number(r.send_hour),
    timezone: String(r.timezone),
    sections: (r.sections as string[]).filter(isSection),
    verified: !!r.verified_at,
    confirmationPending: !!r.verify_hash && r.pending === true,
  };
}

/**
 * Saves the settings. A different address clears its confirmation, turns sending off until it is confirmed again, and
 * ends every pack link already sent (they were for the old address). Returns whether the address changed.
 */
export async function saveSettings(db: Db, userId: string, s: AccountantSettings): Promise<{ addressChanged: boolean }> {
  const before = rowsOf<{ accountant_email: string }>(await db.execute(sql`select accountant_email from accountant_settings where user_id = ${userId}::uuid`))[0];
  const addressChanged = !before || before.accountant_email !== s.email;
  const arr = `{${s.sections.join(',')}}`;
  await db.execute(sql`
    insert into accountant_settings (user_id, accountant_name, accountant_email, enabled, day_of_month, send_hour, sections)
    values (${userId}::uuid, ${s.name}, ${s.email}, ${s.enabled}, ${s.day}, ${s.hour}, ${arr}::text[])
    on conflict (user_id) do update set accountant_name = excluded.accountant_name, accountant_email = excluded.accountant_email,
      enabled = excluded.enabled, day_of_month = excluded.day_of_month, send_hour = excluded.send_hour, sections = excluded.sections,
      updated_at = now()`);
  if (addressChanged) {
    await db.execute(sql`update accountant_settings set verified_at = null, verify_hash = null, verify_expires_at = null, enabled = false where user_id = ${userId}::uuid`);
    await revokeLinks(db, userId);
  }
  return { addressChanged };
}

/** Starts confirmation: a new one-time token (the previous one stops working). Returns the token to email. */
export async function startVerification(db: Db, userId: string, secret: string): Promise<string | null> {
  const id = crypto.randomUUID();
  const token = await deriveToken(secret, id);
  const rows = rowsOf<{ user_id: string }>(
    await db.execute(sql`
      update accountant_settings set verify_hash = ${await hashToken(token)}, verify_expires_at = now() + make_interval(hours => ${VERIFY_HOURS}), updated_at = now()
       where user_id = ${userId}::uuid and accountant_email <> '' and verified_at is null returning user_id`),
  );
  return rows.length ? token : null;
}

/** Looks up the business a confirmation link is for (no change), so the page can say who is asking. */
export async function peekVerification(db: Db, token: string): Promise<{ accountantName: string; businessName: string } | null> {
  if (!isTokenShape(token)) return null;
  const r = rowsOf<{ accountant_name: string; business: string | null }>(
    await db.execute(sql`
      select s.accountant_name, b.name as business from accountant_settings s left join business_profiles b on b.user_id = s.user_id
       where s.verify_hash = ${await hashToken(token)} and s.verify_expires_at > now() and s.verified_at is null`),
  )[0];
  return r ? { accountantName: r.accountant_name, businessName: r.business ?? '' } : null;
}

/** Confirms the address. The token works once; a wrong, used or expired one is the same `false`. */
export async function confirmVerification(db: Db, token: string): Promise<boolean> {
  if (!isTokenShape(token)) return false;
  const rows = rowsOf<{ user_id: string }>(
    await db.execute(sql`
      update accountant_settings set verified_at = now(), verify_hash = null, verify_expires_at = null, updated_at = now()
       where verify_hash = ${await hashToken(token)} and verify_expires_at > now() and verified_at is null returning user_id`),
  );
  return rows.length > 0;
}

/**
 * Queues last month's pack for every account that turned it on, confirmed its accountant and whose day and hour have
 * come (India time). One statement; the key is (account, month), so each month is queued once however often this runs.
 */
export async function enqueueDuePacks(db: Db, now: Clock): Promise<number> {
  const prev = previousMonth(now.date);
  const day = Number(now.date.slice(8, 10));
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      with due as (
        select user_id from accountant_settings
         where enabled and verified_at is not null and accountant_email <> ''
           and (day_of_month < ${day} or (day_of_month = ${day} and send_hour <= ${now.hour}))
      ), packs as (
        insert into accountant_packs (user_id, period, dedupe_key)
        select user_id, ${prev.period}, 'accountant-pack:' || user_id::text || ':' || ${prev.period} from due
        on conflict (dedupe_key) do nothing
        returning id, dedupe_key
      )
      insert into outbox (kind, dedupe_key, payload)
      select 'accountant_pack', dedupe_key, jsonb_build_object('packId', id) from packs
      on conflict (dedupe_key) do nothing
      returning id`),
  );
  return rows.length;
}

export type PackRow = {
  id: string;
  period: string;
  state: 'sending' | 'retrying' | 'failed' | 'waiting' | 'sent' | 'skipped';
  reason: string;
  sentAt: string | null;
  expiresAt: string | null;
  linkLive: boolean;
  downloads: number;
  lastDownloadedAt: string | null;
  attempts: number;
  nextAttemptAt: string | null;
};

export async function listPacks(db: Db, userId: string, limit = 12): Promise<PackRow[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select p.id, p.period, p.status, p.reason, p.sent_at, p.expires_at, p.token_hash is not null and p.expires_at > now() as live, p.download_count, p.last_downloaded_at,
             o.status as o_status, o.attempts, o.last_error, o.next_attempt_at
        from accountant_packs p left join outbox o on o.dedupe_key = p.dedupe_key
       where p.user_id = ${userId}::uuid order by p.period desc, p.created_at desc limit ${limit}`),
  );
  return rows.map((r): PackRow => {
    const st = String(r.status);
    const o = r.o_status ? String(r.o_status) : null;
    const state = st === 'sent' ? 'sent' : st === 'skipped' ? 'skipped' : o === 'dead' ? 'failed' : o === 'failed' ? 'retrying' : o === 'blocked' ? 'waiting' : 'sending';
    return {
      id: String(r.id),
      period: String(r.period),
      state,
      reason: state === 'skipped' ? String(r.reason) : state === 'failed' || state === 'retrying' || state === 'waiting' ? String(r.last_error ?? '') : '',
      sentAt: r.sent_at ? new Date(String(r.sent_at)).toISOString() : null,
      expiresAt: r.expires_at ? new Date(String(r.expires_at)).toISOString() : null,
      linkLive: r.live === true,
      downloads: Number(r.download_count),
      lastDownloadedAt: r.last_downloaded_at ? new Date(String(r.last_downloaded_at)).toISOString() : null,
      attempts: Number(r.attempts ?? 0),
      nextAttemptAt: state === 'retrying' && r.next_attempt_at ? new Date(String(r.next_attempt_at)).toISOString() : null,
    };
  });
}

/** Whether this month's pack (for last month) has already been queued: decides what "next delivery" says. */
export async function queuedThisMonth(db: Db, userId: string, now: Clock): Promise<boolean> {
  const prev = previousMonth(now.date).period;
  return rowsOf<{ id: string }>(await db.execute(sql`select id from accountant_packs where dedupe_key = ${packKey(userId, prev)}`)).length > 0;
}

export function nextFor(s: SettingsView, now: Clock, queued: boolean) {
  return nextDelivery(now, s.day, s.hour, queued);
}

/** "Try again" for a pack that gave up or is waiting on a setting. The job re-checks everything. */
export async function retryPack(db: Db, userId: string, packId: string): Promise<'queued' | 'not_retryable' | 'not_found'> {
  const p = rowsOf<{ status: string; dedupe_key: string }>(await db.execute(sql`select status, dedupe_key from accountant_packs where id = ${packId}::uuid and user_id = ${userId}::uuid`))[0];
  if (!p) return 'not_found';
  if (p.status !== 'queued') return 'not_retryable';
  const moved = rowsOf<{ id: string }>(
    await db.execute(sql`update outbox set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = '', claimed_at = null, updated_at = now() where dedupe_key = ${p.dedupe_key} and status in ('dead', 'blocked', 'failed') returning id`),
  );
  return moved.length ? 'queued' : 'not_retryable';
}

/** Ends every live pack link of the account right now. Returns how many were ended. */
export async function revokeLinks(db: Db, userId: string): Promise<number> {
  return rowsOf<{ id: string }>(await db.execute(sql`update accountant_packs set expires_at = now() where user_id = ${userId}::uuid and expires_at > now() returning id`)).length;
}

/** Issues the pack's link when it is sent: the token is rebuilt from the pack id, so a retry emails the same link. */
export async function issueLink(db: Db, secret: string, packId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = await deriveToken(secret, packId);
  const rows = rowsOf<{ expires_at: string }>(
    await db.execute(sql`
      update accountant_packs set token_hash = ${await hashToken(token)}, expires_at = coalesce(expires_at, now() + make_interval(days => ${LINK_DAYS}))
       where id = ${packId}::uuid returning expires_at`),
  );
  return { token, expiresAt: new Date(rows[0]?.expires_at ?? Date.now()) };
}

export async function markPackSent(db: Db, packId: string): Promise<void> {
  await db.execute(sql`update accountant_packs set status = 'sent', sent_at = now() where id = ${packId}::uuid and status = 'queued'`);
}
export async function markPackSkipped(db: Db, packId: string, reason: string): Promise<void> {
  await db.execute(sql`update accountant_packs set status = 'skipped', reason = ${reason.slice(0, 40)} where id = ${packId}::uuid and status = 'queued'`);
}

export type PackLink = { packId: string; userId: string; period: string };

/**
 * Opens a pack link by its token and counts the download. A token that is the wrong shape, unknown, expired or ended
 * is the same `null`. Only a pack that was actually sent has a live link, and only while the account still has this
 * accountant confirmed.
 */
export async function resolvePackLink(db: Db, token: string): Promise<PackLink | null> {
  if (!isTokenShape(token)) return null;
  const r = rowsOf<{ id: string; user_id: string; period: string }>(
    await db.execute(sql`
      update accountant_packs p set download_count = download_count + 1, last_downloaded_at = now()
       where p.token_hash = ${await hashToken(token)} and p.status = 'sent' and p.expires_at > now()
         and exists (select 1 from accountant_settings s where s.user_id = p.user_id and s.verified_at is not null)
       returning p.id, p.user_id, p.period`),
  )[0];
  return r ? { packId: r.id, userId: r.user_id, period: r.period } : null;
}
