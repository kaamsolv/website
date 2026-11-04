/** GET / PUT /api/invoices/:id/automation — automatic recurring invoices (logic: app/lib/billing/api/automation.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('automation.GET', req, ctx);
export const PUT = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('automation.PUT', req, ctx);
