/**
 * GET /{shortCode}  —  the short-link redirect.
 *
 * A dedicated route segment at the domain root, isolated from the marketing
 * render tree. Next.js static routes (`/url-shortener`, `/about`, …) take
 * precedence over this dynamic segment; `reserved-routes.ts` is the second
 * guard and is shared, framework-free, with the future Cloudflare Worker.
 *
 * Runtime: Node (Vercel Fluid). The Edge runtime is deprecated in Next.js 16
 * (`node_modules/next/dist/docs/.../route-segment-config/runtime.md`), so the
 * `runtime = 'edge'` this was specced with is intentionally omitted — see
 * docs/products/url-shortener.md §6. Neon is still reached over HTTP
 * (`@neondatabase/serverless`), keeping the lookup a single fast round trip.
 *
 *   1. shape / reserved-word guard      → not a code → 404 (non-informative)
 *   2. Neon SELECT destination,status,expires_at WHERE short_code = $1
 *   3. active & not expired  → 302 Location: destination
 *                              + X-Robots-Tag: noindex, Cache-Control: no-store
 *      disabled / expired    → 302 /link-unavailable?reason=…
 *      missing               → 404
 *   4. after(() => clickCount++, lastClickedAt = now())   ← best-effort
 */

import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { isValidShortCodeShape } from '@/app/lib/short-code';
import { isReservedCode } from '@/app/lib/reserved-routes';
import { getDb } from '@/db/client';
import { recordClick, resolveShortLink } from '@/db/links';

export const dynamic = 'force-dynamic';

const REDIRECT_HEADERS = {
  // Short URLs must not be indexed, and a disabled link must stop resolving
  // immediately (no CDN/browser caching of the 302).
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'no-store',
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await ctx.params;

  // Reserved words and non-code shapes never belong to a user link.
  if (!isValidShortCodeShape(shortCode) || isReservedCode(shortCode)) {
    notFound();
  }

  const db = await getDb();
  const result = await resolveShortLink(db, shortCode);

  if (result.outcome === 'not_found') {
    notFound();
  }

  if (result.outcome === 'disabled' || result.outcome === 'expired') {
    const url = new URL(`/link-unavailable?reason=${result.outcome}`, req.url);
    return new Response(null, {
      status: 302,
      headers: { ...REDIRECT_HEADERS, Location: url.toString() },
    });
  }

  // Best-effort click accounting — never blocks or breaks the redirect.
  after(() => recordClick(db, result.id));

  return new Response(null, {
    status: 302,
    headers: { ...REDIRECT_HEADERS, Location: result.destination },
  });
}
