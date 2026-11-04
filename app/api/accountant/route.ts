/** GET / PUT /api/accountant — Accountant Connect settings and history (logic: app/lib/billing/api/accountant.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => dispatch('accountant.GET', req);
export const PUT = (req: Request) => dispatch('accountant.PUT', req);
