import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createMerchant, merchantForOwner, merchantScope, publicMerchantBySlug } from '../db/merchant-scope.ts';
import { authUsers } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import type { MerchantBrand } from '../app/lib/affiliate/merchant.ts';
import { makeTestDb } from './helpers/test-db.mts';

const brand = (over: Partial<MerchantBrand> = {}): MerchantBrand => ({
  logo: null,
  brandColour: '#FE6336',
  programmeName: '',
  programmeDescription: '',
  terms: '',
  ...over,
});

async function user(db: Db, email: string): Promise<string> {
  const [row] = await db.insert(authUsers).values({ name: 'Test', email }).returning({ id: authUsers.id });
  return row.id;
}

async function twoMerchants(db: Db) {
  const a = await user(db, 'a@example.test');
  const b = await user(db, 'b@example.test');
  const ra = await createMerchant(db, a, { slug: 'merchant-a', name: 'Merchant A', brand: brand({ programmeName: 'A programme', terms: 'A terms' }) });
  const rb = await createMerchant(db, b, { slug: 'merchant-b', name: 'Merchant B', brand: brand({ programmeName: 'B programme', brandColour: '#6934D0', terms: 'B terms' }) });
  assert.ok(ra.ok && rb.ok);
  return { a, b, idA: (ra as { id: string }).id, idB: (rb as { id: string }).id };
}

test('creating a merchant writes the merchant and its brand together', async () => {
  const { db, close } = await makeTestDb();
  try {
    const owner = await user(db, 'o@example.test');
    const r = await createMerchant(db, owner, { slug: 'wandernest-tales', name: 'Wandernest Tales', brand: brand({ programmeName: 'Wandernest Partners', brandColour: '#38BBAC' }) });
    assert.ok(r.ok);
    const m = await merchantForOwner(db, owner);
    assert.equal(m?.slug, 'wandernest-tales');
    assert.equal(m?.brand.programmeName, 'Wandernest Partners');
    assert.equal(m?.brand.brandColour, '#38BBAC');
  } finally {
    await close();
  }
});

test('one merchant per owner; slugs are unique', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { a, b } = await twoMerchants(db);
    const second = await createMerchant(db, a, { slug: 'another-one', name: 'Again', brand: brand() });
    assert.deepEqual(second, { ok: false, error: 'already_has_merchant' });
    const c = await user(db, 'c@example.test');
    const clash = await createMerchant(db, c, { slug: 'merchant-b', name: 'Copycat', brand: brand() });
    assert.deepEqual(clash, { ok: false, error: 'slug_taken' });
    assert.equal(await merchantForOwner(db, c), null, 'a refused create leaves nothing behind');
    assert.ok(b);
  } finally {
    await close();
  }
});

test('ISOLATION: an owner only ever reaches their own merchant', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { a, b, idA, idB } = await twoMerchants(db);
    assert.equal((await merchantForOwner(db, a))?.id, idA);
    assert.equal((await merchantForOwner(db, b))?.id, idB);
    assert.equal(await merchantForOwner(db, '00000000-0000-4000-8000-000000000000'), null);
  } finally {
    await close();
  }
});

test('ISOLATION: a scope reads and writes only its own merchant', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { idA, idB } = await twoMerchants(db);
    const scopeA = merchantScope(db, idA);
    assert.equal((await scopeA.read())?.name, 'Merchant A');

    await scopeA.saveName('Merchant A renamed');
    await scopeA.saveBrand(brand({ programmeName: 'A changed', terms: 'A new terms', brandColour: '#0C2248' }));

    const b = await merchantScope(db, idB).read();
    assert.equal(b?.name, 'Merchant B');
    assert.equal(b?.brand.programmeName, 'B programme');
    assert.equal(b?.brand.terms, 'B terms');
    assert.equal(b?.brand.brandColour, '#6934D0');

    const a = await scopeA.read();
    assert.equal(a?.name, 'Merchant A renamed');
    assert.equal(a?.brand.programmeName, 'A changed');
    assert.equal(a?.slug, 'merchant-a', 'the slug never changes');
  } finally {
    await close();
  }
});

test('ISOLATION: a scope for an id that is not a merchant reads nothing and writes nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { idA, idB } = await twoMerchants(db);
    const ghost = merchantScope(db, '11111111-1111-4111-8111-111111111111');
    assert.equal(await ghost.read(), null);
    await ghost.saveName('nope');
    await assert.rejects(ghost.saveBrand(brand({ terms: 'nope' })), 'no merchant, so the brand row is refused');
    assert.equal((await merchantScope(db, idA).read())?.name, 'Merchant A');
    assert.equal((await merchantScope(db, idB).read())?.brand.terms, 'B terms');
  } finally {
    await close();
  }
});

test('the public view carries no owner id or email and finds only by slug', async () => {
  const { db, close } = await makeTestDb();
  try {
    await twoMerchants(db);
    const view = await publicMerchantBySlug(db, 'merchant-b');
    assert.deepEqual(Object.keys(view ?? {}).sort(), ['brand', 'name', 'slug']);
    assert.equal(view?.name, 'Merchant B');
    assert.equal(JSON.stringify(view).includes('example.test'), false);
    assert.equal(await publicMerchantBySlug(db, 'MERCHANT-B'), null);
    assert.equal(await publicMerchantBySlug(db, 'nobody'), null);
  } finally {
    await close();
  }
});

test('deleting an account removes its merchant and brand', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { a } = await twoMerchants(db);
    const { eq } = await import('drizzle-orm');
    await db.delete(authUsers).where(eq(authUsers.id, a));
    assert.equal(await publicMerchantBySlug(db, 'merchant-a'), null);
    assert.ok(await publicMerchantBySlug(db, 'merchant-b'));
  } finally {
    await close();
  }
});

// The structural guard: only db/merchant-scope.ts may use the merchant tables, so no route can build its own
// unscoped query. Phase 2+ tables follow the same rule.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|mts)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('GUARD: only the two scope files, the mail loader and the schema touch the affiliate tables', () => {
  const root = resolve(import.meta.dirname, '..');
  const allowed = new Set(['db/merchant-scope.ts', 'db/affiliate-scope.ts', 'db/affiliate-mail.ts', 'db/schema.ts']);
  const tables =
    /\b(merchants|merchantBrandSettings|affiliateProfiles|programmeApplications|programmeMemberships|affiliateEvents|merchant_brand_settings|affiliate_profiles|programme_applications|programme_memberships|affiliate_events)\b|\b(from|join|into|update)\s+(programmes|merchants)\b|import\s*\{[^}]*\bprogrammes\b[^}]*\}/;
  const offenders: string[] = [];
  for (const dir of ['app', 'db', 'worker']) {
    for (const file of sourceFiles(join(root, dir))) {
      const rel = relative(root, file).replaceAll(String.fromCharCode(92), '/');
      if (allowed.has(rel)) continue;
      if (tables.test(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});
