/**
 * PUT /api/invoices/:id/status — kept for older open tabs and for one job: undoing a legacy "marked paid".
 * Body: { status: "unpaid" }.
 *
 * Payment status now follows the payment ledger (see /api/invoices/:id/payments): an invoice becomes Paid by
 * recording the payment, never by flipping a switch, so `"paid"` is refused (409 `record_payment`). An invoice with
 * recorded payments can't be set unpaid either (409 `has_payments`) — void the mistaken payment instead. Only an
 * invoice that was marked paid before payments existed, with nothing on record, goes back to unpaid.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { clearMarkedPaid } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_payments')) {
    return fail(403, 'not_allowed', 'Payments aren’t part of your plan.');
  }
  const { id } = await params;
  let status: unknown;
  try {
    status = ((await readJson(req, 200)) as { status?: unknown })?.status;
  } catch {
    status = null;
  }
  if (status !== 'paid' && status !== 'unpaid') return fail(400, 'invalid', 'Status must be paid or unpaid.');
  if (status === 'paid') {
    return fail(409, 'record_payment', 'Record the payment you received and the invoice is marked paid for you.');
  }
  const notFound = () => fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted.');
  if (!isUuid(id)) return notFound();
  const r = await clearMarkedPaid(db, user.id, id);
  if (r === 'not_found') return notFound();
  if (r === 'not_marked') {
    return fail(409, 'has_payments', 'This invoice’s status follows its payments. To change it, void the payment that was recorded by mistake.');
  }
  return json({ ok: true, status });
}
