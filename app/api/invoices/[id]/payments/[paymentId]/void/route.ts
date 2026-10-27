/**
 * POST /api/invoices/:id/payments/:paymentId/void — take a mistaken payment out of the totals. The entry stays in
 * the history, marked voided with the reason; the invoice gets the amount back. Body: { reason? }. Repeating it is harmless.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { cleanVoidReason } from '@/app/lib/invoice/payments';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { getInvoicePayments, voidPayment } from '@/db/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_payments')) return fail(403, 'not_allowed', 'Payments aren’t part of your plan.');
  const { id, paymentId } = await params;
  const notFound = () => fail(404, 'not_found', 'That payment isn’t here — it may have been deleted with its invoice.');
  if (!isUuid(id) || !isUuid(paymentId)) return notFound();

  let body: unknown = {};
  try {
    body = await readJson(req, 1_000);
  } catch {
    body = {};
  }
  const cleaned = cleanVoidReason(body);
  if (!cleaned.ok) return fail(400, 'invalid', cleaned.message);

  const r = await voidPayment(db, user.id, id, paymentId, cleaned.reason);
  if (!r.ok) return notFound();
  return json({ ok: true, alreadyVoided: r.alreadyVoided, ...(await getInvoicePayments(db, user.id, id)) });
}
