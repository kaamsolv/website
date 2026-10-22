/**
 * GET /api/dashboard?today=YYYY-MM-DD — Pro dashboard (`invoice_dashboard`):
 * per currency, billed this month, unpaid and overdue, plus recent invoices.
 * `today` is the visitor's calendar date (falls back to the server's).
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { isoDate } from '@/app/lib/invoice/defaults';
import { fail, json, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { getDashboard } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_dashboard')) {
    return fail(403, 'not_allowed', 'The dashboard is part of Pro.');
  }
  const asked = new URL(req.url).searchParams.get('today') ?? '';
  const today = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : isoDate(new Date());
  return json({ ok: true, today, ...(await getDashboard(db, user.id, today, `${today.slice(0, 7)}-01`)) });
}
