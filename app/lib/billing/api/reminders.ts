/**
 * Customer payment reminders and the collections follow-up, for one invoice (Invoice Pro).
 *
 *   GET  /api/invoices/<id>/reminders   the reminders for this invoice (with their state), whether a new one may be
 *                                       sent now (and why not), the promise and the pause
 *   POST /api/invoices/<id>/reminders   { note? } send a reminder now · { retry: "<reminderId>" } try a stuck one again
 *   PUT  /api/invoices/<id>/followup    { promisedOn: "YYYY-MM-DD", note? } record a promise · { promisedOn: null } clear it ·
 *                                       { paused: boolean } pause or resume scheduled reminders
 *
 *   GET/PUT /api/invoices/reminder-settings   scheduled reminders: on/off and the days after the due date
 *
 * Signed in, the owner's own invoice only (another account's id is the same 404 as a missing one), same-site for
 * changes. Sending and scheduling need the `invoice_reminders` entitlement; promises need `invoice_dashboard`.
 * Both are checked here on the server, whatever the page shows. The "today" used is India's, from the server clock.
 */

import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { checkSchedule, MAX_REMINDER_NOTE, reminderEligibility, SKIP_TEXT, DAILY_REMINDER_LIMIT } from '@/app/lib/invoice/reminders';
import { formatErrorForLog } from '@/app/lib/log-error';
import { istClock } from '@/app/lib/notify/schedule';
import { retryAfterSeconds } from '@/app/lib/rate-limit';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { clearPromise, getFollowup, listPromises, setPromise, setRemindersPaused } from '@/db/followups';
import { consumeRateLimits } from '@/db/rate-limits';
import { getReminderSettings, listReminders, reminderFacts, remindersToday, requestManualReminder, retryReminder, saveReminderSettings } from '@/db/reminders';

type Ctx = { params: Promise<{ id: string }> };
const NOT_FOUND = () => fail(404, 'not_found', 'We couldn’t find that invoice.');
const SERVER_ERROR = (what: string) => fail(500, 'server_error', `We couldn’t ${what}. Try again in a moment.`);

export async function handleGET(req: Request, ctx?: Ctx) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx!.params;
  if (!isUuid(id)) return NOT_FOUND();
  try {
    const db = await getDb();
    const ent = entitlementsFrom(await getEntitlements(db, user.id));
    const today = istClock(new Date()).date;
    const facts = await reminderFacts(db, user.id, id);
    if (!facts) return NOT_FOUND();
    const allowedPlan = ent.can('invoice_reminders');
    const e = reminderEligibility(facts, today, false);
    const [reminders, followup, usedToday] = await Promise.all([listReminders(db, user.id, id), getFollowup(db, user.id, id, today), remindersToday(db, user.id, today)]);
    const canSend = allowedPlan && e.ok && usedToday < DAILY_REMINDER_LIMIT;
    const why = !allowedPlan ? SKIP_TEXT.no_plan : !e.ok ? SKIP_TEXT[e.reason] : usedToday >= DAILY_REMINDER_LIMIT ? `You’ve reached today’s limit of ${DAILY_REMINDER_LIMIT} reminders. It resets at midnight India time.` : null;
    return json({
      ok: true,
      today,
      currency: facts.currency,
      plan: allowedPlan,
      canSend,
      why,
      outstanding: e.ok ? e.outstanding : 0,
      // Shown in the confirmation, so the owner knows exactly who gets it.
      to: allowedPlan && e.ok ? facts.email.trim() : null,
      replyTo: user.email,
      reminders,
      followup,
      promisesAllowed: ent.can('invoice_dashboard'),
    });
  } catch (e) {
    console.error('[api/invoices/reminders]', formatErrorForLog(e));
    return SERVER_ERROR('load reminders');
  }
}

