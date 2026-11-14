/**
 * GET /api/affiliate/orders — the latest orders credited to affiliates in the signed-in owner's business, newest first.
 * Only their own merchant's (db/affiliate-orders.ts, bound to the merchant id from the session). An order row holds an
 * order number, amounts, a status and dates: no customer details exist to return.
 */

import { fail, json, requireUser } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { recentOrdersForMerchant } from '@/db/affiliate-orders';
import { getDb } from '@/db/client';
import { merchantForOwner } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return fail(404, 'no_merchant', 'Set up your portal first.');
    return json({ ok: true, orders: await recentOrdersForMerchant(db, m.id, 50) });
  } catch (e) {
    console.error('[api/affiliate/orders GET]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load the orders. Try again in a moment.');
  }
}
