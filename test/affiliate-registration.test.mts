import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { affiliateScope } from '../db/affiliate-scope.ts';
import { createMerchant, merchantScope, portalRegistration } from '../db/merchant-scope.ts';
import { authUsers } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import { makeTestDb } from './helpers/test-db.mts';

const brand = { logo: null, brandColour: '#FE6336', programmeName: '', programmeDescription: '', terms: '' };
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;

async function user(db: Db, email: string): Promise<string> {
  const [r] = await db.insert(authUsers).values({ name: 'T', email }).returning({ id: authUsers.id });
  return r.id;
}
async function merchant(db: Db, owner: string, slug: string): Promise<string> {
  const r = await createMerchant(db, owner, { slug, name: slug, brand });
  assert.ok(r.ok);
  return (r as { id: string }).id;
}
async function profile(db: Db, id: string, name = 'Riya') {
  await affiliateScope(db, id).saveProfile({ displayName: name, website: '' });
}
/** Two open programmes, an owner each, and one affiliate. */
async function world(db: Db) {
  const oa = await user(db, 'oa@example.test');
  const ob = await user(db, 'ob@example.test');
  const ma = await merchant(db, oa, 'merchant-a');
  const mb = await merchant(db, ob, 'merchant-b');
  await merchantScope(db, ma).setProgrammeStatus('open', oa);
  await merchantScope(db, mb).setProgrammeStatus('open', ob);
  const aff = await user(db, 'aff@example.test');
  await profile(db, aff);
  return { oa, ob, ma, mb, aff };
}
const events = async (db: Db, merchantId: string) =>
  rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where merchant_id = ${merchantId}::uuid order by id`)).map((r) => r.action);

test('opening and closing registration; the door reads closed until opened', async () => {
  const { db, close } = await makeTestDb();
  try {
    const o = await user(db, 'o@example.test');
    const m = await merchant(db, o, 'shop-one');
    const scope = merchantScope(db, m);
    assert.equal(await scope.programmeStatus(), null);
    assert.equal(await portalRegistration(db, 'shop-one'), 'closed');
    await scope.setProgrammeStatus('open', o);
    assert.equal(await portalRegistration(db, 'shop-one'), 'open');
    await scope.setProgrammeStatus('open', o);
    await scope.setProgrammeStatus('closed', o);
    assert.equal(await portalRegistration(db, 'shop-one'), 'closed');
    assert.deepEqual(await events(db, m), ['portal_created', 'programme_opened', 'programme_closed'], 'a no-change call writes nothing');
  } finally {
    await close();
  }
});

test('apply → review → approve: one application, one membership, three events', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { oa, ma, aff } = await world(db);
    const me = affiliateScope(db, aff);
    assert.equal(await me.registrationState('merchant-a'), 'open');
    const applied = await me.apply('merchant-a', 'I run a travel blog');
    assert.ok(applied.ok);
    assert.equal(await me.registrationState('merchant-a'), 'pending');

    const scope = merchantScope(db, ma);
    assert.equal(await scope.pendingCount(), 1);
    assert.deepEqual(await scope.applicationCounts(), { pending: 1, approved: 0, rejected: 0, withdrawn: 0 });
    const [row] = await scope.listApplications('pending');
    assert.equal(row.displayName, 'Riya');
    assert.equal(row.message, 'I run a travel blog');
    assert.equal(row.email, 'aff@example.test');

    assert.equal(await scope.decide(row.id, 'approved', oa, 'Welcome'), true);
    assert.equal(await scope.pendingCount(), 0);
    assert.deepEqual(await scope.applicationCounts(), { pending: 0, approved: 1, rejected: 0, withdrawn: 0 });
    assert.equal(await me.registrationState('merchant-a'), 'approved');
    assert.deepEqual(await me.counts(), { pending: 0, approved: 1, rejected: 0, withdrawn: 0 }, 'the affiliate side counts only their own applications');
    const [mine] = await me.list();
    assert.equal(mine.status, 'approved');
    assert.equal(mine.membership, 'active');
    assert.equal(mine.decisionNote, 'Welcome');
    assert.deepEqual(await events(db, ma), ['portal_created', 'programme_opened', 'applied', 'approved']);
  } finally {
    await close();
  }
});

test('reject, cooldown, and withdraw', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { oa, ma, aff } = await world(db);
    const me = affiliateScope(db, aff);
    const scope = merchantScope(db, ma);

    const first = await me.apply('merchant-a', '');
    assert.ok(first.ok);
    assert.equal(await scope.decide((first as { id: string }).id, 'rejected', oa, 'Not a fit'), true);
    assert.equal(await me.registrationState('merchant-a'), 'cooldown');
    assert.deepEqual(await me.apply('merchant-a', ''), { ok: false, block: 'cooldown' });
    assert.equal((await me.list())[0].membership, null);

    // After the cooldown the same person can apply again.
    await db.execute(sql`update programme_applications set decided_at = now() - interval '8 days'`);
    const second = await me.apply('merchant-a', 'again');
    assert.ok(second.ok);
    assert.equal(await me.withdraw((second as { id: string }).id), true);
    assert.equal(await me.withdraw((second as { id: string }).id), false, 'already withdrawn');
    assert.equal(await scope.pendingCount(), 0);
    assert.deepEqual((await events(db, ma)).slice(-3), ['rejected', 'applied', 'withdrawn']);
  } finally {
    await close();
  }
});

test('apply is refused for: closed, unknown, own programme, duplicate pending, already a member', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { oa, ma, mb, aff } = await world(db);
    const me = affiliateScope(db, aff);
    assert.deepEqual(await me.apply('no-such-shop', ''), { ok: false, block: 'not_found' });
    assert.deepEqual(await affiliateScope(db, oa).apply('merchant-a', ''), { ok: false, block: 'own_programme' });

    await merchantScope(db, mb).setProgrammeStatus('closed', (await db.select().from(authUsers).where(eq(authUsers.email, 'ob@example.test')))[0].id);
    assert.deepEqual(await me.apply('merchant-b', ''), { ok: false, block: 'closed' });

    assert.ok((await me.apply('merchant-a', '')).ok);
    assert.deepEqual(await me.apply('merchant-a', ''), { ok: false, block: 'already_pending' });
    const [row] = await merchantScope(db, ma).listApplications('pending');
    await merchantScope(db, ma).decide(row.id, 'approved', oa, '');
    assert.deepEqual(await me.apply('merchant-a', ''), { ok: false, block: 'already_member' });
    const count = rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from programme_applications`))[0].n;
    assert.equal(count, 1, 'every refusal left nothing behind');
  } finally {
    await close();
  }
});

