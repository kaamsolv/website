/**
 * POST /api/billing/webhook — Razorpay tells KaamSolv what happened to a payment.
 *
 * This, not the browser, is what confirms a payment (docs/products/billing.md). In order:
 *   1. Read the raw body exactly as sent and check Razorpay's signature on it. Wrong or missing → 400,
 *      nothing is read, parsed or stored.
 *   2. Use `x-razorpay-event-id` as the idempotency key: a repeated delivery changes nothing.
 *   3. Answer 200 once handled (or safely ignored), 503 when the thing it refers to isn't known yet
 *      (Razorpay redelivers), 500 on a database error (Razorpay redelivers).
 * Nothing here logs the body, the signature or any key.
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (req: Request) => dispatch('webhook.POST', req);
