/**
 * GET /api/affiliate/applications?status=pending|approved|rejected|withdrawn — the signed-in owner's applicants.
 * Always their own merchant's (db/merchant-scope.ts). Each row carries the applicant's name, website, message and
 * email: the form tells applicants that applying shares them with the merchant.
 */

import { APPLICATION_STATUSES, type ApplicationStatus } from '@/app/lib/affiliate/application';
import { fail, json, requireUser } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { NO_ORDER_STATS, orderStatsForMerchant } from '@/db/affiliate-orders';
import { getDb } from '@/db/client';
import { merchantForOwner, merchantScope } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const raw = new URL(req.url).searchParams.get('status');
  if (raw !== null && !(APPLICATION_STATUSES as readonly string[]).includes(raw)) return fail(400, 'bad_status', 'Unknown status.');
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return fail(404, 'no_merchant', 'Set up your portal first.');
    const scope = merchantScope(db, m.id);
    const [applications, counts, orders] = await Promise.all([scope.listApplications((raw as ApplicationStatus | null) ?? undefined), scope.applicationCounts(), orderStatsForMerchant(db, m.id)]);
    return json({ ok: true, applications: applications.map((a) => ({ ...a, coupon: orders.get(a.id)?.coupon ?? '', orders: orders.get(a.id)?.stats ?? NO_ORDER_STATS })), counts });
  } catch (e) {
    console.error('[api/affiliate/applications GET]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load the applications. Try again in a moment.');
  }
}
