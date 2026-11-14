import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  ORDER_BODY_MAX,
  cleanCouponCode,
  deriveWebhookSecret,
  formatPaise,
  isNewer,
  mapStatus,
  netSalePaise,
  normalizeCoupon,
  orderVersion,
  parseGmt,
  parseOrder,
  parsePaise,
  readBoundedBody,
  signBody,
  verifySignature,
  type OrderStatus,
} from '../app/lib/affiliate/orders.ts';
import { wooOrder, wooSign } from './helpers/woo-fixtures.mts';

const bytes = (s: string) => new TextEncoder().encode(s);

// ─── Signature ────────────────────────────────────────────────────────────────

test('signature: the header WooCommerce would send (independent HMAC, base64) verifies; any change does not', async () => {
  const secret = 'a-secret-for-tests';
  const body = JSON.stringify(wooOrder());
  const header = createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(await verifySignature(secret, bytes(body), header), true);
  assert.equal(await verifySignature(secret, bytes(body), ` ${header} `), true, 'stray spaces around the header are fine');
  assert.equal(await verifySignature(secret, bytes(body + ' '), header), false, 'one extra byte in the body');
  assert.equal(await verifySignature(secret, bytes(body.replace('7001', '7002')), header), false, 'a changed order');
  assert.equal(await verifySignature('another-secret', bytes(body), header), false, 'wrong secret');
  assert.equal(await signBody(secret, body), header, 'our signer matches the independent one');
});

test('signature: a missing, malformed, hex, short or empty header is just false', async () => {
  const secret = 's';
  const body = bytes('{"id":1}');
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  for (const bad of [null, '', '   ', 'not base64!!', hex, 'AAAA', createHmac('sha256', secret).update(body).digest('base64').slice(0, 20)]) {
    assert.equal(await verifySignature(secret, body, bad), false, String(bad));
  }
});

test('signature: it is the RAW bytes that count: reformatting the same JSON breaks it', async () => {
  const secret = 'raw-bytes';
  const compact = '{"id":1,"status":"processing"}';
  const pretty = JSON.stringify(JSON.parse(compact), null, 2);
  const header = wooSign(secret, compact);
  assert.equal(await verifySignature(secret, bytes(compact), header), true);
  assert.equal(await verifySignature(secret, bytes(pretty), header), false);
});

test('the connection secret is derived: stable, and different per master, connection and version', async () => {
  const a = await deriveWebhookSecret('master-1', 'c0000000-0000-4000-8000-000000000001', 1);
  assert.equal(a, await deriveWebhookSecret('master-1', 'c0000000-0000-4000-8000-000000000001', 1));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await deriveWebhookSecret('master-2', 'c0000000-0000-4000-8000-000000000001', 1));
  assert.notEqual(a, await deriveWebhookSecret('master-1', 'c0000000-0000-4000-8000-000000000002', 1));
  assert.notEqual(a, await deriveWebhookSecret('master-1', 'c0000000-0000-4000-8000-000000000001', 2), 'rotating changes it');
});

// ─── Money ────────────────────────────────────────────────────────────────────

test('paise: strings are read as digits, never floats; more than two decimals or any junk is refused, not rounded', () => {
  assert.equal(parsePaise('0'), 0);
  assert.equal(parsePaise('0.00'), 0);
  assert.equal(parsePaise('1499'), 149900);
  assert.equal(parsePaise('1499.5'), 149950);
  assert.equal(parsePaise('1499.05'), 149905);
  assert.equal(parsePaise('0.07'), 7);
  assert.equal(parsePaise('19.99'), 1999, '19.99 * 100 is 1998.9999999999998 as a float');
  assert.equal(parsePaise('-200.00'), -20000);
  assert.equal(parsePaise(' 12.30 '), 1230);
  for (const bad of ['1.234', '1e3', 'abc', '', '.5', '5.', '--1', '1,000.00', '₹5', '9999999999999', 12.5, null, undefined, {}]) {
    assert.equal(parsePaise(bad), null, String(bad));
  }
});

