/**
 * GET /api/affiliate/merchant — the signed-in owner's merchant (or null) with its portal address.
 * PUT /api/affiliate/merchant — create it (needs `slug`) or update it. Body: { slug?, name, programmeName,
 *                               programmeDescription, terms, brandColour, logo }. Brand fields are replaced whole.
 *
 * The merchant is always the signed-in user's own: no merchant id is ever read from the request, and every
 * read and write goes through db/merchant-scope.ts. The slug is fixed once created.
 */

import { checkSlug, cleanMerchantInput, portalPath, type MerchantView } from '@/app/lib/affiliate/merchant';
import { overLimit } from '@/app/lib/affiliate/server';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { getDb } from '@/db/client';
import { createMerchant, merchantForOwner, merchantScope, type OwnerMerchant } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const shape = ({ id: _id, ...m }: OwnerMerchant): MerchantView & { portalPath: string } => ({ ...m, portalPath: portalPath(m.slug) });

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const m = await merchantForOwner(await getDb(), user.id);
    return json({ ok: true, merchant: m ? shape(m) : null });
  } catch (e) {
    console.error('[api/affiliate/merchant GET]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load your programme. Try again in a moment.');
  }
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'Those details couldn’t be read.');
  }
  const clean = cleanMerchantInput(body);
  if (!clean.ok) return fail(400, clean.error, clean.message);

  try {
    const db = await getDb();
    const limited = await overLimit(db, [{ action: 'affiliateMerchantEdit', who: user.id }], 'That’s a lot of changes. Try again in a little while.');
    if (limited) return limited;
    const current = await merchantForOwner(db, user.id);
    if (!current) {
      const slug = checkSlug(body.slug);
      if (!slug.ok) return fail(400, slug.error, slug.message);
      const made = await createMerchant(db, user.id, { slug: slug.slug, ...clean.value });
      if (!made.ok) {
        return made.error === 'slug_taken'
          ? fail(409, 'slug_taken', 'That address is taken. Try another.')
          : fail(409, 'already_has_merchant', 'You already have a programme. Refresh to edit it.');
      }
    } else {
      if (typeof body.slug === 'string' && body.slug.trim().toLowerCase() !== current.slug) {
        return fail(400, 'slug_locked', 'The address can’t change once it’s made, so links you’ve shared keep working.');
      }
      await merchantScope(db, current.id).savePortal(clean.value.name, clean.value.brand, user.id);
    }
    const saved = await merchantForOwner(db, user.id);
    return json({ ok: true, merchant: saved ? shape(saved) : null });
  } catch (e) {
    console.error('[api/affiliate/merchant PUT]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
