/**
 * GET  /api/invoices/:id/payments — the invoice's payment summary and its whole ledger (voided entries included).
 * POST /api/invoices/:id/payments — record a payment. Body: { amount, paidOn: "YYYY-MM-DD", method, reference?,
 *      note?, clientKey (one uuid per form, so a repeat can't record twice), today: "YYYY-MM-DD" (the visitor's
 *      calendar date), reconcile? (true to replace a legacy "marked paid" with real entries) }.
 *
 * Every account may record and view payments (`invoice_payments`). The amount is checked against the invoice
 * total *in the database*, under the invoice row's lock — never against anything the browser sends.
 * 201 recorded · 200 the same payment was already recorded (a retry) · 409 `exceeds` / `legacy_paid` / `cap` / `key_reused`.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { formatMoney } from '@/app/lib/invoice/money';
import { cleanPaymentInput } from '@/app/lib/invoice/payments';
import { clientTodayOk } from '@/app/lib/invoice/recurring';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { getInvoicePayments, recordPayment } from '@/db/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted.');

export async function GET(req: Request, { params }: Ctx) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_payments')) return fail(403, 'not_allowed', 'Payments aren’t part of your plan.');
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const found = await getInvoicePayments(db, user.id, id);
  return found ? json({ ok: true, ...found }) : notFound();
}

export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_payments')) return fail(403, 'not_allowed', 'Recording payments isn’t part of your plan.');
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  let body: unknown;
  try {
    body = await readJson(req, 4_000);
  } catch {
    return fail(400, 'bad_request', 'That payment couldn’t be read.');
  }
  const today = (body as { today?: unknown } | null)?.today;
  if (!clientTodayOk(today)) return fail(400, 'invalid', 'Your device’s date looks off. Check your clock and try again.');
  const cleaned = cleanPaymentInput(body, today);
  if (!cleaned.ok) return fail(400, 'invalid', cleaned.message);

  const result = await recordPayment(db, user.id, id, cleaned.value);
  if (!result.ok) {
    switch (result.reason) {
      case 'not_found':
        return notFound();
      case 'legacy':
        return fail(409, 'legacy_paid', 'This invoice was marked paid before payments were recorded. Confirm to replace that with the payments you actually received.');
      case 'exceeds': {
        const cur = (await getInvoicePayments(db, user.id, id))?.invoice.currency as CurrencyCode | undefined;
        const owed = cur ? formatMoney(result.outstanding ?? 0, cur) : String(result.outstanding ?? 0);
        return fail(409, 'exceeds', (result.outstanding ?? 0) > 0 ? `That’s more than is owed — only ${owed} is outstanding on this invoice.` : 'This invoice is already paid in full.');
      }
      case 'date':
        return fail(400, 'invalid', 'The date received can’t be in the future.');
      case 'cap':
        return fail(409, 'cap', 'An invoice can hold up to 200 payment entries. Void a mistaken one instead of adding more.');
      case 'currency':
        return fail(409, 'currency', 'That payment doesn’t match the invoice’s currency.');
      case 'key_reused':
        return fail(409, 'key_reused', 'That form was already used for a different payment. Refresh the page and try again.');
    }
  }
  const detail = await getInvoicePayments(db, user.id, id);
  return json({ ok: true, duplicate: result.duplicate, payment: result.payment, ...detail }, result.duplicate ? 200 : 201);
}
