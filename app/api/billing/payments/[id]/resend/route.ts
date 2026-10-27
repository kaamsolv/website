/**
 * POST /api/billing/payments/<id>/resend — email my invoice for this payment again.
 *
 * Signed in, same-site, and only for the caller's own paid payment. It queues an email job; it never makes
 * a second invoice (the invoice is created once per payment). At most one resend per minute per payment.
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('resend.POST', req, ctx);
