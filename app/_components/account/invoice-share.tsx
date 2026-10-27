'use client';

import { useEffect, useState } from 'react';
import { PRIMARY, SECONDARY } from './account-shell';

type Share = { url: string | null; views: number; lastViewedAt: string | null; whatsapp: { message: string; href: string; hasClientNumber: boolean } | null };

/**
 * Share one invoice: a private link, Share on WhatsApp (opens WhatsApp with the message filled in; you choose who
 * gets it and press send), Copy link, and Turn off. Anyone who has the link can open that one invoice until it is
 * turned off, and the page says so.
 */
export function InvoiceShare({ id }: { id: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoices/${id}/link`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: ({ ok: true } & Share) | null) => setShare(b ?? { url: null, views: 0, lastViewedAt: null, whatsapp: null }))
      .catch(() => setShare({ url: null, views: 0, lastViewedAt: null, whatsapp: null }));
  }, [id]);

  async function make(): Promise<Share | null> {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/invoices/${id}/link`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string } & Share) | null;
    setBusy(false);
    if (!res?.ok || !body?.url) {
      setNote(body?.message ?? 'We couldn’t make the link. Try again in a moment.');
      return null;
    }
    setShare(body);
    return body;
  }

  async function onWhatsApp() {
    const s = share?.url ? share : await make();
    if (s?.whatsapp) window.open(s.whatsapp.href, '_blank', 'noopener,noreferrer');
  }

  async function onCopy() {
    const s = share?.url ? share : await make();
    if (!s?.url) return;
    try {
      await navigator.clipboard.writeText(s.url);
      setNote('Link copied.');
    } catch {
      setNote('Couldn’t copy. Select the link and copy it.');
    }
  }

  async function onTurnOff() {
    setBusy(true);
    const res = await fetch(`/api/invoices/${id}/link`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setShare({ url: null, views: 0, lastViewedAt: null, whatsapp: null });
      setNote('Link turned off. Anyone who had it can no longer open the invoice.');
    } else setNote('We couldn’t turn the link off. Try again in a moment.');
  }

  if (!share) return <div className="h-24 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  return (
    <section aria-labelledby="share-h" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6" data-testid="invoice-share">
      <h2 id="share-h" className="font-display text-lg font-bold text-ink">
        Share this invoice
      </h2>
      <p className="mt-1 text-sm text-muted">A private link your client can open on their phone, with a PDF to download. Anyone who has the link can open this invoice until you turn it off.</p>

      {share.url && (
        <p className="mt-3 break-all rounded-xl border border-hair bg-wash px-3 py-2 text-sm font-semibold text-ink" data-testid="share-url">
          {share.url}
        </p>
      )}
      {share.url && share.views > 0 && (
        <p className="mt-1 text-xs text-muted">
          Opened {share.views} {share.views === 1 ? 'time' : 'times'}. Link previews in chat apps can count too.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={PRIMARY} disabled={busy} onClick={onWhatsApp} data-testid="share-whatsapp">
          Share on WhatsApp
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onCopy} data-testid="share-copy">
          Copy link
        </button>
        {share.url && (
          <button type="button" className={SECONDARY} disabled={busy} onClick={onTurnOff} data-testid="share-off">
            Turn link off
          </button>
        )}
      </div>
      {share.url && share.whatsapp && !share.whatsapp.hasClientNumber && <p className="mt-2 text-xs text-muted">No phone number saved for this client, so WhatsApp will ask who to send it to.</p>}
      {note && (
        <p role="status" className="mt-3 text-sm font-semibold text-strong" data-testid="share-note">
          {note}
        </p>
      )}
    </section>
  );
}
