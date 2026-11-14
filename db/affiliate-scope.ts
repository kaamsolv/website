/**
 * An affiliate's own data layer (Affiliate Manager, Phase 2). Framework-free; takes an explicit `db`.
 *
 * The grant rule, in the style of db/accountant-access.ts `grantFor`: an affiliate reaches only rows where
 * `affiliate_user_id` is the signed-in account, and every statement here says so in its WHERE clause. A merchant's
 * name and portal address are the only merchant details that ever come back: never an owner id or email.
 * The merchant's side of the same rows is db/merchant-scope.ts.
 */

import { sql } from 'drizzle-orm';
import {
  REAPPLY_COOLDOWN_DAYS,
  type ApplicationStatus,
  type ApplyBlock,
  type MembershipStatus,
  type RegistrationState,
} from '../app/lib/affiliate/application.ts';
import { isUniqueViolation, type Db } from './links.ts';

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export type AffiliateProfile = { displayName: string; website: string };

export type MyApplication = {
  id: string;
  status: ApplicationStatus;
  message: string;
  decisionNote: string;
  createdAt: string;
  decidedAt: string | null;
  merchantName: string;
  slug: string;
  programmeName: string;
  /** 'active' once approved, 'suspended' if the merchant paused it; null while pending or after a rejection or withdrawal. */
  membership: MembershipStatus | null;
  /** The merchant's reason for pausing, if they gave one. */
  suspendNote: string;
};

export type ApplyResult = { ok: true; id: string } | { ok: false; block: ApplyBlock };

const STATE_TO_BLOCK: Partial<Record<RegistrationState, ApplyBlock>> = {
  closed: 'closed',
  own_programme: 'own_programme',
  suspended: 'suspended',
  approved: 'already_member',
  pending: 'already_pending',
  cooldown: 'cooldown',
};

