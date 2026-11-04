/**
 * Accountant Connect: the settings, confirming the accountant's address, the monthly pack's history, a preview, and
 * the downloads. Pro (`invoice_csv_export`, the same key as Reports & exports) except the accountant's own two public
 * steps, which are gated by a one-time or expiring token.
 *
 *   GET  /api/accountant                    settings, history, next delivery
 *   PUT  /api/accountant                    save settings (turning delivery on needs Pro and a confirmed address)
 *   POST /api/accountant/verify             email the accountant a one-time confirmation link
 *   POST /api/accountant/confirm            { token }  the accountant confirms (public)
 *   GET  /api/accountant/preview?period=    what a pack would hold (counts, file names), no email
 *   GET  /api/accountant/pack?period=       the owner downloads the ZIP (test run), no email
 *   GET  /api/accountant/download?t=        the accountant downloads the ZIP from the emailed link (public, expires)
 *   POST /api/accountant/retry              { packId }  try a failed delivery again
 *   POST /api/accountant/revoke             end every live pack link now
 *
 * Owner endpoints: signed in, own data only, same-site for changes. Responses are never cached and never logged.
 */

import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { checkAccountant, periodOf, previousMonth, verifyEmail, PACK_COVERAGE } from '@/app/lib/invoice/accountant';
import { sendEmailChecked } from '@/app/lib/email';
import { clientIp, hashIp, resolveIpHashSalt } from '@/app/lib/ip-hash';
import { linkSecret } from '@/app/lib/links/token';
import { formatErrorForLog } from '@/app/lib/log-error';
import { PACK_EMAIL_FROM } from '@/app/lib/notify/accountant-job';
import { istClock } from '@/app/lib/notify/schedule';
import { retryAfterSeconds } from '@/app/lib/rate-limit';
import { siteOrigin } from '@/app/lib/site-origin';
import { getDb } from '@/db/client';
import { buildPack } from '@/db/accountant-pack';
import { confirmVerification, getSettings, listPacks, nextFor, queuedThisMonth, resolvePackLink, retryPack, revokeLinks, saveSettings, startVerification } from '@/db/accountant';
import { getEntitlements } from '@/db/entitlements';
import { consumeRateLimits } from '@/db/rate-limits';

type Ctx = { params: Promise<{ action: string }> };
const SERVER_ERROR = (what: string) => fail(500, 'server_error', `We couldn’t ${what}. Try again in a moment.`);
const NO_PLAN = () => fail(403, 'not_allowed', 'Accountant Connect is part of Pro.');
const clock = () => {
  const c = istClock(new Date());
  return { date: c.date, hour: c.hour };
};

async function owner(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return { res: user as Response, user: null, db: null, plan: false } as const;
  const db = await getDb();
  const plan = entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_csv_export');
  return { res: null, user, db, plan } as const;
}

async function businessName(db: Awaited<ReturnType<typeof getDb>>, userId: string, fallback: string): Promise<string> {
  const { sql } = await import('drizzle-orm');
  const r = (await db.execute(sql`select name from business_profiles where user_id = ${userId}::uuid`)) as unknown as { rows: { name: string }[] };
  return r.rows[0]?.name?.trim() || fallback;
}

export async function handleRootGET(req: Request): Promise<Response> {
  const o = await owner(req);
  if (o.res) return o.res;
  try {
    const now = clock();
    const settings = await getSettings(o.db, o.user.id);
    const [packs, queued] = await Promise.all([listPacks(o.db, o.user.id), queuedThisMonth(o.db, o.user.id, now)]);
    return json({ ok: true, plan: o.plan, today: now.date, replyTo: o.user.email, settings, packs, next: settings?.enabled && settings.verified ? nextFor(settings, now, queued) : null, lastMonth: previousMonth(now.date), coverage: PACK_COVERAGE });
  } catch (e) {
    console.error('[api/accountant]', formatErrorForLog(e));
    return SERVER_ERROR('load that');
  }
}

