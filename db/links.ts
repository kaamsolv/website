/**
 * Data access for the KaamSolv URL Shortener (`links`, `click_events`).
 *
 * Framework-free (no `next/*`). Every function takes an explicit `db`, so the
 * same code runs against Neon (production) and PGlite (local dev + tests).
 *
 * Uniqueness policy (docs/products/url-shortener.md §5): the database is the
 * only arbiter. We never pre-check "is this code taken?" — we insert, and on a
 * unique-constraint violation regenerate and retry, then grow the code length.
 */

import { count, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ClickMeta, DeviceClass } from '../app/lib/click-meta.ts';
import { formatErrorForLog } from '../app/lib/log-error.ts';
import {
  DEFAULT_LENGTH,
  MAX_ATTEMPTS,
  MAX_LENGTH,
  generateShortCode,
} from '../app/lib/short-code.ts';
import { isReservedCode } from '../app/lib/reserved-routes.ts';
import * as schema from './schema.ts';
import { clickEvents, links, type LinkRow } from './schema.ts';

/** Common supertype of the Neon (HTTP) and PGlite Drizzle instances. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const PG_UNIQUE_VIOLATION = '23505';

/** True when a thrown error is a Postgres unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
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
  /** When reputation screening cleared the destination; null = not screened. */
  screenedAt?: Date | null;
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
          screenedAt: input.screenedAt ?? null,
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
 * Record one click: insert a `click_events` row and — for a human click — bump
 * `links.click_count` / `last_clicked_at`.
 *
 * Called from `after()` on the redirect path, so it never delays the redirect.
 * One statement, one round trip, atomic: a data-modifying CTE does the counter
 * update and the event insert together, so the count and the event log can't
 * drift apart. Both are conditional on the link still being active and
 * unexpired at write time (it could have been disabled since the lookup).
 *
 * Bots (link-preview fetchers, crawlers) get an event row with
 * `device_class = 'bot'` but do not move `click_count`: that counter means
 * "people who clicked", and pasting a link into a chat app makes the app fetch
 * it without anyone clicking.
 *
 * Never throws — analytics must not break a redirect — but logs the cause, so a
 * failure is diagnosable rather than silent.
 */
export async function recordClick(db: Db, linkId: string, meta: ClickMeta): Promise<void> {
  // Column names are literal SQL (Postgres forbids qualified names in SET);
  // every value is a bound parameter.
  const eligible = sql`status = 'active' and (expires_at is null or expires_at > now())`;
  const target =
    meta.deviceClass === 'bot'
      ? sql`select id from links where id = ${linkId} and ${eligible}`
      : sql`update links
              set click_count = click_count + 1, last_clicked_at = now()
            where id = ${linkId} and ${eligible}
            returning id`;

  try {
    await db.execute(sql`
      with target as (${target})
      insert into click_events (link_id, referrer_host, country, device_class)
      select id, ${meta.referrerHost}, ${meta.country}, ${meta.deviceClass}::device_class
        from target`);
  } catch (err) {
    console.error('[redirect] click not recorded:', formatErrorForLog(err));
  }
}

/** Every field of one link, or null. For operator tooling, not the hot path. */
export async function getLinkByCode(db: Db, shortCode: string): Promise<LinkRow | null> {
  const [row] = await db.select().from(links).where(eq(links.shortCode, shortCode)).limit(1);
  return row ?? null;
}

/**
 * Turn a link on or off. Operator-only (db/link-status.mts) — there is no
 * public endpoint, because there is no way yet to prove who owns an anonymous
 * link. Takes effect on the very next request: redirects are `no-store`.
 */
export async function setLinkStatus(
  db: Db,
  shortCode: string,
  status: LinkRow['status'],
): Promise<LinkRow | null> {
  const [row] = await db
    .update(links)
    .set({ status, updatedAt: new Date() })
    .where(eq(links.shortCode, shortCode))
    .returning();
  return row ?? null;
}

/** Recorded events for one link, grouped by device class, largest first. */
export async function getClickBreakdown(
  db: Db,
  linkId: string,
): Promise<{ deviceClass: DeviceClass; events: number }[]> {
  return db
    .select({ deviceClass: clickEvents.deviceClass, events: count() })
    .from(clickEvents)
    .where(eq(clickEvents.linkId, linkId))
    .groupBy(clickEvents.deviceClass)
    .orderBy(desc(count()));
}
