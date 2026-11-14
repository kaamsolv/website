/**
 * Orders from a business's WooCommerce store, credited to affiliates by coupon code (Affiliate Manager, Phase 3B).
 * Framework-free; takes an explicit `db`. One of the few files allowed to touch the affiliate tables
 * (test/affiliate-isolation.test.mts).
 *
 * Doors, each bound in its WHERE clause to one owner of the rows:
 *   - merchant side (`merchantId` comes from the signed-in owner, never the request): connect, rotate, disconnect,
 *     set or clear an affiliate's coupon, read stats and recent orders for that business only;
 *   - affiliate side (`userId` is the signed-in account): their coupon, their orders, their numbers only;
 *   - the webhook door (`recordOrder`, `connectionForDelivery`): one connection id from the URL, no user.
 *
 * Every write is ONE SQL statement (Neon over HTTP can't hold a transaction). The order write is the careful one:
 *   • a NEW order is credited only when exactly one coupon on it maps, at the moment the order was placed, to an active
 *     membership of an active business; two affiliate coupons on one order credit nobody (and are counted);
 *   • an order already recorded keeps taking later updates even if the affiliate or business is suspended since;
 *   • an update only lands if it is newer under `orderVersion` (modified time, status, refund, digest), compared as a SQL
 *     row, so repeated and out-of-order deliveries settle on the same row, even two with the same second.
 */

import { sql } from 'drizzle-orm';
import { STATUS_RANK, type OrderStatus, type ParsedOrder } from '../app/lib/affiliate/orders.ts';
import type { Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string | number | Date).toISOString());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What counts as a sale, in SQL: paid orders only, net of refunds, never below zero. Mirrors `netSalePaise`. */
const NET = sql.raw(`case when o.status in ('processing','completed') then greatest(o.sale_paise - o.refunded_paise, 0) else 0 end`);

// ─── Store connection (merchant side) ─────────────────────────────────────────

export type StoreConnection = {
  id: string;
  secretVersion: number;
  lastReceivedAt: string | null;
  ambiguousOrders: number;
  ordersRecorded: number;
};

function connectionRow(r: Record<string, unknown>): StoreConnection {
  return {
    id: String(r.id),
    secretVersion: Number(r.secret_version),
    lastReceivedAt: iso(r.last_received_at),
    ambiguousOrders: Number(r.ambiguous_orders),
    ordersRecorded: Number(r.orders_recorded ?? 0),
  };
}

