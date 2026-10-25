/**
 * Accounts Stage 1: entitlement resolution, save limits, ownership (IDOR),
 * input cleaning, account deletion, sign-in link limits, the e2e gate.
 * Real Postgres (PGlite) with the real migrations — including the plan seed.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  businessProfiles,
  invoices,
  planFeatures,
  subscriptions,
} from '../db/schema.ts';
import { getEntitlements } from '../db/entitlements.ts';
import {
  countInvoices,
  createInvoice,
  deleteInvoice,
  getInvoice,
  getProfile,
  isAcceptableLogo,
  listInvoices,
  saveProfile,
  updateInvoice,
} from '../db/invoices.ts';
import { deleteAccount } from '../db/accounts.ts';
import { consumeRateLimits } from '../db/rate-limits.ts';
import { ENTITLEMENT_KEYS, entitlementsFrom } from '../app/lib/entitlements.ts';

/** Invoice Pro grants every invoice key; other tools' keys belong to their own plans. */
const INVOICE_KEYS = ENTITLEMENT_KEYS.filter((k) => k.startsWith('invoice_'));
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { cleanInvoice, formatSequentialNumber } from '../app/lib/invoice/validate.ts';
import { rateLimitChecks } from '../app/lib/rate-limit.ts';
import { safeNextPath } from '../app/lib/safe-next.ts';
import { e2eSecretMatches, isE2eEnabled } from '../app/lib/e2e-gate.ts';
import { isSameOrigin } from '../app/lib/same-origin.ts';

let db: Db;
let close: () => Promise<void>;

before(async () => {
  ({ db, close } = await makeTestDb());
});
after(async () => close());

async function makeUser(email: string): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}

function sample(number = 'INV-0001') {
  const inv = newInvoice(new Date(2026, 9, 21));
  return { ...inv, number, client: { ...inv.client, name: 'Acme' }, items: [{ id: 'a', description: 'Work', qty: '2', rate: '1000' }], taxRate: '18' };
}

test('seed: free account saves 20 invoices; Pro grants every invoice key, unlimited saving', async () => {
  const rows = await db.select().from(planFeatures);
  const free = rows.filter((r) => r.planKey === 'free_account');
  assert.deepEqual(
    free.map((r) => [r.featureKey, r.limitValue]).sort(),
    [['invoice_client_directory', 3], ['invoice_item_catalogue', null], ['invoice_save', 20]],
  );
  const pro = rows.filter((r) => r.planKey === 'invoice_pro');
  assert.deepEqual(new Set(pro.map((r) => r.featureKey)), new Set(INVOICE_KEYS));
  assert.equal(pro.find((r) => r.featureKey === 'invoice_save')?.limitValue, null);
});

test('entitlements: anonymous none; free 20; manual Pro all; expired or cancelled back to free', async () => {
  assert.deepEqual(await getEntitlements(db, null), { keys: [], limits: {} });

  const id = await makeUser('ent@example.test');
  const free = entitlementsFrom(await getEntitlements(db, id));
  assert.equal(free.limit('invoice_save'), 20);
  assert.equal(free.can('invoice_watermark_remove'), false);

  await db.insert(subscriptions).values({ userId: id, provider: 'manual', providerRef: 'manual:test:1', planKey: 'invoice_pro', status: 'active' });
  const pro = entitlementsFrom(await getEntitlements(db, id));
  for (const key of INVOICE_KEYS) assert.equal(pro.can(key), true, key);
  assert.equal(pro.can('pdf_large_files'), false, 'Invoice Pro is not PDF Pro');
  assert.equal(pro.limit('invoice_save'), null, 'Pro is unlimited even though free says 20');

  await db.update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscriptions.userId, id));
  assert.equal(entitlementsFrom(await getEntitlements(db, id)).limit('invoice_save'), 20, 'expired period');

  await db.update(subscriptions).set({ currentPeriodEnd: null, status: 'cancelled' }).where(eq(subscriptions.userId, id));
  assert.equal(entitlementsFrom(await getEntitlements(db, id)).can('invoice_templates'), false, 'cancelled');
});

