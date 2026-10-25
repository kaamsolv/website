'use client';

import { useEffect, useRef, useState } from 'react';
import type { QrDesign } from '@/app/lib/qr/design';
import { hasLogo } from '@/app/lib/qr/design';
import { cleanTrackablePayload, isTrackableKind, QR_NAME_MAX } from '@/app/lib/qr/tracking';
import type { QrPayload } from '@/app/lib/qr/types';
import { refreshMe, useEntitlements, useMe } from '@/app/lib/me-client';

/** A saved tracked code the studio is now showing: the short link, and the exact link it was saved for. */
export type TrackedState = { shortUrl: string; forText: string; name: string; id: string };

const INPUT =
  'h-11 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const BTN =
  'inline-flex h-11 items-center justify-center rounded-full bg-coral-500 px-5 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60';

function suggestName(payload: QrPayload, canonicalText: string): string {
  switch (payload.kind) {
    case 'whatsapp':
      return 'WhatsApp chat';
    case 'social':
      return `${payload.platform[0].toUpperCase()}${payload.platform.slice(1)} profile`;
    case 'file':
      return payload.label.trim() || 'File link';
    default:
      try {
        return new URL(canonicalText).hostname.replace(/^www\./, '');
      } catch {
        return 'My QR code';
      }
  }
}

/**
 * "Count scans" for link-type QR codes (URL, WhatsApp, Social, File). Signed
 * out it only offers a free sign-in; signed in it saves the code, and the QR
 * then encodes the short link `kaamsolv.com/{code}` — the studio does the rest.
 * For those four the panel is always there — signed out it offers sign-in, signed
 * in the Save button is present and disabled (with the reason) until the link is
 * valid. Other types (Wi-Fi, Location, vCard…) show nothing: a phone reads them
 * directly, so there is nothing to redirect and nothing to count.
 */
export function TrackPanel({
  payload,
  canonicalText,
  design,
  tracked,
  onTracked,
}: {
  payload: QrPayload;
  /** The exact https link this QR leads to, or null while the fields are empty or invalid. */
  canonicalText: string | null;
  design: QrDesign;
  tracked: TrackedState | null;
  onTracked: (t: TrackedState) => void;
}) {
  const me = useMe();
  const { can, limit } = useEntitlements();
  const [name, setName] = useState('');
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKind = useRef(payload.kind);

  // Offer a sensible name until the person types their own.
  useEffect(() => {
    if (lastKind.current !== payload.kind) {
      lastKind.current = payload.kind;
      setEdited(false);
    }
    if (!edited && canonicalText) setName(suggestName(payload, canonicalText));
  }, [payload, canonicalText, edited]);

  if (!isTrackableKind(payload.kind)) return null;

  const current = tracked && canonicalText && tracked.forText === canonicalText;
  const changed = tracked && tracked.forText !== canonicalText;

  if (me.status === 'loading') return null;
  if (me.status !== 'signed-in') {
    return (
      <section aria-labelledby="track-h" className="mt-5 rounded-xl border border-dashed border-hair p-4 sm:mt-6">
        <h3 id="track-h" className="text-sm font-semibold text-ink">
          Want to know how many people scan this?
        </h3>
        <p className="mt-1 text-sm text-muted">
          <a href="/login?next=%2Fqr-code-generator" className="font-semibold text-ink underline underline-offset-2 hover:text-coral-600">
            Sign in (it’s free)
          </a>{' '}
          to count scans. The QR works the same either way.
        </p>
      </section>
    );
  }

  const max = limit('qr_dynamic');
  const used = me.usage.qrCodes;
  const atLimit = max !== null && used >= max;

  async function save() {
    setBusy(true);
    setError(null);
    const clean = cleanTrackablePayload(payload);
    const res = await fetch('/api/qr', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, payload: clean, design }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { id?: string; shortUrl?: string; message?: string } | undefined;
    setBusy(false);
    if (!res?.ok || !body?.shortUrl || !body.id) {
      setError(body?.message ?? 'Couldn’t save that. Check your connection and try again.');
      return;
    }
    onTracked({ shortUrl: body.shortUrl, forText: canonicalText!, name, id: body.id });
    void refreshMe();
  }

  return (
    <section aria-labelledby="track-h" className="mt-5 rounded-xl border border-hair p-4 sm:mt-6">
      <h3 id="track-h" className="text-sm font-semibold text-ink">
        Count scans
      </h3>

      {current ? (
        <div role="status" className="mt-2 space-y-2 text-sm">
          <p className="font-semibold text-ink">Tracked. Download your QR below — it now points through {tracked.shortUrl.replace(/^https?:\/\//, '')}.</p>
          <p className="text-muted">
            People who scan it still land on your link. See the count any time in{' '}
            <a href={`/app/qr/${tracked.id}`} className="font-semibold text-ink underline underline-offset-2 hover:text-coral-600">
              its page
            </a>
            .
          </p>
          {hasLogo(design) && <p className="text-muted">Your logo isn’t kept with the saved code (the QR itself is the same). Add it again if you download a copy later.</p>}
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Your QR will point to a short KaamSolv link that sends people on to yours, so you can see how many scanned it.
            {max !== null && ` You’re tracking ${used} of ${max}.`}
          </p>
          {changed && (
            <p role="status" className="mt-2 text-sm font-semibold text-ink">
              You changed the link — save again to track the new one. The one you saved before stays in All QR codes.
            </p>
          )}
          {atLimit && (
            <p role="status" className="mt-3 text-sm text-ink">
              You’re tracking {max} QR codes — the free limit. Your codes keep working.{' '}
              <a href="/app/qr/codes" className="font-semibold underline underline-offset-2">
                Open All QR codes
              </a>{' '}
              to delete one.
            </p>
          )}
          {/* The button is always here for a link-type code; until it can work it is disabled and says what's missing. */}
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canonicalText && !atLimit) void save();
            }}
          >
            <label className="block min-w-0 flex-1 basis-56 text-sm font-semibold text-ink">
              Name it, so you can find it
              <input
                value={name}
                maxLength={QR_NAME_MAX}
                disabled={atLimit}
                onChange={(e) => {
                  setName(e.target.value);
                  setEdited(true);
                }}
                className={`${INPUT} mt-1 disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !canonicalText || atLimit || !name.trim() || !can('qr_dynamic')}
              aria-describedby={canonicalText ? undefined : 'track-hint'}
              className={BTN}
            >
              {busy ? 'Saving…' : 'Save tracked QR'}
            </button>
          </form>
          {!canonicalText && (
            <p id="track-hint" className="mt-2 text-sm text-muted">
              Finish the details above first — then you can save it and count scans.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger-600">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
