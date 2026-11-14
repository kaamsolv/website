/**
 * The merchant-scoped data layer (Affiliate Manager, Phase 1). Framework-free; takes an explicit `db`.
 *
 * The one place that touches `merchants` and `merchant_brand_settings` (test/affiliate-isolation.test.mts fails if
 * any other file imports them). Three ways in, none of which can reach another merchant's rows:
 *   - `merchantForOwner(ownerId)`  — the signed-in owner's own merchant. A request never names a merchant id.
 *   - `merchantScope(merchantId)`  — every method is bound to that one id in its WHERE clause.
 *   - `publicMerchantBySlug(slug)` — what the public portal shows: no owner id, no email.
 *
 * Neon over HTTP can't hold a transaction, so creating a merchant and its brand row is one SQL statement.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { ApplicationStatus, MembershipStatus, ProgrammeStatus } from '../app/lib/affiliate/application.ts';
import { DEFAULT_BRAND_COLOUR, type MerchantBrand, type MerchantStatus, type MerchantView } from '../app/lib/affiliate/merchant.ts';
import { isUniqueViolation, type Db } from './links.ts';
import { merchantBrandSettings, merchants } from './schema.ts';

/** The owner's own view of their merchant: the public view plus its id and whether an operator has suspended it. */
export type OwnerMerchant = MerchantView & { id: string; status: MerchantStatus; suspendedReason: string };

const columns = {
  id: merchants.id,
  slug: merchants.slug,
  name: merchants.name,
  status: merchants.status,
  suspendedReason: merchants.suspendedReason,
  logo: merchantBrandSettings.logo,
  brandColour: merchantBrandSettings.brandColour,
  programmeName: merchantBrandSettings.programmeName,
  programmeDescription: merchantBrandSettings.programmeDescription,
  terms: merchantBrandSettings.terms,
};

type Joined = {
  id: string;
  slug: string;
  name: string;
  status: string;
  suspendedReason: string;
  logo: string | null;
  brandColour: string | null;
  programmeName: string | null;
  programmeDescription: string | null;
  terms: string | null;
};

function toView(r: Joined): OwnerMerchant {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status === 'suspended' ? 'suspended' : 'active',
    suspendedReason: r.suspendedReason,
    brand: {
      logo: r.logo ?? null,
      brandColour: r.brandColour ?? DEFAULT_BRAND_COLOUR,
      programmeName: r.programmeName ?? '',
      programmeDescription: r.programmeDescription ?? '',
      terms: r.terms ?? '',
    },
  };
}

function select(db: Db) {
  return db.select(columns).from(merchants).leftJoin(merchantBrandSettings, eq(merchantBrandSettings.merchantId, merchants.id));
}

