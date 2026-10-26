/**
 * GET /api/customers/:id/summary?today=YYYY-MM-DD — one saved customer's money, per currency: invoiced, received,
 * outstanding, overdue (all time), from the invoices connected to them — never matched by name. `today` is the
 * visitor's calendar date (required; same rule as the collections page). Any account with saved customers.
 */

import { clientTodayOk } from '@/app/lib/invoice/recurring';
import { customerAccess, customerNotFound } from '@/app/lib/customer-routes';
import { fail, json } from '@/app/lib/api-response';
import { getCustomerSummary } from '@/db/customer-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await customerAccess(req, id);
  if (a instanceof Response) return a;
  const today = new URL(req.url).searchParams.get('today');
  if (!clientTodayOk(today)) return fail(400, 'invalid', 'Your device’s date looks off. Check your clock and try again.');
  const summary = await getCustomerSummary(a.db, a.user.id, id, today);
  return summary ? json({ ok: true, ...summary }) : customerNotFound();
}
