/** GET /api/accountant-access — who has read-only access, and what they did (logic: app/lib/billing/api/access.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => dispatch('access.GET', req);
