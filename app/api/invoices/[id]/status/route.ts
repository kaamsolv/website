/**
 * PUT /api/invoices/:id/status — mark an invoice paid or unpaid (Pro:
 * `invoice_dashboard`). Body: { status: "paid" | "unpaid" }.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { setInvoiceStatus } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_dashboard')) {
    return fail(403, 'not_allowed', 'Paid / unpaid tracking is part of Pro.');
  }
  const { id } = await params;
  let status: unknown;
  try {
    status = ((await readJson(req, 200)) as { status?: unknown })?.status;
  } catch {
    status = null;
  }
  if (status !== 'paid' && status !== 'unpaid') return fail(400, 'invalid', 'Status must be paid or unpaid.');
  if (!isUuid(id) || !(await setInvoiceStatus(db, user.id, id, status))) {
    return fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted.');
  }
  return json({ ok: true, status });
}
