/**
 * PUT /api/affiliate/coupon — { applicationId, code } gives an approved affiliate of the signed-in owner's business the
 * WooCommerce coupon code that credits them. A blank code takes it off. A code belongs to the first affiliate it is given
 * to, for good: it can be taken off and put back, never given to someone else (so a late order isn't credited wrongly).
 */

import { cleanCouponCode } from '@/app/lib/affiliate/orders';
import { SUSPENDED_OWNER_MESSAGE } from '@/app/lib/affiliate/merchant';
import { overLimit } from '@/app/lib/affiliate/server';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { setCoupon } from '@/db/affiliate-orders';
import { getDb } from '@/db/client';
import { merchantForOwner } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req, 2_000)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  if (typeof body.applicationId !== 'string' || !UUID.test(body.applicationId)) return fail(400, 'bad_request', 'That couldn’t be read.');
  const clean = cleanCouponCode(body.code);
  if (!clean.ok) return fail(400, clean.error, clean.message);
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return fail(404, 'no_merchant', 'Set up your portal first.');
    if (m.status === 'suspended') return fail(403, 'suspended', SUSPENDED_OWNER_MESSAGE);
    const limited = await overLimit(db, [{ action: 'affiliateMerchantEdit', who: user.id }], 'That’s a lot of changes. Try again in a little while.');
    if (limited) return limited;
    const result = await setCoupon(db, m.id, body.applicationId, clean.value, user.id);
    if (result === 'not_member') return fail(404, 'not_member', 'Only an approved affiliate of yours can have a code.');
    if (result === 'taken') return fail(409, 'coupon_taken', 'That code belongs to another affiliate, now or before. Use a new code.');
    return json({ ok: true, code: clean.value });
  } catch (e) {
    console.error('[api/affiliate/coupon PUT]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
