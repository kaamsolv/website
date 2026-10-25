/**
 * POST /api/invoices/:id/convert — turn a saved quotation into a new invoice
 * (Pro: invoice_quote_mode). Body (optional): { issueDate: "YYYY-MM-DD" }, the
 * visitor's local today. The quotation stays as it was.
 */

import { isoDate } from '@/app/lib/invoice/defaults';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { convertQuote } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  if (!ent.can('invoice_quote_mode')) return fail(403, 'not_allowed', 'Quotations are part of Pro.');
  const { id } = await params;
  const notFound = () => fail(404, 'not_found', 'That quotation isn’t here — it may have been deleted.');
  if (!isUuid(id)) return notFound();

  let issueDate = isoDate(new Date());
  try {
    const body = (await readJson(req, 200)) as { issueDate?: unknown };
    if (typeof body?.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.issueDate)) issueDate = body.issueDate;
  } catch {
    // No body: server's today.
  }
  const made = await convertQuote(db, user.id, id, issueDate, ent.limit('invoice_save'));
  if (!made) return notFound();
  if (!made.ok) return fail(403, 'limit', 'You’ve reached your saved-invoice limit. Delete one to convert this quotation.');
  return json({ ok: true, id: made.id }, 201);
}
