/**
 * GET /api/invoices/export?mode=invoices|lines&from=YYYY-MM-DD&to=YYYY-MM-DD —
 * a CSV of the signed-in user's invoices and quotations (Pro: invoice_csv_export).
 * `invoices` = one row each; `lines` = one row per line item (HSN/SAC view).
 * At most 5,000 invoices; past that the request is refused (413) with a hint.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { invoicesCsv, linesCsv } from '@/app/lib/invoice/csv';
import { isIsoDate } from '@/app/lib/invoice/recurring';
import { fail, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { EXPORT_MAX_ROWS, listForExport } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_csv_export')) {
    return fail(403, 'not_allowed', 'CSV export is part of Pro.');
  }
  const q = new URL(req.url).searchParams;
  const from = q.get('from') || undefined;
  const to = q.get('to') || undefined;
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return fail(400, 'invalid', 'Use dates like 2026-04-01.');
  const mode = q.get('mode') === 'lines' ? 'lines' : 'invoices';

  const rows = await listForExport(db, user.id, { from, to });
  if (rows.length > EXPORT_MAX_ROWS) {
    return fail(413, 'too_many', `That’s more than ${EXPORT_MAX_ROWS.toLocaleString('en-IN')} invoices. Pick a shorter date range.`);
  }
  const body = mode === 'lines' ? linesCsv(rows) : invoicesCsv(rows);
  const name = `kaamsolv-${mode === 'lines' ? 'invoice-lines' : 'invoices'}${from ? `-from-${from}` : ''}${to ? `-to-${to}` : ''}.csv`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