test('a decision is final: a second decide on the same application changes nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { oa, ma, aff } = await world(db);
    const a = await affiliateScope(db, aff).apply('merchant-a', '');
    const id = (a as { id: string }).id;
    const scope = merchantScope(db, ma);
    assert.equal(await scope.decide(id, 'rejected', oa, ''), true);
    assert.equal(await scope.decide(id, 'approved', oa, ''), false);
    assert.equal(rows(await db.execute(sql`select 1 from programme_memberships`)).length, 0, 'a rejected application never becomes a membership');
  } finally {
    await close();
  }
});

test('ISOLATION: merchant B cannot see or decide merchant A applications', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { oa, ob, ma, mb, aff } = await world(db);
    const a = await affiliateScope(db, aff).apply('merchant-a', 'for A only');
    const id = (a as { id: string }).id;

    const scopeB = merchantScope(db, mb);
    assert.deepEqual(await scopeB.applicationCounts(), { pending: 0, approved: 0, rejected: 0, withdrawn: 0 }, 'B’s counts never include A’s applicants');
    assert.deepEqual(await scopeB.listApplications(), []);
    assert.equal(await scopeB.pendingCount(), 0);
    assert.equal(await scopeB.decide(id, 'approved', ob, ''), false, 'B holding A’s application id changes nothing');
    assert.equal(await scopeB.decide(id, 'rejected', ob, ''), false);

    const [still] = await merchantScope(db, ma).listApplications();
    assert.equal(still.status, 'pending');
    assert.equal(rows(await db.execute(sql`select 1 from programme_memberships`)).length, 0);
    assert.deepEqual(await events(db, mb), ['portal_created', 'programme_opened'], 'nothing was logged against B');
    assert.ok(oa);
  } finally {
    await close();
  }
});

