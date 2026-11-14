import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import {
  connectStore,
  connectionFor,
  connectionForDelivery,
  disconnectStore,
  ordersForAffiliate,
  orderStatsForMerchant,
  recentOrdersForMerchant,
  recordOrder,
  rotateStoreSecret,
  setCoupon,
} from '../db/affiliate-orders.ts';
import { affiliateScope } from '../db/affiliate-scope.ts';
import { createMerchant, merchantScope } from '../db/merchant-scope.ts';
import { authUsers } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import { netSalePaise, parseOrder, type ParsedOrder } from '../app/lib/affiliate/orders.ts';
import { makeTestDb } from './helpers/test-db.mts';
import { wooOrder } from './helpers/woo-fixtures.mts';

const brand = { logo: null, brandColour: '#FE6336', programmeName: '', programmeDescription: '', terms: '' };
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;
const gmt = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString().slice(0, 19);

async function user(db: Db, email: string): Promise<string> {
  const [r] = await db.insert(authUsers).values({ name: 'T', email }).returning({ id: authUsers.id });
  return r.id;
}

/** Business A with two affiliates (Asha, Ravi) and a store connection; business B with one (Kabir) and its own. */
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
  const join = async (email: string, slug: string, owner: string, merchantId: string) => {
    const aff = await user(db, email);
    const applied = await affiliateScope(db, aff).apply(slug, 'hi');
    assert.ok(applied.ok);
    assert.equal(await merchantScope(db, merchantId).decide((applied as { id: string }).id, 'approved', owner, ''), true);
    return { aff, app: (applied as { id: string }).id };
  };
  const asha = await join('asha@example.test', 'merchant-a', oa, ma);
  const ravi = await join('ravi@example.test', 'merchant-a', oa, ma);
  const kabir = await join('kabir@example.test', 'merchant-b', ob, mb);
  const ca = await connectStore(db, ma, oa);
  const cb = await connectStore(db, mb, ob);
  assert.ok(ca && cb);
  return { oa, ob, ma, mb, asha, ravi, kabir, connA: ca!.id, connB: cb!.id };
}
type World = Awaited<ReturnType<typeof world>>;

/** Coupons are credited from when they are given, so most tests move that moment well into the past first. */
async function backdate(db: Db, days = 30) {
  await db.execute(sql.raw(`update affiliate_coupon_periods set active_from = now() - interval '${days} days' where active_to is null`));
}
async function givenCoupon(db: Db, w: World, who: 'asha' | 'ravi' | 'kabir', code: string) {
  const merchant = who === 'kabir' ? w.mb : w.ma;
  const owner = who === 'kabir' ? w.ob : w.oa;
  assert.equal(await setCoupon(db, merchant, w[who].app, code, owner), 'ok');
  await backdate(db);
}
const po = async (over: Parameters<typeof wooOrder>[0], force?: Parameters<typeof parseOrder>[1]): Promise<ParsedOrder> => {
  const r = await parseOrder(wooOrder(over), force);
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { order: ParsedOrder }).order;
};
const count = async (db: Db, table: string) => Number(rows<{ n: number }>(await db.execute(sql.raw(`select count(*)::int as n from ${table}`)))[0].n);

// ─── The connection ───────────────────────────────────────────────────────────