test('save limit: the 21st save is refused on free; unlimited when null', async () => {
  const id = await makeUser('limit@example.test');
  for (let i = 1; i <= 20; i++) assert.equal((await createInvoice(db, id, sample(`X-${i}`), 20)).ok, true, `save ${i}`);
  assert.deepEqual(await createInvoice(db, id, sample('X-21'), 20), { ok: false, reason: 'limit' });
  assert.equal(await countInvoices(db, id), 20);
  assert.equal((await createInvoice(db, id, sample('X-21'), null)).ok, true);
});

test('ownership: user B cannot read, update or delete user A’s invoice', async () => {
  const a = await makeUser('a@example.test');
  const b = await makeUser('b@example.test');
  const created = await createInvoice(db, a, sample(), 20);
  assert.ok(created.ok);
  const id = created.ok ? created.id : '';

  assert.equal(await getInvoice(db, b, id), null);
  assert.equal(await updateInvoice(db, b, id, { ...sample(), notes: 'pwned' }), false);
  assert.equal(await deleteInvoice(db, b, id), false);
  assert.deepEqual(await listInvoices(db, b), []);

  const mine = await getInvoice(db, a, id);
  assert.equal(mine?.invoice.notes, '');
  assert.equal(mine?.invoice.client.name, 'Acme');
});

test('lists carry summaries only — no document, no logo; stored invoices never keep a logo', async () => {
  const id = await makeUser('list@example.test');
  await createInvoice(db, id, { ...sample(), logo: 'data:image/png;base64,AAAA' }, 20);
  const [row] = await listInvoices(db, id);
  assert.deepEqual(Object.keys(row).sort(), ['clientName', 'currency', 'dueDate', 'id', 'issueDate', 'number', 'status', 'total', 'updatedAt']);
  assert.equal(row.total, 2360); // 2 × 1000 + 18%
  const [stored] = await db.select({ data: invoices.data }).from(invoices).where(eq(invoices.userId, id));
  assert.equal('logo' in (stored.data as object), false);
});

test('numbering: saving INV-0007 moves the next number to INV-0008; other formats leave it', async () => {
  const id = await makeUser('num@example.test');
  await saveProfile(db, id, { name: 'Shop', address: '', email: '', phone: '', logo: null });
  assert.equal((await getProfile(db, id))?.nextNumber, 'INV-0001');
  await createInvoice(db, id, sample('INV-0007'), 20);
  assert.equal((await getProfile(db, id))?.nextNumber, 'INV-0008');
  await createInvoice(db, id, sample('2026/42'), 20);
  assert.equal((await getProfile(db, id))?.nextNumber, 'INV-0008');
  assert.equal(formatSequentialNumber(12), 'INV-0012');
});

test('server cleaning: caps every field, drops the logo, rejects too many items', () => {
  const long = 'x'.repeat(5000);
  const r = cleanInvoice({ ...sample(), notes: long, seller: { name: long }, logo: 'data:image/png;base64,AA', currency: 'INR' }, { maxItems: 10 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.invoice.notes.length, 400);
    assert.equal(r.invoice.seller.name.length, 80);
    assert.equal(r.invoice.logo, null);
  }
  const many = { ...sample(), items: Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, description: '', qty: '1', rate: '1' })) };
  assert.equal(cleanInvoice(many, { maxItems: 10 }).ok, false);
  assert.equal(cleanInvoice({ ...sample(), currency: 'BTC' }, { maxItems: 10 }).ok, false);
  assert.equal(cleanInvoice('nope', { maxItems: 10 }).ok, false);
});

test('logo: only small PNG/JPEG/WebP data URLs are stored', () => {
  assert.equal(isAcceptableLogo('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isAcceptableLogo('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isAcceptableLogo('https://evil.example/logo.png'), false);
  assert.equal(isAcceptableLogo(`data:image/png;base64,${'A'.repeat(300_000)}`), false);
});

test('?next= only accepts same-site paths', () => {
  assert.equal(safeNextPath('/invoice-generator?id=1'), '/invoice-generator?id=1');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '/\t/evil.com', 'javascript:alert(1)', '', null, 42]) {
    assert.equal(safeNextPath(bad), '/app', String(bad));
  }
});