export async function handleRootPUT(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const o = await owner(req);
  if (o.res) return o.res;
  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req, 2_000)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const check = checkAccountant({ name: body.name, email: body.email, enabled: body.enabled, day: body.day, hour: body.hour, sections: body.sections });
  if (!check.ok) return fail(400, 'invalid', check.message);
  try {
    // Switching the monthly pack off never needs Pro; switching it on (or changing it while on) does.
    if (!o.plan && check.value.enabled) return NO_PLAN();
    const before = await getSettings(o.db, o.user.id);
    const changed = !before || before.email !== check.value.email;
    // Sending needs an address its owner has confirmed; a new address starts unconfirmed and switched off.
    if (check.value.enabled && (changed || !before?.verified)) return fail(409, 'not_confirmed', 'Confirm your accountant’s email first. We’ll send them a link.');
    const r = await saveSettings(o.db, o.user.id, check.value);
    return json({ ok: true, addressChanged: r.addressChanged });
  } catch (e) {
    console.error('[api/accountant]', formatErrorForLog(e));
    return SERVER_ERROR('save that');
  }
}

export async function handlePOST(req: Request, ctx?: Ctx): Promise<Response> {
  const { action } = await ctx!.params;
  if (action === 'confirm') return confirm(req);
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const o = await owner(req);
  if (o.res) return o.res;
  // Ending the emailed links never needs Pro (a lapsed account can always shut them); everything else does.
  if (!o.plan && action !== 'revoke') return NO_PLAN();
  try {
    if (action === 'verify') {
      const rate = await consumeRateLimits(o.db, [{ key: `acc-verify:${o.user.id}`, limit: 5, windowSeconds: 3600 }]);
      if (!rate.allowed) return fail(429, 'rate_limited', `That’s a few too many. Try again in ${Math.ceil(retryAfterSeconds(rate.resetAt) / 60)} minutes.`);
      const s = await getSettings(o.db, o.user.id);
      if (!s || !s.email) return fail(409, 'no_address', 'Save your accountant’s name and email first.');
      if (s.verified) return json({ ok: true, alreadyConfirmed: true });
      const token = await startVerification(o.db, o.user.id, linkSecret());
      if (!token) return fail(409, 'no_address', 'Save your accountant’s name and email first.');
      const mail = verifyEmail({ accountantName: s.name, businessName: await businessName(o.db, o.user.id, o.user.name), url: `${siteOrigin()}/accountant/confirm/${token}` });
      const sent = await sendEmailChecked({ to: s.email, ...mail, replyTo: o.user.email }, PACK_EMAIL_FROM);
      if (!sent.ok) return fail(sent.code === 'email_not_configured' ? 503 : 502, 'email_failed', 'We couldn’t send the confirmation email just now. Try again in a moment.');
      return json({ ok: true });
    }
    if (action === 'retry' || action === 'revoke') {
      let body: { packId?: unknown } = {};
      try {
        body = ((await readJson(req, 500)) ?? {}) as typeof body;
      } catch {
        return fail(400, 'bad_request', 'That couldn’t be read.');
      }
      if (action === 'revoke') return json({ ok: true, ended: await revokeLinks(o.db, o.user.id) });
      if (typeof body.packId !== 'string' || !isUuid(body.packId)) return fail(400, 'invalid', 'That delivery isn’t valid.');
      const r = await retryPack(o.db, o.user.id, body.packId);
      if (r === 'not_found') return fail(404, 'not_found', 'We couldn’t find that delivery.');
      if (r === 'not_retryable') return fail(409, 'not_retryable', 'That one has already gone, or is still being sent.');
      return json({ ok: true });
    }
    return fail(404, 'not_found', 'Not found.');
  } catch (e) {
    console.error('[api/accountant]', formatErrorForLog(e));
    return SERVER_ERROR('do that');
  }
}

