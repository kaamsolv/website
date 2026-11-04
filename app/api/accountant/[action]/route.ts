/** /api/accountant/<verify|confirm|preview|pack|download|retry|revoke> (logic: app/lib/billing/api/accountant.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('accountant-action.GET', req, ctx);
export const POST = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('accountant-action.POST', req, ctx);
