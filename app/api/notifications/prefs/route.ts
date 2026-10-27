/**
 * /api/notifications/prefs — opt in to, or out of, the receivables summary email.
 * The logic is in app/lib/billing/api/prefs.ts (one door for these routes, see app/lib/billing/api/index.ts).
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => dispatch('prefs.GET', req);
export const PUT = (req: Request) => dispatch('prefs.PUT', req);
