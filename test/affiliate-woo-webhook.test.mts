import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { connectStore, rotateStoreSecret, setCoupon } from '../db/affiliate-orders.ts';
import { affiliateScope } from '../db/affiliate-scope.ts';
import { createMerchant, merchantScope } from '../db/merchant-scope.ts';
import { authUsers } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import { ORDER_BODY_MAX, deriveWebhookSecret } from '../app/lib/affiliate/orders.ts';
import { handleWooDelivery } from '../app/lib/affiliate/woo-webhook.ts';
import { rateLimitChecks } from '../app/lib/rate-limit.ts';
import { makeTestDb } from './helpers/test-db.mts';
import { wooDelivery, wooOrder, wooSign } from './helpers/woo-fixtures.mts';

const MASTER = 'test-master-secret-not-real';
const brand = { logo: null, brandColour: '#FE6336', programmeName: '', programmeDescription: '', terms: '' };
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;
const gmt = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString().slice(0, 19);

async function setup(db: Db) {
  const [{ id: owner }] = await db.insert(authUsers).values({ name: 'O', email: 'owner@example.test' }).returning({ id: authUsers.id });
  const [{ id: aff }] = await db.insert(authUsers).values({ name: 'A', email: 'asha@example.test' }).returning({ id: authUsers.id });
  const made = await createMerchant(db, owner, { slug: 'shop', name: 'Shop', brand });
  assert.ok(made.ok);
  const merchantId = (made as { id: string }).id;
  await merchantScope(db, merchantId).setProgrammeStatus('open', owner);
  const applied = await affiliateScope(db, aff).apply('shop', 'hi');
  assert.ok(applied.ok);
  const app = (applied as { id: string }).id;
  assert.equal(await merchantScope(db, merchantId).decide(app, 'approved', owner, ''), true);
  assert.equal(await setCoupon(db, merchantId, app, 'ASHA10', owner), 'ok');
  await db.execute(sql`update affiliate_coupon_periods set active_from = now() - interval '30 days'`);
  const conn = (await connectStore(db, merchantId, owner))!;
  const secret = await deriveWebhookSecret(MASTER, conn.id, 1);
  return { owner, aff, merchantId, app, connId: conn.id, secret };
}

const request = (connId: string, body: string, headers: Record<string, string>) =>
  new Request(`https://kaamsolv.test/api/affiliate/woo/${connId}`, { method: 'POST', headers, body });

const send = (db: Db, connId: string, d: { body: string; headers: Record<string, string> }, master: string | null = MASTER) =>
  handleWooDelivery(db, connId, request(connId, d.body, d.headers), master);

const orderCount = async (db: Db) => Number(rows<{ n: number }>(await db.execute(sql`select count(*)::int as n from affiliate_orders`))[0].n);

test('a signed delivery for an affiliate coupon is recorded; the same delivery again changes nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const d = wooDelivery(w.secret, wooOrder({ id: 501, created: gmt(10), status: 'processing', coupons: ['asha10'] }), 'order.created', 'd1');
    assert.deepEqual(await send(db, w.connId, d), { status: 200, code: 'recorded' });
    assert.deepEqual(await send(db, w.connId, d), { status: 200, code: 'unchanged' }, 'a repeated delivery id');
    assert.equal(await orderCount(db), 1);
    const [row] = rows<{ sale_paise: string; coupon_code: string }>(await db.execute(sql`select sale_paise, coupon_code from affiliate_orders`));
    assert.equal(Number(row.sale_paise), 150000);
    assert.equal(row.coupon_code, 'ASHA10');
  } finally {
    await close();
  }
});

