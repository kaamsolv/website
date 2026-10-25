/**
 * POST /api/invoices/:id/duplicate — a copy with the next number and new dates.
 * Body (optional): { issueDate: "YYYY-MM-DD" } — the visitor's local today.
 * Counts against the save limit like any new invoice.
 */

import { addDays, DEFAULT_DUE_DAYS, isoDate, QUOTE_VALID_DAYS } from '@/app/lib/invoice/defaults';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { createInvoice, getInvoice, getProfile } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted.');

  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  const limit = ent.limit('invoice_save');
  if (limit === 0) return fail(403, 'not_allowed', 'Saving isn’t part of your plan.');

  const source = await getInvoice(db, user.id, id);
  if (!source) return fail(404, 'not_found', 'That invoice isn’t here — it may have been deleted.');

  let issueDate = isoDate(new Date());
  try {
    const body = (await readJson(req, 200)) as { issueDate?: unknown };
    if (typeof body?.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.issueDate)) issueDate = body.issueDate;
  } catch {
    // No body: server's today.
  }

  // A quotation copies as a quotation (QT-…, valid 30 days) while the account has quotations.
  const asQuote = source.invoice.kind === 'quote' && ent.can('invoice_quote_mode');
  const profile = await getProfile(db, user.id);
  const copy = {
    ...source.invoice,
    kind: asQuote ? ('quote' as const) : undefined,
    number: (asQuote ? profile?.nextQuoteNumber : profile?.nextNumber) ?? `${source.invoice.number} (copy)`.slice(0, 30),
    issueDate,
    dueDate: addDays(issueDate, asQuote ? QUOTE_VALID_DAYS : DEFAULT_DUE_DAYS),
  };
  const created = await createInvoice(db, user.id, copy, limit);
  if (!created.ok) {
    return fail(403, 'limit', `You’ve saved ${limit} invoices — the free limit. Delete one to make a copy.`);
  }
  return json({ ok: true, id: created.id }, 201);
}
