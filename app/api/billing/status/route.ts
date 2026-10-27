/**
 * GET /api/billing/status — the signed-in account's plans, its last checkouts, and the price list.
 * `configured` is false until the Razorpay keys are set, so the page can say payments aren't on yet.
 */

import { razorpayKeys } from '@/app/lib/billing/razorpay';
import { fail, json, requireUser } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { billingStatus, listPrices } from '@/db/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const [prices, status] = await Promise.all([listPrices(db), billingStatus(db, user.id)]);
    return json({ ok: true, configured: razorpayKeys() !== null, prices, ...status });
  } catch (e) {
    console.error('[api/billing/status]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load your plans. Try again in a moment.');
  }
}
