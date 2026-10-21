'use client';

import { useRef, useState, type RefObject } from 'react';
import { Icon } from '@/app/_components/icons';
import { CopyButton } from '@/app/_components/copy-button';
import { DEFAULT_EXPIRY, EXPIRY_OPTIONS, type ExpiryOption } from '@/app/lib/link-expiry';

type Result = {
  shortUrl: string;
  shortCode: string;
  destination: string;
  /** ISO timestamp, or null when the link never expires. */
  expiresAt: string | null;
};

type FormState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: Result }
  | { status: 'invalid'; message: string }
  | { status: 'error'; kind: 'rate_limited' | 'server_error' | 'network'; message: string };

const GENERIC_INVALID = "That doesn't look like a valid URL. Check the link and try again.";
const GENERIC_RATE = "You've made quite a few requests. Try again in a little while.";
const GENERIC_ERROR = "We couldn't shorten that link. Please try again.";
const NETWORK_ERROR = "We couldn't reach KaamSolv. Check your connection and try again.";

export function ShortenForm() {
  const [url, setUrl] = useState('');
  // Kept across "Shorten another", so a batch of links can share one expiry.
  const [expiry, setExpiry] = useState<ExpiryOption>(DEFAULT_EXPIRY);
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLParagraphElement>(null);

  const submitting = state.status === 'submitting';
  const invalid = state.status === 'invalid';
  const bannerError = state.status === 'error' ? state : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value || submitting) return;
    setState({ status: 'submitting' });

    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, expiresIn: expiry }),
      });
      const data: unknown = await res.json().catch(() => null);
      const d = data as
        | (Result & { ok: true })
        | { ok: false; message?: string }
        | null;

      if (res.ok && d && d.ok) {
        setState({ status: 'success', result: d });
        requestAnimationFrame(() => resultHeadingRef.current?.focus());
        return;
      }
      const message = (d && 'message' in d && d.message) || undefined;
      if (res.status === 400) {
        setState({ status: 'invalid', message: message ?? GENERIC_INVALID });
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (res.status === 429) {
        setState({ status: 'error', kind: 'rate_limited', message: message ?? GENERIC_RATE });
      } else {
        setState({ status: 'error', kind: 'server_error', message: message ?? GENERIC_ERROR });
      }
    } catch {
      setState({ status: 'error', kind: 'network', message: NETWORK_ERROR });
    }
  }

  function reset() {
    setState({ status: 'idle' });
    setUrl('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (state.status === 'success') {
    return <ShortResult result={state.result} onReset={reset} headingRef={resultHeadingRef} />;
  }

  return (
    <form onSubmit={onSubmit} aria-busy={submitting || undefined} noValidate>
      <label htmlFor="shorten-url" className="block text-sm font-semibold text-ink">
        Paste your long URL
      </label>

      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          id="shorten-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://your-long-link.example.com/very/long/path"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (state.status !== 'idle') setState({ status: 'idle' });
          }}
          onKeyDown={(e) => {
            // Belt-and-suspenders: some environments don't fire implicit form
            // submission on Enter for a single-input form.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={submitting}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'shorten-error' : 'shorten-help'}
          className={`h-12 w-full rounded-lg border bg-fieldbg px-4 text-sm text-ink placeholder:text-faint focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60 ${
            invalid ? 'border-danger-400 bg-danger-50' : 'border-hair'
          }`}
        />
        <button
          type="submit"
          disabled={submitting || url.trim().length === 0}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-coral-500 px-7 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
        >
          {submitting ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Shortening…
            </>
          ) : (
            'Shorten URL'
          )}
        </button>
      </div>

      {invalid ? (
        <p id="shorten-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-danger-700">
          <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
          {state.message}
        </p>
      ) : (
        <p id="shorten-help" className="mt-2 text-xs text-muted">
          Free to use. No sign-up. We shorten http and https links.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="shorten-expiry" className="text-xs font-semibold text-muted">
          Link expires
        </label>
        <select
          id="shorten-expiry"
          name="expiresIn"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
          disabled={submitting}
          className="h-10 rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60"
        >
          {EXPIRY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {bannerError && (
        <div
          role="alert"
          className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            bannerError.kind === 'rate_limited'
              ? 'border-yellow-300 bg-yellowx-100'
              : 'border-danger-200 bg-danger-50'
          }`}
        >
          <Icon
            name="alert-triangle"
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              bannerError.kind === 'rate_limited' ? 'text-yellowx-600' : 'text-danger-600'
            }`}
          />
          <div>
            <p className="font-semibold text-ink">
              {bannerError.kind === 'rate_limited' ? 'Slow down a moment' : "That didn't work"}
            </p>
            <p className="mt-0.5 text-strong">{bannerError.message}</p>
          </div>
        </div>
      )}
    </form>
  );
}

function ShortResult({
  result,
  onReset,
  headingRef,
}: {
  result: Result;
  onReset: () => void;
  headingRef: RefObject<HTMLParagraphElement | null>;
}) {
  // Shown and copied without the scheme — it's the shortest form, and chat
  // apps, email and social posts turn `kaamsolv.com/abc` into a link anyway.
  // The full https:// form stays one click away for fields that require it.
  const shortLink = result.shortUrl.replace(/^https?:\/\//, '');

  return (
    <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-5 sm:p-6">
      <p
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-1.5 text-sm font-semibold text-tealx-600 outline-none"
      >
        <Icon name="check" className="h-4 w-4 shrink-0" />
        Your short link is ready. Bas.
      </p>

      <div className="mt-3 flex h-12 items-center gap-1 rounded-lg border border-hair bg-surface pl-3 pr-1">
        <input
          readOnly
          value={shortLink}
          aria-label="Your short link"
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-ink outline-none sm:text-base"
        />
        <CopyButton value={shortLink} iconOnlyOnMobile />
      </div>

      <p className="mt-2 truncate text-xs text-muted" title={result.destination}>
        Goes to {result.destination}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="clock" className="h-3.5 w-3.5 shrink-0" />
        {result.expiresAt ? (
          <span>
            Expires <time dateTime={result.expiresAt}>{formatExpiry(result.expiresAt)}</time>
          </span>
        ) : (
          <span>Never expires</span>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hair bg-surface px-3 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          <Icon name="scissors" className="h-4 w-4" />
          Shorten another
        </button>
        <CopyButton value={result.shortUrl} label="Copy with https://" copiedLabel="Copied" />
      </div>
      <p className="mt-2 text-xs text-muted">
        Most apps turn the short form into a link. Use the https:// version for website forms or
        other QR code makers.
      </p>

      <p className="mt-4 border-t border-teal-300 pt-3 text-xs text-muted">
        Anyone with this link goes straight to your original URL. Saved links and click stats are
        coming soon.
      </p>
    </div>
  );
}

/** e.g. "18 Sept 2026, 3:45 pm" — in the viewer's own timezone. */
function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
