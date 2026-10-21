/**
 * POST /api/test/oauth-sign-in — TEST ONLY. Playwright's stand-in for "Continue
 * with Google" (Google's real login can't be automated). Body: { email, name }.
 *
 * 404 unless all three locks in app/lib/e2e-gate.ts hold: a non-production
 * build, KK_E2E=1, and an X-KK-E2E-Secret header matching KK_E2E_SECRET. The
 * better-auth endpoint behind it is server-only and checks the secret again.
 */

import { NextResponse } from 'next/server';
import { getAuth } from '@/app/lib/auth';
import { e2eSecretMatches, isE2eEnabled } from '@/app/lib/e2e-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => new NextResponse('Not found', { status: 404 });

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return notFound();
  if (!isE2eEnabled() || !e2eSecretMatches(req.headers.get('x-kk-e2e-secret'))) return notFound();

  const auth = (await getAuth()) as unknown as {
    api: { kkE2eOAuthSignIn: (opts: { body: unknown; headers: Headers; asResponse: true }) => Promise<Response> };
  };
  return auth.api.kkE2eOAuthSignIn({ body: await req.json(), headers: req.headers, asResponse: true });
}
