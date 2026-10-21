/**
 * GET    /api/invoices/:id  — one saved invoice (the full document, no logo).
 * PUT    /api/invoices/:id  — replace it. Body: { invoice }.
 * DELETE /api/invoices/:id
 *
 * Always scoped to the signed-in user: someone else's id is a plain 404.
 */

import { MAX_FREE_ITEMS } from '@/app/lib/invoice/limits';
import { cleanInvoice, MAX_ITEMS_ANY_PLAN } from '@/app/lib/invoice/validate';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { deleteInvoice, getInvoice, updateInvoice } from '@/db/invoices';

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
  });
  if (!cleaned.ok) return fail(400, 'invalid', cleaned.message);

  return (await updateInvoice(db, user.id, id, cleaned.invoice)) ? json({ ok: true }) : notFound();
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  return (await deleteInvoice(await getDb(), user.id, id)) ? json({ ok: true }) : notFound();
}
