/**
 * GET /api/invoices/receivables?today=YYYY-MM-DD[&currency=INR] — where the money stands, as of the visitor's date (Pro:
 * `invoice_dashboard`, like Payments & collections), with the short message to copy or share on WhatsApp.
 * Every figure comes from db/collections.ts, the same ledger and formulas as the Payments & collections page.
 * `today` is required and must be within a day of the server's (no fallback to the server's clock).
 */

import { fail, requireUser } from '@/app/lib/api-response';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { clientTodayOk } from '@/app/lib/invoice/recurring';
import { receivablesMessage } from '@/app/lib/invoice/receivables-summary';
import { whatsappHref } from '@/app/lib/invoice/share';
import { CURRENCIES, type CurrencyCode } from '@/app/lib/invoice/types';
import { formatErrorForLog } from '@/app/lib/log-error';
import { siteOrigin } from '@/app/lib/site-origin';
import { getDb } from '@/db/client';
import { getReceivables } from '@/db/collections';
import { getEntitlements } from '@/db/entitlements';

export async function handleGET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const params = new URL(req.url).searchParams;
  const today = params.get('today');
  if (!clientTodayOk(today)) return fail(400, 'invalid', 'Your device’s date looks off. Check your clock and try again.');
  const currency = params.get('currency');
  if (currency !== null && !(CURRENCIES as readonly string[]).includes(currency)) return fail(400, 'invalid', 'That currency isn’t one KaamSolv knows.');
  try {
    const db = await getDb();
    if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_dashboard')) return fail(403, 'not_allowed', 'Payments & collections is part of Pro.');
    const r = await getReceivables(db, user.id, { today, ...(currency ? { currency: currency as CurrencyCode } : {}) });
    const message = receivablesMessage(
      [{ currency: r.currency, today: r.today, outstanding: r.outstanding, overdue: r.overdue, dueToday: r.dueToday, dueNext7: r.dueNext7, dueNext30: r.dueNext30, receivedThisMonth: r.receivedThisMonth }],
      `${siteOrigin()}/app/invoices/collections`,
    );
    return Response.json(
      { ok: true, ...r, message, whatsappHref: message ? whatsappHref(undefined, message) : null },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    console.error('[api/invoices/receivables]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load your receivables. Try again in a moment.');
  }
}
