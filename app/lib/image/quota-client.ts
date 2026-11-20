/**
 * Browser side of the free daily limit (see app/api/image-quota).
 *
 * Fails open: if the counter can't be reached, the file still converts. The
 * limit is a fair-use standard, and a flaky network shouldn't block the tool.
 */

export type DailyQuota = { limit: number; used: number; remaining: number; signedIn: boolean };

export async function readDailyQuota(): Promise<DailyQuota | null> {
  try {
    const res = await fetch('/api/image-quota', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<DailyQuota> & { ok?: boolean };
    if (!body.ok || typeof body.remaining !== 'number') return null;
    return {
      limit: body.limit ?? 0,
      used: body.used ?? 0,
      remaining: body.remaining,
      signedIn: body.signedIn === true,
    };
  } catch {
    return null;
  }
}

/**
 * `ok`: counted, convert it. `limit-visitor`: the visitor's free files are
 * used up, so sign in. `limit-user`: a signed-in person's files are used up
 * for today. `unavailable`: the counter couldn't be reached, convert without counting.
 */
export type ReserveResult = 'ok' | 'limit-visitor' | 'limit-user' | 'unavailable';

export async function reserveDailyFile(): Promise<ReserveResult> {
  try {
    const res = await fetch('/api/image-quota', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'use' }),
      cache: 'no-store',
    });
    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as { needsSignIn?: boolean } | null;
      return body?.needsSignIn ? 'limit-visitor' : 'limit-user';
    }
    return res.ok ? 'ok' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function giveBackDailyFile(): Promise<void> {
  try {
    await fetch('/api/image-quota', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'give-back' }),
      cache: 'no-store',
    });
  } catch {
    // Housekeeping only: a lost give-back costs one file of the day.
  }
}

export const LIMIT_VISITOR_MESSAGE =
  "You've used today's free conversions. Sign in to keep converting today.";
export const LIMIT_USER_MESSAGE =
  "You've used today's free conversions. The limit resets at midnight India time.";

/** Shorter text for the file row; the status note above the list says the full thing. */
export const BLOCKED_ROW_MESSAGE = "Not converted. Today's free limit is used up.";

export function limitMessage(kind: 'limit-visitor' | 'limit-user'): string {
  return kind === 'limit-visitor' ? LIMIT_VISITOR_MESSAGE : LIMIT_USER_MESSAGE;
}
