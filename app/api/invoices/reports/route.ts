/**
 * GET /api/invoices/reports — one small page of an operational report, with the totals over every match (Pro:
 * `invoice_csv_export`, checked on every request, including `report=meta`). The browser joins the pages into a
 * CSV (app/_components/account/report-export.ts) so no request builds a large file — each one reads at most
 * 100 invoices or 500 payments. The older /api/invoices/export is a separate endpoint and is unchanged.
 *
 *   ?report=register|payments|outstanding|ageing &currency=INR &today=YYYY-MM-DD
 *   &from=&to= (register, payments)  &customer=<uuid>  &state=  &bucket=  &method=  &includeVoided=1
 *   &page=1 &pageSize=
 *   ?report=meta                    → the currencies the account has invoices in, and the page sizes / caps
 *
 * An export that would hold more than its cap (`EXPORT_CAP`) is refused with 413 on every page, so a person
 * is told before anything is downloaded. Everything is scoped to the signed-in user.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { ageingCells, COLUMNS, EXPORT_CAP, OPERATIONAL_NOTE, outstandingCells, PAGE_SIZE, parseReportQuery, paymentCells, registerCells, REPORT_LABELS } from '@/app/lib/invoice/reports';
import { rateLimitChecks, retryAfterSeconds } from '@/app/lib/rate-limit';
import { formatErrorForLog } from '@/app/lib/log-error';
import { fail, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { listCurrencies } from '@/db/collections';
import { getEntitlements } from '@/db/entitlements';
import { consumeRateLimits } from '@/db/rate-limits';
import { ageingSummary, outstandingPage, paymentsPage, registerPage } from '@/db/invoice-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ok = (body: unknown) => Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    // Every request, every report: the entitlement is checked here and nothing is read for anyone without it.
    if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_csv_export')) {
      return fail(403, 'not_allowed', 'Reports and exports are part of Pro.');
    }
    const rate = await consumeRateLimits(db, rateLimitChecks('invoice', 'invoiceReport', await hashIp(user.id, resolveIpHashSalt())));
    if (!rate.allowed) {
      return Response.json(
        { ok: false, error: 'rate_limited', message: 'That’s a lot of report pages at once. Give it a little while and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rate.resetAt)), 'Cache-Control': 'no-store' } },
      );
    }

    const params = new URL(req.url).searchParams;
    if (params.get('report') === 'meta') {
      return ok({ ok: true, report: 'meta', currencies: await listCurrencies(db, user.id), pageSize: PAGE_SIZE, cap: EXPORT_CAP, note: OPERATIONAL_NOTE });
    }

    const parsed = parseReportQuery(params);
    if (!parsed.ok) return fail(400, 'invalid', parsed.message);
    const q = parsed.value;

    const result =
      q.report === 'register'
        ? await registerPage(db, user.id, q)
        : q.report === 'payments'
          ? await paymentsPage(db, user.id, q)
          : q.report === 'outstanding'
            ? await outstandingPage(db, user.id, q)
            : await ageingSummary(db, user.id, q);

    const cap = EXPORT_CAP[q.report];
    if (result.matched > cap) {
      return Response.json(
        {
          ok: false,
          error: 'too_many',
          message:
            q.report === 'register' || q.report === 'payments'
              ? `That’s more than ${cap.toLocaleString('en-IN')} rows. Pick a shorter period or narrow it down, and export in parts.`
              : `That’s more than ${cap.toLocaleString('en-IN')} invoices. Narrow it down with a customer or age filter, and export in parts.`,
          matched: result.matched,
          cap,
        },
        { status: 413, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const cells =
      q.report === 'register'
        ? (result as Awaited<ReturnType<typeof registerPage>>).rows.map(registerCells)
        : q.report === 'payments'
          ? (result as Awaited<ReturnType<typeof paymentsPage>>).rows.map(paymentCells)
          : q.report === 'outstanding'
            ? (result as Awaited<ReturnType<typeof outstandingPage>>).rows.map(outstandingCells)
            : (result as Awaited<ReturnType<typeof ageingSummary>>).rows.map(ageingCells);

    return ok({
      ok: true,
      report: q.report,
      title: REPORT_LABELS[q.report],
      currency: q.currency,
      today: q.today,
      columns: COLUMNS[q.report],
      rows: cells,
      totals: result.totals,
      matched: result.matched,
      page: q.page,
      pages: Math.max(1, Math.ceil(result.matched / q.pageSize)),
      pageSize: q.pageSize,
      cap,
      /** Register only: invoices on this page whose tax columns were left blank because their lines no longer add up to the saved total. */
      blanked: 'blanked' in result ? result.blanked : 0,
    });
  } catch (e) {
    console.error('[api/invoices/reports]', formatErrorForLog(e));
    return fail(500, 'server', 'That report didn’t load. Try again.');
  }
}
