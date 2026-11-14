/**
 * GET /{business-slug}/{code}  —  an affiliate's referral link.
 *
 * Lives inside the existing root dynamic folder (Next.js allows one dynamic name per level, so `shortCode` here is the
 * business address). Real pages always win over this route: `/tools/x` is never a link because `tools` is a reserved
 * route name, and business addresses are checked against every top-level route (test/affiliate-link-routes.test.mts).
 *
 *   unknown business, suspended business, unknown code → 404 (the same for all three)
 *   membership paused by the business                  → 302 to the store, no `?ref=`, nothing recorded
 *   no destination set yet                             → 302 to the programme page
 *   otherwise                                          → 302 to `destination?ref=CODE`, then after the response
 *                                                        one recorded click (not for HEAD, prefetch or link previews)
 *
 * Always `no-store` and `noindex`, so a paused link stops counting on the very next request.
 */

import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { isLinkCodeShape, withRef } from '@/app/lib/affiliate/link';
import { SLUG_RE } from '@/app/lib/affiliate/merchant';
import { clickMetaFromRequest } from '@/app/lib/click-meta';
import { isReservedCode } from '@/app/lib/reserved-routes';
import { getDb } from '@/db/client';
import { recordAffiliateClick, resolveAffiliateLink } from '@/db/affiliate-links';

export const dynamic = 'force-dynamic';

const HEADERS = { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' };

export async function GET(req: Request, ctx: { params: Promise<{ shortCode: string; code: string }> }) {
  const { shortCode: slug, code } = await ctx.params;
  if (!SLUG_RE.test(slug) || isReservedCode(slug) || !isLinkCodeShape(code)) notFound();

  const db = await getDb();
  const link = await resolveAffiliateLink(db, slug, code);
  if (link.outcome === 'not_found') notFound();

  if (link.destination === '') {
    // A relative Location, so it never depends on which host name the request arrived on.
    return new Response(null, { status: 302, headers: { ...HEADERS, Location: `/affiliate/${slug}` } });
  }
  if (link.paused) {
    return new Response(null, { status: 302, headers: { ...HEADERS, Location: link.destination } });
  }

  // Headers are read now so the deferred write holds only plain values; it never blocks or breaks the redirect.
  const click = clickMetaFromRequest(req.method, req.headers);
  if (click) after(() => recordAffiliateClick(db, link.linkId, click));

  return new Response(null, { status: 302, headers: { ...HEADERS, Location: withRef(link.destination, code) } });
}
