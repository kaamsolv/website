/**
 * A named accountant's read-only access (Invoice Pro; the same plan gate as Reports & exports).
 *
 * The owner (signed in, own data only, same-site for changes):
 *   GET  /api/accountant-access                    who has access, and what they did
 *   POST /api/accountant-access/invite             { name, email }   email an invitation (7 days, once)
 *   POST /api/accountant-access/resend             { id }            a fresh invitation to one still waiting
 *   POST /api/accountant-access/revoke             { id }            end access now
 *
 * The invited accountant (signed in as the invited, verified email):
 *   POST /api/accountant-access/accept             { token }
 *   GET  /api/accountant-access/clients            the businesses they may read
 *   GET  /api/accountant-access/data?owner=&view=register|payments|customers|meta&period=YYYY-MM&currency=&page=
 *   GET  /api/accountant-access/pack?owner=&period=YYYY-MM         the monthly pack ZIP
 *
 * Every read goes through `grantFor` (db/accountant-access.ts) first and answers the same 404 for "no such business",
 * "no access", "ended" and "not yours", then checks the owner still has Pro. There is no write here for an accountant:
 * the owner's own routes only ever act on the signed-in person's own data, so an accountant's session can't reach them.
 * Nothing in a response or a log carries report content beyond what is returned to the permitted reader.
 */

import { sql } from 'drizzle-orm';
import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { sendEmailChecked } from '@/app/lib/email';
import { checkInvite, inviteEmail, isView, ACCESS_CAN, ACCESS_CANNOT } from '@/app/lib/invoice/accountant-access';
import { periodOf, previousMonth, PACK_SECTIONS } from '@/app/lib/invoice/accountant';
import { COLUMNS, paymentCells, registerCells, type ReportQuery } from '@/app/lib/invoice/reports';
import { CURRENCIES, type CurrencyCode } from '@/app/lib/invoice/types';
import { linkSecret } from '@/app/lib/links/token';
import { formatErrorForLog } from '@/app/lib/log-error';
import { PACK_EMAIL_FROM } from '@/app/lib/notify/accountant-job';
import { istClock } from '@/app/lib/notify/schedule';
import { retryAfterSeconds } from '@/app/lib/rate-limit';
import { siteOrigin } from '@/app/lib/site-origin';
import { getDb } from '@/db/client';
import { acceptInvite, clientsOf, customersView, grantFor, invite, inviteTarget, listAccess, logEvent, recentEvents, revoke } from '@/db/accountant-access';
import { getSettings } from '@/db/accountant';
import { buildPack } from '@/db/accountant-pack';
import { listCurrencies } from '@/db/collections';
import { getEntitlements } from '@/db/entitlements';
import { paymentsPage, registerPage } from '@/db/invoice-reports';
import { consumeRateLimits } from '@/db/rate-limits';

type Ctx = { params: Promise<{ action: string }> };
type DbT = Awaited<ReturnType<typeof getDb>>;
const NOT_FOUND = () => fail(404, 'not_found', 'We couldn’t find that.');
const SERVER_ERROR = (what: string) => fail(500, 'server_error', `We couldn’t ${what}. Try again in a moment.`);
const PAGE = 100;

async function businessName(db: DbT, userId: string, fallback: string): Promise<string> {
  const r = (await db.execute(sql`select name from business_profiles where user_id = ${userId}::uuid`)) as unknown as { rows: { name: string }[] };
  return r.rows[0]?.name?.trim() || fallback;
}

// ─── The owner ────────────────────────────────────────────────────────────────

async function owner(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return { res: user as Response, user: null, db: null, plan: false } as const;
  const db = await getDb();
  const plan = entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_csv_export');
  return { res: null, user, db, plan } as const;
}

export async function handleOwnerGET(req: Request): Promise<Response> {
  const o = await owner(req);
  if (o.res) return o.res;
  try {
    const [access, events] = await Promise.all([listAccess(o.db, o.user.id), recentEvents(o.db, o.user.id)]);
    return json({ ok: true, plan: o.plan, access, events, can: ACCESS_CAN, cannot: ACCESS_CANNOT });
  } catch (e) {
    console.error('[api/accountant-access]', formatErrorForLog(e));
    return SERVER_ERROR('load that');
  }
}

