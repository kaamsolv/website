/**
 * GET    /api/invoices/:id  — one saved invoice (the full document, no logo).
 * PUT    /api/invoices/:id  — replace it. Body: { invoice }.
 * DELETE /api/invoices/:id  — also removes the invoice's recorded payments.
 *
 * A save is refused (409) when it would leave an invoice with payments in another currency or with a total
 * below what was received.
 *
 * Always scoped to the signed-in user: someone else's id is a plain 404.
 */

import { MAX_FREE_ITEMS } from '@/app/lib/invoice/limits';
import { cleanInvoice, MAX_ITEMS_ANY_PLAN } from '@/app/lib/invoice/validate';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { formatMoney } from '@/app/lib/invoice/money';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { deleteInvoice, getInvoice, InvoiceLockedError, SalesInvoiceError, updateInvoice } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted.');

export async function GET(req: Request, { params }: Ctx) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const found = await getInvoice(await getDb(), user.id, id);
  return found ? json({ ok: true, ...found }) : notFound();
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  if (ent.limit('invoice_save') === 0) return fail(403, 'not_allowed', 'Saving isn’t part of your plan.');

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return fail(400, 'bad_request', 'That invoice couldn’t be read.');
  }
  const cleaned = cleanInvoice((body as { invoice?: unknown })?.invoice, {
    maxItems: ent.can('invoice_unlimited_items') ? MAX_ITEMS_ANY_PLAN : MAX_FREE_ITEMS,
    allowQuote: ent.can('invoice_quote_mode'),
    allowDesign: ent.can('invoice_templates') || ent.can('invoice_brand_color'),
  });
  if (!cleaned.ok) return fail(400, 'invalid', cleaned.message);

  try {
    return (await updateInvoice(db, user.id, id, cleaned.invoice)) ? json({ ok: true }) : notFound();
  } catch (e) {
    if (!(e instanceof InvoiceLockedError)) throw e;
    const received = formatMoney(e.amountPaid, e.currency as CurrencyCode);
    return e.code === 'has_payments'
      ? fail(409, 'has_payments', `${received} has been received on this invoice, so its currency and type can’t change.`)
      : fail(409, 'below_paid', `${received} has been received on this invoice, so its total can’t go below that. If a payment was recorded by mistake, void it on the payments page first.`);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  try {
    return (await deleteInvoice(await getDb(), user.id, id)) ? json({ ok: true }) : notFound();
  } catch (e) {
    if (e instanceof SalesInvoiceError) return fail(409, 'sales_invoice', 'This is one of KaamSolv’s own sales invoices, so it can’t be deleted.');
    throw e;
  }
}
