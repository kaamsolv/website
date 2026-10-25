/**
 * POST /api/invoices/:id/recur — "Due to repeat": Create the next invoice, or
 * Skip this one (Pro: invoice_recurring). Body: { action: "create"|"skip",
 * today: "YYYY-MM-DD" } — the visitor's local calendar date, accepted when it
 * is within a day of the server's UTC date (app/lib/invoice/recurring.ts).
 * 409 `not_due` if it was already handled (a second tab, a double click).
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { clientTodayOk } from '@/app/lib/invoice/recurring';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { recurInvoice } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  if (!ent.can('invoice_recurring')) return fail(403, 'not_allowed', 'Repeating invoices is part of Pro.');
  const { id } = await params;
  const notFound = () => fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted.');
  if (!isUuid(id)) return notFound();

  let body: { action?: unknown; today?: unknown };
  try {
    body = (await readJson(req, 500)) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  if (body?.action !== 'create' && body?.action !== 'skip') return fail(400, 'invalid', 'Choose Create or Skip.');
  if (!clientTodayOk(body?.today)) return fail(400, 'invalid', 'Your device’s date looks off. Check your clock and try again.');

  const r = await recurInvoice(db, user.id, id, body.action, body.today, ent.limit('invoice_save'));
  if (!r.ok) {
    if (r.reason === 'limit') return fail(403, 'limit', 'You’ve reached your saved-invoice limit. Delete one to make the next invoice.');
    if (r.reason === 'not_due') return fail(409, 'not_due', 'That one’s already been taken care of.');
    return notFound();
  }
  return json({ ok: true, id: r.id, next: r.next }, r.id ? 201 : 200);
}