test('a connection: made once per business with a history entry; rotated; removed; the address then answers nobody', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    const first = await connectionFor(db, w.ma);
    assert.equal(first?.secretVersion, 1);
    assert.equal(first?.lastReceivedAt, null);
    assert.equal((await connectStore(db, w.ma, w.oa))?.id, first?.id, 'a second connect makes nothing new');
    assert.equal(await count(db, 'store_connections'), 2);
    assert.equal(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_events where action = 'store_connected' and merchant_id = ${w.ma}::uuid`))[0].n, 1);

    assert.deepEqual(await connectionForDelivery(db, first!.id), { id: first!.id, secretVersion: 1 });
    assert.equal(await rotateStoreSecret(db, w.ma, w.oa), true);
    assert.deepEqual(await connectionForDelivery(db, first!.id), { id: first!.id, secretVersion: 2 });
    assert.equal(await connectionForDelivery(db, 'not-a-uuid'), null);
    assert.equal(await connectionForDelivery(db, '11111111-1111-4111-8111-111111111111'), null);

    assert.equal(await disconnectStore(db, w.ma, w.oa), true);
    assert.equal(await connectionFor(db, w.ma), null);
    assert.equal(await connectionForDelivery(db, first!.id), null);
    assert.equal(await disconnectStore(db, w.ma, w.oa), false, 'nothing left to remove');
    assert.ok(await connectionFor(db, w.mb), 'the other business is untouched');
  } finally {
    await close();
  }
});

test('a suspended business cannot make or rotate a connection', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await disconnectStore(db, w.ma, w.oa);
    await db.execute(sql`update merchants set status = 'suspended' where id = ${w.ma}::uuid`);
    assert.equal(await connectStore(db, w.ma, w.oa), null);
    await db.execute(sql`update merchants set status = 'active' where id = ${w.ma}::uuid`);
    await connectStore(db, w.ma, w.oa);
    await db.execute(sql`update merchants set status = 'suspended' where id = ${w.ma}::uuid`);
    assert.equal(await rotateStoreSecret(db, w.ma, w.oa), false);
  } finally {
    await close();
  }
});

// ─── Coupons: ownership and history ───────────────────────────────────────────

test('coupons: a code belongs to the first affiliate it is given to, for good; it can come off and go back on, never to someone else', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    assert.equal(await setCoupon(db, w.ma, w.asha.app, 'ASHA10', w.oa), 'ok');
    assert.equal(await setCoupon(db, w.ma, w.asha.app, 'ASHA10', w.oa), 'ok', 'naming the code already in use changes nothing');
    assert.equal(await setCoupon(db, w.ma, w.ravi.app, 'ASHA10', w.oa), 'taken', 'in use by Asha');

    assert.equal(await setCoupon(db, w.ma, w.asha.app, 'ASHA20', w.oa), 'ok', 'replaced');
    assert.equal(await setCoupon(db, w.ma, w.ravi.app, 'ASHA10', w.oa), 'taken', 'Asha no longer uses it, but it was hers: never silently given to Ravi');
    assert.equal(await setCoupon(db, w.ma, w.ravi.app, 'ASHA20', w.oa), 'taken');
    assert.equal(await setCoupon(db, w.ma, w.ravi.app, 'RAVI10', w.oa), 'ok');

    assert.equal(await setCoupon(db, w.ma, w.asha.app, 'ASHA10', w.oa), 'ok', 'Asha can take her old code back');
    const open = rows<{ code: string }>(await db.execute(sql`select code from affiliate_coupon_periods where membership_id = (select id from programme_memberships where affiliate_user_id = ${w.asha.aff}::uuid) and active_to is null`));
    assert.deepEqual(open.map((r) => r.code), ['ASHA10'], 'one open code at a time');

    assert.equal(await setCoupon(db, w.ma, w.asha.app, '', w.oa), 'ok', 'cleared');
    assert.equal(rows(await db.execute(sql`select 1 from affiliate_coupon_periods where code = 'ASHA10' and active_to is null`)).length, 0);
    assert.ok(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_coupon_periods where code like 'ASHA%'`))[0].n >= 3, 'the history stays');
    const ev = rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where application_id = ${w.asha.app}::uuid and action like 'coupon_%' order by id`)).map((r) => r.action);
    assert.ok(ev.includes('coupon_set') && ev.includes('coupon_cleared'));

    // The same code in another business is a different code.
    assert.equal(await setCoupon(db, w.mb, w.kabir.app, 'ASHA10', w.ob), 'ok');
  } finally {
    await close();
  }
});

test('coupons: only an approved affiliate of YOUR business can be given one', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    assert.equal(await setCoupon(db, w.ma, w.kabir.app, 'KABIR10', w.oa), 'not_member', 'Kabir is business B’s');
    assert.equal(await setCoupon(db, w.mb, w.asha.app, 'ASHA10', w.ob), 'not_member', 'Asha is business A’s');
    assert.equal(await setCoupon(db, w.ma, '11111111-1111-4111-8111-111111111111', 'GHOST10', w.oa), 'not_member');
    assert.equal(await count(db, 'affiliate_coupon_codes'), 0, 'refusals leave nothing behind');
    await db.execute(sql`update merchants set status = 'suspended' where id = ${w.ma}::uuid`);
    assert.equal(await setCoupon(db, w.ma, w.asha.app, 'ASHA10', w.oa), 'not_member', 'a suspended business can’t change codes');
  } finally {
    await close();
  }
});

// ─── Crediting an order ───────────────────────────────────────────────────────

test('a new order is credited when exactly one of its coupons maps to an active affiliate; its numbers add up', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(30), lines: ['1000.00', '500.00'], coupons: ['asha10'] })), 'recorded');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 2, created: gmt(20), status: 'pending', lines: ['700.00'], coupons: ['ASHA10'] })), 'recorded');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 3, created: gmt(10), status: 'completed', lines: ['2000.00'], coupons: ['ASHA10'], refunds: ['500.00'] })), 'recorded');
    const mine = (await ordersForAffiliate(db, w.asha.aff)).get(w.asha.app)!;
    assert.equal(mine.coupon, 'ASHA10');
    assert.deepEqual(mine.stats.orders, { days7: 3, days30: 3, all: 3 });
    // 1,500 (processing) + 0 (pending: not paid yet) + (2,000 − 500) (completed, partly refunded)
    assert.deepEqual(mine.stats.sales, [{ currency: 'INR', days30: 300000, all: 300000 }]);
    assert.equal(mine.recent.length, 3);
    assert.equal(mine.recent[0].number, '3', 'newest first');
    assert.deepEqual({ sale: mine.recent[0].salePaise, refunded: mine.recent[0].refundedPaise, net: mine.recent[0].netPaise }, { sale: 200000, refunded: 50000, net: 150000 }, 'the partial refund is shown, and sales are net of it');
    assert.equal(mine.recent[2].netPaise, 150000);
    assert.equal(mine.recent[1].netPaise, 0, 'pending counts as an order, not as sales');
    for (const r of mine.recent) assert.equal(r.netPaise, netSalePaise(r.status, r.salePaise, r.refundedPaise), 'SQL and TypeScript agree');
    const conn = await connectionFor(db, w.ma);
    assert.ok(conn?.lastReceivedAt, 'the connection shows when it last heard from the store');
    assert.equal(conn?.ordersRecorded, 3);
  } finally {
    await close();
  }
});

test('an order that names no affiliate coupon, or one that is not in use, is not stored at all', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: [] })), 'not_credited');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 2, created: gmt(5), coupons: ['WELCOME'] })), 'not_credited');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 3, created: gmt(5), coupons: ['KABIR10'] })), 'not_credited');
    assert.equal(await count(db, 'affiliate_orders'), 0);
    assert.equal((await connectionFor(db, w.ma))?.ambiguousOrders, 0);
  } finally {
    await close();
  }
});

test('two affiliate coupons on one order: nobody is credited, nothing is guessed, and the business is told how many', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    await givenCoupon(db, w, 'ravi', 'RAVI10');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: ['ASHA10', 'RAVI10'] })), 'ambiguous');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: ['ravi10', 'asha10'] })), 'ambiguous', 'a repeat is counted again, still credits nobody');
    assert.equal(await count(db, 'affiliate_orders'), 0);
    assert.equal((await connectionFor(db, w.ma))?.ambiguousOrders, 2);
    // One affiliate coupon plus an ordinary store coupon is fine.
    assert.equal(await recordOrder(db, w.connA, await po({ id: 2, created: gmt(5), coupons: ['WELCOME', 'asha10'] })), 'recorded');
    // The same affiliate's code twice is one coupon, not two.
    assert.equal(await recordOrder(db, w.connA, await po({ id: 3, created: gmt(5), coupons: ['ASHA10', 'asha10'] })), 'recorded');
  } finally {
    await close();
  }
});

test('a delayed order resolves to whoever owned the code WHEN IT WAS PLACED, and a replaced code is never reassigned', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    // History: ASHA10 was Asha's for ten days, retired five days ago, and ASHA20 is hers now.
    await db.execute(sql`update affiliate_coupon_periods set active_from = now() - interval '10 days' where code = 'ASHA10'`);
    assert.equal(await setCoupon(db, w.ma, w.asha.app, 'ASHA20', w.oa), 'ok');
    await db.execute(sql`update affiliate_coupon_periods set active_to = now() - interval '5 days' where code = 'ASHA10'`);
    await db.execute(sql`update affiliate_coupon_periods set active_from = now() - interval '5 days' where code = 'ASHA20'`);
    assert.equal(await setCoupon(db, w.ma, w.ravi.app, 'ASHA10', w.oa), 'taken', 'Ravi can’t be given Asha’s old code');
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);

    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: ago(7), coupons: ['ASHA10'] })), 'recorded', 'a delayed webhook for an order placed while ASHA10 was hers');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 2, created: ago(2), coupons: ['ASHA10'] })), 'not_credited', 'placed after the code was retired');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 3, created: ago(12), coupons: ['ASHA10'] })), 'not_credited', 'placed before the code was ever given');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 4, created: ago(1), coupons: ['ASHA20'] })), 'recorded');
    const credited = rows<{ external_order_id: string; affiliate_user_id: string }>(await db.execute(sql`select external_order_id, affiliate_user_id from affiliate_orders order by external_order_id`));
    assert.deepEqual(credited.map((r) => [r.external_order_id, r.affiliate_user_id === w.asha.aff]), [['1', true], ['4', true]]);
  } finally {
    await close();
  }
});

test('a NEW order needs an active membership and an active business; a recorded one keeps taking updates after a suspension', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(60), status: 'processing', modified: gmt(60), coupons: ['ASHA10'] })), 'recorded');

    assert.equal(await merchantScope(db, w.ma).setMembership(w.asha.app, 'suspended', w.oa, 'paused'), true);
    assert.equal(await recordOrder(db, w.connA, await po({ id: 2, created: gmt(5), coupons: ['ASHA10'] })), 'not_credited', 'a paused affiliate earns no new order');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(60), status: 'completed', modified: gmt(30), refunds: ['100.00'], coupons: ['ASHA10'] })), 'updated', 'but the order already recorded moves on');

    await db.execute(sql`update merchants set status = 'suspended' where id = ${w.ma}::uuid`);
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(60), status: 'refunded', modified: gmt(10), refunds: ['1550.00'], coupons: ['ASHA10'] })), 'updated', 'and still does if the business is suspended');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 3, created: gmt(5), coupons: ['ASHA10'] })), 'not_credited', 'a suspended business credits no new order');
    const o = rows<{ status: string; refunded_paise: string }>(await db.execute(sql`select status, refunded_paise from affiliate_orders`));
    assert.deepEqual(o.map((r) => [r.status, Number(r.refunded_paise)]), [['refunded', 155000]]);
  } finally {
    await close();
  }
});

test('an unknown connection credits nothing; a connection only sees its own business’s coupons', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'kabir', 'KABIR10');
    assert.equal(await recordOrder(db, '11111111-1111-4111-8111-111111111111', await po({ id: 1, created: gmt(5), coupons: ['KABIR10'] })), 'no_connection');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: ['KABIR10'] })), 'not_credited', 'business A’s webhook can’t credit business B’s affiliate');
    assert.equal(await recordOrder(db, w.connB, await po({ id: 1, created: gmt(5), coupons: ['KABIR10'] })), 'recorded');
    assert.equal(await count(db, 'affiliate_orders'), 1);
    // The same store order id in two businesses is two orders.
    await givenCoupon(db, w, 'asha', 'ASHA10');
    assert.equal(await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: ['ASHA10'] })), 'recorded');
    assert.equal(await count(db, 'affiliate_orders'), 2);
  } finally {
    await close();
  }
});

// ─── Repeated, late and out-of-order deliveries ───────────────────────────────

test('deliveries: a duplicate changes nothing; an older update is ignored; an update that arrives first still works', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    const created = gmt(60);
    const v1 = await po({ id: 9, created, modified: gmt(50), status: 'processing', coupons: ['ASHA10'] });
    const v2 = await po({ id: 9, created, modified: gmt(40), status: 'completed', coupons: ['ASHA10'] });
    assert.equal(await recordOrder(db, w.connA, v2), 'recorded', 'the update arrived before the creation');
    assert.equal(await recordOrder(db, w.connA, v2), 'unchanged', 'the same delivery again');
    assert.equal(await recordOrder(db, w.connA, v1), 'unchanged', 'the older one, arriving late');
    const r = rows<{ status: string }>(await db.execute(sql`select status from affiliate_orders`));
    assert.deepEqual(r.map((x) => x.status), ['completed']);
    assert.equal(await count(db, 'affiliate_orders'), 1);
  } finally {
    await close();
  }
});

test('deliveries: same-second conflicts settle by status, then refund, then digest, in either order of arrival', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    const created = gmt(60);
    const t = gmt(30);
    const final = async (variants: ParsedOrder[]) => {
      const out = new Set<string>();
      const orders = [variants, [...variants].reverse()];
      for (const order of orders) {
        await db.execute(sql`delete from affiliate_orders`);
        for (const v of order) await recordOrder(db, w.connA, v);
        const [row] = rows<{ status: string; refunded_paise: string; sale_paise: string }>(await db.execute(sql`select status, refunded_paise, sale_paise from affiliate_orders`));
        out.add(`${row.status}|${row.refunded_paise}|${row.sale_paise}`);
      }
      assert.equal(out.size, 1, `both arrival orders settle on one row, got ${[...out].join(' / ')}`);
      return [...out][0];
    };
    const mk = (over: Parameters<typeof wooOrder>[0]) => po({ id: 5, created, modified: t, coupons: ['ASHA10'], ...over });

    assert.equal(await final([await mk({ status: 'processing' }), await mk({ status: 'completed' })]), 'completed|0|150000');
    assert.equal(await final([await mk({ status: 'completed' }), await mk({ status: 'completed', refunds: ['200.00'] })]), 'completed|20000|150000', 'the larger refund');
    assert.equal(await final([await mk({ status: 'completed', refunds: ['200.00'] }), await mk({ status: 'completed', refunds: ['300.00'] })]), 'completed|30000|150000');
    assert.equal(await final([await mk({ status: 'completed' }), await mk({ status: 'refunded', refunds: ['1550.00'] })]), 'refunded|155000|150000');
    assert.equal(await final([await mk({ status: 'completed' }), await mk({ status: 'cancelled' })]), 'cancelled|0|150000');
    assert.equal((await final([await mk({ status: 'completed', lines: ['1000.00', '500.00'] }), await mk({ status: 'completed', lines: ['1001.00', '500.00'] })])).startsWith('completed|0|'), true, 'a digest breaks a true tie, the same way each time');
  } finally {
    await close();
  }
});

test('deliveries: every ordering of a whole order’s life ends on the same row', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    const created = gmt(120);
    const life = [
      await po({ id: 77, created, modified: gmt(100), status: 'pending', coupons: ['ASHA10'] }),
      await po({ id: 77, created, modified: gmt(90), status: 'processing', coupons: ['ASHA10'] }),
      await po({ id: 77, created, modified: gmt(80), status: 'completed', coupons: ['ASHA10'] }),
      await po({ id: 77, created, modified: gmt(70), status: 'completed', refunds: ['200.00'], coupons: ['ASHA10'] }),
      await po({ id: 77, created, modified: gmt(70), status: 'completed', refunds: ['350.00'], coupons: ['ASHA10'] }),
    ];
    const perms: number[][] = [];
    const permute = (rest: number[], got: number[] = []) => (rest.length === 0 ? perms.push(got) : rest.forEach((r, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...got, r])));
    permute([0, 1, 2, 3, 4]);
    const results = new Set<string>();
    for (const p of perms) {
      await db.execute(sql`delete from affiliate_orders`);
      for (const i of p) await recordOrder(db, w.connA, life[i]);
      const [row] = rows<{ status: string; refunded_paise: string }>(await db.execute(sql`select status, refunded_paise from affiliate_orders`));
      results.add(`${row.status}|${row.refunded_paise}`);
    }
    assert.deepEqual([...results], ['completed|35000'], `${perms.length} orderings`);
  } finally {
    await close();
  }
});

test('deliveries: two arriving at the very same moment still settle on the newer one', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    const created = gmt(60);
    const older = await po({ id: 31, created, modified: gmt(50), status: 'processing', coupons: ['ASHA10'] });
    const newer = await po({ id: 31, created, modified: gmt(40), status: 'completed', refunds: ['100.00'], coupons: ['ASHA10'] });
    await Promise.all([recordOrder(db, w.connA, older), recordOrder(db, w.connA, newer)]);
    const r = rows<{ status: string; refunded_paise: string }>(await db.execute(sql`select status, refunded_paise from affiliate_orders`));
    assert.deepEqual(r.map((x) => [x.status, Number(x.refunded_paise)]), [['completed', 10000]]);
  } finally {
    await close();
  }
});

test('sales: partial refunds are shown and subtracted, a full refund and a cancellation count for nothing, and nothing overstates', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    const base = { created: gmt(30), coupons: ['ASHA10'], lines: ['1000.00'] };
    await recordOrder(db, w.connA, await po({ ...base, id: 1, status: 'completed' }));
    await recordOrder(db, w.connA, await po({ ...base, id: 2, status: 'completed', refunds: ['250.00'] }));
    await recordOrder(db, w.connA, await po({ ...base, id: 3, status: 'refunded', refunds: ['1050.00'] }));
    await recordOrder(db, w.connA, await po({ ...base, id: 4, status: 'cancelled' }));
    await recordOrder(db, w.connA, await po({ ...base, id: 5, status: 'on-hold' }));
    await recordOrder(db, w.connA, await po({ ...base, id: 6, status: 'completed', refunds: ['5000.00'] }));
    const stats = (await ordersForAffiliate(db, w.asha.aff)).get(w.asha.app)!.stats;
    assert.equal(stats.orders.all, 6);
    assert.deepEqual(stats.sales, [{ currency: 'INR', days30: 175000, all: 175000 }], '1,000 + 750 + 0 + 0 + 0 + 0');
    const merchantView = (await orderStatsForMerchant(db, w.ma)).get(w.asha.app)!;
    assert.deepEqual(merchantView.stats, stats, 'the business sees the same numbers');
  } finally {
    await close();
  }
});

test('sales are kept per currency, and counted by when the order was placed (7 and 30 days, all time)', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);
    await recordOrder(db, w.connA, await po({ id: 1, created: ago(2), status: 'completed', lines: ['100.00'], coupons: ['ASHA10'] }));
    await recordOrder(db, w.connA, await po({ id: 2, created: ago(20), status: 'completed', lines: ['200.00'], coupons: ['ASHA10'] }));
    await recordOrder(db, w.connA, await po({ id: 3, created: ago(29), status: 'completed', lines: ['400.00'], coupons: ['ASHA10'] }));
    await recordOrder(db, w.connA, await po({ id: 4, created: ago(29), currency: 'USD', status: 'completed', lines: ['50.00'], coupons: ['ASHA10'] }));
    await db.execute(sql`update affiliate_coupon_periods set active_from = now() - interval '200 days'`);
    await recordOrder(db, w.connA, await po({ id: 5, created: ago(100), status: 'completed', lines: ['800.00'], coupons: ['ASHA10'] }));
    const s = (await ordersForAffiliate(db, w.asha.aff)).get(w.asha.app)!.stats;
    assert.deepEqual(s.orders, { days7: 1, days30: 4, all: 5 });
    const by = Object.fromEntries(s.sales.map((x) => [x.currency, x]));
    assert.deepEqual(by.INR, { currency: 'INR', days30: 70000, all: 150000 });
    assert.deepEqual(by.USD, { currency: 'USD', days30: 5000, all: 5000 });
  } finally {
    await close();
  }
});

// ─── Who can see what, and what is kept ───────────────────────────────────────

test('ISOLATION: an affiliate sees only their own orders; a business only its own', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    await givenCoupon(db, w, 'ravi', 'RAVI10');
    await givenCoupon(db, w, 'kabir', 'KABIR10');
    await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: ['ASHA10'], lines: ['100.00'] }));
    await recordOrder(db, w.connA, await po({ id: 2, created: gmt(5), coupons: ['RAVI10'], lines: ['200.00'] }));
    await recordOrder(db, w.connB, await po({ id: 1, created: gmt(5), coupons: ['KABIR10'], lines: ['300.00'] }));

    const asha = await ordersForAffiliate(db, w.asha.aff);
    assert.deepEqual([...asha.keys()], [w.asha.app]);
    assert.deepEqual(asha.get(w.asha.app)!.recent.map((r) => r.salePaise), [10000]);
    const ravi = (await ordersForAffiliate(db, w.ravi.aff)).get(w.ravi.app)!;
    assert.deepEqual(ravi.recent.map((r) => r.salePaise), [20000]);
    assert.equal(ravi.coupon, 'RAVI10');
    const stranger = await user(db, 'stranger@example.test');
    assert.equal((await ordersForAffiliate(db, stranger)).size, 0);

    const a = await recentOrdersForMerchant(db, w.ma);
    assert.deepEqual(a.map((r) => r.salePaise).sort(), [10000, 20000]);
    assert.ok(a.every((r) => r.displayName !== undefined && ['ASHA10', 'RAVI10'].includes(r.couponCode)));
    const b = await recentOrdersForMerchant(db, w.mb);
    assert.deepEqual(b.map((r) => r.salePaise), [30000]);
    assert.deepEqual([...(await orderStatsForMerchant(db, w.mb)).keys()], [w.kabir.app]);
    assert.equal((await orderStatsForMerchant(db, w.ma)).get(w.kabir.app), undefined);
  } finally {
    await close();
  }
});

test('an order row keeps amounts, a status and dates: no customer name, email, phone or address, anywhere', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: ['ASHA10'] }));
    const cols = rows<{ column_name: string }>(await db.execute(sql`select column_name from information_schema.columns where table_name = 'affiliate_orders'`)).map((r) => r.column_name);
    assert.equal(cols.some((c) => /(^|_)(email|phone|address|billing|customer|ip|first|last)(_|$)|^name$/.test(c)), false, cols.join(', '));
    const text = rows<{ t: string }>(await db.execute(sql`select affiliate_orders::text as t from affiliate_orders`))[0].t;
    for (const pii of ['buyer@example.test', '9000000000', 'Test', 'Buyer', 'Delhi', 'Street']) assert.equal(text.includes(pii), false, pii);
  } finally {
    await close();
  }
});

test('removing a business or an affiliate account removes their coupons and orders', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    await givenCoupon(db, w, 'asha', 'ASHA10');
    await givenCoupon(db, w, 'ravi', 'RAVI10');
    await recordOrder(db, w.connA, await po({ id: 1, created: gmt(5), coupons: ['ASHA10'] }));
    await recordOrder(db, w.connA, await po({ id: 2, created: gmt(5), coupons: ['RAVI10'] }));
    const { eq } = await import('drizzle-orm');
    await db.delete(authUsers).where(eq(authUsers.id, w.asha.aff));
    assert.equal(await count(db, 'affiliate_orders'), 1, 'Asha’s order goes with her account');
    assert.equal(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_coupon_codes where code = 'ASHA10'`))[0].n, 0);
    await db.delete(authUsers).where(eq(authUsers.id, w.oa));
    for (const t of ['affiliate_orders', 'affiliate_coupon_codes', 'affiliate_coupon_periods']) assert.equal(await count(db, t), 0, t);
    assert.ok(await connectionFor(db, w.mb), 'the other business is untouched');
  } finally {
    await close();
  }
});
