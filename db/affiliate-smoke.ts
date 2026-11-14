/**
 * The affiliate smoke test: the cases that only a real Neon database can settle, written once and run unchanged on any
 * driver. It is driver-free (takes a `db`), so it is proved on PGlite in the unit tests and then run against a
 * staging Neon database by `npm run affiliate:smoke` (db/affiliate-staging-smoke.mts) through the real Neon HTTP driver.
 *
 * What it checks: that the migrations (0018 to 0022) are in; one merchant per owner and taken slugs (the unique-violation
 * handling, which has only run on PGlite); the one-statement writes that use data-modifying CTEs, typed parameters and
 * `pg_trigger_depth()`; apply, approve, suspend and reinstate; the append-only history; the emails queued with each
 * change (once); referral links (made once, resolved, `?ref=` added) and recorded clicks (written, counted, and skipped for
 * previews and paused affiliates); optionally the real redirect over HTTP, including that the click written *after* the
 * response persists; reports and operator suspension; the plan entitlement; cross-merchant isolation; and that removing the
 * test accounts removes everything they made.
 *
 * It only ever creates rows tagged `smoke-<tag>-…@example.test` and removes them (and their outbox jobs) at the end,
 * whether the checks pass or not. It never reads or changes any other row. One of the few files allowed to touch the
 * affiliate tables (see test/affiliate-isolation.test.mts).
 */

import { like, sql } from 'drizzle-orm';
import { affiliateScope } from './affiliate-scope.ts';
import { findMerchant, reinstateMerchant, suspendMerchant } from './affiliate-operator.ts';
import { getEntitlements } from './entitlements.ts';
import type { Db } from './links.ts';
import { createMerchant, merchantForOwner, merchantScope, portalRegistration, publicMerchantBySlug } from './merchant-scope.ts';
import { createPortalReport, listPortalReports } from './portal-reports.ts';
import { ensureLinks, linksForAffiliate, recordAffiliateClick, resolveAffiliateLink } from './affiliate-links.ts';
import { connectStore, ordersForAffiliate, recordOrder, setCoupon } from './affiliate-orders.ts';
import { withRef } from '../app/lib/affiliate/link.ts';
import { deriveWebhookSecret, parseOrder, signBody } from '../app/lib/affiliate/orders.ts';
import { authUsers } from './schema.ts';

export type SmokeResult = { name: string; ok: boolean; detail: string };

const TABLES = ['merchants', 'merchant_brand_settings', 'programmes', 'programme_applications', 'programme_memberships', 'affiliate_profiles', 'affiliate_events', 'portal_reports', 'affiliate_links', 'affiliate_clicks', 'store_connections', 'affiliate_coupon_codes', 'affiliate_coupon_periods', 'affiliate_orders'];
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;
const brand = { logo: null, brandColour: '#FE6336', programmeName: 'Smoke Partners', programmeDescription: '', terms: '' };

/** True when every email in `auth_users` is a throwaway `@example.test` address: the backstop against a real database. */
export async function onlyTestAccounts(db: Db): Promise<{ ok: boolean; total: number }> {
  const r = rows<{ total: number; real: number }>(
    await db.execute(sql`select count(*)::int as total, count(*) filter (where email not like '%@example.test')::int as real from auth_users`),
  )[0];
  return { ok: r.real === 0, total: r.total };
}

export type SmokeOptions = {
  /**
   * The address of a running copy of the app that uses THIS database (for example the OpenNext preview on
   * http://localhost:8787, or a staging deployment). When given, the smoke test also requests a real referral link
   * and waits for the click that is written after the response to appear in the database.
   */
  redirectBaseUrl?: string;
  /** How long to wait for that click to appear. */
  waitMs?: number;
  /**
   * The master secret the app at `redirectBaseUrl` was started with (AFFILIATE_WEBHOOK_MASTER). With it the smoke test
   * also posts a signed WooCommerce order to that app and checks it is recorded, and that a wrongly signed one is refused.
   * Without it that check does not run (it is never silently reported as passed).
   */
  webhookMaster?: string;
};

