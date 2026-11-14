/**
 * DELETE /api/affiliate/me/applications/{id} — withdraw one of the signed-in person's own pending applications.
 * Anyone else's id, or one already decided, is a plain 404 and changes nothing.
 */

import { fail, isUuid, json, requireUser, sameOrigin } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { affiliateScope } from '@/db/affiliate-scope';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail(404, 'not_found', 'We couldn’t find that application.');
  try {
    const done = await affiliateScope(await getDb(), user.id).withdraw(id);
    return done ? json({ ok: true }) : fail(404, 'not_found', 'We couldn’t find a pending application like that.');
  } catch (e) {
    console.error('[api/affiliate/me/applications DELETE]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t do that. Try again in a moment.');
  }
}
