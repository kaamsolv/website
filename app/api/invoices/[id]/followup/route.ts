/** PUT /api/invoices/:id/followup — payment promise and reminder pause (logic: app/lib/billing/api/reminders.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('followup.PUT', req, ctx);