test('ISOLATION: an affiliate sees only their own applications and cannot withdraw another’s', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { aff } = await world(db);
    const other = await user(db, 'other@example.test');
    await profile(db, other, 'Sam');
    const mine = await affiliateScope(db, aff).apply('merchant-a', 'mine');
    const theirs = await affiliateScope(db, other).apply('merchant-a', 'theirs');
    assert.ok(mine.ok && theirs.ok);

    assert.deepEqual(await affiliateScope(db, aff).counts(), { pending: 1, approved: 0, rejected: 0, withdrawn: 0 }, 'another affiliate’s application is not in my counts');
    assert.deepEqual(await affiliateScope(db, other).counts(), { pending: 1, approved: 0, rejected: 0, withdrawn: 0 });
    const myList = await affiliateScope(db, aff).list();
    assert.equal(myList.length, 1);
    assert.equal(myList[0].message, 'mine');
    assert.equal(await affiliateScope(db, aff).withdraw((theirs as { id: string }).id), false);
    assert.equal((await affiliateScope(db, other).list())[0].status, 'pending');
    assert.equal((await affiliateScope(db, aff).profile())?.displayName, 'Riya');
    assert.equal((await affiliateScope(db, other).profile())?.displayName, 'Sam');
  } finally {
    await close();
  }
});

test('an affiliate’s own view never carries a merchant owner id or email', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { aff } = await world(db);
    await affiliateScope(db, aff).apply('merchant-a', '');
    const json = JSON.stringify(await affiliateScope(db, aff).list());
    assert.equal(json.includes('example.test'), false);
    assert.equal(json.includes('oa@'), false);
    assert.deepEqual(Object.keys((await affiliateScope(db, aff).list())[0]).sort(), [
      'createdAt', 'decidedAt', 'decisionNote', 'id', 'membership', 'merchantName', 'message', 'programmeName', 'slug', 'status', 'suspendNote',
    ]);
  } finally {
    await close();
  }
});

test('EVENTS are append-only: no update, no direct delete; the cascade from deleting an account still works', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { ma, aff } = await world(db);
    await affiliateScope(db, aff).apply('merchant-a', '');
    const appendOnly = (e: unknown) => /append-only/.test(`${(e as Error).message} ${((e as { cause?: Error }).cause?.message) ?? ''}`);
    await assert.rejects(db.execute(sql`update affiliate_events set action = 'approved'`), appendOnly);
    await assert.rejects(db.execute(sql`delete from affiliate_events`), appendOnly);
    const before = (await events(db, ma)).length;
    assert.ok(before >= 2);

    await db.delete(authUsers).where(eq(authUsers.id, aff));
    const after = rows<{ affiliate_user_id: string | null }>(await db.execute(sql`select affiliate_user_id from affiliate_events where merchant_id = ${ma}::uuid`));
    assert.ok(after.every((r) => r.affiliate_user_id !== aff), 'the affiliate’s own rows went with the account');
    assert.equal(rows(await db.execute(sql`select 1 from programme_applications`)).length, 0);
  } finally {
    await close();
  }
});

test('deleting a merchant’s owner removes its programme, applications, memberships and events', async () => {
  const { db, close } = await makeTestDb();
  try {
    const { oa, ma, aff } = await world(db);
    const a = await affiliateScope(db, aff).apply('merchant-a', '');
    await merchantScope(db, ma).decide((a as { id: string }).id, 'approved', oa, '');
    await db.delete(authUsers).where(eq(authUsers.id, oa));
    for (const t of ['programmes', 'programme_applications', 'programme_memberships']) {
      assert.equal(rows(await db.execute(sql.raw(`select 1 from ${t} where merchant_id = '${ma}'`))).length, 0, t);
    }
    assert.deepEqual(await events(db, ma), []);
    assert.equal((await affiliateScope(db, aff).profile())?.displayName, 'Riya', 'the affiliate keeps their account and profile');
  } finally {
    await close();
  }
});