/** The owner's own merchant, or null. */
export async function merchantForOwner(db: Db, ownerId: string): Promise<OwnerMerchant | null> {
  const rows = await select(db).where(eq(merchants.ownerUserId, ownerId)).limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

/** The public portal's data: no internal id, no status. A suspended merchant has no public portal: it reads as not found. */
export async function publicMerchantBySlug(db: Db, slug: string): Promise<MerchantView | null> {
  const rows = await select(db).where(and(eq(merchants.slug, slug), eq(merchants.status, 'active'))).limit(1);
  if (!rows[0]) return null;
  const { id: _id, status: _status, suspendedReason: _reason, ...view } = toView(rows[0]);
  return view;
}

export type CreateMerchantResult = { ok: true; id: string } | { ok: false; error: 'already_has_merchant' | 'slug_taken' };

/** Makes the owner's merchant and its brand row in one statement. One merchant per owner; slugs are unique. */
export async function createMerchant(db: Db, ownerId: string, input: { slug: string; name: string; brand: MerchantBrand }): Promise<CreateMerchantResult> {
  const b = input.brand;
  try {
    const res = (await db.execute(sql`
      with m as (
        insert into merchants (owner_user_id, slug, name)
        values (${ownerId}::uuid, ${input.slug}, ${input.name})
        returning id
      ),
      ev as (
        insert into affiliate_events (merchant_id, actor_user_id, action)
        select id, ${ownerId}::uuid, 'portal_created' from m
      )
      insert into merchant_brand_settings (merchant_id, logo, brand_colour, programme_name, programme_description, terms)
      select id, ${b.logo}, ${b.brandColour}, ${b.programmeName}, ${b.programmeDescription}, ${b.terms} from m
      returning merchant_id as id
    `)) as unknown as { rows: { id: string }[] };
    return { ok: true, id: res.rows[0].id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return { ok: false, error: (await merchantForOwner(db, ownerId)) ? 'already_has_merchant' : 'slug_taken' };
  }
}

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;
const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

/** The public face of a programme's door: open, or not. Anything else (no programme yet) reads as closed. */
export async function portalRegistration(db: Db, slug: string): Promise<ProgrammeStatus> {
  const rows = rowsOf<{ status: string }>(
    await db.execute(sql`select p.status from programmes p join merchants m on m.id = p.merchant_id where m.slug = ${slug} and m.status = 'active'`),
  );
  return rows[0]?.status === 'open' ? 'open' : 'closed';
}

export type ApplicationForReview = {
  id: string;
  status: ApplicationStatus;
  message: string;
  decisionNote: string;
  createdAt: string;
  decidedAt: string | null;
  displayName: string;
  website: string;
  /** Shown to the merchant because the applicant is told, on the form, that applying shares it. */
  email: string;
  /** The optional answers from the form: keys (see AFFILIATE_CATEGORIES / AFFILIATE_CHANNELS) and a free-text country. */
  category: string;
  channel: string;
  country: string;
  /** For an approved applicant: whether their access is active or paused by this merchant (null if not approved). */
  membership: MembershipStatus | null;
  /** The merchant's reason for pausing access, if they gave one. */
  suspendNote: string;
};

/** Reads and writes for exactly one merchant. Every statement below names `merchantId` in its WHERE clause. */
export function merchantScope(db: Db, merchantId: string) {
  return {
    merchantId,
    async read(): Promise<OwnerMerchant | null> {
      const rows = await select(db).where(eq(merchants.id, merchantId)).limit(1);
      return rows[0] ? toView(rows[0]) : null;
    },
    /** The business name. The slug is never changed, so addresses people have shared keep working. */
    async saveName(name: string): Promise<void> {
      await db.update(merchants).set({ name, updatedAt: new Date() }).where(eq(merchants.id, merchantId));
    },
    /** Replaces all five brand fields. */
    async saveBrand(brand: MerchantBrand): Promise<void> {
      await db
        .insert(merchantBrandSettings)
        .values({ merchantId, ...brand, updatedAt: new Date() })
        .onConflictDoUpdate({ target: merchantBrandSettings.merchantId, set: { ...brand, updatedAt: new Date() } });
    },
    /**
     * Saves the name and all five brand fields and records `portal_edited`, in one statement, so the history can't miss
     * an edit and an edit can't half-apply. The slug never changes.
     */
    async savePortal(name: string, brand: MerchantBrand, actorUserId: string): Promise<void> {
      await db.execute(sql`
        with n as (
          update merchants set name = ${name}, updated_at = now() where id = ${merchantId}::uuid returning id
        ),
        b as (
          insert into merchant_brand_settings (merchant_id, logo, brand_colour, programme_name, programme_description, terms)
          select id, ${brand.logo}, ${brand.brandColour}, ${brand.programmeName}, ${brand.programmeDescription}, ${brand.terms} from n
          on conflict (merchant_id) do update set logo = excluded.logo, brand_colour = excluded.brand_colour,
            programme_name = excluded.programme_name, programme_description = excluded.programme_description,
            terms = excluded.terms, updated_at = now()
          returning merchant_id
        )
        insert into affiliate_events (merchant_id, actor_user_id, action)
        select id, ${actorUserId}::uuid, 'portal_edited' from n
      `);
    },

    /** The programme's status, or null if registration has never been opened. */
    async programmeStatus(): Promise<ProgrammeStatus | null> {
      const rows = rowsOf<{ status: ProgrammeStatus }>(await db.execute(sql`select status from programmes where merchant_id = ${merchantId}::uuid`));
      return rows[0]?.status ?? null;
    },
    /** Opens or closes registration (making the programme the first time). Writes one event; a no-change call writes none. */
    async setProgrammeStatus(status: ProgrammeStatus, actorUserId: string): Promise<void> {
      const action = status === 'open' ? 'programme_opened' : 'programme_closed';
      await db.execute(sql`
        with p as (
          insert into programmes (merchant_id, status) values (${merchantId}::uuid, ${status})
          on conflict (merchant_id) do update set status = excluded.status, updated_at = now()
            where programmes.status <> excluded.status
          returning id
        )
        insert into affiliate_events (merchant_id, actor_user_id, action)
        select ${merchantId}::uuid, ${actorUserId}::uuid, ${action} from p
      `);
    },
    async pendingCount(): Promise<number> {
      const rows = rowsOf<{ n: number | string }>(
        await db.execute(sql`select count(*)::int as n from programme_applications where merchant_id = ${merchantId}::uuid and status = 'pending'`),
      );
      return Number(rows[0]?.n ?? 0);
    },
    /** How many applications this merchant has in each status, for the filter chips. */
    async applicationCounts(): Promise<Record<ApplicationStatus, number>> {
      const rows = rowsOf<{ status: ApplicationStatus; n: number | string }>(
        await db.execute(sql`select status, count(*)::int as n from programme_applications where merchant_id = ${merchantId}::uuid group by status`),
      );
      const out: Record<ApplicationStatus, number> = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
      for (const r of rows) out[r.status] = Number(r.n);
      return out;
    },
    async listApplications(status?: ApplicationStatus): Promise<ApplicationForReview[]> {
      const rows = rowsOf<Record<string, unknown>>(
        await db.execute(sql`
          select a.id, a.status, a.message, a.decision_note, a.created_at, a.decided_at, a.category, a.channel, a.country,
                 coalesce(p.display_name, '') as display_name, coalesce(p.website, '') as website, u.email,
                 ms.status as membership, coalesce(ms.status_note, '') as suspend_note
          from programme_applications a
          join auth_users u on u.id = a.affiliate_user_id
          left join affiliate_profiles p on p.user_id = a.affiliate_user_id
          left join programme_memberships ms on ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id and a.status = 'approved'
          where a.merchant_id = ${merchantId}::uuid ${status ? sql`and a.status = ${status}` : sql``}
          order by a.created_at desc
          limit 200
        `),
      );
      return rows.map((r) => ({
        id: String(r.id),
        status: r.status as ApplicationStatus,
        message: String(r.message),
        decisionNote: String(r.decision_note),
        createdAt: iso(r.created_at)!,
        decidedAt: iso(r.decided_at),
        displayName: String(r.display_name),
        website: String(r.website),
        email: String(r.email),
        category: String(r.category),
        channel: String(r.channel),
        country: String(r.country),
        membership: (r.membership as MembershipStatus | null) ?? null,
        suspendNote: String(r.suspend_note),
      }));
    },
    /**
     * Approve or reject a pending application of THIS merchant, in one statement: the status change, the membership
     * (on approval) and the event. An id that belongs to another merchant, or is no longer pending, changes nothing.
     */
    async decide(applicationId: string, decision: 'approved' | 'rejected', actorUserId: string, note: string): Promise<boolean> {
      const approve = decision === 'approved';
      const rows = rowsOf<{ id: string }>(
        await db.execute(sql`
          with a as (
            update programme_applications
               set status = ${decision}, decision_note = ${note}, decided_at = now(), updated_at = now()
             where id = ${applicationId}::uuid and merchant_id = ${merchantId}::uuid and status = 'pending'
            returning id, programme_id, merchant_id, affiliate_user_id
          ),
          m as (
            insert into programme_memberships (programme_id, merchant_id, affiliate_user_id)
            select programme_id, merchant_id, affiliate_user_id from a where ${approve}
            on conflict (programme_id, affiliate_user_id) do update set status = 'active'
            returning id
          ),
          e as (
            insert into affiliate_events (merchant_id, affiliate_user_id, actor_user_id, application_id, action)
            select merchant_id, affiliate_user_id, ${actorUserId}::uuid, id, ${decision} from a
          ),
          q as (
            insert into outbox (kind, dedupe_key, payload)
            select 'affiliate_decision', 'affiliate_decision:' || id::text, jsonb_build_object('applicationId', id) from a
            on conflict (dedupe_key) do nothing
          )
          select id from a
        `),
      );
      return rows.length === 1;
    },
    /**
     * Pause or restore an approved affiliate of THIS merchant, with an optional reason, in one statement (the membership
     * change and its event). The application stays "approved"; the membership is what pauses access. An id from another
     * merchant, an application that isn't approved, or a membership already in that state changes nothing.
     */
    async setMembership(applicationId: string, to: MembershipStatus, actorUserId: string, note: string): Promise<boolean> {
      const from = to === 'suspended' ? 'active' : 'suspended';
      const action = to === 'suspended' ? 'suspended' : 'reinstated';
      const rows = rowsOf<{ id: string }>(
        await db.execute(sql`
          with a as (
            select id, programme_id, merchant_id, affiliate_user_id from programme_applications
             where id = ${applicationId}::uuid and merchant_id = ${merchantId}::uuid and status = 'approved'
          ),
          m as (
            update programme_memberships ms set status = ${to}, status_note = ${to === 'suspended' ? note : ''}, updated_at = now()
              from a
             where ms.programme_id = a.programme_id and ms.affiliate_user_id = a.affiliate_user_id
               and ms.merchant_id = ${merchantId}::uuid and ms.status = ${from}
            returning ms.id
          ),
          e as (
            insert into affiliate_events (merchant_id, affiliate_user_id, actor_user_id, application_id, action)
            select a.merchant_id, a.affiliate_user_id, ${actorUserId}::uuid, a.id, ${action} from a where exists (select 1 from m)
          )
          select id from m
        `),
      );
      return rows.length === 1;
    },
  };
}
