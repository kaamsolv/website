'use client';

import { useCallback, useEffect, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from '@/app/_components/account/account-shell';
import { useInfo } from '@/app/_components/calc/info-tip';
import { CopyButton } from '@/app/_components/copy-button';
import { Notice } from '@/app/_components/notice';
import { Skeleton } from '@/app/_components/skeleton';
import { STORE_NOTE, WOO_DISABLE_NOTE, WOO_STEPS } from '@/app/lib/affiliate/orders';
import { ago } from './order-bits';

type Connection = { webhookUrl: string; secret: string | null; lastReceivedAt: string | null; ordersRecorded: number; ambiguousOrders: number };
type View = { configured: boolean; connection: Connection | null };

const SECRET_NOTE =
  'A password only your store and KaamSolv know. WooCommerce uses it to sign every order it sends, and KaamSolv ignores anything that isn’t signed with it. Keep it to yourself. If it ever leaks, change it here and paste the new one into both webhooks.';
const URL_NOTE = 'Where WooCommerce sends each order. It is unique to your business; don’t share it.';

/**
 * Connect a WooCommerce store (portal settings). Shows the webhook address and secret to paste into WooCommerce, plain
 * steps, how to switch a stopped webhook back on, and whether the store has been heard from.
 */
export function StoreConnection() {
  const storeInfo = useInfo(STORE_NOTE);
  const urlInfo = useInfo(URL_NOTE);
  const secretInfo = useInfo(SECRET_NOTE);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [confirming, setConfirming] = useState<'rotate' | 'disconnect' | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/affiliate/store', { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 404) return setView({ configured: true, connection: null });
    if (!res.ok) throw new Error('load');
    setView((await res.json()) as View);
  }, []);
  useEffect(() => {
    load().catch(() => setError('Couldn’t load your store connection. Refresh to try again.'));
  }, [load]);

  async function act(action: 'connect' | 'rotate' | 'disconnect') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/affiliate/store', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const b = (await res.json().catch(() => ({}))) as View & { message?: string };
      if (!res.ok) setError(b.message ?? 'We couldn’t save that. Try again in a moment.');
      else {
        setView({ configured: b.configured, connection: b.connection });
        setConfirming(null);
        setShowSecret(false);
      }
    } catch {
      setError('We couldn’t reach KaamSolv. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const conn = view?.connection ?? null;
  return (
    <section aria-labelledby="store-title" className="space-y-3 rounded-xl2 border border-hair bg-surface p-4" data-testid="store-connection">
      <div className="flex items-center gap-2">
        <h2 id="store-title" className="font-display text-lg font-extrabold text-ink">
          Store connection
        </h2>
        {storeInfo.button}
      </div>
      {storeInfo.note}
      <p className="text-sm text-muted">Connect your WooCommerce store so KaamSolv can record the orders that use an affiliate’s coupon code.</p>

      {error && <Notice role="alert">{error}</Notice>}

      {view === null && !error && <Skeleton className="h-24" />}

      {view && !view.configured && (
        <Notice tone="info" role="status">
          Store connection isn’t switched on yet. It will be soon.
        </Notice>
      )}

      {view && view.configured && !conn && (
        <button type="button" className={PRIMARY} disabled={busy} onClick={() => act('connect')} data-testid="store-connect">
          {busy ? 'Connecting…' : 'Connect my store'}
        </button>
      )}

      {conn && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-ink" data-testid="store-status">
            {conn.lastReceivedAt ? `Last order received ${ago(conn.lastReceivedAt)}. ${conn.ordersRecorded.toLocaleString('en-IN')} recorded.` : 'Waiting for the first order from your store.'}
          </p>

          <div>
            <div className="flex items-center gap-2">
              <label htmlFor="store-url" className="text-sm font-bold text-ink">
                Webhook address
              </label>
              {urlInfo.button}
            </div>
            {urlInfo.note}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input id="store-url" readOnly className={`${INPUT} min-w-0 flex-1 basis-56`} value={conn.webhookUrl} onFocus={(e) => e.currentTarget.select()} data-testid="store-url" />
              <CopyButton value={conn.webhookUrl} label="Copy address" copiedLabel="Copied" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <label htmlFor="store-secret" className="text-sm font-bold text-ink">
                Secret
              </label>
              {secretInfo.button}
            </div>
            {secretInfo.note}
            {conn.secret ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input id="store-secret" readOnly type={showSecret ? 'text' : 'password'} className={`${INPUT} min-w-0 flex-1 basis-56 font-mono`} value={conn.secret} autoComplete="off" onFocus={(e) => e.currentTarget.select()} data-testid="store-secret" />
                <button type="button" className={SECONDARY} aria-pressed={showSecret} onClick={() => setShowSecret((s) => !s)}>
                  {showSecret ? 'Hide' : 'Show'}
                </button>
                <CopyButton value={conn.secret} label="Copy secret" copiedLabel="Copied" />
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">The secret isn’t available right now. Try again soon.</p>
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-ink">In WooCommerce</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-strong" data-testid="store-steps">
              {WOO_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <Notice tone="info" role="status">
            {WOO_DISABLE_NOTE}
          </Notice>

          {conn.ambiguousOrders > 0 && (
            <Notice tone="info" role="status">
              <span data-testid="store-ambiguous">
                {conn.ambiguousOrders.toLocaleString('en-IN')} order{conn.ambiguousOrders === 1 ? '' : 's'} used more than one affiliate’s coupon, so {conn.ambiguousOrders === 1 ? 'it was' : 'they were'} credited to nobody.
              </span>
            </Notice>
          )}

          {confirming ? (
            <div className="space-y-2 rounded-xl border border-hair bg-wash p-3" role="alertdialog" aria-labelledby="store-confirm">
              <p id="store-confirm" className="text-sm font-semibold text-ink">
                {confirming === 'rotate'
                  ? 'Change the secret? The old one stops working straight away, and you’ll need to paste the new one into both webhooks in WooCommerce.'
                  : 'Disconnect your store? Orders stop being recorded. The orders already recorded stay.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={PRIMARY} disabled={busy} onClick={() => act(confirming)}>
                  {confirming === 'rotate' ? 'Change secret' : 'Disconnect'}
                </button>
                <button type="button" className={SECONDARY} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={SECONDARY} onClick={() => setConfirming('rotate')}>
                Change secret…
              </button>
              <button type="button" className={SECONDARY} onClick={() => setConfirming('disconnect')}>
                Disconnect…
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
