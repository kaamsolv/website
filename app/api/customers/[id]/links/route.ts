/**
 * POST /api/customers/:id/links — connect or disconnect invoices, by explicit choice.
 *   Body: { action: "connect" | "disconnect", invoiceIds: [uuid, …] }   (1–50 ids)
 *
 * connect: only the signed-in user's own invoices that aren't connected to any customer yet, to the user's own
 * customer. Never overrides an existing connection, never touches the invoice document. disconnect: only invoices
 * currently connected to this customer. Both change nothing but `invoices.customer_id`. Anything skipped is counted,
 * not guessed at. There is no "connect everything with this name" — the owner picks the invoices.
 */

import { customerAccess, customerNotFound } from '@/app/lib/customer-routes';
import { fail, isUuid, json, readJson, sameOrigin } from '@/app/lib/api-response';
import { MAX_IDS } from '@/app/lib/invoice/list-query';
import { getCustomer } from '@/db/directory';
import { linkInvoices, unlinkInvoices } from '@/db/customer-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const { id } = await params;
  const a = await customerAccess(req, id);
  if (a instanceof Response) return a;

  let body: { action?: unknown; invoiceIds?: unknown };
  try {
    body = (await readJson(req, 4_000)) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  if (body?.action !== 'connect' && body?.action !== 'disconnect') return fail(400, 'invalid', 'Choose connect or disconnect.');
  const ids = Array.isArray(body.invoiceIds) ? [...new Set(body.invoiceIds.map((v) => (typeof v === 'string' ? v.toLowerCase() : '')))] : [];
  if (!ids.length || ids.length > MAX_IDS || ids.some((v) => !isUuid(v))) return fail(400, 'invalid', `Pick between 1 and ${MAX_IDS} invoices.`);
  if (!(await getCustomer(a.db, a.user.id, id))) return customerNotFound();

  const done = body.action === 'connect' ? await linkInvoices(a.db, a.user.id, id, ids) : await unlinkInvoices(a.db, a.user.id, id, ids);
  return json({ ok: true, changed: done.length, skipped: ids.length - done.length, ids: done });
}
