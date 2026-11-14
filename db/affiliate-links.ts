/**
 * Referral links and recorded clicks (Affiliate Manager, Phase 3A). Framework-free; takes an explicit `db`.
 *
 * Three doors, each bound in its WHERE clause to one owner of the rows:
 *   - `ensureLinks` / `linksForAffiliate` : only memberships where `affiliate_user_id` is the signed-in account.
 *   - `resolveAffiliateLink` / `recordAffiliateClick` : the public redirect. Takes a slug and a code, returns a
 *     destination and a link id, never an owner id or an email.
 *   - the merchant's per-affiliate counts live in db/merchant-scope.ts, bound to the merchant id.
 *
 * Every write is one SQL statement (Neon over HTTP can't hold a transaction). A click is a single INSERT … SELECT
 * that re-checks, in the same statement, that the membership and the merchant are still active.
 */

import { sql } from 'drizzle-orm';
import { generateLinkCode, type ClickCounts } from '../app/lib/affiliate/link.ts';
import type { ClickMeta } from '../app/lib/click-meta.ts';
import { formatErrorForLog } from '../app/lib/log-error.ts';
import { isUniqueViolation, type Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

/** How many times to draw a fresh code if two affiliates of one business ever draw the same one. */
const CODE_ATTEMPTS = 6;

/**
 * Gives each of THIS person's memberships a link if it has none yet (one per membership). Safe to call on every page
 * load: a membership that already has a link is skipped, and two calls at once make one link. Returns how many it made.
 */
export async function ensureLinks(db: Db, userId: string): Promise<number> {
  const missing = rowsOf<{ id: string }>(
    await db.execute(sql`
      select ms.id from programme_memberships ms
       where ms.affiliate_user_id = ${userId}::uuid
         and not exists (select 1 from affiliate_links l where l.membership_id = ms.id)
    `),
  );
  let made = 0;
  for (const { id } of missing) {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      try {
        const rows = rowsOf<{ id: string }>(
          await db.execute(sql`
            with l as (
              insert into affiliate_links (membership_id, merchant_id, affiliate_user_id, code)
              select ms.id, ms.merchant_id, ms.affiliate_user_id, ${generateLinkCode()}
                from programme_memberships ms
               where ms.id = ${id}::uuid and ms.affiliate_user_id = ${userId}::uuid
              on conflict (membership_id) do nothing
              returning id, merchant_id
            ),
            e as (
              insert into affiliate_events (merchant_id, affiliate_user_id, actor_user_id, action)
              select merchant_id, ${userId}::uuid, ${userId}::uuid, 'link_created' from l
            )
            select id from l
          `),
        );
        made += rows.length;
        break;
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === CODE_ATTEMPTS - 1) throw err;
      }
    }
  }
  return made;
}

export type MyLink = {
  applicationId: string;
  code: string;
  slug: string;
  /** False until the business sets where visitors should land; the link then leads to the programme page. */
  hasDestination: boolean;
  /** The membership is paused: the link still opens the store, but clicks aren't recorded. */
  paused: boolean;
  clicks: ClickCounts;
};

/** THIS person's links with their recorded clicks, one per approved application. */
export async function linksForAffiliate(db: Db, userId: string): Promise<MyLink[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select a.id as application_id, l.code, m.slug, (p.destination_url <> '') as has_destination, ms.status as membership,
             count(c.id) filter (where c.occurred_at > now() - interval '7 days')::int as d7,
             count(c.id) filter (where c.occurred_at > now() - interval '30 days')::int as d30,
             count(c.id)::int as total
        from programme_applications a
        join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
        join affiliate_links l on l.membership_id = ms.id and l.affiliate_user_id = ${userId}::uuid
        join merchants m on m.id = a.merchant_id
        join programmes p on p.id = a.programme_id
        left join affiliate_clicks c on c.link_id = l.id
       where a.affiliate_user_id = ${userId}::uuid and a.status = 'approved'
       group by a.id, l.code, m.slug, p.destination_url, ms.status
    `),
  );
  return rows.map((r) => ({
    applicationId: String(r.application_id),
    code: String(r.code),
    slug: String(r.slug),
    hasDestination: r.has_destination === true,
    paused: r.membership === 'suspended',
    clicks: { days7: Number(r.d7), days30: Number(r.d30), all: Number(r.total) } satisfies ClickCounts,
  }));
}

export type ResolvedLink =
  | { outcome: 'not_found' }
  | { outcome: 'ok'; linkId: string; destination: string; paused: boolean };

/**
 * The public redirect's one lookup: an active business at `slug` whose affiliate has `code`. Anything else is
 * not_found, so a suspended business and an unknown code look the same from outside. `destination` is '' until the
 * business has set one.
 */
export async function resolveAffiliateLink(db: Db, slug: string, code: string): Promise<ResolvedLink> {
  const rows = rowsOf<{ id: string; destination_url: string; membership: string }>(
    await db.execute(sql`
      select l.id, p.destination_url, ms.status as membership
        from merchants m
        join affiliate_links l on l.merchant_id = m.id
        join programme_memberships ms on ms.id = l.membership_id
        join programmes p on p.id = ms.programme_id
       where m.slug = ${slug} and m.status = 'active' and l.code = ${code}
       limit 1
    `),
  );
  const r = rows[0];
  if (!r) return { outcome: 'not_found' };
  return { outcome: 'ok', linkId: r.id, destination: r.destination_url, paused: r.membership === 'suspended' };
}

/**
 * Records one click: a single INSERT … SELECT that only writes if the link's membership and business are still
 * active at that moment. Link previews fetched by apps (device class `bot`) are not recorded. Best-effort: a failure
 * is logged and never reaches the visitor. Resolves to whether a row was written (the smoke test checks this).
 */
export async function recordAffiliateClick(db: Db, linkId: string, meta: ClickMeta): Promise<boolean> {
  if (meta.deviceClass === 'bot') return false;
  try {
    const rows = rowsOf<{ id: number }>(
      await db.execute(sql`
        insert into affiliate_clicks (link_id, merchant_id, referrer_host, country, device_class)
        select l.id, l.merchant_id, ${meta.referrerHost}, ${meta.country}, ${meta.deviceClass}::device_class
          from affiliate_links l
          join programme_memberships ms on ms.id = l.membership_id
          join merchants m on m.id = l.merchant_id
         where l.id = ${linkId}::uuid and ms.status = 'active' and m.status = 'active'
        returning id
      `),
    );
    return rows.length === 1;
  } catch (err) {
    console.error('[affiliate redirect] click not recorded:', formatErrorForLog(err));
    return false;
  }
}
