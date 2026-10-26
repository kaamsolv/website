/**
 * GET /api/customers/:id/unlinked — invoices and quotations that were typed in with exactly this customer's name
 * (any case) but are not connected to them. A list to review; it connects nothing (POST …/links does, for the
 * ones the owner ticks). Up to 50, with `capped` when there are more.
 */

import { customerAccess, customerNotFound } from '@/app/lib/customer-routes';
import { json } from '@/app/lib/api-response';
import { findUnlinkedByName } from '@/db/customer-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await customerAccess(req, id);
  if (a instanceof Response) return a;
  const found = await findUnlinkedByName(a.db, a.user.id, id);
  return found ? json({ ok: true, customerGstin: found.customer.gstin, candidates: found.candidates, capped: found.capped }) : customerNotFound();
}