test('account deletion leaves zero rows in every user table, including pending sign-in links', async () => {
  const id = await makeUser('Gone@Example.test');
  await db.insert(authSessions).values({ userId: id, token: 't-gone', expiresAt: new Date(Date.now() + 1e6) });
  await db.insert(authAccounts).values({ userId: id, providerId: 'google', accountId: 'g-gone' });
  await db.insert(subscriptions).values({ userId: id, provider: 'manual', providerRef: 'manual:gone', planKey: 'invoice_pro', status: 'active' });
  await saveProfile(db, id, { name: 'Gone', address: '', email: '', phone: '', logo: null });
  await createInvoice(db, id, sample(), 20);
  await db.insert(authVerifications).values([
    { identifier: 'tok-1', value: JSON.stringify({ type: 'magic-link', email: 'gone@example.test' }), expiresAt: new Date(Date.now() + 1e6) },
    { identifier: 'tok-2', value: JSON.stringify({ type: 'magic-link', email: 'other@example.test' }), expiresAt: new Date(Date.now() + 1e6) },
    { identifier: 'state-1', value: 'not json', expiresAt: new Date(Date.now() + 1e6) },
  ]);

  await deleteAccount(db, id, 'Gone@Example.test');

  for (const [name, table, col] of [
    ['auth_users', authUsers, authUsers.id],
    ['auth_sessions', authSessions, authSessions.userId],
    ['auth_accounts', authAccounts, authAccounts.userId],
    ['subscriptions', subscriptions, subscriptions.userId],
    ['business_profiles', businessProfiles, businessProfiles.userId],
    ['invoices', invoices, invoices.userId],
  ] as const) {
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(col, id));
    assert.equal(rows[0].n, 0, name);
  }
  const left = await db.select({ identifier: authVerifications.identifier }).from(authVerifications);
  assert.deepEqual(left.map((r) => r.identifier).sort(), ['state-1', 'tok-2']);
});

test('sign-in links: 3 per address per 10 minutes, then blocked', async () => {
  const checks = rateLimitChecks('accounts', 'signInLinkEmail', 'hash-of-someone');
  assert.equal(checks.length, 2);
  for (let i = 0; i < 3; i++) assert.equal((await consumeRateLimits(db, checks)).allowed, true);
  assert.equal((await consumeRateLimits(db, checks)).allowed, false);
});

test('e2e gate: closed without KK_E2E, without the secret, or with a wrong one', () => {
  const saved = { ...process.env };
  try {
    delete process.env.KK_E2E;
    process.env.KK_E2E_SECRET = 's'.repeat(40);
    assert.equal(isE2eEnabled(), false);
    process.env.KK_E2E = '1';
    assert.equal(isE2eEnabled(), true);
    assert.equal(e2eSecretMatches('s'.repeat(40)), true);
    assert.equal(e2eSecretMatches('s'.repeat(39)), false);
    assert.equal(e2eSecretMatches(null), false);
    process.env.KK_E2E_SECRET = 'short';
    assert.equal(isE2eEnabled(), false);
    assert.equal(e2eSecretMatches('short'), false);
  } finally {
    process.env = saved;
  }
});

test('same-site writes: Origin must match the host the browser used (dev on 0.0.0.0 included)', () => {
  const req = (url: string, headers: Record<string, string>) => ({ url, headers: new Headers(headers) });
  // `next dev --hostname 0.0.0.0`: req.url says 0.0.0.0, the browser says localhost.
  assert.equal(isSameOrigin(req('http://0.0.0.0:3000/api/invoices', { origin: 'http://localhost:3000', host: 'localhost:3000' })), true);
  assert.equal(isSameOrigin(req('https://kaamsolv.com/api/invoices', { origin: 'https://kaamsolv.com', host: 'kaamsolv.com' })), true);
  // Another site, a missing or opaque Origin, or a look-alike host: refused.
  assert.equal(isSameOrigin(req('https://kaamsolv.com/api/invoices', { origin: 'https://evil.example', host: 'kaamsolv.com' })), false);
  assert.equal(isSameOrigin(req('https://kaamsolv.com/api/invoices', { host: 'kaamsolv.com' })), false);
  assert.equal(isSameOrigin(req('https://kaamsolv.com/api/invoices', { origin: 'null', host: 'kaamsolv.com' })), false);
  assert.equal(isSameOrigin(req('https://kaamsolv.com/api/invoices', { origin: 'https://kaamsolv.com.evil.example', host: 'kaamsolv.com' })), false);
  assert.equal(isSameOrigin(req('http://localhost:3000/api/invoices', { origin: 'http://localhost:3001', host: 'localhost:3000' })), false);
});
