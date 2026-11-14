/**
 * GET /api/affiliate/nav — what the sidebar and the Affiliate page need, in one request:
 *   joined:  how many of MY applications are in each status (I'm the affiliate);
 *   created: my own programme (I'm the merchant) with its registration state and applicant counts, or null.
 * Only the signed-in person's own rows: the affiliate side by their user id (db/affiliate-scope.ts), the merchant side
 * through the merchant they own (db/merchant-scope.ts). Nothing is read from the request.
 */

import { fail, json, requireUser } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { affiliateScope } from '@/db/affiliate-scope';
import { getDb } from '@/db/client';
import { merchantForOwner, merchantScope } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const [joined, m] = await Promise.all([affiliateScope(db, user.id).counts(), merchantForOwner(db, user.id)]);
    if (!m) return json({ ok: true, joined, created: null });
    const scope = merchantScope(db, m.id);
    const [counts, status] = await Promise.all([scope.applicationCounts(), scope.programmeStatus()]);
    return json({
      ok: true,
      joined,
      created: { slug: m.slug, name: m.name, registration: status === 'open' ? 'open' : 'closed', counts, suspended: m.status === 'suspended', suspendedReason: m.suspendedReason },
    });
  } catch (e) {
    console.error('[api/affiliate/nav]', formatErrorForLog(e));
    return fail(500, 'server_error', 'Couldn’t load that.');
  }
}
