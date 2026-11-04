/** GET /api/invoices/promises — open invoices with a promised payment date (logic: app/lib/billing/api/reminders.ts). */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => dispatch('promises.GET', req);
