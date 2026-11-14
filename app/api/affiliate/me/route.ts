/**
 * GET /api/affiliate/me — the signed-in person's own affiliate profile, applications and memberships.
 * Only rows where they are the affiliate (db/affiliate-scope.ts); a merchant's name and portal address are the only
 * merchant details returned.
 */

import { fail, json, requireUser } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { ensureLinks, linksForAffiliate } from '@/db/affiliate-links';
import { affiliateScope } from '@/db/affiliate-scope';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const me = affiliateScope(db, user.id);
    // Each approved membership gets its link the first time its owner looks; then read the lot.
    await ensureLinks(db, user.id);
    const [profile, applications, links] = await Promise.all([me.profile(), me.list(), linksForAffiliate(db, user.id)]);
    const byApplication = new Map(links.map((l) => [l.applicationId, l]));
    return json({ ok: true, profile, applications: applications.map((a) => ({ ...a, link: byApplication.get(a.id) ?? null })) });
  } catch (e) {
    console.error('[api/affiliate/me]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load your programmes. Try again in a moment.');
  }
}
