/**
 * GET /api/affiliate/me — the signed-in person's own affiliate profile, applications and memberships.
 * Only rows where they are the affiliate (db/affiliate-scope.ts); a merchant's name and portal address are the only
 * merchant details returned.
 */

import { fail, json, requireUser } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { affiliateScope } from '@/db/affiliate-scope';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const me = affiliateScope(await getDb(), user.id);
    const [profile, applications] = await Promise.all([me.profile(), me.list()]);
    return json({ ok: true, profile, applications });
  } catch (e) {
    console.error('[api/affiliate/me]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load your programmes. Try again in a moment.');
  }
}
