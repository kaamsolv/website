/**
 * GET  /api/customers?q=  — the signed-in user's saved customers (search by name).
 * POST /api/customers     — save one. 403 `limit` at the plan's limit.
 * Scoped to the user; entitlement re-checked here (app/lib/directory-routes.ts).
 */

import { collectionHandlers } from '@/app/lib/directory-routes';
import { CUSTOMERS } from '@/app/lib/directories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST } = collectionHandlers(CUSTOMERS);