/** THIS business's connection, or null if it hasn't made one. */
export async function connectionFor(db: Db, merchantId: string): Promise<StoreConnection | null> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select c.id, c.secret_version, c.last_received_at, c.ambiguous_orders,
             (select count(*)::int from affiliate_orders o where o.merchant_id = c.merchant_id) as orders_recorded
        from store_connections c
       where c.merchant_id = ${merchantId}::uuid
    `),
  );
  return rows[0] ? connectionRow(rows[0]) : null;
}

/** Makes the business's connection if it has none (one per business), with a history entry. Not for a suspended business. */
export async function connectStore(db: Db, merchantId: string, actorUserId: string): Promise<StoreConnection | null> {
  await db.execute(sql`
    with c as (
      insert into store_connections (merchant_id)
      select m.id from merchants m where m.id = ${merchantId}::uuid and m.status = 'active'
      on conflict (merchant_id) do nothing
      returning merchant_id
    )
    insert into affiliate_events (merchant_id, actor_user_id, action)
    select merchant_id, ${actorUserId}::uuid, 'store_connected' from c
  `);
  return connectionFor(db, merchantId);
}

/** Changes the secret: the old one stops verifying at once. Returns false if there is no connection or the business is suspended. */
export async function rotateStoreSecret(db: Db, merchantId: string, actorUserId: string): Promise<boolean> {
  const rows = rowsOf<{ merchant_id: string }>(
    await db.execute(sql`
      with c as (
        update store_connections sc set secret_version = sc.secret_version + 1
         where sc.merchant_id = ${merchantId}::uuid
           and exists (select 1 from merchants m where m.id = sc.merchant_id and m.status = 'active')
        returning sc.merchant_id
      ),
      e as (
        insert into affiliate_events (merchant_id, actor_user_id, action)
        select merchant_id, ${actorUserId}::uuid, 'store_secret_rotated' from c
      )
      select merchant_id from c
    `),
  );
  return rows.length === 1;
}

/** Removes the connection. The address stops working; orders already recorded stay. */
export async function disconnectStore(db: Db, merchantId: string, actorUserId: string): Promise<boolean> {
  const rows = rowsOf<{ merchant_id: string }>(
    await db.execute(sql`
      with c as (delete from store_connections where merchant_id = ${merchantId}::uuid returning merchant_id),
      e as (
        insert into affiliate_events (merchant_id, actor_user_id, action)
        select merchant_id, ${actorUserId}::uuid, 'store_disconnected' from c
      )
      select merchant_id from c
    `),
  );
  return rows.length === 1;
}

// ─── The webhook door ─────────────────────────────────────────────────────────

/** All the webhook route may learn from the URL: the version it needs to derive the secret. No merchant detail. */
export async function connectionForDelivery(db: Db, connectionId: string): Promise<{ id: string; secretVersion: number } | null> {
  if (!UUID.test(connectionId)) return null;
  const rows = rowsOf<{ id: string; secret_version: number }>(
    await db.execute(sql`select id, secret_version from store_connections where id = ${connectionId}::uuid`),
  );
  return rows[0] ? { id: rows[0].id, secretVersion: Number(rows[0].secret_version) } : null;
}

export type RecordOutcome = 'no_connection' | 'recorded' | 'updated' | 'unchanged' | 'ambiguous' | 'not_credited';

/**
 * One delivery, one statement. See the file header for the rules. `outcome` says what happened; none of them is an
 * error: a database failure throws (the route turns that into a retryable 5xx).
 */
export async function recordOrder(db: Db, connectionId: string, o: ParsedOrder): Promise<RecordOutcome> {
  const rank = STATUS_RANK[o.status];
  const placed = o.placedAt.toISOString();
  const modified = o.modifiedAt.toISOString();
  const codes = JSON.stringify(o.codes);
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      with conn as (
        select id, merchant_id from store_connections where id = ${connectionId}::uuid
      ),
      codes as (
        select distinct upper(btrim(x)) as code from jsonb_array_elements_text(${codes}::jsonb) x
      ),
      hits as (
        select p.membership_id, p.code
          from conn
          join affiliate_coupon_periods p on p.merchant_id = conn.merchant_id
          join codes on codes.code = p.code
         where p.active_from <= ${placed}::timestamptz and (p.active_to is null or ${placed}::timestamptz < p.active_to)
      ),
      ex as (
        select o.id from affiliate_orders o join conn on o.merchant_id = conn.merchant_id where o.external_order_id = ${o.externalId}
      ),
      credit as (
        select h.membership_id, h.code, ms.merchant_id, ms.affiliate_user_id
          from hits h
          join programme_memberships ms on ms.id = h.membership_id
          join merchants m on m.id = ms.merchant_id
         where (select count(*) from hits) = 1 and ms.status = 'active' and m.status = 'active'
      ),
      ins as (
        insert into affiliate_orders
          (merchant_id, membership_id, affiliate_user_id, external_order_id, order_number, currency, placed_at, store_modified_at,
           status, status_rank, woo_status, sale_paise, refunded_paise, coupon_code, version_digest)
        select credit.merchant_id, credit.membership_id, credit.affiliate_user_id, ${o.externalId}::text, ${o.number}::text, ${o.currency}::text,
               ${placed}::timestamptz, ${modified}::timestamptz, ${o.status}::text, ${rank}::int, ${o.wooStatus}::text, ${o.salePaise}::bigint,
               ${o.refundedPaise}::bigint, credit.code, ${o.digest}::text
          from credit
         where not exists (select 1 from ex)
        on conflict (merchant_id, external_order_id) do update
           set store_modified_at = excluded.store_modified_at, status = excluded.status, status_rank = excluded.status_rank,
               woo_status = excluded.woo_status, sale_paise = excluded.sale_paise, refunded_paise = excluded.refunded_paise,
               version_digest = excluded.version_digest, updated_at = now()
         where (affiliate_orders.store_modified_at, affiliate_orders.status_rank, affiliate_orders.refunded_paise, affiliate_orders.version_digest)
             < (excluded.store_modified_at, excluded.status_rank, excluded.refunded_paise, excluded.version_digest)
        returning id
      ),
      upd as (
        update affiliate_orders o
           set store_modified_at = ${modified}::timestamptz, status = ${o.status}::text, status_rank = ${rank}::int, woo_status = ${o.wooStatus}::text,
               sale_paise = ${o.salePaise}::bigint, refunded_paise = ${o.refundedPaise}::bigint, version_digest = ${o.digest}::text, updated_at = now()
         where o.id = (select id from ex)
           and (o.store_modified_at, o.status_rank, o.refunded_paise, o.version_digest)
             < (${modified}::timestamptz, ${rank}::int, ${o.refundedPaise}::bigint, ${o.digest}::text)
        returning o.id
      ),
      seen as (
        update store_connections c
           set last_received_at = now(),
               ambiguous_orders = c.ambiguous_orders
                 + case when not exists (select 1 from ex) and (select count(*) from hits) > 1 then 1 else 0 end
         where c.id in (select id from conn)
        returning c.id
      )
      select (select count(*) from conn)::int as connected, (select count(*) from ex)::int as existed,
             (select count(*) from ins)::int as inserted_n, (select count(*) from upd)::int as updated_n,
             (select count(*) from hits)::int as hit_n
    `),
  );
  const r = rows[0];
  if (!r || Number(r.connected) === 0) return 'no_connection';
  if (Number(r.existed) > 0) return Number(r.updated_n) > 0 ? 'updated' : 'unchanged';
  if (Number(r.inserted_n) > 0) return 'recorded';
  return Number(r.hit_n) > 1 ? 'ambiguous' : 'not_credited';
}

