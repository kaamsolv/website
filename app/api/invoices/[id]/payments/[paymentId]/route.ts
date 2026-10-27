/**
 * PATCH /api/invoices/:id/payments/:paymentId — change a recorded payment's reference and note. Nothing else
 * about a payment can change (amount, date and method are fixed; a mistake is voided and recorded again).
 * Body: { reference, note }.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { cleanPaymentEdit } from '@/app/lib/invoice/payments';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { editPayment, getInvoicePayments } from '@/db/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_payments')) return fail(403, 'not_allowed', 'Payments aren’t part of your plan.');
  const { id, paymentId } = await params;
  const notFound = () => fail(404, 'not_found', 'That payment isn’t here — it may have been deleted with its invoice.');
  if (!isUuid(id) || !isUuid(paymentId)) return notFound();

  let body: unknown;
  try {
    body = await readJson(req, 2_000);
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const cleaned = cleanPaymentEdit(body);
  if (!cleaned.ok) return fail(400, 'invalid', cleaned.message);

  const r = await editPayment(db, user.id, id, paymentId, { reference: cleaned.reference, note: cleaned.note });
  if (!r.ok) return r.reason === 'voided' ? fail(409, 'voided', 'That payment was voided, so it can’t be changed.') : notFound();
  return json({ ok: true, ...(await getInvoicePayments(db, user.id, id)) });
}
