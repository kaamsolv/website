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

import { eq, sql } from 'drizzle-orm';
import { DEFAULT_BRAND_COLOUR, type MerchantBrand, type MerchantView } from '../app/lib/affiliate/merchant.ts';
import { isUniqueViolation, type Db } from './links.ts';
import { merchantBrandSettings, merchants } from './schema.ts';

export type OwnerMerchant = MerchantView & { id: string };

const columns = {
  id: merchants.id,
  slug: merchants.slug,
  name: merchants.name,
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

/** The public portal's data. Same shape minus the internal id. */
export async function publicMerchantBySlug(db: Db, slug: string): Promise<MerchantView | null> {
  const rows = await select(db).where(eq(merchants.slug, slug)).limit(1);
  if (!rows[0]) return null;
  const { id: _id, ...view } = toView(rows[0]);
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

/** Reads and writes for exactly one merchant. */
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
  };
}
