/**
 * /api/notifications/prefs — whether to get the receivables summary by email, and how often.
 *
 *   GET  { summaryCadence: 'off' | 'weekly' | 'monthly', available }   `available` = the account has the plan that includes it
 *   PUT  { summaryCadence }                                            turning it ON needs that plan; turning it OFF never does
 *
 * Signed in, same-site for changes. Nothing is sent unless an account turns it on here, and it goes only to the
 * account's own email address.
 */

import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { entitlementsFrom } from '@/app/lib/entitlements';
import { isCadence } from '@/app/lib/notify/schedule';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { getSummaryCadence, setSummaryCadence } from '@/db/notifications';

export async function handleGET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const available = entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_dashboard');
    return json({ ok: true, summaryCadence: await getSummaryCadence(db, user.id), available });
  } catch (e) {
    console.error('[api/notifications/prefs]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load your settings. Try again in a moment.');
  }
}

export async function handlePUT(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let body: { summaryCadence?: unknown };
  try {
    body = (await readJson(req, 1_000)) as typeof body;
  } catch {
    return fail(400, 'invalid', 'Choose off, weekly or monthly.');
  }
  if (!isCadence(body?.summaryCadence)) return fail(400, 'invalid', 'Choose off, weekly or monthly.');
  try {
    const db = await getDb();
    if (body.summaryCadence !== 'off' && !entitlementsFrom(await getEntitlements(db, user.id)).can('invoice_dashboard')) {
      return fail(403, 'not_allowed', 'The receivables summary is part of Pro.');
    }
    await setSummaryCadence(db, user.id, body.summaryCadence);
    return json({ ok: true, summaryCadence: body.summaryCadence });
  } catch (e) {
    console.error('[api/notifications/prefs]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
