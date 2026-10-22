/**
 * GET  /api/items?q=  — the signed-in user's saved items (search by name).
 * POST /api/items     — save one. 403 `limit` at the plan's limit.
 * Scoped to the user; entitlement re-checked here (app/lib/directory-routes.ts).
 */

import { collectionHandlers } from '@/app/lib/directory-routes';
import { ITEMS } from '@/app/lib/directories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST } = collectionHandlers(ITEMS);
