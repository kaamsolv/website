/**
 * POST /api/billing/checkout { planKey, period } — start paying for a plan.
 *
 * Signed-in, same-site only. The price comes from the `plan_prices` table, never from the request. This
 * only creates a Razorpay order and a "created" row; the plan switches on when the webhook says it was
 * paid (app/api/billing/webhook), not when this returns and not when the browser says "success".
 */

import { isBillingPeriod } from '@/app/lib/billing/plans';
import { createRazorpayOrder, razorpayKeys } from '@/app/lib/billing/razorpay';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { formatErrorForLog } from '@/app/lib/log-error';
import { retryAfterSeconds } from '@/app/lib/rate-limit';
import { getDb } from '@/db/client';
import { abandonPending, attachOrder, createPendingPayment, priceFor } from '@/db/billing';
import { consumeRateLimits } from '@/db/rate-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const keys = razorpayKeys();
  if (!keys) return fail(503, 'billing_unavailable', 'Payments aren’t switched on yet.');

  let body: { planKey?: unknown; period?: unknown };
  try {
    body = (await readJson(req, 2_000)) as typeof body;
  } catch {
    return fail(400, 'invalid', 'Choose a plan and try again.');
  }
  if (typeof body.planKey !== 'string' || !isBillingPeriod(body.period)) return fail(400, 'invalid', 'Choose a plan and try again.');

  let paymentId: string | null = null;
  try {
    const db = await getDb();
    const who = await hashIp(user.id, resolveIpHashSalt());
    const rate = await consumeRateLimits(db, [
      { key: `billing:checkout:1m:${who}`, limit: 5, windowSeconds: 60 },
      { key: `billing:checkout:1h:${who}`, limit: 20, windowSeconds: 3600 },
    ]);
    if (!rate.allowed) {
      return Response.json(
        { ok: false, error: 'rate_limited', message: 'Too many tries. Give it a minute and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rate.resetAt)), 'Cache-Control': 'no-store' } },
      );
    }

    const price = await priceFor(db, body.planKey, body.period);
    if (!price) return fail(400, 'unknown_plan', 'That plan isn’t available.');

    paymentId = await createPendingPayment(db, user.id, price);
    const order = await createRazorpayOrder(keys, {
      amountPaise: price.amountPaise,
      currency: price.currency,
      receipt: paymentId,
      notes: { plan: price.planKey, period: price.period },
    });
    await attachOrder(db, paymentId, order.id);
    return json({
      ok: true,
      keyId: keys.keyId,
      orderId: order.id,
      amountPaise: price.amountPaise,
      currency: price.currency,
      description: `${price.name} — ${price.period === 'year' ? 'one year' : 'one month'}`,
      email: user.email,
    });
  } catch (e) {
    console.error('[api/billing/checkout]', formatErrorForLog(e));
    if (paymentId) {
      try {
        await abandonPending(await getDb(), paymentId);
      } catch {
        // The row stays "created" with no order: harmless, nothing can pay it.
      }
    }
    return fail(502, 'checkout_failed', 'We couldn’t start the payment. Nothing was charged. Try again in a moment.');
  }
}
