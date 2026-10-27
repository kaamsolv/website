/**
 * GET    /api/me  — who is signed in, what they may do, how many invoices saved.
 *                   { signedIn: false } for visitors. Never returns the logo or
 *                   any invoice data.
 * DELETE /api/me  — delete the account and everything in it. Body:
 *                   { "confirm": "DELETE" } (the UI asks the user to type it).
 */

import { NO_ENTITLEMENTS } from '@/app/lib/entitlements';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { getCurrentUser } from '@/app/lib/session';
import { getDb } from '@/db/client';
import { deleteAccount, holdsSalesInvoices } from '@/db/accounts';
import { countQr } from '@/db/qr';
import { getEntitlements } from '@/db/entitlements';
import { countInvoices } from '@/db/invoices';
import { countCustomers } from '@/db/directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser(req.headers);
  if (!user) return json({ signedIn: false, entitlements: NO_ENTITLEMENTS });
  const db = await getDb();
  const [entitlements, saved, customers, qrCodes] = await Promise.all([getEntitlements(db, user.id), countInvoices(db, user.id), countCustomers(db, user.id), countQr(db, user.id)]);
  return json({
    signedIn: true,
    user: { id: user.id, email: user.email, name: user.name },
    entitlements,
    usage: { invoiceSave: saved, customers, qrCodes },
  });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await readJson(req, 1_000);
  } catch {
    body = null;
  }
  if ((body as { confirm?: unknown })?.confirm !== 'DELETE') {
    return fail(400, 'confirm_required', 'Type DELETE to confirm.');
  }
  // The account that issues KaamSolv's own invoices is the accounting record: deleting it would delete them.
  const db = await getDb();
  const seller = process.env.BILLING_SELLER_EMAIL?.trim().toLowerCase();
  if ((seller && user.email.toLowerCase() === seller) || (await holdsSalesInvoices(db, user.id))) {
    return fail(409, 'billing_account', 'This account issues KaamSolv’s own invoices, so it can’t be deleted here.');
  }
  await deleteAccount(db, user.id, user.email);
  // The session row is gone with the user; clear the cookie too.
  const res = json({ ok: true });
  for (const name of ['kk.session_token', '__Secure-kk.session_token', 'kk.session_data', '__Secure-kk.session_data']) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return res;
}
