/** /api/accountant-access/<invite|resend|revoke|accept|clients|data|pack> (logic: app/lib/billing/api/access.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('access-action.GET', req, ctx);
export const POST = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('access-action.POST', req, ctx);
