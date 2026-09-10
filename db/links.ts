/**
 * Data access for the KaamKit URL Shortener `links` table.
 *
 * Framework-free (no `next/*`). Every function takes an explicit `db`, so the
 * same code runs against Neon (production) and PGlite (local dev + tests).
 *
 * Uniqueness policy (docs/products/url-shortener.md §5): the database is the
 * only arbiter. We never pre-check "is this code taken?" — we insert, and on a
 * unique-constraint violation regenerate and retry, then grow the code length.
 */

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import {
  DEFAULT_LENGTH,
  MAX_ATTEMPTS,
  MAX_LENGTH,
  generateShortCode,
} from '../app/lib/short-code.ts';
import { isReservedCode } from '../app/lib/reserved-routes.ts';
import * as schema from './schema.ts';
import { links, type LinkRow } from './schema.ts';

/** Common supertype of the Neon (HTTP) and PGlite Drizzle instances. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const PG_UNIQUE_VIOLATION = '23505';

/** True when a thrown error is a Postgres unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  if (e.code === PG_UNIQUE_VIOLATION || e.cause?.code === PG_UNIQUE_VIOLATION) return true;
  return typeof e.message === 'string' && /duplicate key|unique constraint|23505/i.test(e.message);
}

export type CreateShortLinkInput = {
  /** Normalised destination — already through validateDestinationUrl(). */
  destination: string;
  createdIpHash?: string | null;
  expiresAt?: Date | null;
};

/**
 * Persist a new short link, retrying on code collision.
 *
 * Throws if it cannot find a free code within the attempt budget at the
 * maximum length (`generateShortCode` clamps to MAX_LENGTH) — effectively
 * impossible, but surfaced rather than looping forever.
 */
export async function createShortLink(
  db: Db,
  input: CreateShortLinkInput,
): Promise<LinkRow> {
  let length = DEFAULT_LENGTH;

  for (let attempt = 0; attempt < MAX_ATTEMPTS * 4; attempt += 1) {
    // Skip reserved words up front so we don't burn an insert on a code that
    // the redirect route would refuse to serve anyway.
    let code = generateShortCode(length);
    for (let i = 0; i < MAX_ATTEMPTS && isReservedCode(code); i += 1) {
      code = generateShortCode(length);
    }

    try {
      const [row] = await db
        .insert(links)
        .values({
          shortCode: code,
          destination: input.destination,
          createdIpHash: input.createdIpHash ?? null,
          expiresAt: input.expiresAt ?? null,
        })
        .returning();
      return row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Collision — widen the keyspace every few attempts, then retry.
      if ((attempt + 1) % MAX_ATTEMPTS === 0 && length < MAX_LENGTH) length += 1;
    }
  }

  throw new Error('createShortLink: exhausted attempts finding a free short code');
}

export type ResolveResult =
  | { outcome: 'redirect'; id: string; destination: string }
  | { outcome: 'not_found' }
  | { outcome: 'disabled' }
  | { outcome: 'expired' };

/** Look a short code up and decide what the redirect route should do. */
export async function resolveShortLink(db: Db, shortCode: string): Promise<ResolveResult> {
  const [row] = await db
    .select({
      id: links.id,
      destination: links.destination,
      status: links.status,
      expiresAt: links.expiresAt,
    })
    .from(links)
    .where(eq(links.shortCode, shortCode))
    .limit(1);

  if (!row) return { outcome: 'not_found' };
  if (row.status === 'disabled') return { outcome: 'disabled' };
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return { outcome: 'expired' };
  return { outcome: 'redirect', id: row.id, destination: row.destination };
}

/**
 * Best-effort click accounting. Called from `after()` on the redirect path, so
 * a slow or failing write never affects the redirect. Swallows its own errors.
 */
export async function recordClick(db: Db, id: string): Promise<void> {
  try {
    await db
      .update(links)
      .set({
        clickCount: sql`${links.clickCount} + 1`,
        lastClickedAt: new Date(),
      })
      .where(
        and(
          eq(links.id, id),
          eq(links.status, 'active'),
          or(isNull(links.expiresAt), sql`${links.expiresAt} > now()`),
        ),
      );
  } catch {
    // Analytics must never break the redirect.
  }
}
