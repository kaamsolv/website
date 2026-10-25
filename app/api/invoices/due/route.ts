/**
 * GET /api/invoices/due?today=YYYY-MM-DD — invoices whose "repeat" reminder is
 * due (Pro: invoice_recurring). `today` is the visitor's local date.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { clientTodayOk } from '@/app/lib/invoice/recurring';
import { fail, json, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { listDueToRecur } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_recurring')) {
    return fail(403, 'not_allowed', 'Repeating invoices is part of Pro.');
  }
  const today = new URL(req.url).searchParams.get('today');
  if (!clientTodayOk(today)) return fail(400, 'invalid', 'Your device’s date looks off. Check your clock and try again.');
  return json({ ok: true, due: await listDueToRecur(db, user.id, today) });
}