async function sendInvite(db: DbT, ownerUser: { id: string; email: string; name: string }, who: { name: string; email: string }): Promise<Response> {
  const r = await invite(db, ownerUser.id, linkSecret(), who);
  if (!r.ok) {
    return r.reason === 'already_active'
      ? fail(409, 'already_active', 'That person already has access.')
      : fail(409, 'too_many', 'You can have up to 5 accountants at once. End one first.');
  }
  const mail = inviteEmail({ accountantName: who.name, businessName: await businessName(db, ownerUser.id, ownerUser.name), url: `${siteOrigin()}/accountant/accept/${r.token}` });
  const sent = await sendEmailChecked({ to: who.email, ...mail, replyTo: ownerUser.email }, PACK_EMAIL_FROM);
  if (!sent.ok) return fail(sent.code === 'email_not_configured' ? 503 : 502, 'email_failed', 'We saved the invitation but couldn’t email it just now. Use “Send again” in a moment.');
  return json({ ok: true });
}

export async function handlePOST(req: Request, ctx?: Ctx): Promise<Response> {
  const { action } = await ctx!.params;
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req, 1_500)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  if (action === 'accept') return accept(req, body);
  const o = await owner(req);
  if (o.res) return o.res;
  // Ending access never needs Pro: a lapsed account can always shut the door. Inviting does.
  if (!o.plan && action !== 'revoke') return fail(403, 'not_allowed', 'Accountant access is part of Pro.');
  try {
    if (action === 'invite' || action === 'resend') {
      const rate = await consumeRateLimits(o.db, [{ key: `acc-invite:${o.user.id}`, limit: 10, windowSeconds: 3600 }]);
      if (!rate.allowed) return fail(429, 'rate_limited', `That’s a few too many invitations. Try again in ${Math.ceil(retryAfterSeconds(rate.resetAt) / 60)} minutes.`);
      if (action === 'resend') {
        if (typeof body.id !== 'string' || !isUuid(body.id)) return NOT_FOUND();
        const t = await inviteTarget(o.db, o.user.id, body.id);
        return t ? sendInvite(o.db, o.user, t) : NOT_FOUND();
      }
      const c = checkInvite(body.name, body.email, o.user.email);
      if (!c.ok) return fail(400, 'invalid', c.message);
      return sendInvite(o.db, o.user, { name: c.name, email: c.email });
    }
    if (action === 'revoke') {
      if (typeof body.id !== 'string' || !isUuid(body.id)) return NOT_FOUND();
      return (await revoke(o.db, o.user.id, body.id)) ? json({ ok: true }) : NOT_FOUND();
    }
    return NOT_FOUND();
  } catch (e) {
    console.error('[api/accountant-access]', formatErrorForLog(e));
    return SERVER_ERROR('do that');
  }
}

// ─── The accountant ───────────────────────────────────────────────────────────

async function accept(req: Request, body: Record<string, unknown>): Promise<Response> {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (typeof body.token !== 'string') return fail(404, 'not_found', 'That invitation has already been used or has expired.');
  try {
    const db = await getDb();
    const rate = await consumeRateLimits(db, [{ key: `acc-accept:${user.id}`, limit: 20, windowSeconds: 3600 }]);
    if (!rate.allowed) return fail(429, 'rate_limited', 'Too many tries. Please wait a while.');
    const v = (await db.execute(sql`select email_verified from auth_users where id = ${user.id}::uuid`)) as unknown as { rows: { email_verified: boolean }[] };
    const r = await acceptInvite(db, body.token, { id: user.id, email: user.email, emailVerified: v.rows[0]?.email_verified === true });
    if (r === 'ok') return json({ ok: true });
    if (r === 'wrong_account') return fail(403, 'wrong_account', 'This invitation is for a different email address. Sign in with the address it was sent to.');
    if (r === 'unverified') return fail(403, 'unverified', 'Verify your email address first, then use the link again.');
    return fail(404, 'not_found', 'That invitation has already been used or has expired.');
  } catch (e) {
    console.error('[api/accountant-access/accept]', formatErrorForLog(e));
    return SERVER_ERROR('accept that');
  }
}