test('sales: counted only when paid, net of refunds, never below zero', () => {
  const cases: [OrderStatus, number, number, number][] = [
    ['completed', 150000, 0, 150000],
    ['processing', 150000, 0, 150000],
    ['completed', 150000, 20000, 130000],
    ['completed', 150000, 150000, 0],
    ['completed', 150000, 999999, 0],
    ['pending', 150000, 0, 0],
    ['cancelled', 150000, 0, 0],
    ['refunded', 150000, 150000, 0],
    ['refunded', 150000, 0, 0],
  ];
  for (const [s, sale, refunded, want] of cases) assert.equal(netSalePaise(s, sale, refunded), want, `${s} ${sale} ${refunded}`);
});

test('formatPaise: Indian grouping for rupees, plain grouping for other currencies', () => {
  assert.equal(formatPaise(0, 'INR'), '₹0');
  assert.equal(formatPaise(99900, 'INR'), '₹999');
  assert.equal(formatPaise(150000, 'INR'), '₹1,500');
  assert.equal(formatPaise(12500000, 'INR'), '₹1,25,000');
  assert.equal(formatPaise(123456789, 'INR'), '₹12,34,567.89');
  assert.equal(formatPaise(125000, 'USD'), 'USD 1,250');
  assert.equal(formatPaise(-20000, 'INR'), '-₹200');
});

// ─── Statuses and coupons ─────────────────────────────────────────────────────

test('statuses: WooCommerce to ours; an unknown or custom status reads as pending (it can only under-report)', () => {
  const want: Record<string, OrderStatus> = {
    pending: 'pending', 'on-hold': 'pending', processing: 'processing', completed: 'completed', cancelled: 'cancelled', failed: 'cancelled',
    trash: 'cancelled', refunded: 'refunded', 'wc-completed': 'completed', 'Completed ': 'completed', 'shipped-by-courier': 'pending', '': 'pending',
  };
  for (const [woo, ours] of Object.entries(want)) assert.equal(mapStatus(woo), ours, woo);
});

test('coupons: matched ignoring case and spaces; a business can only type a sensible code', () => {
  assert.equal(normalizeCoupon('  asha10 '), 'ASHA10');
  assert.deepEqual(cleanCouponCode(' asha10 '), { ok: true, value: 'ASHA10' });
  assert.deepEqual(cleanCouponCode(''), { ok: true, value: '' });
  assert.deepEqual(cleanCouponCode(null), { ok: true, value: '' });
  assert.deepEqual(cleanCouponCode('AB-12_cd'), { ok: true, value: 'AB-12_CD' });
  for (const bad of ['ab', 'has space', 'x'.repeat(33), '-LEADING', 'ÑAME!', '10%OFF', 5, {}]) {
    assert.equal(cleanCouponCode(bad).ok, false, String(bad));
  }
});

// ─── Reading an order ─────────────────────────────────────────────────────────

