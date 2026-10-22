/**
 * Shared handlers for the saved-customers and saved-items API routes — same
 * shape, different table. Server only.
 */

import type { NextResponse } from 'next/server';
import { entitlementsFrom, type EntitlementKey } from './entitlements';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from './api-response';
import type { Cleaned } from './invoice/settings';
import type { CurrentUser } from './session';
import { getDb } from '@/db/client';
import type { InsertResult } from '@/db/directory';
import { getEntitlements } from '@/db/entitlements';
import type { Db } from '@/db/links';

type Directory<T, R> = {
  /** Entitlement that unlocks it (and caps it, e.g. 3 customers on free). */
  key: EntitlementKey;
  noun: string;
  limitMessage: (limit: number) => string;
  clean: (input: unknown) => Cleaned<T>;
  list: (db: Db, userId: string, q: string) => Promise<R[]>;
  get: (db: Db, userId: string, id: string) => Promise<R | null>;
  create: (db: Db, userId: string, value: T, limit: number | null) => Promise<InsertResult>;
  update: (db: Db, userId: string, id: string, value: T) => Promise<boolean>;
  remove: (db: Db, userId: string, id: string) => Promise<boolean>;
};

const forbidden = () => fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');

async function access(req: Request, key: EntitlementKey): Promise<{ user: CurrentUser; db: Db; limit: number | null } | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  if (!ent.can(key)) return fail(403, 'not_allowed', 'That isn’t part of your plan.');
  return { user, db, limit: ent.limit(key) };
}

async function body(req: Request): Promise<unknown> {
  try {
    return await readJson(req, 20_000);
  } catch {
    return null;
  }
}

export function collectionHandlers<T, R>(d: Directory<T, R>) {
  return {
    async GET(req: Request) {
      const a = await access(req, d.key);
      if (a instanceof Response) return a;
      const q = new URL(req.url).searchParams.get('q') ?? '';
      return json({ ok: true, rows: await d.list(a.db, a.user.id, q), limit: a.limit });
    },
    async POST(req: Request) {
      if (!sameOrigin(req)) return forbidden();
      const a = await access(req, d.key);
      if (a instanceof Response) return a;
      const cleaned = d.clean(await body(req));
      if (!cleaned.ok) return json({ ok: false, error: 'invalid', message: 'Check the highlighted fields.', errors: cleaned.errors }, 400);
      const made = await d.create(a.db, a.user.id, cleaned.value, a.limit);
      if (!made.ok) return fail(403, 'limit', d.limitMessage(a.limit ?? 0));
      return json({ ok: true, id: made.id }, 201);
    },
  };
}

export function itemHandlers<T, R>(d: Directory<T, R>) {
  type Ctx = { params: Promise<{ id: string }> };
  const notFound = () => fail(404, 'not_found', `That ${d.noun} isn’t here — it may have been deleted.`);
  return {
    async GET(req: Request, { params }: Ctx) {
      const a = await access(req, d.key);
      if (a instanceof Response) return a;
      const { id } = await params;
      const row = isUuid(id) ? await d.get(a.db, a.user.id, id) : null;
      return row ? json({ ok: true, row }) : notFound();
    },
    async PUT(req: Request, { params }: Ctx) {
      if (!sameOrigin(req)) return forbidden();
      const a = await access(req, d.key);
      if (a instanceof Response) return a;
      const { id } = await params;
      if (!isUuid(id)) return notFound();
      const cleaned = d.clean(await body(req));
      if (!cleaned.ok) return json({ ok: false, error: 'invalid', message: 'Check the highlighted fields.', errors: cleaned.errors }, 400);
      return (await d.update(a.db, a.user.id, id, cleaned.value)) ? json({ ok: true }) : notFound();
    },
    async DELETE(req: Request, { params }: Ctx) {
      if (!sameOrigin(req)) return forbidden();
      const a = await access(req, d.key);
      if (a instanceof Response) return a;
      const { id } = await params;
      if (!isUuid(id)) return notFound();
      return (await d.remove(a.db, a.user.id, id)) ? json({ ok: true }) : notFound();
    },
  };
}
