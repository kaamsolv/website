/**
 * GET  /api/invoices  — the signed-in user's saved invoices (summaries only:
 *                       no document, no logo), newest first.
 *                       With filters (state, currency, bucket, issuedFrom/issuedTo, paidFrom/paidTo,
 *                       customer — app/lib/invoice/filters.ts; `today` for overdue and ageing) it returns
 *                       invoices only, capped at 200, plus totals over every match: that is what a
 *                       Payments & Collections card or chart links to. Filtering only narrows the
 *                       user's own invoices, so every account may use it. No filters: unchanged.
 * POST /api/invoices  — save a new one. Body: { invoice }. 403 `limit` when the
 *                       plan's save limit is reached (free account: 20).
 *
 * Entitlements are re-checked here on every request (db/entitlements.ts).
 */

import { MAX_FREE_ITEMS } from '@/app/lib/invoice/limits';
import { cleanInvoice, MAX_ITEMS_ANY_PLAN } from '@/app/lib/invoice/validate';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { hasFilterParams, parseInvoiceFilter } from '@/app/lib/invoice/filters';
import { createInvoice, listInvoices } from '@/db/invoices';
import { listInvoicesFiltered } from '@/db/invoice-filters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const q = new URL(req.url).searchParams;
  if (hasFilterParams(q)) {
    const parsed = parseInvoiceFilter(q);
    if (!parsed.ok) return fail(400, 'invalid', parsed.message);
    return json({ ok: true, filtered: true, ...(await listInvoicesFiltered(await getDb(), user.id, parsed.filter, parsed.today)) });
  }
  return json({ ok: true, invoices: await listInvoices(await getDb(), user.id) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  const limit = ent.limit('invoice_save');
  if (limit === 0) return fail(403, 'not_allowed', 'Saving isn’t part of your plan.');

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

  const created = await createInvoice(db, user.id, cleaned.invoice, limit);
  if (!created.ok) {
    return fail(
      403,
      'limit',
      `You’ve saved ${limit} invoices — the free limit. Delete one to save another. You can still download this one as a PDF.`,
    );
  }
  return json({ ok: true, id: created.id }, 201);
}
