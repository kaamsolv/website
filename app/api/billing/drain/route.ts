/**
 * POST /api/billing/drain — runs the outbox: retries invoice emails that failed or were waiting on a setting.
 * Called by the Cloudflare scheduled trigger (worker/index.ts) with the shared CRON_SECRET; nobody else.
 * Returns counts only.
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (req: Request) => dispatch('drain.POST', req);