const HUMAN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const BOT_UA = 'WhatsApp/2.23.20.0';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAffiliateSmoke(db: Db, tag: string, options: SmokeOptions = {}): Promise<SmokeResult[]>{
  const results: SmokeResult[] = [];
  const email = (n: string) => `smoke-${tag}-${n}@example.test`;
  const check = async (name: string, fn: () => Promise<string | void>) => {
    try {
      results.push({ name, ok: true, detail: (await fn()) ?? '' });
    } catch (e) {
      results.push({ name, ok: false, detail: (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 200) });
    }
  };
  const must = (cond: unknown, message: string) => {
    if (!cond) throw new Error(message);
  };
  const user = async (n: string) => (await db.insert(authUsers).values({ name: `Smoke ${n}`, email: email(n) }).returning({ id: authUsers.id }))[0].id;
  const refused = async (statement: ReturnType<typeof sql>, expect: RegExp) => {
    try {
      await db.execute(statement);
    } catch (e) {
      const text = `${(e as Error).message} ${(e as { cause?: Error }).cause?.message ?? ''}`;
      return expect.test(text);
    }
    return false;
  };

  const slugA = `smoke-a-${tag}`;
  const slugB = `smoke-b-${tag}`;
  const ids: { ownerA?: string; ownerB?: string; aff?: string; ma?: string; mb?: string; app?: string; link?: string; code?: string; before?: number; conn?: string; coupon?: string } = {};
  const destination = 'https://smoke-store.example/shop';
  const clicksOf = async (linkId: string) => Number(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_clicks where link_id = ${linkId}::uuid`))[0].n);

  try {
    await check('migrations 0018 to 0023 are applied (tables and columns exist)', async () => {
      for (const t of TABLES) {
        const r = rows<{ ok: boolean }>(await db.execute(sql`select to_regclass(${`public.${t}`}) is not null as ok`))[0];
        must(r.ok, `table ${t} is missing`);
      }
      const cols = rows<{ column_name: string }>(
        await db.execute(sql`select column_name from information_schema.columns where table_name = 'merchants' and column_name in ('status', 'suspended_reason')`),
      );
      must(cols.length === 2, 'merchants.status / suspended_reason are missing (is 0021 applied?)');
      const dest = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from information_schema.columns where table_name = 'programmes' and column_name = 'destination_url'`))[0].n;
      must(dest === 1, 'programmes.destination_url is missing (is 0022 applied?)');
      const plan = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from plan_features where plan_key = 'affiliate_manager' and feature_key = 'affiliate_programme'`))[0];
      must(plan.n === 1, 'the affiliate_manager plan is not seeded');
    });

    ids.ownerA = await user('owner-a');
    ids.ownerB = await user('owner-b');
    ids.aff = await user('affiliate');
    await affiliateScope(db, ids.aff).saveProfile({ displayName: 'Smoke Affiliate', website: '' });

    await check('make a merchant; a second one for the same owner is refused (already_has_merchant)', async () => {
      const a = await createMerchant(db, ids.ownerA!, { slug: slugA, name: 'Smoke A', brand });
      must(a.ok, 'the first create failed');
      ids.ma = (a as { id: string }).id;
      const again = await createMerchant(db, ids.ownerA!, { slug: `${slugA}-2`, name: 'Again', brand });
      must(!again.ok && again.error === 'already_has_merchant', `expected already_has_merchant, got ${JSON.stringify(again)}`);
    });

    await check('a taken slug is refused (slug_taken) and leaves nothing behind', async () => {
      const clash = await createMerchant(db, ids.ownerB!, { slug: slugA, name: 'Copycat', brand });
      must(!clash.ok && clash.error === 'slug_taken', `expected slug_taken, got ${JSON.stringify(clash)}`);
      must((await merchantForOwner(db, ids.ownerB!)) === null, 'a refused create left a merchant behind');
      const b = await createMerchant(db, ids.ownerB!, { slug: slugB, name: 'Smoke B', brand });
      must(b.ok, 'owner B could not make their own');
      ids.mb = (b as { id: string }).id;
    });

    await check('open registration; the public portal and its door read correctly', async () => {
      await merchantScope(db, ids.ma!).setProgrammeStatus('open', ids.ownerA!);
      await merchantScope(db, ids.mb!).setProgrammeStatus('open', ids.ownerB!);
      must((await publicMerchantBySlug(db, slugA))?.name === 'Smoke A', 'public portal not found');
      must((await portalRegistration(db, slugA)) === 'open', 'door is not open');
    });

    await check('apply with answers; a duplicate is refused; one "received" email is queued', async () => {
      const me = affiliateScope(db, ids.aff!);
      const r = await me.apply(slugA, 'hello', { category: 'teacher', channel: 'instagram', country: 'India' });
      must(r.ok, `apply failed: ${JSON.stringify(r)}`);
      ids.app = (r as { id: string }).id;
      const dup = await me.apply(slugA, 'again');
      must(!dup.ok && dup.block === 'already_pending', `expected already_pending, got ${JSON.stringify(dup)}`);
      const q = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from outbox where kind = 'affiliate_received' and payload->>'applicationId' = ${ids.app!}`))[0].n;
      must(q === 1, `expected 1 queued email, found ${q}`);
      const [row] = await merchantScope(db, ids.ma!).listApplications('pending');
      must(row.category === 'teacher' && row.channel === 'instagram' && row.country === 'India', 'answers were not saved');
    });

    await check('another merchant cannot decide or suspend this application (isolation)', async () => {
      must(!(await merchantScope(db, ids.mb!).decide(ids.app!, 'approved', ids.ownerB!, '')), 'merchant B approved merchant A’s application');
      must((await merchantScope(db, ids.mb!).listApplications()).length === 0, 'merchant B can list merchant A’s applicants');
    });

    await check('approve with a reason: one membership, one "decision" email, a second decision changes nothing', async () => {
      must(await merchantScope(db, ids.ma!).decide(ids.app!, 'approved', ids.ownerA!, 'Welcome'), 'approve failed');
      must(!(await merchantScope(db, ids.ma!).decide(ids.app!, 'rejected', ids.ownerA!, '')), 'a decided application was decided again');
      const m = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from programme_memberships where merchant_id = ${ids.ma!}::uuid`))[0].n;
      must(m === 1, `expected 1 membership, found ${m}`);
      const q = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from outbox where kind = 'affiliate_decision' and payload->>'applicationId' = ${ids.app!}`))[0].n;
      must(q === 1, `expected 1 decision email, found ${q}`);
      const [mine] = await affiliateScope(db, ids.aff!).list();
      must(mine.status === 'approved' && mine.decisionNote === 'Welcome', 'the affiliate does not see the decision and reason');
    });

    await check('suspend and reinstate an affiliate; a suspended one cannot apply again', async () => {
      const scope = merchantScope(db, ids.ma!);
      must(await scope.setMembership(ids.app!, 'suspended', ids.ownerA!, 'Test'), 'suspend failed');
      const blocked = await affiliateScope(db, ids.aff!).apply(slugA, '');
      must(!blocked.ok && blocked.block === 'suspended', `expected suspended, got ${JSON.stringify(blocked)}`);
      must(await scope.setMembership(ids.app!, 'active', ids.ownerA!, ''), 'reinstate failed');
    });


    await check('save the destination; each membership gets one link, made once; the link resolves and gets ?ref=', async () => {
      await merchantScope(db, ids.ma!).saveDestination(destination, ids.ownerA!);
      must((await merchantScope(db, ids.ma!).destination()) === destination, 'the destination was not saved');
      must((await ensureLinks(db, ids.aff!)) === 1, 'the first call did not make exactly one link');
      must((await ensureLinks(db, ids.aff!)) === 0, 'a second call made another link');
      const [mine] = await linksForAffiliate(db, ids.aff!);
      must(mine && /^[0-9A-Za-z]{8}$/.test(mine.code) && mine.hasDestination && !mine.paused, 'the link is not as expected');
      ids.code = mine.code;
      const r = await resolveAffiliateLink(db, slugA, mine.code);
      must(r.outcome === 'ok' && r.destination === destination, 'the link did not resolve to the destination');
      ids.link = (r as { linkId: string }).linkId;
      must((await resolveAffiliateLink(db, slugB, mine.code)).outcome === 'not_found', 'the code resolved under another business');
      must(withRef(destination, mine.code) === `${destination}?ref=${mine.code}`, 'the ?ref= address is wrong');
    });

    await check('a click is written and counted; a preview and a paused affiliate record nothing; reinstated, it records again', async () => {
      const human = { deviceClass: 'mobile', referrerHost: 'web.whatsapp.com', country: 'IN' } as const;
      must(await recordAffiliateClick(db, ids.link!, human), 'a click was not written');
      must(!(await recordAffiliateClick(db, ids.link!, { deviceClass: 'bot', referrerHost: null, country: null })), 'a preview was recorded');
      must((await clicksOf(ids.link!)) === 1, 'expected exactly 1 recorded click');
      const scope = merchantScope(db, ids.ma!);
      must(await scope.setMembership(ids.app!, 'suspended', ids.ownerA!, 'Test'), 'pause failed');
      must(!(await recordAffiliateClick(db, ids.link!, human)), 'a paused affiliate’s click was recorded');
      must(await scope.setMembership(ids.app!, 'active', ids.ownerA!, ''), 'reinstate failed');
      must(await recordAffiliateClick(db, ids.link!, human), 'a reinstated affiliate’s click was not recorded');
      const [mine] = await linksForAffiliate(db, ids.aff!);
      must(mine.clicks.all === 2 && mine.clicks.days7 === 2, `the affiliate sees ${mine.clicks.all} click(s), expected 2`);
      const [row] = await scope.listApplications('approved');
      must(row.clicksAll === 2, `the business sees ${row.clicksAll} click(s), expected 2`);
    });

    await check('connect a store; give a coupon; an order is recorded once, moved on by a refund, an unrelated coupon is not stored, and a paused affiliate earns no new order', async () => {
      const conn = await connectStore(db, ids.ma!, ids.ownerA!);
      must(conn, 'the store could not be connected');
      ids.conn = conn!.id;
      ids.coupon = `SM${tag.toUpperCase()}`;
      must((await setCoupon(db, ids.ma!, ids.app!, ids.coupon, ids.ownerA!)) === 'ok', 'the coupon was not saved');
      const created = new Date(Date.now() + 5000).toISOString().slice(0, 19);
      const body = (id: number, over: { status?: string; refund?: string; modified?: string; coupon?: string } = {}) => ({
        id, number: `S-${id}`, status: over.status ?? 'processing', currency: 'INR', date_created_gmt: created, date_modified_gmt: over.modified ?? created,
        total: '1650.00', line_items: [{ total: '1000.00' }, { total: '500.00' }], coupon_lines: [{ code: (over.coupon ?? ids.coupon!).toLowerCase() }],
        refunds: over.refund ? [{ total: `-${over.refund}` }] : [],
      });
      const read = async (b: object) => {
        const p = await parseOrder(b);
        must(p.ok, `the order was not readable: ${JSON.stringify(p)}`);
        return (p as { order: Parameters<typeof recordOrder>[2] }).order;
      };
      // Orders are credited from when the coupon was given; these are stamped a few seconds ahead, so they always fall after it.
      must((await recordOrder(db, ids.conn!, await read(body(1)))) === 'recorded', 'the order was not recorded');
      must((await recordOrder(db, ids.conn!, await read(body(1)))) === 'unchanged', 'a repeated delivery changed something');
      const later = new Date(Date.now() + 8000).toISOString().slice(0, 19);
      must((await recordOrder(db, ids.conn!, await read(body(1, { status: 'completed', refund: '200.00', modified: later })))) === 'updated', 'the refund update did not land');
      must((await recordOrder(db, ids.conn!, await read(body(1)))) === 'unchanged', 'an older update overwrote a newer one');
      must((await recordOrder(db, ids.conn!, await read(body(2, { coupon: 'NOTMINE1' })))) === 'not_credited', 'an unrelated coupon was credited');
      const mine = (await ordersForAffiliate(db, ids.aff!)).get(ids.app!);
      must(mine?.coupon === ids.coupon && mine.stats.orders.all === 1, `expected 1 recorded order, got ${mine?.stats.orders.all}`);
      must(mine!.stats.sales[0]?.all === 130000, `expected sales of 130000 paise (1,500 less the 200 refunded), got ${mine!.stats.sales[0]?.all}`);
      const scope = merchantScope(db, ids.ma!);
      must(await scope.setMembership(ids.app!, 'suspended', ids.ownerA!, 'Test'), 'pause failed');
      must((await recordOrder(db, ids.conn!, await read(body(3)))) === 'not_credited', 'a paused affiliate earned a new order');
      must((await recordOrder(db, ids.conn!, await read(body(1, { status: 'refunded', refund: '1550.00', modified: new Date(Date.now() + 20_000).toISOString().slice(0, 19) })))) === 'updated', 'a recorded order stopped taking updates when the affiliate was paused');
      must(await scope.setMembership(ids.app!, 'active', ids.ownerA!, ''), 'reinstate failed');
    });

    if (options.redirectBaseUrl) {
      const base = options.redirectBaseUrl.replace(/\/+$/, '');
      const waitMs = options.waitMs ?? 10_000;
      const get = (path: string, ua: string) => fetch(`${base}${path}`, { redirect: 'manual', headers: { 'user-agent': ua } });
      const waitFor = async (want: number) => {
        const until = Date.now() + waitMs;
        while (Date.now() < until) {
          if ((await clicksOf(ids.link!)) >= want) return true;
          await sleep(250);
        }
        return (await clicksOf(ids.link!)) >= want;
      };
      await check('the real redirect: 302 to the destination with ?ref=, no-store, noindex; unknown code is 404', async () => {
        const before = await clicksOf(ids.link!);
        const res = await get(`/${slugA}/${ids.code}`, HUMAN_UA);
        must(res.status === 302, `expected 302, got ${res.status}`);
        must(res.headers.get('location') === withRef(destination, ids.code!), `Location was ${res.headers.get('location')}`);
        must(/no-store/.test(res.headers.get('cache-control') ?? ''), 'the redirect is cacheable');
        must(/noindex/.test(res.headers.get('x-robots-tag') ?? ''), 'the redirect is indexable');
        must((await get(`/${slugA}/NoSuchCd`, HUMAN_UA)).status === 404, 'an unknown code was not 404');
        must((await get(`/nobody-${tag}/${ids.code}`, HUMAN_UA)).status === 404, 'an unknown business was not 404');
        ids.before = before;
      });
      await check('the click written AFTER the response persisted (polled in the database)', async () => {
        const want = (ids.before ?? 0) + 1;
        must(await waitFor(want), `no new click appeared within ${waitMs} ms: the post-response write did not persist (is this app using the same database?)`);
        return `appeared and counted ${await clicksOf(ids.link!)}`;
      });
      await check('over HTTP: a link preview records nothing; a paused affiliate goes to the store without ?ref= and records nothing', async () => {
        const settled = await clicksOf(ids.link!);
        must((await get(`/${slugA}/${ids.code}`, BOT_UA)).status === 302, 'a preview request was not redirected');
        await sleep(1500);
        must((await clicksOf(ids.link!)) === settled, 'a preview was recorded');
        const scope = merchantScope(db, ids.ma!);
        must(await scope.setMembership(ids.app!, 'suspended', ids.ownerA!, 'Test'), 'pause failed');
        const res = await get(`/${slugA}/${ids.code}`, HUMAN_UA);
        must(res.status === 302 && res.headers.get('location') === destination, `a paused link went to ${res.headers.get('location')}`);
        await sleep(1500);
        must((await clicksOf(ids.link!)) === settled, 'a paused affiliate’s click was recorded');
        must(await scope.setMembership(ids.app!, 'active', ids.ownerA!, ''), 'reinstate failed');
      });

      if (options.webhookMaster && ids.conn && ids.coupon) {
        await check('a signed WooCommerce order posted to the app is recorded; a wrongly signed one is refused', async () => {
          const secret = await deriveWebhookSecret(options.webhookMaster!, ids.conn!, 1);
          const created = new Date(Date.now() + 5000).toISOString().slice(0, 19);
          const text = JSON.stringify({
            id: 4, number: 'S-4', status: 'processing', currency: 'INR', date_created_gmt: created, date_modified_gmt: created, total: '800.00',
            line_items: [{ total: '800.00' }], coupon_lines: [{ code: ids.coupon!.toLowerCase() }], refunds: [],
          });
          const post = async (sig: string) => fetch(`${base}/api/affiliate/woo/${ids.conn}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-wc-webhook-topic': 'order.created', 'x-wc-webhook-signature': sig }, body: text });
          const bad = await post(await signBody('not-the-secret', text));
          must(bad.status === 401, `a wrongly signed order answered ${bad.status}, expected 401`);
          const good = await post(await signBody(secret, text));
          const answer = (await good.json().catch(() => ({}))) as { code?: string };
          must(good.status === 200 && answer.code === 'recorded', `a signed order answered ${good.status} ${answer.code}, expected 200 recorded (does the app use the same master secret and database?)`);
          const n = Number(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_orders where merchant_id = ${ids.ma!}::uuid and external_order_id = '4'`))[0].n);
          must(n === 1, `expected the order in the database, found ${n}`);
        });
      }
    }

    await check('the history is append-only: update and delete are refused', async () => {
      must(await refused(sql`update affiliate_events set action = 'approved' where merchant_id = ${ids.ma!}::uuid`, /append-only/), 'an event row could be updated');
      must(await refused(sql`delete from affiliate_events where merchant_id = ${ids.ma!}::uuid`, /append-only/), 'an event row could be deleted directly');
      const ev = rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where merchant_id = ${ids.ma!}::uuid order by id`)).map((r) => r.action);
      for (const a of ['portal_created', 'programme_opened', 'applied', 'approved', 'suspended', 'reinstated', 'destination_saved', 'link_created']) must(ev.includes(a), `event ${a} missing`);
    });

    await check('report a portal (live: stored; unknown: dropped); operator suspend hides it and reinstate restores it', async () => {
      must(await createPortalReport(db, { slug: slugA, reason: 'scam', details: 'smoke', reporterIpHash: `smoke-${tag}` }), 'a live portal report was not stored');
      must(!(await createPortalReport(db, { slug: `nobody-${tag}`, reason: 'scam', details: '', reporterIpHash: `smoke-${tag}` })), 'a report of an unknown portal was stored');
      must(await suspendMerchant(db, slugA, 'smoke'), 'operator suspend failed');
      must((await publicMerchantBySlug(db, slugA)) === null, 'a suspended portal is still public');
      must((await affiliateScope(db, ids.aff!).registrationState(slugA)) === null, 'a suspended portal still takes applications');
      must((await findMerchant(db, slugA))?.status === 'suspended', 'operator view does not show it suspended');
      must((await listPortalReports(db, { status: 'open' })).every((r) => r.slug !== slugA), 'its open reports were not marked reviewed');
      must(await reinstateMerchant(db, slugA), 'reinstate failed');
      must((await publicMerchantBySlug(db, slugA)) !== null, 'a reinstated portal is not public');
    });

    await check('the Affiliate Manager plan grants the entitlement; no plan, no entitlement', async () => {
      must(!(await getEntitlements(db, ids.ownerB!)).keys.includes('affiliate_programme'), 'a free account holds the entitlement');
      await db.execute(sql`insert into subscriptions (user_id, provider, provider_ref, plan_key, status) values (${ids.ownerB!}::uuid, 'manual', ${`manual:smoke:${tag}`}, 'affiliate_manager', 'active')`);
      must((await getEntitlements(db, ids.ownerB!)).keys.includes('affiliate_programme'), 'the plan does not grant the entitlement');
    });
  } finally {
    await check('clean-up: removing the test accounts removes everything they made', async () => {
      const appIds = ids.app ? [ids.app] : [];
      for (const id of appIds) await db.execute(sql`delete from outbox where payload->>'applicationId' = ${id}`);
      await db.delete(authUsers).where(like(authUsers.email, `smoke-${tag}-%@example.test`));
      const left = rows<{ n: number }>(
        await db.execute(sql`
          select (select count(*) from merchants where slug in (${slugA}, ${slugB}))::int
               + (select count(*) from auth_users where email like ${`smoke-${tag}-%`})::int
               + (select count(*) from outbox where payload->>'applicationId' = ${ids.app ?? ''})::int
               + (select count(*) from affiliate_links where merchant_id in (${ids.ma ?? '00000000-0000-0000-0000-000000000000'}::uuid, ${ids.mb ?? '00000000-0000-0000-0000-000000000000'}::uuid))::int
               + (select count(*) from affiliate_events where merchant_id in (${ids.ma ?? '00000000-0000-0000-0000-000000000000'}::uuid, ${ids.mb ?? '00000000-0000-0000-0000-000000000000'}::uuid))::int
               + (select count(*) from affiliate_orders where merchant_id in (${ids.ma ?? '00000000-0000-0000-0000-000000000000'}::uuid, ${ids.mb ?? '00000000-0000-0000-0000-000000000000'}::uuid))::int
               + (select count(*) from store_connections where merchant_id in (${ids.ma ?? '00000000-0000-0000-0000-000000000000'}::uuid, ${ids.mb ?? '00000000-0000-0000-0000-000000000000'}::uuid))::int as n`),
      )[0].n;
      must(left === 0, `${left} test row(s) are still there`);
    });
  }
  return results;
}
