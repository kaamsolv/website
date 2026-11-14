/**
 * The affiliate smoke test: the cases that only a real Neon database can settle, written once and run unchanged on any
 * driver. It is driver-free (takes a `db`), so it is proved on PGlite in the unit tests and then run against a
 * staging Neon database by `npm run affiliate:smoke` (db/affiliate-staging-smoke.mts) through the real Neon HTTP driver.
 *
 * What it checks: that the migrations (0018 to 0021) are in; one merchant per owner and taken slugs (the unique-violation
 * handling, which has only run on PGlite); the one-statement writes that use data-modifying CTEs, typed parameters and
 * `pg_trigger_depth()`; apply, approve, suspend and reinstate; the append-only history; the emails queued with each
 * change (once); reports and operator suspension; the plan entitlement; cross-merchant isolation; and that removing the
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
import { authUsers } from './schema.ts';

export type SmokeResult = { name: string; ok: boolean; detail: string };

const TABLES = ['merchants', 'merchant_brand_settings', 'programmes', 'programme_applications', 'programme_memberships', 'affiliate_profiles', 'affiliate_events', 'portal_reports'];
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;
const brand = { logo: null, brandColour: '#FE6336', programmeName: 'Smoke Partners', programmeDescription: '', terms: '' };

/** True when every email in `auth_users` is a throwaway `@example.test` address: the backstop against a real database. */
export async function onlyTestAccounts(db: Db): Promise<{ ok: boolean; total: number }> {
  const r = rows<{ total: number; real: number }>(
    await db.execute(sql`select count(*)::int as total, count(*) filter (where email not like '%@example.test')::int as real from auth_users`),
  )[0];
  return { ok: r.real === 0, total: r.total };
}

export async function runAffiliateSmoke(db: Db, tag: string): Promise<SmokeResult[]> {
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
  const ids: { ownerA?: string; ownerB?: string; aff?: string; ma?: string; mb?: string; app?: string } = {};

  try {
    await check('migrations 0018 to 0021 are applied (tables and columns exist)', async () => {
      for (const t of TABLES) {
        const r = rows<{ ok: boolean }>(await db.execute(sql`select to_regclass(${`public.${t}`}) is not null as ok`))[0];
        must(r.ok, `table ${t} is missing`);
      }
      const cols = rows<{ column_name: string }>(
        await db.execute(sql`select column_name from information_schema.columns where table_name = 'merchants' and column_name in ('status', 'suspended_reason')`),
      );
      must(cols.length === 2, 'merchants.status / suspended_reason are missing (is 0021 applied?)');
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

    await check('the history is append-only: update and delete are refused', async () => {
      must(await refused(sql`update affiliate_events set action = 'approved' where merchant_id = ${ids.ma!}::uuid`, /append-only/), 'an event row could be updated');
      must(await refused(sql`delete from affiliate_events where merchant_id = ${ids.ma!}::uuid`, /append-only/), 'an event row could be deleted directly');
      const ev = rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where merchant_id = ${ids.ma!}::uuid order by id`)).map((r) => r.action);
      for (const a of ['portal_created', 'programme_opened', 'applied', 'approved', 'suspended', 'reinstated']) must(ev.includes(a), `event ${a} missing`);
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
               + (select count(*) from affiliate_events where merchant_id in (${ids.ma ?? '00000000-0000-0000-0000-000000000000'}::uuid, ${ids.mb ?? '00000000-0000-0000-0000-000000000000'}::uuid))::int as n`),
      )[0].n;
      must(left === 0, `${left} test row(s) are still there`);
    });
  }
  return results;
}
