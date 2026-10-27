/**
 * /api/invoices/<id>/link — a private link to one of my invoices, and the WhatsApp message that carries it.
 *
 *   GET     the live link (if any) and its views
 *   POST    make the link (or return the one that is live) and the ready-to-send WhatsApp message
 *   DELETE  turn every live link of this invoice off
 *
 * Signed in, own invoice only (a stranger's id is the same 404 as a missing one), same-site for changes.
 * Every account can share; it is not a paid feature. A link is a bearer link: whoever has the address can open
 * that one invoice until it is turned off.
 */

import { dispatch } from '@/app/lib/billing/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('link.GET', req, ctx);
export const POST = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('link.POST', req, ctx);
export const DELETE = (req: Request, ctx: { params: Promise<Record<string, string>> }) => dispatch('link.DELETE', req, ctx);
