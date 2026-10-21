/**
 * The one way pages and API routes learn who is signed in. Only this file and
 * app/lib/auth.ts touch better-auth — everything else gets a `CurrentUser`.
 * Server only.
 */

import { getAuth } from './auth';

export type CurrentUser = { id: string; email: string; name: string };

export async function getCurrentUser(headers: Headers): Promise<CurrentUser | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name ?? '' };
}

/** Signs out every session of a user's browser that sent these headers. */
export async function signOut(headers: Headers): Promise<Response> {
  const auth = await getAuth();
  return auth.api.signOut({ headers, asResponse: true });
}
