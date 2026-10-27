/**
 * GET /api/invoices/receivables — where the money stands today, with a short message to copy or share on WhatsApp.
 * The logic is in app/lib/billing/api/receivables.ts (one door for these routes, see app/lib/billing/api/index.ts).
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => dispatch('receivables.GET', req);
