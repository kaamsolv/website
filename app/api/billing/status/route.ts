/**
 * GET /api/billing/status — the signed-in account's plans, its last checkouts, and the price list.
 * `configured` is false until the Razorpay keys are set, so the page can say payments aren't on yet.
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => dispatch('status.GET', req);
