/**
 * better-auth's own endpoints: /api/auth/sign-in/social, /sign-in/magic-link,
 * /magic-link/verify, /callback/google, /sign-out, /get-session, …
 * Config lives in app/lib/auth.ts.
 */

import { getAuth } from '@/app/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return (await getAuth()).handler(req);
}

export async function POST(req: Request) {
  return (await getAuth()).handler(req);
}