/** Signed in, a live grant for this owner, and the owner still on Pro. Anything else is the same 404 (or 403 for a lapsed plan). */
async function reader(req: Request, ownerParam: string | null) {
  const user = await requireUser(req);
  if (user instanceof Response) return { res: user as Response } as const;
  if (!ownerParam || !isUuid(ownerParam)) return { res: NOT_FOUND() } as const;
  const db = await getDb();
  const rate = await consumeRateLimits(db, [{ key: `acc-read:${user.id}`, limit: 600, windowSeconds: 3600 }]);
  if (!rate.allowed) return { res: fail(429, 'rate_limited', 'That’s a lot at once. Try again in a little while.') } as const;
  const grant = await grantFor(db, user.id, ownerParam);
  if (!grant) return { res: NOT_FOUND() } as const;
  if (!entitlementsFrom(await getEntitlements(db, ownerParam)).can('invoice_csv_export')) {
    return { res: fail(403, 'plan_ended', 'This business’s plan no longer includes accountant access. Ask them.') } as const;
  }
  return { res: null, db, ownerId: ownerParam, grant } as const;
}

export async function handleGET(req: Request, ctx?: Ctx): Promise<Response> {
  const { action } = await ctx!.params;
  const q = new URL(req.url).searchParams;
  try {
    if (action === 'clients') {
      const user = await requireUser(req);
      if (user instanceof Response) return user;
      const db = await getDb();
      return json({ ok: true, clients: await clientsOf(db, user.id) });
    }
    if (action !== 'data' && action !== 'pack') return NOT_FOUND();
    const rd = await reader(req, q.get('owner'));
    if (rd.res) return rd.res;
    const { db, ownerId, grant } = rd;
    const today = istClock(new Date()).date;

    if (action === 'pack') {
      const p = periodOf(q.get('period') ?? previousMonth(today).period);
      if (!p || p.to >= today) return fail(400, 'invalid', 'Pick a month that has finished.');
      const s = await getSettings(db, ownerId);
      const built = await buildPack(db, ownerId, p.period, s?.sections ?? [...PACK_SECTIONS], today, grant.businessName);
      if (!built) return fail(400, 'invalid', 'Pick a month, like 2026-10.');
      await logEvent(db, ownerId, grant.accessId, 'downloaded', p.period);
      return new Response(built.zip as unknown as BodyInit, {
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${built.filename}"`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
      });
    }

    const view = q.get('view') ?? 'meta';
    const currencies = await listCurrencies(db, ownerId);
    if (view === 'meta') {
      await logEvent(db, ownerId, grant.accessId, 'viewed', 'overview');
      return json({ ok: true, businessName: grant.businessName, today, lastMonth: previousMonth(today), currencies: currencies.map((c) => c.code), can: ACCESS_CAN });
    }
    if (!isView(view)) return fail(400, 'invalid', 'Choose invoices, payments or customers.');
    const page = Math.max(1, Math.min(10_000, Math.floor(Number(q.get('page') ?? '1')) || 1));
    if (view === 'customers') {
      const c = await customersView(db, ownerId, page, PAGE);
      await logEvent(db, ownerId, grant.accessId, 'viewed', 'customers');
      return json({ ok: true, columns: ['Name', 'GSTIN', 'State code'], rows: c.rows.map((r) => [r.name, r.gstin, r.state]), matched: c.matched, page, pages: Math.max(1, Math.ceil(c.matched / PAGE)) });
    }
    const p = periodOf(q.get('period') ?? previousMonth(today).period);
    if (!p || p.from > today) return fail(400, 'invalid', 'Pick a month, like 2026-10.');
    const cur = q.get('currency') ?? currencies[0]?.code ?? 'INR';
    if (!(CURRENCIES as readonly string[]).includes(cur)) return fail(400, 'invalid', 'That currency isn’t one KaamSolv knows.');
    const query: ReportQuery = { report: view, currency: cur as CurrencyCode, today, from: p.from, to: p.to, includeVoided: false, page, pageSize: PAGE };
    const res = view === 'register' ? await registerPage(db, ownerId, query) : await paymentsPage(db, ownerId, query);
    await logEvent(db, ownerId, grant.accessId, 'viewed', `${view} ${p.period}`);
    return json({
      ok: true,
      columns: COLUMNS[view].map((c) => c.label),
      rows: view === 'register' ? (res.rows as Parameters<typeof registerCells>[0][]).map(registerCells) : (res.rows as Parameters<typeof paymentCells>[0][]).map(paymentCells),
      matched: res.matched,
      page,
      pages: Math.max(1, Math.ceil(res.matched / PAGE)),
    });
  } catch (e) {
    console.error('[api/accountant-access]', formatErrorForLog(e));
    return SERVER_ERROR('load that');
  }
}
