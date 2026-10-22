/**
 * GET /api/settings — business details, getting paid, invoice defaults, logo
 *                     and the next invoice number (same shape as
 *                     /api/business-profile, which stays for the editor).
 * PUT /api/settings — save the Settings page. Body: Settings (+ optional logo:
 *                     a data URL, or null to remove). 400 with `errors` keyed
 *                     by field when something doesn't check out.
 */

import { cleanSettings } from '@/app/lib/invoice/settings';
import { formatSequentialNumber } from '@/app/lib/invoice/validate';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { DEFAULT_SETTINGS, getProfile, isAcceptableLogo, saveProfile, saveSettings, saveSignature } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const profile = await getProfile(await getDb(), user.id);
  return json({ ok: true, settings: profile ?? { ...DEFAULT_SETTINGS, logo: null, signature: null, nextNumber: formatSequentialNumber(1) } });
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request', 'Those settings couldn’t be read.');
  }
  const cleaned = cleanSettings(body);
  if (!cleaned.ok) return json({ ok: false, error: 'invalid', message: 'Check the highlighted fields.', errors: cleaned.errors }, 400);
  if ('logo' in body && body.logo !== null && !isAcceptableLogo(body.logo)) {
    return json({ ok: false, error: 'invalid', message: 'Check the highlighted fields.', errors: { logo: 'That logo is too big to save. Try a smaller image.' } }, 400);
  }
  if ('signature' in body && body.signature !== null && !isAcceptableLogo(body.signature)) {
    return json({ ok: false, error: 'invalid', message: 'Check the highlighted fields.', errors: { signature: 'That signature image is too big to save. Try a smaller image.' } }, 400);
  }

  const db = await getDb();
  await saveSettings(db, user.id, cleaned.value);
  if ('logo' in body) {
    const s = cleaned.value;
    await saveProfile(db, user.id, { name: s.name, address: s.address, email: s.email, phone: s.phone, logo: (body.logo as string | null) ?? null });
  }
  if ('signature' in body) await saveSignature(db, user.id, (body.signature as string | null) ?? null);
  return json({ ok: true });
}
