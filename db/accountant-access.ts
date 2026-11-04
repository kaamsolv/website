/**
 * A named accountant's read-only access to one owner's books: invite, accept, revoke, the grant check every read goes
 * through, and the activity log. Framework-free; takes an explicit `db`.
 *
 * Authorization lives here and in the API that calls it, never in the page: `grantFor` is the single question "may
 * this signed-in person read this owner's books right now?", asked on every request. Revoking, or the invited
 * person's account going away, answers no on the very next one. The log keeps what was opened, never its content.
 */

import { sql } from 'drizzle-orm';
import { hashToken, isTokenShape, deriveToken } from '../app/lib/links/token.ts';
import { INVITE_DAYS, MAX_ACCOUNTANTS, type AccessView } from '../app/lib/invoice/accountant-access.ts';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

export type AccessAction = 'invited' | 'accepted' | 'revoked' | 'viewed' | 'downloaded';

/** Records what happened. A "viewed" of the same thing within the hour is not written again (the log stays readable). */
export async function logEvent(db: Db, ownerId: string, accessId: string, action: AccessAction, detail = ''): Promise<void> {
  const d = detail.slice(0, 60);
  if (action === 'viewed') {
    await db.execute(sql`
      insert into accountant_access_events (owner_id, access_id, action, detail)
      select ${ownerId}::uuid, ${accessId}::uuid, 'viewed', ${d}
       where not exists (select 1 from accountant_access_events where access_id = ${accessId}::uuid and action = 'viewed' and detail = ${d} and at > now() - interval '1 hour')`);
    return;
  }
  await db.execute(sql`insert into accountant_access_events (owner_id, access_id, action, detail) values (${ownerId}::uuid, ${accessId}::uuid, ${action}, ${d})`);
}

export type InviteResult = { ok: true; token: string; accessId: string } | { ok: false; reason: 'already_active' | 'too_many' };

/**
 * Invites an email address (or sends a fresh invitation to one already invited or revoked). The new token replaces any
 * earlier one. An address that already has access is refused, so an invitation can't be used to reset someone's access.
 */
export async function invite(db: Db, ownerId: string, secret: string, who: { name: string; email: string }): Promise<InviteResult> {
  const existing = rowsOf<{ id: string; status: string }>(await db.execute(sql`select id, status from accountant_access where owner_id = ${ownerId}::uuid and email = ${who.email}`))[0];
  if (existing?.status === 'active') return { ok: false, reason: 'already_active' };
  if (!existing || existing.status === 'revoked') {
    const live = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from accountant_access where owner_id = ${ownerId}::uuid and status <> 'revoked'`))[0]?.n ?? 0;
    if (live >= MAX_ACCOUNTANTS) return { ok: false, reason: 'too_many' };
  }
  const id = existing?.id ?? crypto.randomUUID();
  const token = await deriveToken(secret, crypto.randomUUID());
  const hash = await hashToken(token);
  await db.execute(sql`
    insert into accountant_access (id, owner_id, email, name, status, invite_hash, invite_expires_at)
    values (${id}::uuid, ${ownerId}::uuid, ${who.email}, ${who.name}, 'invited', ${hash}, now() + make_interval(days => ${INVITE_DAYS}))
    on conflict (owner_id, email) do update set name = excluded.name, status = 'invited', invite_hash = excluded.invite_hash,
      invite_expires_at = excluded.invite_expires_at, accountant_user_id = null, accepted_at = null, revoked_at = null`);
  await logEvent(db, ownerId, id, 'invited');
  return { ok: true, token, accessId: id };
}

export type AccessRow = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'revoked';
  inviteExpired: boolean;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastOpenedAt: string | null;
};

export async function listAccess(db: Db, ownerId: string): Promise<AccessRow[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select a.id, a.name, a.email, a.status, a.invite_expires_at < now() as expired, a.accepted_at, a.revoked_at,
             (select max(e.at) from accountant_access_events e where e.access_id = a.id and e.action in ('viewed', 'downloaded')) as last_opened
        from accountant_access a where a.owner_id = ${ownerId}::uuid order by a.created_at desc`),
  );
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    status: String(r.status) as AccessRow['status'],
    inviteExpired: r.status === 'invited' && r.expired === true,
    acceptedAt: iso(r.accepted_at),
    revokedAt: iso(r.revoked_at),
    lastOpenedAt: iso(r.last_opened),
  }));
}

export type EventRow = { id: string; who: string; action: AccessAction; detail: string; at: string };

export async function recentEvents(db: Db, ownerId: string, limit = 20): Promise<EventRow[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select e.id, a.name, e.action, e.detail, e.at from accountant_access_events e join accountant_access a on a.id = e.access_id
       where e.owner_id = ${ownerId}::uuid order by e.at desc limit ${limit}`),
  );
  return rows.map((r) => ({ id: String(r.id), who: String(r.name), action: String(r.action) as AccessAction, detail: String(r.detail), at: new Date(String(r.at)).toISOString() }));
}

/** Ends an accountant's access at once (and any invitation still open). Only the owner's own row. */
export async function revoke(db: Db, ownerId: string, accessId: string): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      update accountant_access set status = 'revoked', revoked_at = now(), invite_hash = null, invite_expires_at = null
       where id = ${accessId}::uuid and owner_id = ${ownerId}::uuid and status <> 'revoked' returning id`),
  );
  if (!rows.length) return false;
  await logEvent(db, ownerId, accessId, 'revoked');
  return true;
}