export async function handlePOST(req: Request, ctx?: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx!.params;
  if (!isUuid(id)) return NOT_FOUND();
  let body: { note?: unknown; retry?: unknown };
  try {
    body = ((await readJson(req, 2_000)) ?? {}) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  try {
    const db = await getDb();
    if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_reminders')) return fail(403, 'not_allowed', 'Payment reminders are part of Pro.');
    const limit = await consumeRateLimits(db, [{ key: `reminder:${user.id}`, limit: 10, windowSeconds: 60 }]);
    if (!limit.allowed) return fail(429, 'rate_limited', `Slow down a little. Try again in ${retryAfterSeconds(limit.resetAt)} seconds.`);

    if (body.retry !== undefined) {
      if (typeof body.retry !== 'string' || !isUuid(body.retry)) return fail(400, 'invalid', 'That reminder isn’t valid.');
      const r = await retryReminder(db, user.id, body.retry);
      if (r === 'not_found') return fail(404, 'not_found', 'We couldn’t find that reminder.');
      if (r === 'not_retryable') return fail(409, 'not_retryable', 'That reminder has already gone, or is still being sent.');
      return json({ ok: true, retried: true });
    }

    let note = '';
    if (body.note !== undefined) {
      if (typeof body.note !== 'string' || body.note.length > MAX_REMINDER_NOTE) return fail(400, 'invalid', `Keep your note under ${MAX_REMINDER_NOTE} characters.`);
      note = body.note;
    }
    const r = await requestManualReminder(db, user.id, id, istClock(new Date()).date, note);
    if (!r.ok) {
      if (r.reason === 'not_found') return NOT_FOUND();
      if (r.reason === 'daily_limit') return fail(429, 'daily_limit', `You’ve reached today’s limit of ${DAILY_REMINDER_LIMIT} reminders. It resets at midnight India time.`);
      return fail(409, r.reason, SKIP_TEXT[r.reason]);
    }
    return json({ ok: true, reminderId: r.reminderId, alreadyQueued: r.alreadyQueued });
  } catch (e) {
    console.error('[api/invoices/reminders]', formatErrorForLog(e));
    return SERVER_ERROR('queue that reminder');
  }
}

export async function handleFollowupPUT(req: Request, ctx?: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx!.params;
  if (!isUuid(id)) return NOT_FOUND();
  let body: { promisedOn?: unknown; note?: unknown; paused?: unknown };
  try {
    body = (await readJson(req, 2_000)) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  try {
    const db = await getDb();
    const ent = entitlementsFrom(await getEntitlements(db, user.id));
    const today = istClock(new Date()).date;
    if (typeof body?.paused === 'boolean') {
      if (!ent.can('invoice_reminders')) return fail(403, 'not_allowed', 'Payment reminders are part of Pro.');
      return (await setRemindersPaused(db, user.id, id, body.paused)) ? json({ ok: true, paused: body.paused }) : NOT_FOUND();
    }
    if (!ent.can('invoice_dashboard')) return fail(403, 'not_allowed', 'Payment promises are part of Pro.');
    if (body?.promisedOn === null) return (await clearPromise(db, user.id, id)) ? json({ ok: true, cleared: true }) : NOT_FOUND();
    const r = await setPromise(db, user.id, id, body?.promisedOn, body?.note, today);
    if (r.ok) return json({ ok: true });
    if (r.reason === 'not_found') return NOT_FOUND();
    if (r.reason === 'not_open') return fail(409, 'not_open', 'Nothing is owed on this invoice, so there’s no payment to promise.');
    return fail(400, 'invalid', r.message ?? 'That date isn’t valid.');
  } catch (e) {
    console.error('[api/invoices/followup]', formatErrorForLog(e));
    return SERVER_ERROR('save that');
  }
}

export async function handleSettingsGET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const plan = entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_reminders');
    return json({ ok: true, plan, ...(await getReminderSettings(db, user.id)), replyTo: user.email, dailyLimit: DAILY_REMINDER_LIMIT });
  } catch (e) {
    console.error('[api/invoices/reminder-settings]', formatErrorForLog(e));
    return SERVER_ERROR('load your settings');
  }
}

export async function handleSettingsPUT(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let body: { enabled?: unknown; days?: unknown };
  try {
    body = (await readJson(req, 1_000)) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  if (typeof body?.enabled !== 'boolean') return fail(400, 'invalid', 'Choose on or off.');
  const days = checkSchedule(body.days);
  if (!days.ok) return fail(400, 'invalid', days.message);
  try {
    const db = await getDb();
    // Turning it on needs Pro; turning it off never does (a lapsed account can always stop its reminders).
    if (body.enabled && !entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_reminders')) return fail(403, 'not_allowed', 'Scheduled reminders are part of Pro.');
    await saveReminderSettings(db, user.id, { enabled: body.enabled, days: days.days });
    return json({ ok: true, enabled: body.enabled, days: days.days });
  } catch (e) {
    console.error('[api/invoices/reminder-settings]', formatErrorForLog(e));
    return SERVER_ERROR('save that');
  }
}

/** GET /api/invoices/promises — open invoices with a promised date, missed ones first (Pro: invoice_dashboard, like collections). */
export async function handlePromisesGET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    if (!entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_dashboard')) return fail(403, 'not_allowed', 'Payments & collections is part of Pro.');
    const today = istClock(new Date()).date;
    return json({ ok: true, today, promises: await listPromises(db, user.id, today) });
  } catch (e) {
    console.error('[api/invoices/promises]', formatErrorForLog(e));
    return SERVER_ERROR('load promises');
  }
}
