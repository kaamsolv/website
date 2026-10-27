/**
 * POST /api/billing/checkout { planKey, period } — start paying for a plan.
 *
 * Signed-in, same-site only. The price comes from the `plan_prices` table, never from the request. This
 * only creates a Razorpay order and a "created" row; the plan switches on when the webhook says it was
 * paid (app/api/billing/webhook), not when this returns and not when the browser says "success".
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (req: Request) => dispatch('checkout.POST', req);
