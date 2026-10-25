/**
 * PUT /api/invoices/:id/recurring — set how a saved invoice repeats (Pro:
 * invoice_recurring). Body: { every: "week"|"month"|"quarter"|"year", next:
 * "YYYY-MM-DD" } to set it, or { every: null } to stop. A reminder only —
 * nothing is created until the user presses Create (/recur).
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { isIsoDate, isRecurEvery } from '@/app/lib/invoice/recurring';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { setRecurring } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_recurring')) {
    return fail(403, 'not_allowed', 'Repeating invoices is part of Pro.');
  }
  const { id } = await params;
  const notFound = () => fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted, or it’s a quotation.');
  if (!isUuid(id)) return notFound();

  let body: { every?: unknown; next?: unknown };
  try {
    body = (await readJson(req, 500)) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  if (body?.every === null) return (await setRecurring(db, user.id, id, null)) ? json({ ok: true }) : notFound();
  if (!isRecurEvery(body?.every)) return fail(400, 'invalid', 'Pick how often it repeats.');
  if (!isIsoDate(body?.next)) return fail(400, 'invalid', 'Pick the date of the next one.');
  return (await setRecurring(db, user.id, id, { every: body.every, next: body.next })) ? json({ ok: true }) : notFound();
}