/** The address and name behind an invitation, for the owner to resend to. */
export async function inviteTarget(db: Db, ownerId: string, accessId: string): Promise<{ name: string; email: string } | null> {
  const r = rowsOf<{ name: string; email: string }>(await db.execute(sql`select name, email from accountant_access where id = ${accessId}::uuid and owner_id = ${ownerId}::uuid and status = 'invited'`))[0];
  return r ?? null;
}

export type InvitePeek = { name: string; email: string; businessName: string };

/** Who an open invitation is for (no change), so the page can say what is being asked. A wrong, used or expired token is null. */
export async function peekInvite(db: Db, token: string): Promise<InvitePeek | null> {
  if (!isTokenShape(token)) return null;
  const r = rowsOf<{ name: string; email: string; business: string | null }>(
    await db.execute(sql`
      select a.name, a.email, b.name as business from accountant_access a left join business_profiles b on b.user_id = a.owner_id
       where a.invite_hash = ${await hashToken(token)} and a.invite_expires_at > now() and a.status = 'invited'`),
  )[0];
  return r ? { name: r.name, email: r.email, businessName: r.business ?? '' } : null;
}

export type Acceptor = { id: string; email: string; emailVerified: boolean };

/**
 * Accepts an invitation as the signed-in person. It works only for the invited address, on a verified account, once,
 * before it expires. Another signed-in address cannot use the link, and it is not used up when they try.
 */
export async function acceptInvite(db: Db, token: string, who: Acceptor): Promise<'ok' | 'invalid' | 'wrong_account' | 'unverified'> {
  if (!isTokenShape(token)) return 'invalid';
  const peek = await peekInvite(db, token);
  if (!peek) return 'invalid';
  if (peek.email !== who.email.trim().toLowerCase()) return 'wrong_account';
  if (!who.emailVerified) return 'unverified';
  const rows = rowsOf<{ id: string; owner_id: string }>(
    await db.execute(sql`
      update accountant_access set status = 'active', accountant_user_id = ${who.id}::uuid, accepted_at = now(), invite_hash = null, invite_expires_at = null
       where invite_hash = ${await hashToken(token)} and invite_expires_at > now() and status = 'invited' and email = ${who.email.trim().toLowerCase()}
       returning id, owner_id`),
  );
  if (!rows.length) return 'invalid';
  await logEvent(db, rows[0].owner_id, rows[0].id, 'accepted');
  return 'ok';
}

export type Client = { accessId: string; ownerId: string; businessName: string; since: string };

/** The businesses this signed-in person may read right now. */
export async function clientsOf(db: Db, userId: string): Promise<Client[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select a.id, a.owner_id, coalesce(nullif(trim(b.name), ''), u.name, '') as business, a.accepted_at
        from accountant_access a join auth_users u on u.id = a.owner_id left join business_profiles b on b.user_id = a.owner_id
       where a.accountant_user_id = ${userId}::uuid and a.status = 'active' order by a.accepted_at desc`),
  );
  return rows.map((r) => ({ accessId: String(r.id), ownerId: String(r.owner_id), businessName: String(r.business), since: new Date(String(r.accepted_at)).toISOString() }));
}

/** THE check: may this person read this owner's books right now? Null is "no", for every reason. */
export async function grantFor(db: Db, userId: string, ownerId: string): Promise<{ accessId: string; businessName: string } | null> {
  const r = rowsOf<{ id: string; business: string }>(
    await db.execute(sql`
      select a.id, coalesce(nullif(trim(b.name), ''), u.name, '') as business
        from accountant_access a join auth_users u on u.id = a.owner_id left join business_profiles b on b.user_id = a.owner_id
       where a.accountant_user_id = ${userId}::uuid and a.owner_id = ${ownerId}::uuid and a.status = 'active'`),
  )[0];
  return r ? { accessId: r.id, businessName: r.business } : null;
}

export type CustomerView = { name: string; gstin: string; state: string };

/** The owner's saved customers as the accountant sees them: name, GSTIN and state only. Never email, phone or address. */
export async function customersView(db: Db, ownerId: string, page: number, pageSize = 100): Promise<{ rows: CustomerView[]; matched: number }> {
  const rows = rowsOf<{ name: string; gstin: string; state_code: string }>(
    await db.execute(sql`select name, gstin, state_code from customers where user_id = ${ownerId}::uuid order by name asc, id asc limit ${pageSize} offset ${(page - 1) * pageSize}`),
  );
  const n = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from customers where user_id = ${ownerId}::uuid`))[0]?.n ?? 0;
  return { rows: rows.map((r) => ({ name: r.name, gstin: r.gstin, state: r.state_code })), matched: n };
}

export const viewDetail = (v: AccessView, period: string): string => `${v} ${period}`.trim();
