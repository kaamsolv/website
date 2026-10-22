/**
 * GET /api/business-profile — Settings (seller details, payment details,
 *                              defaults), the logo, and the next invoice number.
 *                              With /api/settings, the only endpoints that return the logo.
 * PUT /api/business-profile — save them. Body: { name, address, email, phone, logo }.
 */

import { MAX_LEN } from '@/app/lib/invoice/limits';
import { formatSequentialNumber } from '@/app/lib/invoice/validate';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { DEFAULT_SETTINGS, getProfile, isAcceptableLogo, saveProfile } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const profile = await getProfile(await getDb(), user.id);
  return json({
    ok: true,
    profile: profile ?? { ...DEFAULT_SETTINGS, logo: null, signature: null, nextNumber: formatSequentialNumber(1) },
  });
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
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (body.logo !== null && body.logo !== undefined && !isAcceptableLogo(body.logo)) {
    return fail(400, 'bad_logo', 'That logo is too big to save. Try a smaller image (PNG, JPG or WebP).');
  }
  await saveProfile(await getDb(), user.id, {
    name: text(body.name, MAX_LEN.name),
    address: text(body.address, MAX_LEN.address),
    email: text(body.email, MAX_LEN.email),
    phone: text(body.phone, MAX_LEN.phone),
    logo: (body.logo as string | null | undefined) ?? null,
  });
  return json({ ok: true });
}
