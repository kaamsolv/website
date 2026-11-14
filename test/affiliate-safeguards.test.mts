import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { affiliateScope } from '../db/affiliate-scope.ts';
import { findMerchant, listMerchants, reinstateMerchant, releaseMerchant, staleMerchants, suspendMerchant } from '../db/affiliate-operator.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { createMerchant, merchantForOwner, merchantScope, portalRegistration, publicMerchantBySlug } from '../db/merchant-scope.ts';
import { createPortalReport, handlePortalReport, listPortalReports } from '../db/portal-reports.ts';
import { authUsers } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import { checkSlug } from '../app/lib/affiliate/merchant.ts';
import { parsePortalReport, PORTAL_REPORT_REASONS } from '../app/lib/affiliate/report.ts';
import { makeTestDb } from './helpers/test-db.mts';

const brand = { logo: null, brandColour: '#FE6336', programmeName: '', programmeDescription: '', terms: '' };
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;

async function user(db: Db, email: string): Promise<string> {
  const [r] = await db.insert(authUsers).values({ name: 'T', email }).returning({ id: authUsers.id });
  return r.id;
}
async function world(db: Db) {
  const oa = await user(db, 'oa@example.test');
  const ob = await user(db, 'ob@example.test');
  const ra = await createMerchant(db, oa, { slug: 'merchant-a', name: 'Merchant A', brand });
  const rb = await createMerchant(db, ob, { slug: 'merchant-b', name: 'Merchant B', brand });
  assert.ok(ra.ok && rb.ok);
  const ma = (ra as { id: string }).id;
  const mb = (rb as { id: string }).id;
  await merchantScope(db, ma).setProgrammeStatus('open', oa);
  await merchantScope(db, mb).setProgrammeStatus('open', ob);
  const aff = await user(db, 'aff@example.test');
  await affiliateScope(db, aff).saveProfile({ displayName: 'Riya', website: '' });
  return { oa, ob, ma, mb, aff };
}
const events = async (db: Db, merchantId: string) =>
  rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where merchant_id = ${merchantId}::uuid order by id`)).map((r) => r.action);

// ---- rules ----

test('slug: names that pass for KaamSolv, an official body or a payment provider are not available', () => {
  for (const bad of ['kaamsolv-support', 'my-kaamsolv', 'official-wandernest', 'hdfc-bank-offers', 'paytm-partners', 'phonepe-cashback', 'razorpay-affiliates', 'govt-jobs-partner', 'verified-travel', 'upi-rewards', 'incometax-refunds']) {
    const r = checkSlug(bad);
    assert.equal(r.ok, false, bad);
    if (!r.ok) assert.equal(r.error, 'slug_blocked', bad);
  }
});

test('slug: ordinary business names pass, including ones that merely contain a plain word', () => {
  for (const ok of ['wandernest-tales', 'riverbank-travel', 'sharma-and-sons', 'banksy-prints', 'govindas-kitchen', 'rbiswas-travel', 'upiter-tours']) {
    assert.equal(checkSlug(ok).ok, true, ok);
  }
});

test('portal report: a valid reason is required, details are cleaned and capped, the address must look like one', () => {
  for (const reason of PORTAL_REPORT_REASONS) assert.equal(parsePortalReport({ slug: 'merchant-a', reason }).ok, true, reason);
  const long = parsePortalReport({ slug: 'Merchant-A', reason: 'scam', details: 'x'.repeat(900) });
  assert.ok(long.ok);
  if (long.ok) {
    assert.equal(long.slug, 'merchant-a');
    assert.ok(long.details.length <= 500);
  }
  const dirty = parsePortalReport({ slug: 'merchant-a', reason: 'scam', details: 'a\u001b[31mred\u0007 text' });
  assert.ok(dirty.ok);
  if (dirty.ok) assert.ok(!/[\u001b\u0007]/.test(dirty.details), 'control characters are removed so it is safe to print in a terminal');
  for (const [body, field] of [
    [{ slug: 'merchant-a' }, 'reason'],
    [{ slug: 'merchant-a', reason: 'wizard' }, 'reason'],
    [{ reason: 'scam' }, 'slug'],
    [{ slug: 'no spaces allowed', reason: 'scam' }, 'slug'],
    [{ slug: 'merchant-a', reason: 'scam', details: 42 }, 'details'],
    [null, 'slug'],
  ] as const) {
    const r = parsePortalReport(body);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, field);
  }
});

// ---- reports ----

test('a report of a live portal is stored; an address that does not exist, or is suspended, stores nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    await world(db);
    assert.equal(await createPortalReport(db, { slug: 'merchant-a', reason: 'scam', details: 'asks for money', reporterIpHash: 'h1' }), true);
    assert.equal(await createPortalReport(db, { slug: 'no-such-portal', reason: 'scam', details: '', reporterIpHash: 'h1' }), false);
    await suspendMerchant(db, 'merchant-b', 'looks fake');
    assert.equal(await createPortalReport(db, { slug: 'merchant-b', reason: 'other', details: '', reporterIpHash: 'h2' }), false);
    const list = await listPortalReports(db, { status: 'all' });
    assert.equal(list.length, 1);
    assert.equal(list[0].slug, 'merchant-a');
    assert.equal(list[0].reason, 'scam');
    assert.equal(list[0].details, 'asks for money');
    assert.equal(list[0].openForMerchant, 1);
    assert.ok(!JSON.stringify(list).includes('h1'), 'the caller hash is never listed');
  } finally {
    await close();
  }
});

test('handling a report: reviewed or dismissed once; the database refuses anything else', async () => {
  const { db, close } = await makeTestDb();
  try {
    await world(db);
    await createPortalReport(db, { slug: 'merchant-a', reason: 'scam', details: '', reporterIpHash: 'h' });
    const [r] = await listPortalReports(db);
    assert.equal(await handlePortalReport(db, r.id, 'dismissed'), true);
    assert.equal(await handlePortalReport(db, r.id, 'reviewed'), false, 'already handled');
    assert.equal((await listPortalReports(db)).length, 0, 'open list is empty now');
    assert.equal((await listPortalReports(db, { status: 'dismissed' })).length, 1);
    await assert.rejects(db.execute(sql`update portal_reports set reason = 'wizard'`));
    await assert.rejects(db.execute(sql`update portal_reports set status = 'lost'`));
  } finally {
    await close();
  }
});

// ---- suspension ----

test('suspending a merchant hides the portal, shuts registration, tells the owner, and logs it; reinstating undoes it', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await createPortalReport(db, { slug: 'merchant-a', reason: 'impersonation', details: '', reporterIpHash: 'h' });
    assert.ok(await publicMerchantBySlug(db, 'merchant-a'));
    assert.equal(await portalRegistration(db, 'merchant-a'), 'open');

    assert.equal(await suspendMerchant(db, 'merchant-a', 'Pretends to be a bank'), true);
    assert.equal(await publicMerchantBySlug(db, 'merchant-a'), null, 'the portal is not found');
    assert.equal(await portalRegistration(db, 'merchant-a'), 'closed');
    assert.equal(await affiliateScope(db, w.aff).registrationState('merchant-a'), null);
    assert.deepEqual(await affiliateScope(db, w.aff).apply('merchant-a', ''), { ok: false, block: 'not_found' });

    const owner = await merchantForOwner(db, w.oa);
    assert.equal(owner?.status, 'suspended');
    assert.equal(owner?.suspendedReason, 'Pretends to be a bank');
    assert.equal((await listPortalReports(db, { status: 'open' })).length, 0, 'open reports are marked reviewed with the suspension');
    assert.equal(await suspendMerchant(db, 'merchant-a', 'again'), false, 'already suspended');

    // ISOLATION: the other merchant is untouched.
    assert.ok(await publicMerchantBySlug(db, 'merchant-b'));
    assert.equal((await merchantForOwner(db, w.ob))?.status, 'active');
    assert.ok(!(await events(db, w.mb)).includes('merchant_suspended'));

    assert.equal(await reinstateMerchant(db, 'merchant-a'), true);
    assert.ok(await publicMerchantBySlug(db, 'merchant-a'));
    assert.equal((await merchantForOwner(db, w.oa))?.suspendedReason, '');
    assert.equal(await reinstateMerchant(db, 'merchant-a'), false, 'not suspended');
    assert.equal(await affiliateScope(db, w.aff).registrationState('merchant-a'), 'open');
    assert.deepEqual((await events(db, w.ma)).slice(-2), ['merchant_suspended', 'merchant_reinstated']);
  } finally {
    await close();
  }
});

test('operator views: find, list, and the database refuses an unknown status', async () => {
  const { db, close } = await makeTestDb();
  try {
    await world(db);
    const m = await findMerchant(db, 'merchant-a');
    assert.equal(m?.ownerEmail, 'oa@example.test');
    assert.equal(m?.programme, 'open');
    assert.equal(m?.applications, 0);
    assert.equal(await findMerchant(db, 'nobody'), null);
    assert.deepEqual((await listMerchants(db)).map((x) => x.slug).sort(), ['merchant-a', 'merchant-b']);
    await assert.rejects(db.execute(sql`update merchants set status = 'banished'`));
  } finally {
    await close();
  }
});

// ---- stale addresses ----

test('stale portals: only ones nobody applied to and older than the cutoff can be listed or released; a portal in use never can', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    assert.equal((await staleMerchants(db, 90)).length, 0, 'new portals are not stale');
    assert.equal(await releaseMerchant(db, 'merchant-b', 90), false, 'too new');

    await db.execute(sql`update merchants set created_at = now() - interval '120 days'`);
    assert.deepEqual((await staleMerchants(db, 90)).map((m) => m.slug).sort(), ['merchant-a', 'merchant-b']);

    // A has an applicant: never stale, never releasable.
    assert.ok((await affiliateScope(db, w.aff).apply('merchant-a', '')).ok);
    assert.deepEqual((await staleMerchants(db, 90)).map((m) => m.slug), ['merchant-b']);
    assert.equal(await releaseMerchant(db, 'merchant-a', 90), false);
    assert.ok(await findMerchant(db, 'merchant-a'));

    // B is released: its address is free again, and its history went with it.
    assert.equal(await releaseMerchant(db, 'merchant-b', 90), true);
    assert.equal(await findMerchant(db, 'merchant-b'), null);
    assert.equal(rows(await db.execute(sql`select 1 from affiliate_events where merchant_id = ${w.mb}::uuid`)).length, 0);
    const again = await createMerchant(db, w.ob, { slug: 'merchant-b', name: 'Fresh start', brand });
    assert.ok(again.ok, 'the owner can make a new portal at the freed address');
  } finally {
    await close();
  }
});

// ---- entitlement ----

test('the Affiliate Manager plan exists and grants affiliate_programme; a free account does not hold it', async () => {
  const { db, close } = await makeTestDb();
  try {
    const free = await user(db, 'free@example.test');
    const paid = await user(db, 'paid@example.test');
    assert.ok(!(await getEntitlements(db, free)).keys.includes('affiliate_programme'));

    await db.execute(sql`insert into subscriptions (user_id, provider, provider_ref, plan_key, status) values (${paid}::uuid, 'manual', 'manual:test:aff', 'affiliate_manager', 'active')`);
    const held = await getEntitlements(db, paid);
    assert.ok(held.keys.includes('affiliate_programme'));
    assert.equal(held.limits.affiliate_programme, 1);
    assert.ok(!(await getEntitlements(db, free)).keys.includes('affiliate_programme'), 'one account’s plan never reaches another');

    await db.execute(sql`update subscriptions set status = 'canceled'`);
    assert.ok(!(await getEntitlements(db, paid)).keys.includes('affiliate_programme'), 'a lapsed plan no longer holds it');
    assert.equal(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from plan_features where plan_key = 'affiliate_manager'`))[0].n, 1);
  } finally {
    await close();
  }
});
