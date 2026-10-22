/**
 * GET / PUT / DELETE /api/items/:id — one saved items. Someone else's id is a 404.
 */

import { itemHandlers } from '@/app/lib/directory-routes';
import { ITEMS } from '@/app/lib/directories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, PUT, DELETE } = itemHandlers(ITEMS);