test('the signature decides everything and is checked first: wrong, missing, tampered or reformatted bodies are all 401 and store nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const order = wooOrder({ id: 502, created: gmt(10), coupons: ['ASHA10'] });
    const good = wooDelivery(w.secret, order);

    assert.equal((await send(db, w.connId, wooDelivery('not-the-secret', order))).status, 401, 'wrong secret');
    const missing = { ...good, headers: { ...good.headers } };
    delete missing.headers['x-wc-webhook-signature'];
    assert.equal((await send(db, w.connId, missing)).status, 401, 'no signature');
    assert.equal((await send(db, w.connId, { ...good, body: good.body.replace('502', '503') })).status, 401, 'a changed body');
    const pretty = JSON.stringify(order, null, 2);
    assert.equal((await send(db, w.connId, { body: pretty, headers: good.headers })).status, 401, 'the same JSON, reformatted: the raw bytes are what is signed');
    assert.equal((await send(db, w.connId, { body: 'not json at all', headers: { ...good.headers, 'x-wc-webhook-signature': wooSign('nope', 'not json at all') } })).status, 401, 'a broken body with a bad signature is 401, not 400: nothing was parsed first');
    assert.equal(await orderCount(db), 0);
    assert.deepEqual(await send(db, w.connId, good), { status: 200, code: 'recorded' });
  } finally {
    await close();
  }
});

test('an unknown connection address is a plain 404 and stores nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const d = wooDelivery(w.secret, wooOrder({ id: 503, created: gmt(10), coupons: ['ASHA10'] }));
    assert.deepEqual(await send(db, '11111111-1111-4111-8111-111111111111', d), { status: 404, code: 'not_found' });
    assert.deepEqual(await send(db, 'not-a-uuid', d), { status: 404, code: 'not_found' });
    assert.equal(await orderCount(db), 0);
  } finally {
    await close();
  }
});

test('rotating the secret: the old one stops working at once and the new one works', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    assert.equal(await rotateStoreSecret(db, w.merchantId, w.owner), true);
    const order = wooOrder({ id: 504, created: gmt(10), coupons: ['ASHA10'] });
    assert.equal((await send(db, w.connId, wooDelivery(w.secret, order))).status, 401, 'the old secret');
    const fresh = await deriveWebhookSecret(MASTER, w.connId, 2);
    assert.deepEqual(await send(db, w.connId, wooDelivery(fresh, order)), { status: 200, code: 'recorded' });
  } finally {
    await close();
  }
});

test('without the master secret nothing can be verified, so the answer is a retryable 503 and nothing is processed', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const d = wooDelivery(w.secret, wooOrder({ id: 505, created: gmt(10), coupons: ['ASHA10'] }));
    assert.deepEqual(await send(db, w.connId, d, null), { status: 503, code: 'not_configured' });
    assert.equal(await orderCount(db), 0);
  } finally {
    await close();
  }
});

test('the body is limited: a big Content-Length is refused unread, and an unannounced big body is cut off', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const announced = new Request(`https://kaamsolv.test/api/affiliate/woo/${w.connId}`, { method: 'POST', body: 'x', headers: { 'content-length': String(ORDER_BODY_MAX + 1) } });
    assert.deepEqual(await handleWooDelivery(db, w.connId, announced, MASTER), { status: 413, code: 'too_large' });
    const big = 'x'.repeat(ORDER_BODY_MAX + 10);
    const streamed = new Request(`https://kaamsolv.test/api/affiliate/woo/${w.connId}`, {
      method: 'POST',
      body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }),
      // @ts-expect-error Node's fetch needs this for a streamed request body
      duplex: 'half',
    });
    assert.equal((await handleWooDelivery(db, w.connId, streamed, MASTER)).status, 413);
  } finally {
    await close();
  }
});

test('WooCommerce’s setup ping and topics we don’t use are successes (a failure would count toward switching the webhook off)', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const ping = { body: 'webhook_id=12', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-wc-webhook-signature': wooSign(w.secret, 'webhook_id=12') } };
    assert.deepEqual(await send(db, w.connId, ping), { status: 200, code: 'ping' });
    const unsigned = { body: 'webhook_id=12', headers: { 'content-type': 'application/x-www-form-urlencoded' } };
    assert.equal((await send(db, w.connId, unsigned)).status, 401, 'an unsigned ping is still refused');
    const order = wooOrder({ id: 506, created: gmt(10), coupons: ['ASHA10'] });
    for (const topic of ['coupon.created', 'product.updated', 'customer.created', '']) {
      assert.deepEqual(await send(db, w.connId, wooDelivery(w.secret, order, topic)), { status: 200, code: 'ignored' }, topic);
    }
    assert.equal(await orderCount(db), 0);
  } finally {
    await close();
  }
});

