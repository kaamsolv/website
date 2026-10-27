/**
 * GET /i/<token>/pdf — the invoice as a PDF, for anyone holding the link. A wrong, expired or revoked link is a
 * plain 404 with no body that says why. Not cached, not indexed, no referrer.
 */

import { invoicePdf } from '@/app/lib/invoice/server-pdf';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { resolveLink } from '@/db/invoice-links';


const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

export async function handleGET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const inv = await resolveLink(await getDb(), token);
    if (!inv) return new Response('Not found', { status: 404, headers: HEADERS });
    const status = inv.status === 'paid' && inv.amountPaid > 0 ? 'paid' : inv.amountPaid > 0 ? 'partly-paid' : 'unpaid';
    const bytes = invoicePdf(inv.doc, { status, amountPaid: inv.amountPaid });
    const name = `invoice-${inv.number.replace(/[^A-Za-z0-9_-]+/g, '-')}.pdf`;
    return new Response(bytes as BodyInit, { headers: { ...HEADERS, 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"` } });
  } catch (e) {
    console.error('[i/token/pdf]', formatErrorForLog(e));
    return new Response('Something went wrong', { status: 500, headers: HEADERS });
  }
}
