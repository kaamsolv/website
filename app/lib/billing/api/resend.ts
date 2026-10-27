/**
 * POST /api/billing/payments/<id>/resend — email my invoice for this payment again.
 *
 * Signed in, same-site, and only for the caller's own paid payment. It queues an email job; it never makes
 * a second invoice (the invoice is created once per payment). At most one resend per minute per payment.
 */

import { and, eq } from 'drizzle-orm';
import { fail, isUuid, json, requireUser, sameOrigin } from '@/app/lib/api-response';
import { DRAIN_AFTER_REQUEST, drainOutbox, queueResend } from '@/app/lib/billing/jobs';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { billingPayments } from '@/db/schema';
import { after } from 'next/server';


export async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail(404, 'not_found', 'We couldn’t find that payment.');
  try {
    const db = await getDb();
    const [pay] = await db
      .select({ status: billingPayments.status, invoiceId: billingPayments.invoiceId })
      .from(billingPayments)
      .where(and(eq(billingPayments.id, id), eq(billingPayments.userId, user.id)));
    if (!pay || pay.status !== 'paid') return fail(404, 'not_found', 'We couldn’t find that payment.');
    await queueResend(db, id);
    after(() => drainOutbox(DRAIN_AFTER_REQUEST).catch((e) => console.error('[api/billing/resend] drain', formatErrorForLog(e))));
    return json({ ok: true, message: 'On its way. Check your inbox in a minute.' });
  } catch (e) {
    console.error('[api/billing/resend]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t send that. Try again in a moment.');
  }
}