test('a signed but malformed order is a permanent 422 (not a retry), a signed non-JSON body is 400, and neither stores anything', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const broken = { ...wooOrder({ id: 507, created: gmt(10), coupons: ['ASHA10'] }), total: 'lots' };
    assert.deepEqual(await send(db, w.connId, wooDelivery(w.secret, broken)), { status: 422, code: 'bad_order_bad_total' });
    const junk = 'definitely not json';
    assert.deepEqual(await send(db, w.connId, { body: junk, headers: { 'x-wc-webhook-topic': 'order.updated', 'x-wc-webhook-signature': wooSign(w.secret, junk) } }), { status: 400, code: 'bad_json' });
    assert.equal(await orderCount(db), 0);
  } finally {
    await close();
  }
});

test('order.deleted turns a recorded order into a cancelled one (no sales), even though its modified time has not moved', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const order = wooOrder({ id: 508, created: gmt(20), modified: gmt(15), status: 'completed', coupons: ['ASHA10'] });
    await send(db, w.connId, wooDelivery(w.secret, order, 'order.updated'));
    assert.deepEqual(await send(db, w.connId, wooDelivery(w.secret, order, 'order.deleted')), { status: 200, code: 'updated' });
    const [row] = rows<{ status: string }>(await db.execute(sql`select status from affiliate_orders`));
    assert.equal(row.status, 'cancelled');
    // The old "completed" arriving late does not bring it back.
    assert.deepEqual(await send(db, w.connId, wooDelivery(w.secret, order, 'order.updated')), { status: 200, code: 'unchanged' });
  } finally {
    await close();
  }
});

test('only signed deliveries spend the rate limit, and a used-up limit answers 429 with Retry-After seconds', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const order = wooOrder({ id: 509, created: gmt(10), coupons: ['ASHA10'] });
    for (let i = 0; i < 5; i += 1) await send(db, w.connId, wooDelivery('wrong', order));
    assert.equal(rows(await db.execute(sql`select 1 from rate_limits`)).length, 0, 'unsigned traffic costs the business nothing');

    for (const c of rateLimitChecks('woo', 'affiliateWebhook', w.connId)) {
      await db.execute(sql`insert into rate_limits (key, count, reset_at) values (${c.key}, ${c.limit}, now() + interval '1 minute') on conflict (key) do update set count = excluded.count, reset_at = excluded.reset_at`);
    }
    const r = await send(db, w.connId, wooDelivery(w.secret, order));
    assert.equal(r.status, 429);
    assert.equal(r.code, 'rate_limited');
    assert.ok((r.retryAfter ?? 0) > 0 && (r.retryAfter ?? 0) <= 60);
    assert.equal(await orderCount(db), 0);
  } finally {
    await close();
  }
});

