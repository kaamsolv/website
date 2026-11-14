/**
 * GET /api/affiliate/programme — the signed-in owner's programme door: { status: 'open' | 'closed' | null, pending }.
 * PUT /api/affiliate/programme — { status: 'open' | 'closed' } opens or closes registration.
 * Always the signed-in user's own merchant (db/merchant-scope.ts); nothing here reads a merchant id from the request.
 */

import { PROGRAMME_STATUSES, type ProgrammeStatus } from '@/app/lib/affiliate/application';
import { NOT_ALLOWED_MESSAGE, SUSPENDED_OWNER_MESSAGE } from '@/app/lib/affiliate/merchant';
import { canRunProgramme, overLimit } from '@/app/lib/affiliate/server';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { merchantForOwner, merchantScope } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noMerchant = () => fail(404, 'no_merchant', 'Set up your portal first.');

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return noMerchant();
    const scope = merchantScope(db, m.id);
    const [status, pending] = await Promise.all([scope.programmeStatus(), scope.pendingCount()]);
    return json({ ok: true, status, pending, slug: m.slug, suspended: m.status === 'suspended', suspendedReason: m.suspendedReason });
  } catch (e) {
    console.error('[api/affiliate/programme GET]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load that. Try again in a moment.');
  }
}

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
  if (!(PROGRAMME_STATUSES as readonly unknown[]).includes(body.status)) return fail(400, 'bad_status', 'Choose open or closed.');
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return noMerchant();
    if (body.status === 'open') {
      if (m.status === 'suspended') return fail(403, 'suspended', SUSPENDED_OWNER_MESSAGE);
      if (!(await canRunProgramme(db, user.id))) return fail(403, 'not_allowed', NOT_ALLOWED_MESSAGE);
    }
    const limited = await overLimit(db, [{ action: 'affiliateMerchantEdit', who: user.id }], 'That’s a lot of changes. Try again in a little while.');
    if (limited) return limited;
    await merchantScope(db, m.id).setProgrammeStatus(body.status as ProgrammeStatus, user.id);
    return json({ ok: true, status: body.status });
  } catch (e) {
    console.error('[api/affiliate/programme PUT]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
