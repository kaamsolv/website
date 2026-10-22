/**
 * GET / PUT / DELETE /api/customers/:id — one saved customers. Someone else's id is a 404.
 */

import { itemHandlers } from '@/app/lib/directory-routes';
import { CUSTOMERS } from '@/app/lib/directories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, PUT, DELETE } = itemHandlers(CUSTOMERS);
