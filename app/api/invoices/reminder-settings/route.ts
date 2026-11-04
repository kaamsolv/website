/** GET / PUT /api/invoices/reminder-settings — scheduled reminders on/off and days (logic: app/lib/billing/api/reminders.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => dispatch('reminder-settings.GET', req);
export const PUT = (req: Request) => dispatch('reminder-settings.PUT', req);
