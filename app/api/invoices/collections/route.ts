/**
 * GET /api/invoices/collections — the Payments & Collections dashboard (Pro: `invoice_dashboard`).
 *
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD&today=YYYY-MM-DD[&currency=INR][&customer=<saved customer id>]
 *
 * One currency per answer (the account's main one when `currency` is left out) — currencies are never
 * summed or converted. `today` is the visitor's own calendar date and is required: it must be a real date
 * within a day of the server's UTC date, with no fallback to the server's clock (app/lib/invoice/collections.ts
 * explains how dates and the Indian financial year are handled). The range is at most 24 months.
 *
 * The plan is checked here, on the server, before anything is read: without `invoice_dashboard` the answer
 * is a 403 and no figure is computed. Every figure comes from the payment ledger and is scoped to the
 * signed-in user. See db/collections.ts for what each number means.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { parseCollectionsQuery } from '@/app/lib/invoice/collections';
import { fail, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getCollections } from '@/db/collections';
import { getEntitlements } from '@/db/entitlements';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_dashboard')) {
    return fail(403, 'not_allowed', 'Payments & collections is part of Pro.');
  }
  const parsed = parseCollectionsQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return fail(400, 'invalid', parsed.message);

  const data = await getCollections(db, user.id, parsed.value);
  return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
