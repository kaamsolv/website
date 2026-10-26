/**
 * Shared guard for the customer-workspace routes (/api/customers/:id/summary, /unlinked, /links). Server only.
 * Same rule as the saved-customer routes: signed in, with the `invoice_client_directory` entitlement (every
 * account has it — 3 customers on a free account, more on Pro). Ownership is checked in each query.
 */

import type { NextResponse } from 'next/server';
import { entitlementsFrom } from './entitlements';
import { fail, isUuid, requireUser } from './api-response';
import type { CurrentUser } from './session';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import type { Db } from '@/db/links';

export const customerNotFound = () => fail(404, 'not_found', 'That customer isn’t here — it may have been deleted.');

export async function customerAccess(req: Request, id: string): Promise<{ user: CurrentUser; db: Db } | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_client_directory')) return fail(403, 'not_allowed', 'That isn’t part of your plan.');
  if (!isUuid(id)) return customerNotFound();
  return { user, db };
}