// ─── Coupons (merchant side) ──────────────────────────────────────────────────

export type SetCouponResult = 'ok' | 'not_member' | 'taken';

/**
 * Gives an approved affiliate of THIS business a coupon code, or clears it (`code` ''). One statement.
 *   • A code belongs, for good, to the first affiliate it is given to. It can come off them and go back on, but never be
 *     given to someone else (`taken`), so a late order for an old code can't be credited to the wrong person.
 *   • Replacing a code closes the old code's period and opens the new one. Orders are resolved by when they were placed.
 *   • Naming the code already in use changes nothing.
 */
export async function setCoupon(db: Db, merchantId: string, applicationId: string, code: string, actorUserId: string): Promise<SetCouponResult> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      with ms as (
        select ms.id, ms.merchant_id, ms.affiliate_user_id
          from programme_applications a
          join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
          join merchants m on m.id = a.merchant_id
         where a.id = ${applicationId}::uuid and a.merchant_id = ${merchantId}::uuid and a.status = 'approved' and m.status = 'active'
      ),
      owner as (
        select membership_id from affiliate_coupon_codes where merchant_id = ${merchantId}::uuid and code = ${code}
      ),
      reg as (
        insert into affiliate_coupon_codes (merchant_id, code, membership_id)
        select ms.merchant_id, ${code}, ms.id from ms
         where ${code} <> '' and not exists (select 1 from owner)
        on conflict (merchant_id, code) do nothing
        returning membership_id
      ),
      go as (
        select ms.id as membership_id from ms
         where ${code} = ''
            or exists (select 1 from reg)
            or exists (select 1 from owner o where o.membership_id = ms.id)
      ),
      retire as (
        update affiliate_coupon_periods p
           set active_to = greatest(now(), p.active_from + interval '1 millisecond')
         where p.membership_id in (select membership_id from go) and p.active_to is null and p.code <> ${code}
        returning p.id, p.merchant_id
      ),
      -- The insert below reads the count of retire first, which makes Postgres finish closing the old period before
      -- it opens the new one (two writes in one statement have no other guaranteed order, and the index allows one open).
      opened as (
        insert into affiliate_coupon_periods (merchant_id, membership_id, code)
        select ms.merchant_id, ms.id, ${code} from ms
         where ${code} <> '' and ms.id in (select membership_id from go)
           and (select count(*) from retire) >= 0
           and not exists (select 1 from affiliate_coupon_periods p where p.membership_id = ms.id and p.active_to is null and p.code = ${code})
        returning id
      ),
      e as (
        insert into affiliate_events (merchant_id, affiliate_user_id, actor_user_id, application_id, action)
        select ms.merchant_id, ms.affiliate_user_id, ${actorUserId}::uuid, ${applicationId}::uuid,
               case when ${code} = '' then 'coupon_cleared' else 'coupon_set' end
          from ms
         where ms.id in (select membership_id from go)
           and (exists (select 1 from opened) or exists (select 1 from retire))
      )
      select (select count(*) from ms)::int as has_member, (select membership_id from owner limit 1) as owner_id,
             (select id from ms limit 1) as ms_id, (select count(*) from reg)::int as reg_n, (select count(*) from go)::int as go_n
    `),
  );
  const r = rows[0];
  if (!r || Number(r.has_member) === 0) return 'not_member';
  if (Number(r.go_n) === 0) return 'taken';
  return 'ok';
}

// ─── Reading orders ───────────────────────────────────────────────────────────

export type OrderCounts = { days7: number; days30: number; all: number };
export type SaleTotal = { currency: string; days30: number; all: number };
export type OrderStats = { orders: OrderCounts; sales: SaleTotal[] };
export type OrderRow = {
  number: string;
  placedAt: string;
  currency: string;
  status: OrderStatus;
  salePaise: number;
  refundedPaise: number;
  /** What counts as sales for this order now: paid, net of refunds, never below zero. */
  netPaise: number;
};
export type MyOrders = { coupon: string; stats: OrderStats; recent: OrderRow[] };
export type MerchantOrderRow = OrderRow & { applicationId: string; displayName: string; couponCode: string };

export const NO_ORDER_STATS: OrderStats = { orders: { days7: 0, days30: 0, all: 0 }, sales: [] };

type StatRow = { application_id: string; currency: string | null; d7: number; d30: number; total: number; net30: number; net_all: number };

/** Fold per-currency rows for one application into one `OrderStats`. */
function foldStats(rows: StatRow[]): OrderStats {
  const out: OrderStats = { orders: { days7: 0, days30: 0, all: 0 }, sales: [] };
  for (const r of rows) {
    out.orders.days7 += Number(r.d7);
    out.orders.days30 += Number(r.d30);
    out.orders.all += Number(r.total);
    if (r.currency && (Number(r.net_all) > 0 || Number(r.net30) > 0)) out.sales.push({ currency: r.currency, days30: Number(r.net30), all: Number(r.net_all) });
  }
  return out;
}

const orderRow = (r: Record<string, unknown>): OrderRow => ({
  number: String(r.order_number),
  placedAt: iso(r.placed_at)!,
  currency: String(r.currency),
  status: r.status as OrderStatus,
  salePaise: Number(r.sale_paise),
  refundedPaise: Number(r.refunded_paise),
  netPaise: Number(r.net),
});

/** THIS person's coupon, numbers and latest orders, per approved application. Only rows where they are the affiliate. */
export async function ordersForAffiliate(db: Db, userId: string): Promise<Map<string, MyOrders>> {
  const apps = rowsOf<{ application_id: string; code: string | null }>(
    await db.execute(sql`
      select a.id as application_id,
             (select p.code from affiliate_coupon_periods p where p.membership_id = ms.id and p.active_to is null) as code
        from programme_applications a
        join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
       where a.affiliate_user_id = ${userId}::uuid and a.status = 'approved'
    `),
  );
  const stats = rowsOf<StatRow>(
    await db.execute(sql`
      select a.id as application_id, o.currency,
             count(o.id) filter (where o.placed_at > now() - interval '7 days')::int as d7,
             count(o.id) filter (where o.placed_at > now() - interval '30 days')::int as d30,
             count(o.id)::int as total,
             coalesce(sum(${NET}) filter (where o.placed_at > now() - interval '30 days'), 0)::bigint as net30,
             coalesce(sum(${NET}), 0)::bigint as net_all
        from programme_applications a
        join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
        join affiliate_orders o on o.membership_id = ms.id and o.affiliate_user_id = ${userId}::uuid
       where a.affiliate_user_id = ${userId}::uuid and a.status = 'approved'
       group by a.id, o.currency
    `),
  );
  const recent = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select * from (
        select a.id as application_id, o.order_number, o.placed_at, o.currency, o.status, o.sale_paise, o.refunded_paise, ${NET} as net,
               row_number() over (partition by a.id order by o.placed_at desc, o.id) as rn
          from programme_applications a
          join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
          join affiliate_orders o on o.membership_id = ms.id and o.affiliate_user_id = ${userId}::uuid
         where a.affiliate_user_id = ${userId}::uuid and a.status = 'approved'
      ) t where rn <= 15 order by placed_at desc
    `),
  );
  const out = new Map<string, MyOrders>();
  for (const a of apps) {
    out.set(a.application_id, {
      coupon: a.code ?? '',
      stats: foldStats(stats.filter((s) => s.application_id === a.application_id)),
      recent: recent.filter((r) => String(r.application_id) === a.application_id).map(orderRow),
    });
  }
  return out;
}

