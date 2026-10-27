/**
 * GET /api/billing/status — the signed-in account's plans, its last checkouts, and the price list.
 * `configured` is false until the Razorpay keys are set, so the page can say payments aren't on yet.
 */

import { invoiceUrl } from '@/app/lib/billing/jobs';
import { billingConfig } from '@/app/lib/billing/invoice';
import { razorpayKeys } from '@/app/lib/billing/razorpay';
import { linkSecret } from '@/app/lib/links/token';
import { fail, json, requireUser } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { billingStatus, listPrices } from '@/db/billing';
import { billingLinkToken } from '@/db/invoice-links';


export async function handleGET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const [prices, status] = await Promise.all([listPrices(db), billingStatus(db, user.id)]);
    const payments = await Promise.all(
      status.payments.map(async (p) => {
        const token = p.invoiceId && p.status === 'paid' ? await billingLinkToken(db, linkSecret(), p.invoiceId) : null;
        const { invoiceId: _invoiceId, ...rest } = p;
        return { ...rest, invoiceUrl: token ? invoiceUrl(token) : null };
      }),
    );
    const treatment = billingConfig().treatment;
    // Only a price that includes GST gets a split on screen; anything else shows the plain price.
    const taxRate = treatment?.mode === 'inclusive' ? Number(treatment.rate) : null;
    return json({ ok: true, configured: razorpayKeys() !== null, taxRate, prices, subscriptions: status.subscriptions, payments });
  } catch (e) {
    console.error('[api/billing/status]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load your plans. Try again in a moment.');
  }
}
