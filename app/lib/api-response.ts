/**
 * Small helpers shared by the account API routes. Server only.
 */

import { NextResponse } from 'next/server';
import { isSameOrigin } from './same-origin';
import { getCurrentUser, type CurrentUser } from './session';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function fail(status: number, error: string, message: string): NextResponse {
  return json({ ok: false, error, message }, status);
}

/** Same-site writes only (app/lib/same-origin.ts). Session cookies are also SameSite=Lax. */
export const sameOrigin = (req: Request): boolean => isSameOrigin(req);

/** Signed-in user, or a ready 401 response. */
export async function requireUser(req: Request): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser(req.headers);
  return user ?? fail(401, 'signed_out', 'Sign in to do that.');
}

export async function readJson(req: Request, maxBytes = 300_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error('too_large');
  return JSON.parse(text);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);
