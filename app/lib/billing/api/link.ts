/**
 * /api/invoices/<id>/link — a private link to one of my invoices, and the WhatsApp message that carries it.
 *
 *   GET     the live link (if any) and its views
 *   POST    make the link (or return the one that is live) and the ready-to-send WhatsApp message
 *   DELETE  turn every live link of this invoice off
 *
 * Signed in, own invoice only (a stranger's id is the same 404 as a missing one), same-site for changes.
 * Every account can share; it is not a paid feature. A link is a bearer link: whoever has the address can open
 * that one invoice until it is turned off.
 */

import { and, eq } from 'drizzle-orm';
import { fail, isUuid, json, requireUser, sameOrigin } from '@/app/lib/api-response';
import { invoiceUrl } from '@/app/lib/billing/jobs';
import { hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { whatsappHref, whatsappMessage, whatsappNumber } from '@/app/lib/invoice/share';
import type { CurrencyCode, Invoice } from '@/app/lib/invoice/types';
import { linkSecret } from '@/app/lib/links/token';
import { formatErrorForLog } from '@/app/lib/log-error';
import { retryAfterSeconds } from '@/app/lib/rate-limit';
import { getDb } from '@/db/client';
import { ensureLink, liveLinks, revokeLinks } from '@/db/invoice-links';
import { consumeRateLimits } from '@/db/rate-limits';
import { customers, invoices } from '@/db/schema';


const NOT_FOUND = () => fail(404, 'not_found', 'We couldn’t find that invoice.');

async function load(userId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ number: invoices.number, currency: invoices.currency, total: invoices.total, dueDate: invoices.dueDate, status: invoices.status, kind: invoices.kind, data: invoices.data, customerId: invoices.customerId })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
  // A saved invoice doesn't keep the client's phone; the saved customer does.
  let phone = '';
  if (row?.customerId) {
    const [c] = await db.select({ phone: customers.phone }).from(customers).where(and(eq(customers.id, row.customerId), eq(customers.userId, userId)));
    phone = c?.phone ?? '';
  }
  return { db, row: row ? { ...row, phone } : row };
}

function reply(row: NonNullable<Awaited<ReturnType<typeof load>>['row']>, links: { token: string; createdAt: Date; expiresAt: Date | null; viewCount: number; lastViewedAt: Date | null }[]) {
  const doc = row.data as Invoice;
  const newest = links[0];
  const url = newest ? invoiceUrl(newest.token) : null;
  const message = url
    ? whatsappMessage({ sellerName: doc.seller?.name ?? '', clientName: doc.client?.name ?? '', number: row.number, total: row.total, currency: row.currency as CurrencyCode, dueDate: row.dueDate ?? '', url, paid: row.status === 'paid' })
    : null;
  return json({
    ok: true,
    url,
    expiresAt: newest?.expiresAt ? newest.expiresAt.toISOString() : null,
    views: newest?.viewCount ?? 0,
    lastViewedAt: newest?.lastViewedAt ? newest.lastViewedAt.toISOString() : null,
    whatsapp: message ? { message, href: whatsappHref(row.phone, message), hasClientNumber: whatsappNumber(row.phone) !== null } : null,
  });
}

export async function handleGET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NOT_FOUND();
  try {
    const { db, row } = await load(user.id, id);
    if (!row || row.kind !== 'invoice') return NOT_FOUND();
    return reply(row, await liveLinks(db, linkSecret(), user.id, id));
  } catch (e) {
    console.error('[api/invoices/link]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load the link. Try again in a moment.');
  }
}

export async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NOT_FOUND();
  try {
    const { db, row } = await load(user.id, id);
    if (!row || row.kind !== 'invoice') return NOT_FOUND();
    const rate = await consumeRateLimits(db, [{ key: `invoice-link:1h:${await hashIp(user.id, resolveIpHashSalt())}`, limit: 60, windowSeconds: 3600 }]);
    if (!rate.allowed) {
      return Response.json(
        { ok: false, error: 'rate_limited', message: 'That’s a lot of links. Give it a little while and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rate.resetAt)), 'Cache-Control': 'no-store' } },
      );
    }
    await ensureLink(db, linkSecret(), { invoiceId: id, userId: user.id, purpose: 'share' });
    return reply(row, await liveLinks(db, linkSecret(), user.id, id));
  } catch (e) {
    console.error('[api/invoices/link]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t make the link. Try again in a moment.');
  }
}

export async function handleDELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NOT_FOUND();
  try {
    const { db, row } = await load(user.id, id);
    if (!row) return NOT_FOUND();
    const turnedOff = await revokeLinks(db, user.id, id);
    return json({ ok: true, turnedOff });
  } catch (e) {
    console.error('[api/invoices/link]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t turn the link off. Try again in a moment.');
  }
}
