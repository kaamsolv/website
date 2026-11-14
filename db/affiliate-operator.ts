/**
 * Operator actions on merchants (npm run affiliate:merchant). Framework-free; takes an explicit `db`.
 *
 * Not reachable from the web: no route calls this. It is how an operator suspends a portal that has been reported,
 * puts one back, finds portals nobody ever used, and frees their address. Every change is one SQL statement and
 * leaves a row in the append-only event history (suspend and reinstate), so what was done to a portal can be shown.
 * One of the few files allowed to touch the affiliate tables (see test/affiliate-isolation.test.mts).
 */

import { sql } from 'drizzle-orm';
import { SUSPENDED_REASON_MAX } from '../app/lib/affiliate/merchant.ts';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

export type OperatorMerchant = {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  suspendedReason: string;
  ownerEmail: string;
  createdAt: Date;
  programme: 'open' | 'closed' | 'none';
  applications: number;
  openReports: number;
};

const SELECT = sql`
  select m.id, m.slug, m.name, m.status, m.suspended_reason, o.email as owner_email, m.created_at,
         coalesce(p.status, 'none') as programme,
         (select count(*)::int from programme_applications a where a.merchant_id = m.id) as applications,
         (select count(*)::int from portal_reports r where r.merchant_id = m.id and r.status = 'open') as open_reports
  from merchants m
  join auth_users o on o.id = m.owner_user_id
  left join programmes p on p.merchant_id = m.id`;

function toMerchant(r: Record<string, unknown>): OperatorMerchant {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    status: r.status === 'suspended' ? 'suspended' : 'active',
    suspendedReason: String(r.suspended_reason ?? ''),
    ownerEmail: String(r.owner_email),
    createdAt: toDate(r.created_at),
    programme: r.programme === 'open' ? 'open' : r.programme === 'closed' ? 'closed' : 'none',
    applications: Number(r.applications),
    openReports: Number(r.open_reports),
  };
}

export async function findMerchant(db: Db, slug: string): Promise<OperatorMerchant | null> {
  const rows = rowsOf<Record<string, unknown>>(await db.execute(sql`${SELECT} where m.slug = ${slug}`));
  return rows[0] ? toMerchant(rows[0]) : null;
}

export async function listMerchants(db: Db, limit = 25): Promise<OperatorMerchant[]> {
  const n = Math.min(Math.max(limit, 1), 200);
  return rowsOf<Record<string, unknown>>(await db.execute(sql`${SELECT} order by m.created_at desc limit ${n}`)).map(toMerchant);
}

/**
 * Suspends a live merchant: the portal answers 404, registration is shut to newcomers, and its owner sees the reason.
 * Open reports against it are marked reviewed in the same statement. Returns false if there is no such live merchant.
 */
export async function suspendMerchant(db: Db, slug: string, reason: string): Promise<boolean> {
  const why = reason.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, SUSPENDED_REASON_MAX);
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      with m as (
        update merchants set status = 'suspended', suspended_at = now(), suspended_reason = ${why}, updated_at = now()
         where slug = ${slug} and status = 'active' returning id
      ),
      e as (
        insert into affiliate_events (merchant_id, actor_user_id, action) select id, null, 'merchant_suspended' from m
      ),
      r as (
        update portal_reports set status = 'reviewed', handled_at = now() where merchant_id in (select id from m) and status = 'open'
      )
      select id from m
    `),
  );
  return rows.length === 1;
}

/** Puts a suspended merchant back. Returns false if there is no such suspended merchant. */
export async function reinstateMerchant(db: Db, slug: string): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      with m as (
        update merchants set status = 'active', suspended_at = null, suspended_reason = '', updated_at = now()
         where slug = ${slug} and status = 'suspended' returning id
      ),
      e as (
        insert into affiliate_events (merchant_id, actor_user_id, action) select id, null, 'merchant_reinstated' from m
      )
      select id from m
    `),
  );
  return rows.length === 1;
}

/** Portals nobody ever applied to, made more than `days` ago. The policy for freeing an unused address starts here. */
export async function staleMerchants(db: Db, days = 90): Promise<OperatorMerchant[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      ${SELECT}
      where m.created_at < now() - ${days} * interval '1 day'
        and not exists (select 1 from programme_applications a where a.merchant_id = m.id)
      order by m.created_at
      limit 200
    `),
  );
  return rows.map(toMerchant);
}

/**
 * Frees an unused address by removing the merchant (its brand, programme, reports and history go with it). Refuses
 * anything that ever had an application, or is newer than `days`, so a portal in use can't be released by mistake.
 * Returns false if it isn't releasable.
 */
export async function releaseMerchant(db: Db, slug: string, days = 90): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      delete from merchants m
       where m.slug = ${slug}
         and m.created_at < now() - ${days} * interval '1 day'
         and not exists (select 1 from programme_applications a where a.merchant_id = m.id)
      returning m.id
    `),
  );
  return rows.length === 1;
}
