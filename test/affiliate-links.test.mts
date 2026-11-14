import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { ensureLinks, linksForAffiliate, recordAffiliateClick, resolveAffiliateLink } from '../db/affiliate-links.ts';
import { affiliateScope } from '../db/affiliate-scope.ts';
import { createMerchant, merchantScope } from '../db/merchant-scope.ts';
import { authUsers } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import type { ClickMeta } from '../app/lib/click-meta.ts';
import { makeTestDb } from './helpers/test-db.mts';

const brand = { logo: null, brandColour: '#FE6336', programmeName: '', programmeDescription: '', terms: '' };
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;
const human: ClickMeta = { deviceClass: 'mobile', referrerHost: 'web.whatsapp.com', country: 'IN' };

async function user(db: Db, email: string): Promise<string> {
  const [r] = await db.insert(authUsers).values({ name: 'T', email }).returning({ id: authUsers.id });
  return r.id;
}

/** Two businesses, each with an open programme; Riya joins A, Kabir joins B. */
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
  const riya = await user(db, 'riya@example.test');
  const kabir = await user(db, 'kabir@example.test');
  const join = async (aff: string, slug: string, owner: string, scopeId: string) => {
    const applied = await affiliateScope(db, aff).apply(slug, 'hi');
    assert.ok(applied.ok);
    assert.equal(await merchantScope(db, scopeId).decide((applied as { id: string }).id, 'approved', owner, ''), true);
    return (applied as { id: string }).id;
  };
  const appRiya = await join(riya, 'merchant-a', oa, ma);
  const appKabir = await join(kabir, 'merchant-b', ob, mb);
  return { oa, ob, ma, mb, riya, kabir, appRiya, appKabir };
}
const clickCount = async (db: Db) => Number(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_clicks`))[0].n);

test('each membership gets one link, once, with a history entry; calling again changes nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    assert.equal(await ensureLinks(db, w.riya), 1);
    assert.equal(await ensureLinks(db, w.riya), 0, 'a second call makes nothing');
    const mine = await linksForAffiliate(db, w.riya);
    assert.equal(mine.length, 1);
    assert.match(mine[0].code, /^[0-9A-Za-z]{8}$/);
    assert.equal(mine[0].slug, 'merchant-a');
    assert.equal(mine[0].applicationId, w.appRiya);
    assert.deepEqual(mine[0].clicks, { days7: 0, days30: 0, all: 0 });
    const ev = rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where merchant_id = ${w.ma}::uuid and action = 'link_created'`));
    assert.equal(ev.length, 1);
    // Someone else's memberships are not touched by Riya's call.
    assert.equal((await linksForAffiliate(db, w.kabir)).length, 0, 'Kabir has no link until he asks for one');
    assert.equal(await ensureLinks(db, w.kabir), 1);
  } finally {
    await close();
  }
});

test('an affiliate sees only their own link, and a code only resolves under its own business', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await ensureLinks(db, w.riya);
    await ensureLinks(db, w.kabir);
    const [riya] = await linksForAffiliate(db, w.riya);
    const [kabir] = await linksForAffiliate(db, w.kabir);
    assert.notEqual(riya.code, kabir.code);
    assert.equal((await linksForAffiliate(db, w.riya)).some((l) => l.code === kabir.code), false);
    assert.equal((await resolveAffiliateLink(db, 'merchant-a', riya.code)).outcome, 'ok');
    assert.equal((await resolveAffiliateLink(db, 'merchant-b', riya.code)).outcome, 'not_found', 'A’s code under B’s address is nothing');
    assert.equal((await resolveAffiliateLink(db, 'merchant-a', 'ZZZZZZZZ')).outcome, 'not_found');
    assert.equal((await resolveAffiliateLink(db, 'nobody', riya.code)).outcome, 'not_found');
    assert.equal((await resolveAffiliateLink(db, 'MERCHANT-A', riya.code)).outcome, 'not_found', 'addresses are lower-case only');
    assert.equal((await resolveAffiliateLink(db, 'merchant-a', riya.code.toLowerCase() === riya.code ? riya.code.toUpperCase() : riya.code.toLowerCase())).outcome, 'not_found', 'codes are case-sensitive');
  } finally {
    await close();
  }
});

