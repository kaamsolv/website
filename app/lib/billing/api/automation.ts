/**
 * /api/invoices/<id>/automation — make a recurring invoice create itself (Invoice Pro: invoice_recurring).
 *
 *   GET  the schedule, the automation (on/paused/ended, end date, run count) and the last runs
 *   PUT  { autoCreate, paused?, endsOn?, maxRuns? }   turning it on needs a schedule (set through /recurring) and Pro;
 *                                                     turning it off or pausing never needs Pro
 *
 * Signed in, the owner's own invoice only (another account's id is the same 404), same-site for changes. The
 * invoice made each period is a plain copy; nothing is emailed or shared automatically.
 */

import { fail, isUuid, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { checkAutoSettings } from '@/app/lib/invoice/recurring-auto';
import { formatErrorForLog } from '@/app/lib/log-error';
import { istClock } from '@/app/lib/notify/schedule';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { getAutomation, saveAutomation } from '@/db/recurring-auto';

type Ctx = { params: Promise<{ id: string }> };
const NOT_FOUND = () => fail(404, 'not_found', 'We couldn’t find that invoice.');

export async function handleGET(req: Request, ctx?: Ctx) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx!.params;
  if (!isUuid(id)) return NOT_FOUND();
  try {
    const db = await getDb();
    const a = await getAutomation(db, user.id, id);
    if (!a) return NOT_FOUND();
    const plan = entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_recurring');
    return json({ ok: true, today: istClock(new Date()).date, plan, ...a });
  } catch (e) {
    console.error('[api/invoices/automation]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load that. Try again in a moment.');
  }
}

export async function handlePUT(req: Request, ctx?: Ctx) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx!.params;
  if (!isUuid(id)) return NOT_FOUND();
  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req, 1_000)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  const check = checkAutoSettings(body, istClock(new Date()).date);
  if (!check.ok) return fail(400, 'invalid', check.message);
  try {
    const db = await getDb();
    if (check.value.autoCreate && !check.value.paused && !entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_recurring')) {
      return fail(403, 'not_allowed', 'Repeating invoices is part of Pro.');
    }
    const r = await saveAutomation(db, user.id, id, check.value);
    if (!r.ok) return r.reason === 'no_schedule' ? fail(409, 'no_schedule', 'Set how often this invoice repeats first.') : NOT_FOUND();
    return json({ ok: true });
  } catch (e) {
    console.error('[api/invoices/automation]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
