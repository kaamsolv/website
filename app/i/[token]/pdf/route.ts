/**
 * GET /i/<token>/pdf — the invoice as a PDF, for anyone holding the link. A wrong, expired or revoked link is a
 * plain 404 with no body that says why. Not cached, not indexed, no referrer.
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('invoice-pdf.GET', req, ctx);