/** THIS business's coupon and numbers per approved application. */
export async function orderStatsForMerchant(db: Db, merchantId: string): Promise<Map<string, { coupon: string; stats: OrderStats }>> {
  const apps = rowsOf<{ application_id: string; code: string | null }>(
    await db.execute(sql`
      select a.id as application_id,
             (select p.code from affiliate_coupon_periods p where p.membership_id = ms.id and p.active_to is null) as code
        from programme_applications a
        join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
       where a.merchant_id = ${merchantId}::uuid and a.status = 'approved'
    `),
  );
  const stats = rowsOf<StatRow>(
    await db.execute(sql`
      select a.id as application_id, o.currency,
             count(o.id) filter (where o.placed_at > now() - interval '7 days')::int as d7,
             count(o.id) filter (where o.placed_at > now() - interval '30 days')::int as d30,
             count(o.id)::int as total,
             coalesce(sum(${NET}) filter (where o.placed_at > now() - interval '30 days'), 0)::bigint as net30,
             coalesce(sum(${NET}), 0)::bigint as net_all
        from programme_applications a
        join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
        join affiliate_orders o on o.membership_id = ms.id and o.merchant_id = ${merchantId}::uuid
       where a.merchant_id = ${merchantId}::uuid and a.status = 'approved'
       group by a.id, o.currency
    `),
  );
  const out = new Map<string, { coupon: string; stats: OrderStats }>();
  for (const a of apps) out.set(a.application_id, { coupon: a.code ?? '', stats: foldStats(stats.filter((s) => s.application_id === a.application_id)) });
  return out;
}

/** The latest orders credited in THIS business, newest first (at most `limit`, 100). */
export async function recentOrdersForMerchant(db: Db, merchantId: string, limit = 50): Promise<MerchantOrderRow[]> {
  const n = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select a.id as application_id, coalesce(p.display_name, '') as display_name, o.coupon_code,
             o.order_number, o.placed_at, o.currency, o.status, o.sale_paise, o.refunded_paise, ${NET} as net
        from affiliate_orders o
        join programme_memberships ms on ms.id = o.membership_id
        join programme_applications a on a.programme_id = ms.programme_id and a.affiliate_user_id = ms.affiliate_user_id and a.status = 'approved'
        left join affiliate_profiles p on p.user_id = o.affiliate_user_id
       where o.merchant_id = ${merchantId}::uuid
       order by o.placed_at desc, o.id
       limit ${n}
    `),
  );
  return rows.map((r) => ({ ...orderRow(r), applicationId: String(r.application_id), displayName: String(r.display_name), couponCode: String(r.coupon_code) }));
}