test('the destination: saved per programme with one history entry; the programme row is made if needed; same value again writes nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const owner = await user(db, 'o@example.test');
    const made = await createMerchant(db, owner, { slug: 'fresh-shop', name: 'Fresh', brand });
    assert.ok(made.ok);
    const scope = merchantScope(db, (made as { id: string }).id);
    assert.equal(await scope.destination(), '');
    assert.equal(await scope.programmeStatus(), null);
    await scope.saveDestination('https://fresh.example/', owner);
    assert.equal(await scope.destination(), 'https://fresh.example/');
    assert.equal(await scope.programmeStatus(), 'closed', 'saving a destination does not open registration');
    await scope.saveDestination('https://fresh.example/', owner);
    await scope.setProgrammeStatus('open', owner);
    assert.equal(await scope.destination(), 'https://fresh.example/', 'opening registration keeps it');
    await scope.saveDestination('https://fresh.example/new', owner);
    const ev = rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where merchant_id = ${(made as { id: string }).id}::uuid order by id`)).map((r) => r.action);
    assert.deepEqual(ev, ['portal_created', 'destination_saved', 'programme_opened', 'destination_saved']);
    await assert.rejects(db.execute(sql`update programmes set destination_url = repeat('a', 501)`), 'the database refuses an over-long address');
  } finally {
    await close();
  }
});

test('a click records once for an active link, with only the agreed fields, and counts by window', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await ensureLinks(db, w.riya);
    const r = await resolveAffiliateLink(db, 'merchant-a', (await linksForAffiliate(db, w.riya))[0].code);
    assert.equal(r.outcome, 'ok');
    const linkId = (r as { linkId: string }).linkId;
    assert.equal(await recordAffiliateClick(db, linkId, human), true);
    assert.equal(await recordAffiliateClick(db, linkId, { deviceClass: 'desktop', referrerHost: null, country: null }), true);
    // An older click, outside 7 days and inside 30, and one older still.
    await db.execute(sql`insert into affiliate_clicks (link_id, merchant_id, occurred_at) values (${linkId}::uuid, ${w.ma}::uuid, now() - interval '10 days'), (${linkId}::uuid, ${w.ma}::uuid, now() - interval '45 days')`);
    const [mine] = await linksForAffiliate(db, w.riya);
    assert.deepEqual(mine.clicks, { days7: 2, days30: 3, all: 4 });
    const [row] = rows<Record<string, unknown>>(await db.execute(sql`select * from affiliate_clicks order by id limit 1`));
    assert.deepEqual(Object.keys(row).sort(), ['country', 'device_class', 'id', 'link_id', 'merchant_id', 'occurred_at', 'referrer_host'], 'no IP, no user agent, no visitor id');
    assert.equal(row.referrer_host, 'web.whatsapp.com');
    assert.equal(row.country, 'IN');
    await assert.rejects(db.execute(sql`insert into affiliate_clicks (link_id, merchant_id, country) values (${linkId}::uuid, ${w.ma}::uuid, 'India')`), 'the database refuses a country that isn’t two letters');
  } finally {
    await close();
  }
});

test('link previews (bots) are not recorded; a paused affiliate and a suspended business record nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await ensureLinks(db, w.riya);
    const code = (await linksForAffiliate(db, w.riya))[0].code;
    const linkId = ((await resolveAffiliateLink(db, 'merchant-a', code)) as { linkId: string }).linkId;

    assert.equal(await recordAffiliateClick(db, linkId, { deviceClass: 'bot', referrerHost: null, country: null }), false);
    assert.equal(await clickCount(db), 0, 'a preview fetcher leaves no row');

    // The business pauses Riya: the redirect says paused, and even a late write records nothing.
    assert.equal(await merchantScope(db, w.ma).setMembership(w.appRiya, 'suspended', w.oa, 'paused'), true);
    const paused = await resolveAffiliateLink(db, 'merchant-a', code);
    assert.equal(paused.outcome === 'ok' && paused.paused, true);
    assert.equal(await recordAffiliateClick(db, linkId, human), false);
    assert.equal((await linksForAffiliate(db, w.riya))[0].paused, true);
    assert.equal(await merchantScope(db, w.ma).setMembership(w.appRiya, 'active', w.oa, ''), true);
    assert.equal(await recordAffiliateClick(db, linkId, human), true, 'reinstated, it records again');

    // An operator suspends the business: the link is nothing, and nothing records.
    await db.execute(sql`update merchants set status = 'suspended' where id = ${w.ma}::uuid`);
    assert.equal((await resolveAffiliateLink(db, 'merchant-a', code)).outcome, 'not_found');
    assert.equal(await recordAffiliateClick(db, linkId, human), false);
    assert.equal(await clickCount(db), 1);
  } finally {
    await close();
  }
});

test('the business sees recorded clicks per affiliate, only for its own affiliates', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await ensureLinks(db, w.riya);
    await ensureLinks(db, w.kabir);
    const idOf = async (slug: string, aff: string) => ((await resolveAffiliateLink(db, slug, (await linksForAffiliate(db, aff))[0].code)) as { linkId: string }).linkId;
    const la = await idOf('merchant-a', w.riya);
    const lb = await idOf('merchant-b', w.kabir);
    for (let i = 0; i < 3; i += 1) await recordAffiliateClick(db, la, human);
    await recordAffiliateClick(db, lb, human);
    await db.execute(sql`insert into affiliate_clicks (link_id, merchant_id, occurred_at) values (${la}::uuid, ${w.ma}::uuid, now() - interval '60 days')`);

    const [a] = await merchantScope(db, w.ma).listApplications();
    assert.deepEqual([a.clicks30, a.clicksAll], [3, 4]);
    const [b] = await merchantScope(db, w.mb).listApplications();
    assert.deepEqual([b.clicks30, b.clicksAll], [1, 1], 'B sees only its own affiliate’s clicks');
  } finally {
    await close();
  }
});

test('removing a membership, a business or an account removes the link and its clicks', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await ensureLinks(db, w.riya);
    await ensureLinks(db, w.kabir);
    const linkId = async (slug: string, aff: string) => ((await resolveAffiliateLink(db, slug, (await linksForAffiliate(db, aff))[0].code)) as { linkId: string }).linkId;
    await recordAffiliateClick(db, await linkId('merchant-a', w.riya), human);
    await recordAffiliateClick(db, await linkId('merchant-b', w.kabir), human);
    assert.equal(await clickCount(db), 2);

    await db.execute(sql`delete from auth_users where id = ${w.riya}::uuid`);
    assert.equal(await clickCount(db), 1, 'deleting the affiliate removes their link and clicks');
    await db.execute(sql`delete from auth_users where id = ${w.ob}::uuid`);
    assert.equal(await clickCount(db), 0, 'deleting the business removes its affiliates’ links and clicks');
    const left = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_links`))[0].n;
    assert.equal(Number(left), 0);
  } finally {
    await close();
  }
});

test('two links in one business never share a code (the database refuses it)', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await ensureLinks(db, w.riya);
    const c = (await linksForAffiliate(db, w.riya))[0].code;
    const other = await user(db, 'third@example.test');
    const applied = await affiliateScope(db, other).apply('merchant-a', '');
    assert.ok(applied.ok);
    await merchantScope(db, w.ma).decide((applied as { id: string }).id, 'approved', w.oa, '');
    await assert.rejects(
      db.execute(sql`insert into affiliate_links (membership_id, merchant_id, affiliate_user_id, code)
                     select ms.id, ms.merchant_id, ms.affiliate_user_id, ${c} from programme_memberships ms where ms.affiliate_user_id = ${other}::uuid`),
    );
    assert.equal(await ensureLinks(db, other), 1, 'the normal path still gives them a fresh code');
  } finally {
    await close();
  }
});
