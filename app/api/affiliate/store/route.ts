/**
 * GET  /api/affiliate/store — the signed-in owner's store connection: the webhook address and secret to paste into
 *                             WooCommerce, when it last heard from the store, and how many orders it has recorded.
 * POST /api/affiliate/store — { action: 'connect' | 'rotate' | 'disconnect' }.
 *
 * Always the signed-in user's own merchant (db/merchant-scope.ts); no merchant id is read from the request. The secret
 * is derived on request from AFFILIATE_WEBHOOK_MASTER and the connection, never stored, and only ever sent to the
 * owner, with no-store. A suspended business can't connect or rotate.
 */

import { SUSPENDED_OWNER_MESSAGE } from '@/app/lib/affiliate/merchant';
import { deriveWebhookSecret } from '@/app/lib/affiliate/orders';
import { overLimit } from '@/app/lib/affiliate/server';
import { webhookMaster, webhookPath } from '@/app/lib/affiliate/woo-secret';
import { fail, json, readJson, requireUser, sameOrigin } from '@/app/lib/api-response';
import { formatErrorForLog } from '@/app/lib/log-error';
import { siteOrigin } from '@/app/lib/site-origin';
import { connectStore, connectionFor, disconnectStore, rotateStoreSecret } from '@/db/affiliate-orders';
import { getDb } from '@/db/client';
import type { Db } from '@/db/links';
import { merchantForOwner } from '@/db/merchant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noMerchant = () => fail(404, 'no_merchant', 'Set up your portal first.');
const NOT_ON = 'Store connection isn’t switched on yet. Try again soon.';

async function view(db: Db, merchantId: string, req: Request) {
  const master = webhookMaster();
  const connection = await connectionFor(db, merchantId);
  if (!connection) return { configured: master !== null, connection: null };
  const origin = process.env.NODE_ENV === 'production' ? siteOrigin() : new URL(req.url).origin;
  return {
    configured: master !== null,
    connection: {
      webhookUrl: `${origin}${webhookPath(connection.id)}`,
      secret: master ? await deriveWebhookSecret(master, connection.id, connection.secretVersion) : null,
      lastReceivedAt: connection.lastReceivedAt,
      ordersRecorded: connection.ordersRecorded,
      ambiguousOrders: connection.ambiguousOrders,
    },
  };
}

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return noMerchant();
    return json({ ok: true, ...(await view(db, m.id, req)) });
  } catch (e) {
    console.error('[api/affiliate/store GET]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t load that. Try again in a moment.');
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'forbidden', 'That request didn’t come from KaamSolv.');
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  let action: unknown;
  try {
    action = ((await readJson(req, 1_000)) as { action?: unknown } | null)?.action;
  } catch {
    return fail(400, 'bad_request', 'That couldn’t be read.');
  }
  if (action !== 'connect' && action !== 'rotate' && action !== 'disconnect') return fail(400, 'bad_action', 'Unknown action.');
  try {
    const db = await getDb();
    const m = await merchantForOwner(db, user.id);
    if (!m) return noMerchant();
    if (m.status === 'suspended' && action !== 'disconnect') return fail(403, 'suspended', SUSPENDED_OWNER_MESSAGE);
    if (action !== 'disconnect' && webhookMaster() === null) return fail(503, 'not_configured', NOT_ON);
    const limited = await overLimit(db, [{ action: 'affiliateMerchantEdit', who: user.id }], 'That’s a lot of changes. Try again in a little while.');
    if (limited) return limited;
    if (action === 'connect') await connectStore(db, m.id, user.id);
    else if (action === 'rotate') {
      if (!(await rotateStoreSecret(db, m.id, user.id))) return fail(409, 'no_connection', 'Connect your store first.');
    } else await disconnectStore(db, m.id, user.id);
    return json({ ok: true, ...(await view(db, m.id, req)) });
  } catch (e) {
    console.error('[api/affiliate/store POST]', formatErrorForLog(e));
    return fail(500, 'server_error', 'We couldn’t save that. Try again in a moment.');
  }
}