/** The accountant confirms their address with the one-time token from the email. A wrong or used token is one plain answer. */
async function confirm(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  let body: { token?: unknown };
  try {
    body = ((await readJson(req, 500)) ?? {}) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  try {
    const db = await getDb();
    const ip = await hashIp(clientIp(req.headers), resolveIpHashSalt());
    const rate = await consumeRateLimits(db, [{ key: `acc-confirm:${ip}`, limit: 20, windowSeconds: 3600 }]);
    if (!rate.allowed) return fail(429, 'rate_limited', 'Too many tries. Please wait a while and use the link again.');
    const ok = typeof body.token === 'string' && (await confirmVerification(db, body.token));
    return ok ? json({ ok: true }) : fail(404, 'not_found', 'That link has already been used or has expired. Ask your client to send a new one.');
  } catch (e) {
    console.error('[api/accountant/confirm]', formatErrorForLog(e));
    return SERVER_ERROR('confirm that');
  }
}

export async function handleGET(req: Request, ctx?: Ctx): Promise<Response> {
  const { action } = await ctx!.params;
  if (action === 'download') return download(req);
  const o = await owner(req);
  if (o.res) return o.res;
  if (!o.plan) return NO_PLAN();
  if (action !== 'preview' && action !== 'pack') return fail(404, 'not_found', 'Not found.');
  const now = clock();
  const period = periodOf(new URL(req.url).searchParams.get('period') ?? previousMonth(now.date).period);
  if (!period) return fail(400, 'invalid', 'Pick a month, like 2026-10.');
  if (period.to >= now.date) return fail(400, 'invalid', 'A pack covers a month that has finished.');
  try {
    const rate = await consumeRateLimits(o.db, [{ key: `acc-pack:${o.user.id}`, limit: 20, windowSeconds: 3600 }]);
    if (!rate.allowed) return fail(429, 'rate_limited', 'That’s a lot of packs at once. Try again in a little while.');
    const s = await getSettings(o.db, o.user.id);
    const built = await buildPack(o.db, o.user.id, period.period, s?.sections ?? ['register', 'tax_summary', 'payments', 'outstanding', 'ageing'], now.date, await businessName(o.db, o.user.id, o.user.name));
    if (!built) return fail(400, 'invalid', 'Pick a month, like 2026-10.');
    if (action === 'preview') return json({ ok: true, summary: built.summary, coverage: PACK_COVERAGE });
    return zip(built.zip, built.filename);
  } catch (e) {
    console.error('[api/accountant/pack]', formatErrorForLog(e));
    return SERVER_ERROR('build that');
  }
}

/** The emailed link: a token, an expiry, a rate limit. A wrong, expired or ended link is the same plain 404. */
async function download(req: Request) {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  try {
    const db = await getDb();
    const ip = await hashIp(clientIp(req.headers), resolveIpHashSalt());
    const rate = await consumeRateLimits(db, [{ key: `acc-dl:${ip}`, limit: 30, windowSeconds: 3600 }]);
    if (!rate.allowed) return new Response('Too many downloads. Try again later.', { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfterSeconds(rate.resetAt)) } });
    const link = await resolvePackLink(db, token);
    if (!link) return new Response('This link has expired or isn’t valid. Ask your client to send a new pack.', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    // The plan is checked again on every download: an old link stops working when Pro ends.
    if (!entitlementsFrom(await getEntitlements(db, link.userId)).can('invoice_csv_export')) {
      return new Response('This link is no longer available. Ask your client to send a new pack.', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    const s = await getSettings(db, link.userId);
    const built = await buildPack(db, link.userId, link.period, s?.sections ?? ['register', 'tax_summary', 'payments', 'outstanding', 'ageing'], clock().date, await businessName(db, link.userId, ''));
    if (!built) return new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return zip(built.zip, built.filename);
  } catch (e) {
    console.error('[api/accountant/download]', formatErrorForLog(e));
    return new Response('We couldn’t build that just now. Please try the link again in a moment.', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

function zip(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
