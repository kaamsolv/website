/**
 * POST /api/affiliate/applications/{id} — { decision, note? } where decision is:
 *   'approved' | 'rejected'      decide one PENDING application (the note is the reason the applicant sees);
 *   'suspended' | 'reinstated'   pause or restore an APPROVED affiliate (the note is the reason shown to them).
 * Always the signed-in owner's own merchant; any other id, or one in the wrong state, is a plain 404 and changes nothing.
 */

import { after } from 'next/server';
import { cleanNote } from '@/app/lib/affiliate/application';
import { overLimit } from '@/app/lib/affiliate/server';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { DRAIN_AFTER_REQUEST, drainOutbox } from '@/app/lib/billing/jobs';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { merchantForOwner, merchantScope } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req, 5_000)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const decision = body.decision;
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'suspended' && decision !== 'reinstated') {
    return fail(400, 'bad_decision', 'Choose approve, don’t approve, suspend or reinstate.');
  }
  const note = cleanNote(body.note);
  if (note === null) return fail(400, 'note_long', 'Keep the note under 300 characters.');
  if (!isUuid(id)) return fail(404, 'not_found', 'We couldn’t find that application.');
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return fail(404, 'not_found', 'We couldn’t find that application.');
    const limited = await overLimit(db, [{ action: 'affiliateDecide', who: user.id }], 'That’s a lot of decisions. Try again in a little while.');
    if (limited) return limited;
    const scope = merchantScope(db, m.id);
    const done =
      decision === 'suspended' || decision === 'reinstated'
        ? await scope.setMembership(id, decision === 'suspended' ? 'suspended' : 'active', user.id, note)
        : await scope.decide(id, decision, user.id, note);
    if (!done) return fail(404, 'not_found', 'We couldn’t find an application like that in that state. It may already have changed.');
    // The approved / not approved email was queued with the decision; send it now rather than at the next schedule.
    if (decision === 'approved' || decision === 'rejected') after(() => drainOutbox(DRAIN_AFTER_REQUEST).catch((e) => console.error('[api/affiliate/applications drain]', formatErrorForLog(e))));
    return json({ ok: true });
  } catch (e) {
    console.error('[api/affiliate/applications POST]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