export function affiliateScope(db: Db, userId: string) {
  return {
    userId,

    async profile(): Promise<AffiliateProfile | null> {
      const rows = rowsOf<{ display_name: string; website: string }>(
        await db.execute(sql`select display_name, website from affiliate_profiles where user_id = ${userId}::uuid`),
      );
      return rows[0] ? { displayName: rows[0].display_name, website: rows[0].website } : null;
    },

    async saveProfile(p: AffiliateProfile): Promise<void> {
      await db.execute(sql`
        insert into affiliate_profiles (user_id, display_name, website) values (${userId}::uuid, ${p.displayName}, ${p.website})
        on conflict (user_id) do update set display_name = excluded.display_name, website = excluded.website, updated_at = now()
      `);
    },

    /** What this person can do on a programme's register page. null = no such merchant. */
    async registrationState(slug: string): Promise<RegistrationState | null> {
      const rows = rowsOf<{ own: boolean; status: string | null; member: string | null; pending: boolean; cooling: boolean }>(
        await db.execute(sql`
          select m.owner_user_id = ${userId}::uuid as own,
                 pr.status,
                 (select ms.status from programme_memberships ms where ms.programme_id = pr.id and ms.affiliate_user_id = ${userId}::uuid) as member,
                 exists (select 1 from programme_applications a where a.programme_id = pr.id and a.affiliate_user_id = ${userId}::uuid and a.status = 'pending') as pending,
                 exists (select 1 from programme_applications a where a.programme_id = pr.id and a.affiliate_user_id = ${userId}::uuid and a.status = 'rejected'
                           and a.decided_at > now() - ${REAPPLY_COOLDOWN_DAYS} * interval '1 day') as cooling
          from merchants m left join programmes pr on pr.merchant_id = m.id
          where m.slug = ${slug}
        `),
      );
      const r = rows[0];
      if (!r) return null;
      if (r.own) return 'own_programme';
      if (r.member === 'suspended') return 'suspended';
      if (r.member) return 'approved';
      if (r.pending) return 'pending';
      if (r.cooling) return 'cooldown';
      return r.status === 'open' ? 'open' : 'closed';
    },

    /**
     * Apply to the programme at `slug`. One statement checks the programme is open, it isn't the applicant's own, and
     * they aren't already in, pending or cooling off, then inserts the application and its event together.
     */
    async apply(slug: string, message: string, extras: { category?: string; channel?: string; country?: string } = {}): Promise<ApplyResult> {
      const { category = '', channel = '', country = '' } = extras;
      const week = REAPPLY_COOLDOWN_DAYS;
      try {
        const rows = rowsOf<{ id: string }>(
          await db.execute(sql`
            with p as (
              select pr.id as programme_id, pr.merchant_id
              from programmes pr join merchants m on m.id = pr.merchant_id
              where m.slug = ${slug} and pr.status = 'open' and m.owner_user_id <> ${userId}::uuid
            ),
            blocked as (
              select 1 from programme_memberships ms join p on p.programme_id = ms.programme_id
               where ms.affiliate_user_id = ${userId}::uuid
              union all
              select 1 from programme_applications a join p on p.programme_id = a.programme_id
               where a.affiliate_user_id = ${userId}::uuid
                 and (a.status = 'pending' or (a.status = 'rejected' and a.decided_at > now() - ${week} * interval '1 day'))
            ),
            a as (
              insert into programme_applications (programme_id, merchant_id, affiliate_user_id, message, category, channel, country)
              select programme_id, merchant_id, ${userId}::uuid, ${message}, ${category}, ${channel}, ${country} from p where not exists (select 1 from blocked)
              returning id, merchant_id
            ),
            e as (
              insert into affiliate_events (merchant_id, affiliate_user_id, actor_user_id, application_id, action)
              select merchant_id, ${userId}::uuid, ${userId}::uuid, id, 'applied' from a
            ),
            q as (
              insert into outbox (kind, dedupe_key, payload)
              select 'affiliate_received', 'affiliate_received:' || id::text, jsonb_build_object('applicationId', id) from a
              on conflict (dedupe_key) do nothing
            )
            select id from a
          `),
        );
        if (rows[0]) return { ok: true, id: rows[0].id };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        return { ok: false, block: 'already_pending' };
      }
      const state = await this.registrationState(slug);
      if (state === null) return { ok: false, block: 'not_found' };
      return { ok: false, block: STATE_TO_BLOCK[state] ?? 'already_pending' };
    },

    /** How many of MY applications are in each status, for the menu and the Affiliate page. */
    async counts(): Promise<Record<ApplicationStatus, number>> {
      const rows = rowsOf<{ status: ApplicationStatus; n: number | string }>(
        await db.execute(sql`select status, count(*)::int as n from programme_applications where affiliate_user_id = ${userId}::uuid group by status`),
      );
      const out: Record<ApplicationStatus, number> = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
      for (const r of rows) out[r.status] = Number(r.n);
      return out;
    },

    /** This person's applications and memberships, newest first. */
    async list(): Promise<MyApplication[]> {
      const rows = rowsOf<Record<string, unknown>>(
        await db.execute(sql`
          select a.id, a.status, a.message, a.decision_note, a.created_at, a.decided_at,
                 m.slug, m.name as merchant_name,
                 coalesce(nullif(b.programme_name, ''), m.name || ' affiliate programme') as programme_name,
                 ms.status as membership, coalesce(ms.status_note, '') as suspend_note
          from programme_applications a
          join merchants m on m.id = a.merchant_id
          left join merchant_brand_settings b on b.merchant_id = m.id
          left join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
          where a.affiliate_user_id = ${userId}::uuid
          order by a.created_at desc
          limit 100
        `),
      );
      return rows.map((r) => ({
        id: String(r.id),
        status: r.status as ApplicationStatus,
        message: String(r.message),
        decisionNote: String(r.decision_note),
        createdAt: iso(r.created_at)!,
        decidedAt: iso(r.decided_at),
        merchantName: String(r.merchant_name),
        slug: String(r.slug),
        programmeName: String(r.programme_name),
        membership: (r.membership as MembershipStatus | null) ?? null,
        suspendNote: String(r.suspend_note),
      }));
    },

    /** Withdraw one of MY pending applications. Anyone else's id, or one already decided, changes nothing. */
    async withdraw(applicationId: string): Promise<boolean> {
      const rows = rowsOf<{ id: string }>(
        await db.execute(sql`
          with a as (
            update programme_applications set status = 'withdrawn', updated_at = now()
             where id = ${applicationId}::uuid and affiliate_user_id = ${userId}::uuid and status = 'pending'
            returning id, merchant_id
          ),
          e as (
            insert into affiliate_events (merchant_id, affiliate_user_id, actor_user_id, application_id, action)
            select merchant_id, ${userId}::uuid, ${userId}::uuid, id, 'withdrawn' from a
          )
          select id from a
        `),
      );
      return rows.length === 1;
    },
  };
}