test('a database failure while recording is a retryable 500, and nothing about the order, the signature or the secret is logged or returned', async () => {
  const { db, close } = await makeTestDb();
  const logged: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const capture = (...a: unknown[]) => void logged.push(a.map(String).join(' '));
  try {
    const w = await setup(db);
    const d = wooDelivery(w.secret, wooOrder({ id: 510, number: 'WT-SECRET-510', created: gmt(10), coupons: ['ASHA10'] }));
    // The lookup succeeds, the order write is the first thing to fail.
    let calls = 0;
    const flaky = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'execute') {
          return async (q: unknown) => {
            calls += 1;
            if (calls >= 2) throw new Error('connection reset by peer');
            return (target as unknown as { execute: (x: unknown) => Promise<unknown> }).execute(q);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;
    Object.assign(console, { log: capture, error: capture, warn: capture, info: capture });
    const r = await handleWooDelivery(flaky, w.connId, request(w.connId, d.body, d.headers), MASTER);
    Object.assign(console, original);
    assert.deepEqual(r, { status: 500, code: 'server_error' });
    assert.ok(logged.length >= 1, 'the failure is logged');
    const everything = logged.join('\n') + JSON.stringify(r);
    for (const secretish of [d.headers['x-wc-webhook-signature'], w.secret, MASTER, 'WT-SECRET-510', 'buyer@example.test', '9000000000', 'Delhi']) {
      assert.equal(everything.includes(secretish), false, `must not appear in logs or the answer: ${secretish.slice(0, 12)}`);
    }
    // And the retry, once the database is back, records it.
    assert.deepEqual(await send(db, w.connId, d), { status: 200, code: 'recorded' });
  } finally {
    Object.assign(console, original);
    await close();
  }
});

test('even the success path logs nothing about the delivery', async () => {
  const { db, close } = await makeTestDb();
  const logged: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  try {
    const w = await setup(db);
    const d = wooDelivery(w.secret, wooOrder({ id: 511, created: gmt(10), coupons: ['ASHA10'] }));
    const capture = (...a: unknown[]) => void logged.push(a.map(String).join(' '));
    Object.assign(console, { log: capture, error: capture, warn: capture, info: capture });
    await send(db, w.connId, d);
    await send(db, w.connId, wooDelivery('wrong', wooOrder({ id: 512 })));
    Object.assign(console, original);
    assert.deepEqual(logged, []);
  } finally {
    Object.assign(console, original);
    await close();
  }
});

test('the signed-order sender refuses the live site without --allow-production, and refuses to run without a secret or with http', async () => {
  const { spawnSync } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const root = resolve(import.meta.dirname, '..');
  const run = (env: Record<string, string>, ...args: string[]) =>
    spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/affiliate-woo-test.mts', ...args], { cwd: root, env: { ...process.env, NODE_OPTIONS: '', WOO_TEST_SECRET: '', ...env }, encoding: 'utf8', timeout: 60_000 });

  const noSecret = run({}, '--url', 'http://localhost:1/x', '--coupon', 'ASHA10');
  assert.equal(noSecret.status, 1);
  assert.match(noSecret.stderr, /WOO_TEST_SECRET/);

  const live = run({ WOO_TEST_SECRET: 'x' }, '--url', 'https://kaamsolv.com/api/affiliate/woo/11111111-1111-4111-8111-111111111111', '--coupon', 'ASHA10');
  assert.equal(live.status, 1);
  assert.match(live.stderr, /live KaamSolv site/);
  assert.ok(!/x\b.*secret/.test(live.stdout), 'nothing was sent');

  const plain = run({ WOO_TEST_SECRET: 'x' }, '--url', 'http://staging.example.com/api/affiliate/woo/1', '--coupon', 'ASHA10');
  assert.equal(plain.status, 1);
  assert.match(plain.stderr, /https/);
  assert.ok(!(live.stdout + live.stderr + plain.stdout + plain.stderr).includes('WOO_TEST_SECRET=x'), 'the secret is never printed');
});

test('duplicate deliveries are safe whatever their delivery IDs: the same order under two ids, and a retry of an old id, record once', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await setup(db);
    const order = wooOrder({ id: 520, created: gmt(10), status: 'completed', coupons: ['ASHA10'] });
    const d1 = wooDelivery(w.secret, order, 'order.created', 'delivery-1');
    const d2 = wooDelivery(w.secret, order, 'order.updated', 'delivery-2');
    assert.deepEqual(await send(db, w.connId, d1), { status: 200, code: 'recorded' });
    assert.deepEqual(await send(db, w.connId, d2), { status: 200, code: 'unchanged' }, 'the same content under a new delivery id');
    assert.deepEqual(await send(db, w.connId, d1), { status: 200, code: 'unchanged' }, 'WooCommerce retrying the first delivery');
    assert.equal(await orderCount(db), 1);
    const [row] = rows<{ n: string }>(await db.execute(sql`select sale_paise::text as n from affiliate_orders`));
    assert.equal(row.n, '150000');
  } finally {
    await close();
  }
});