test('an order: sales are line totals after discounts and before tax and shipping; coupons are normalised and distinct', async () => {
  const r = await parseOrder(wooOrder({ lines: ['1000.00', '500.00'], shipping: '50.00', tax: '270.00', coupons: ['asha10', 'ASHA10', ' welcome '], id: 7777, number: 'WT-7777' }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.order.externalId, '7777');
  assert.equal(r.order.number, 'WT-7777');
  assert.equal(r.order.salePaise, 150000, 'not the 1,820.00 total: tax and shipping are out');
  assert.equal(r.order.refundedPaise, 0);
  assert.deepEqual(r.order.codes, ['ASHA10', 'WELCOME']);
  assert.equal(r.order.status, 'processing');
  assert.equal(r.order.currency, 'INR');
  assert.equal(r.order.placedAt.toISOString(), '2026-11-14T09:30:00.000Z');
  assert.match(r.order.digest, /^[0-9a-f]{64}$/);
});

test('an order: partial and full refunds come from the negative refund totals and are capped at the order total', async () => {
  const partial = await parseOrder(wooOrder({ refunds: ['-200.00'], status: 'completed' }));
  assert.ok(partial.ok && partial.order.refundedPaise === 20000);
  const two = await parseOrder(wooOrder({ refunds: ['-200.00', '-50.50'] }));
  assert.ok(two.ok && two.order.refundedPaise === 25050);
  const over = await parseOrder(wooOrder({ refunds: ['-9999.00'] })); // total is 1,550.00
  assert.ok(over.ok && over.order.refundedPaise === 155000, 'never more than was billed');
  const none = await parseOrder({ ...wooOrder(), refunds: undefined });
  assert.ok(none.ok && none.order.refundedPaise === 0, 'refunds are optional');
});

test('an order: required fields and sane values, or a refusal that names no order data', async () => {
  const good = wooOrder();
  const without = (k: string) => {
    const o = { ...good };
    delete o[k];
    return o;
  };
  for (const [name, payload, reason] of [
    ['not an object', 'x', 'not_an_order'],
    ['an array', [], 'not_an_order'],
    ['no id', without('id'), 'bad_id'],
    ['id zero', { ...good, id: 0 }, 'bad_id'],
    ['id with letters', { ...good, id: '12ab' }, 'bad_id'],
    ['no status', without('status'), 'bad_status'],
    ['no currency', without('currency'), 'bad_currency'],
    ['currency too long', { ...good, currency: 'RUPEES' }, 'bad_currency'],
    ['no date', without('date_created_gmt'), 'bad_date'],
    ['31 February', { ...good, date_created_gmt: '2026-02-31T00:00:00' }, 'bad_date'],
    ['a date with an offset', { ...good, date_created_gmt: '2026-11-14T09:30:00+05:30' }, 'bad_date'],
    ['no total', without('total'), 'bad_total'],
    ['negative total', { ...good, total: '-5.00' }, 'bad_total'],
    ['three decimals', { ...good, total: '10.123' }, 'bad_total'],
    ['no lines', without('line_items'), 'bad_lines'],
    ['a line without a total', { ...good, line_items: [{ id: 1 }] }, 'bad_lines'],
    ['a negative line', { ...good, line_items: [{ total: '-1.00' }] }, 'bad_lines'],
    ['too many lines', { ...good, line_items: Array.from({ length: 501 }, () => ({ total: '1.00' })) }, 'bad_lines'],
    ['no coupon lines', without('coupon_lines'), 'bad_coupons'],
    ['a coupon without a code', { ...good, coupon_lines: [{}] }, 'bad_coupons'],
    ['a refund that is not money', { ...good, refunds: [{ total: 'lots' }] }, 'bad_refunds'],
  ] as const) {
    const r = await parseOrder(payload);
    assert.deepEqual(r, { ok: false, reason }, name);
  }
});

test('an order: a missing modified time falls back to the created time; a deleted order is read as cancelled', async () => {
  const r = await parseOrder(wooOrder({ modified: null }));
  assert.ok(r.ok && r.order.modifiedAt.getTime() === r.order.placedAt.getTime());
  const d = await parseOrder(wooOrder({ status: 'completed' }), 'cancelled');
  assert.ok(d.ok && d.order.status === 'cancelled' && d.order.wooStatus === 'completed');
});

test('parseGmt: UTC to the second, a real calendar date, nothing else', () => {
  assert.equal(parseGmt('2026-11-14T09:30:05')?.toISOString(), '2026-11-14T09:30:05.000Z');
  assert.equal(parseGmt('2026-11-14T09:30:05Z')?.toISOString(), '2026-11-14T09:30:05.000Z');
  assert.equal(parseGmt('2026-11-14T09:30:05.123')?.toISOString(), '2026-11-14T09:30:05.000Z');
  for (const bad of ['2026-11-14', '14/11/2026', '2026-13-01T00:00:00', '2026-02-30T00:00:00', null, 5]) assert.equal(parseGmt(bad), null, String(bad));
});

// ─── Which delivery wins ──────────────────────────────────────────────────────

async function version(over: Parameters<typeof wooOrder>[0]) {
  const r = await parseOrder(wooOrder(over));
  assert.ok(r.ok);
  return orderVersion((r as { order: Parameters<typeof orderVersion>[0] }).order);
}

test('versions: later modified time wins; same second goes to the more final status, then the bigger refund, then the digest; a repeat does not beat itself', async () => {
  const t1 = '2026-11-14T10:00:00';
  const t2 = '2026-11-14T10:00:01';
  const older = await version({ status: 'completed', modified: t1 });
  const newer = await version({ status: 'processing', modified: t2 });
  assert.equal(isNewer(newer, older), true, 'a later time wins even over a more final status');
  assert.equal(isNewer(older, newer), false);

  const processing = await version({ status: 'processing', modified: t1 });
  const completed = await version({ status: 'completed', modified: t1 });
  const refunded = await version({ status: 'refunded', modified: t1, refunds: ['1550.00'] });
  assert.equal(isNewer(completed, processing), true);
  assert.equal(isNewer(refunded, completed), true);

  const part1 = await version({ status: 'completed', modified: t1, refunds: ['100.00'] });
  const part2 = await version({ status: 'completed', modified: t1, refunds: ['300.00'] });
  assert.equal(isNewer(part2, part1), true, 'same second and status: the larger refund wins');

  const a = await version({ status: 'completed', modified: t1, lines: ['1000.00'] });
  const b = await version({ status: 'completed', modified: t1, lines: ['1001.00'] });
  assert.notEqual(a[3], b[3]);
  assert.equal(isNewer(a, b) !== isNewer(b, a), true, 'two different updates never tie: exactly one wins');
  assert.equal(isNewer(a, a), false, 'one delivered twice does not beat itself');
});

test('versions: whatever order the deliveries arrive in, they settle on the same winner', async () => {
  const t = '2026-11-14T10:00:00';
  const all = [
    await version({ status: 'pending', modified: '2026-11-14T09:59:58' }),
    await version({ status: 'processing', modified: '2026-11-14T09:59:59' }),
    await version({ status: 'completed', modified: t }),
    await version({ status: 'completed', modified: t, refunds: ['200.00'] }),
    await version({ status: 'completed', modified: t, refunds: ['200.00'], lines: ['999.00', '500.00'] }),
    await version({ status: 'refunded', modified: t, refunds: ['1550.00'] }),
  ];
  const settle = (order: number[]) => order.map((i) => all[i]).reduce((best, v) => (isNewer(v, best) ? v : best));
  const perms: number[][] = [];
  const permute = (rest: number[], got: number[] = []) => (rest.length === 0 ? perms.push(got) : rest.forEach((r, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...got, r])));
  permute([0, 1, 2, 3, 4, 5]);
  const winners = new Set(perms.map((p) => JSON.stringify(settle(p))));
  assert.equal(winners.size, 1, `${perms.length} orderings, ${winners.size} winners`);
  assert.equal(settle([0, 1, 2, 3, 4, 5])[1], 5, 'the refunded one is the most final');
});

// ─── Reading the body, bounded ────────────────────────────────────────────────

test('the body: refused from a big Content-Length without reading it, and cut off while reading when there is no header', async () => {
  const small = new Request('https://x.test/', { method: 'POST', body: '{"id":1}' });
  assert.equal(new TextDecoder().decode((await readBoundedBody(small)) ?? new Uint8Array()), '{"id":1}');

  const declared = new Request('https://x.test/', { method: 'POST', body: 'x', headers: { 'content-length': String(ORDER_BODY_MAX + 1) } });
  assert.equal(await readBoundedBody(declared), null);

  const streamed = new Request('https://x.test/', {
    method: 'POST',
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(200));
        c.enqueue(new Uint8Array(200));
        c.close();
      },
    }),
    // @ts-expect-error Node's fetch needs this for a streamed request body
    duplex: 'half',
  });
  assert.equal(await readBoundedBody(streamed, 300), null, 'cut off at the limit');

  const empty = new Request('https://x.test/', { method: 'POST' });
  assert.equal((await readBoundedBody(empty))?.length, 0);
});
