/**
 * POST /api/affiliate/apply — { slug, displayName, website?, message?, openedAt, website2 } a signed-in person applies
 * to one merchant's programme. The merchant approves by hand; there is no auto-approval.
 *
 * Checks, in order: same-origin, verified sign-in, the cheap bot checks (a hidden field and a minimum fill time: a
 * tripped check looks like success and stores nothing), rate limits per person, per device and per merchant, then the
 * single statement in db/affiliate-scope.ts that refuses closed, own, duplicate and cooling-off cases.
 */

import { after } from 'next/server';
import { APPLY_BLOCK_MESSAGES, botCheck, cleanApplication } from '@/app/lib/affiliate/application';
import { overLimit } from '@/app/lib/affiliate/server';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { DRAIN_AFTER_REQUEST, drainOutbox } from '@/app/lib/billing/jobs';
import { clientIp } from '@/app/lib/ip-hash';
import { formatErrorForLog } from '@/app/lib/log-error';
import { affiliateScope } from '@/db/affiliate-scope';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req, 10_000)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'Those details couldn’t be read.');
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().slice(0, 60) : '';
  if (!slug) return fail(400, 'bad_request', 'Those details couldn’t be read.');

  const bot = botCheck(body);
  if (!bot.ok) return json({ ok: true });

  const clean = cleanApplication(body);
  if (!clean.ok) return json({ ok: false, error: clean.error, message: clean.message, field: clean.field }, 400);

  try {
    const db = await getDb();
    const limited = await overLimit(
      db,
      [
        { action: 'affiliateApplyUser', who: user.id },
        { action: 'affiliateApplyIp', who: clientIp(req.headers) },
        { action: 'affiliateApplyMerchant', who: `merchant:${slug}` },
      ],
      'That’s a lot of applications. Try again in a little while.',
    );
    if (limited) return limited;

    const me = affiliateScope(db, user.id);
    const state = await me.registrationState(slug);
    if (state === null) return fail(404, 'not_found', APPLY_BLOCK_MESSAGES.not_found);
    await me.saveProfile({ displayName: clean.value.displayName, website: clean.value.website });
    const { category, channel, country } = clean.value;
    const result = await me.apply(slug, clean.value.message, { category, channel, country });
    if (!result.ok) return fail(409, result.block, APPLY_BLOCK_MESSAGES[result.block]);
    // The "application received" email was queued with the application; send it now rather than at the next schedule.
    after(() => drainOutbox(DRAIN_AFTER_REQUEST).catch((e) => console.error('[api/affiliate/apply drain]', formatErrorForLog(e))));
    return json({ ok: true });
  } catch (e) {
    console.error('[api/affiliate/apply]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t send that. Try again in a moment.');
  }
}
