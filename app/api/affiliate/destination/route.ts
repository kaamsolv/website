/**
 * GET /api/affiliate/destination — the signed-in owner's programme destination: { destination: string } ('' if not set).
 * PUT /api/affiliate/destination — { destination } saves where affiliate links send visitors. Blank clears it.
 *
 * Always the signed-in user's own merchant (db/merchant-scope.ts); no merchant id is read from the request. The
 * address is checked by cleanDestination (https only; no passwords, private networks, KaamSolv or link shorteners).
 */

import { cleanDestination } from '@/app/lib/affiliate/link';
import { SUSPENDED_OWNER_MESSAGE } from '@/app/lib/affiliate/merchant';
import { overLimit } from '@/app/lib/affiliate/server';
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
    return json({ ok: true, destination: await merchantScope(db, m.id).destination() });
  } catch (e) {
    console.error('[api/affiliate/destination GET]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load that. Try again in a moment.');
  }
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req, 4_000)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const clean = cleanDestination(body.destination);
  if (!clean.ok) return fail(400, clean.error, clean.message);
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return noMerchant();
    if (m.status === 'suspended') return fail(403, 'suspended', SUSPENDED_OWNER_MESSAGE);
    const limited = await overLimit(db, [{ action: 'affiliateMerchantEdit', who: user.id }], 'That’s a lot of changes. Try again in a little while.');
    if (limited) return limited;
    await merchantScope(db, m.id).saveDestination(clean.value, user.id);
    return json({ ok: true, destination: clean.value });
  } catch (e) {
    console.error('[api/affiliate/destination PUT]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
