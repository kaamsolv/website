/** GET / POST /api/invoices/:id/reminders — customer payment reminders (logic: app/lib/billing/api/reminders.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('reminders.GET', req, ctx);
export const POST = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('reminders.POST', req, ctx);
