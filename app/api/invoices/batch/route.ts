/**
 * POST /api/invoices/batch — save several invoices at once (Pro:
 * invoice_batch_csv). Body: { invoices: Invoice[] } (at most 50). Each is
 * re-checked with cleanInvoice here, and numbered in order from the account's
 * sequence — whatever number the browser sent is ignored. Saved one at a time:
 * the answer lists which were created and which weren't.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { BATCH_MAX } from '@/app/lib/invoice/batch';
import { cleanInvoice, MAX_ITEMS_ANY_PLAN } from '@/app/lib/invoice/validate';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';
import { createBatch } from '@/db/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = await getDb();
  const ent = entitlementsFrom(await getEntitlements(db, user.id));
  if (!ent.can('invoice_batch_csv')) return fail(403, 'not_allowed', 'Making invoices from a CSV is part of Pro.');

  let body: { invoices?: unknown };
  try {
    body = (await readJson(req, 3_000_000)) as typeof body;
  } catch {
    return fail(400, 'bad_request', 'That file couldn’t be read.');
  }
  const list = body?.invoices;
  if (!Array.isArray(list) || list.length === 0) return fail(400, 'invalid', 'There’s nothing to create.');
  if (list.length > BATCH_MAX) return fail(400, 'too_many', `Up to ${BATCH_MAX} invoices at a time. Split the file and run it again.`);

  const docs = [];
  for (let i = 0; i < list.length; i++) {
    const cleaned = cleanInvoice(list[i], {
      maxItems: MAX_ITEMS_ANY_PLAN,
      allowQuote: false,
      allowDesign: ent.can('invoice_templates') || ent.can('invoice_brand_color'),
    });
    if (!cleaned.ok) return fail(400, 'invalid', `Invoice ${i + 1}: ${cleaned.message}`);
    docs.push(cleaned.invoice);
  }
  const result = await createBatch(db, user.id, docs, ent.limit('invoice_save'));
  return json({ ok: result.failed.length === 0, ...result }, result.created.length ? 201 : 403);
}
