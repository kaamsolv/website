/**
 * Sends one SYNTHETIC, signed WooCommerce order to a KaamSolv webhook address, the way WooCommerce would. For trying the
 * store connection without a store: local dev, staging, the OpenNext preview. It contains no customer data.
 *
 *   WOO_TEST_SECRET=<the secret shown on the Store connection card> \
 *     npm run affiliate:woo-test -- --url <webhook address> --coupon ASHA10 [--id 9001] [--status completed] [--refund 200.00] [--lines 1000.00,500.00] [--topic order.updated]
 *
 * Safety:
 *   • the secret comes from the environment (WOO_TEST_SECRET), never from an argument, so it is not left in shell history;
 *   • an address on kaamsolv.com is refused unless you also pass --allow-production, so a real programme is never sent
 *     made-up orders by accident;
 *   • only the status and the short answer code are printed: not the secret, the signature or the body.
 *
 * Run with Node's native TypeScript support:  node scripts/affiliate-woo-test.mts
 */

import { signBody } from '../app/lib/affiliate/orders.ts';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const refuse = (message: string): never => {
  console.error(`Refusing: ${message}`);
  process.exit(1);
};

const url = arg('--url');
const coupon = arg('--coupon');
const secret = process.env.WOO_TEST_SECRET?.trim();
if (!url) refuse('pass --url <the webhook address from the Store connection card>.');
if (!coupon) refuse('pass --coupon <the affiliate’s code>.');
if (!secret) refuse('set WOO_TEST_SECRET in this command’s environment to the secret on the Store connection card.');

let target: URL;
try {
  target = new URL(url!);
} catch {
  refuse('that address could not be read.');
  process.exit(1);
}
const host = target!.hostname.toLowerCase();
const isProduction = host === 'kaamsolv.com' || host.endsWith('.kaamsolv.com');
if (isProduction && !args.includes('--allow-production')) refuse('that is the live KaamSolv site. Add --allow-production only if you really mean to send a made-up order to a real programme.');
if (target!.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(host)) refuse('use an https address (http is only for your own computer).');

const id = Number(arg('--id') ?? Date.now() % 1_000_000_000);
const created = new Date(Date.now() + 5000).toISOString().slice(0, 19);
const lines = (arg('--lines') ?? '1000.00,500.00').split(',').map((t) => t.trim());
const refund = arg('--refund');
const status = arg('--status') ?? 'processing';
const order = {
  id,
  number: `TEST-${id}`,
  status,
  currency: 'INR',
  date_created_gmt: created,
  date_modified_gmt: arg('--modified') ?? created,
  total: lines.reduce((s, t) => s + Math.round(Number(t) * 100), 0) / 100 + '',
  line_items: lines.map((t) => ({ total: t })),
  coupon_lines: [{ code: coupon!.toLowerCase() }],
  refunds: refund ? [{ total: `-${refund.replace(/^-/, '')}` }] : [],
};
const body = JSON.stringify(order);
const res = await fetch(target!, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-wc-webhook-topic': arg('--topic') ?? 'order.created', 'x-wc-webhook-signature': await signBody(secret!, body) },
  body,
});
const answer = (await res.json().catch(() => ({}))) as { code?: string };
console.log(`${res.status} ${answer.code ?? ''}`.trim());
process.exitCode = res.status < 300 ? 0 : 1;
