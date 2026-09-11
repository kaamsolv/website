'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/app/_components/icons';
import {
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
} from '@/app/lib/report';

// Same field treatment as the shortener form and the QR tool (DESIGN-SYSTEM §11).
const INPUT =
  'h-12 w-full rounded-lg border bg-fieldbg px-4 text-sm text-ink placeholder:text-faint focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';
const TEXTAREA =
  'min-h-[7rem] w-full resize-y rounded-lg border border-hair bg-fieldbg px-4 py-3 text-sm text-ink placeholder:text-faint focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';
const LABEL = 'block text-sm font-semibold text-ink';
const ERROR = 'mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger-700';

type FormState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'invalid'; field: 'link' | 'reason'; message: string }
  | { status: 'error'; kind: 'rate_limited' | 'server_error' | 'network'; message: string };

const GENERIC_ERROR = "We couldn't send your report. Please try again.";
const NETWORK_ERROR = "We couldn't reach KaamKit. Check your connection and try again.";

export function ReportForm() {
  const [link, setLink] = useState('');
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const linkRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLFieldSetElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const submitting = state.status === 'submitting';
  const fieldError = state.status === 'invalid' ? state : null;
  const banner = state.status === 'error' ? state : null;

  function clearErrors() {
    if (state.status === 'invalid' || state.status === 'error') setState({ status: 'idle' });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Quick client-side nudges; the server is the real validator.
    if (!link.trim()) {
      setState({ status: 'invalid', field: 'link', message: 'Paste the short link you want to report.' });
      requestAnimationFrame(() => linkRef.current?.focus());
      return;
    }
    if (!reason) {
      setState({ status: 'invalid', field: 'reason', message: "Choose what's wrong with the link." });
      requestAnimationFrame(() => reasonRef.current?.querySelector('input')?.focus());
      return;
    }

    setState({ status: 'submitting' });
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, reason, details, website }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; field?: 'link' | 'reason'; message?: string }
        | null;

      if (res.ok && data?.ok) {
        setState({ status: 'success' });
        requestAnimationFrame(() => doneRef.current?.focus());
        return;
      }
      const message = (data && 'message' in data && data.message) || GENERIC_ERROR;
      if (res.status === 400 && data && 'field' in data && data.field) {
        setState({ status: 'invalid', field: data.field, message });
        requestAnimationFrame(() =>
          data.field === 'reason'
            ? reasonRef.current?.querySelector('input')?.focus()
            : linkRef.current?.focus(),
        );
      } else if (res.status === 429) {
        setState({ status: 'error', kind: 'rate_limited', message });
      } else {
        setState({ status: 'error', kind: 'server_error', message });
      }
    } catch {
      setState({ status: 'error', kind: 'network', message: NETWORK_ERROR });
    }
  }

  function reset() {
    setLink('');
    setReason('');
    setDetails('');
    setState({ status: 'idle' });
    requestAnimationFrame(() => linkRef.current?.focus());
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-5 sm:p-6">
        <h2
          ref={doneRef}
          tabIndex={-1}
          className="flex items-center gap-1.5 text-sm font-semibold text-tealx-600 outline-none"
        >
          <Icon name="check" className="h-4 w-4 shrink-0" />
          Thanks — we&apos;ll take a look.
        </h2>
        <p className="mt-2 text-sm text-strong">
          We review every report. If the link breaks our rules, we&apos;ll switch it off.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-hair bg-surface px-3 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          <Icon name="flag" className="h-4 w-4" />
          Report another link
        </button>
      </div>
    );
  }

  const linkInvalid = fieldError?.field === 'link';
  const reasonInvalid = fieldError?.field === 'reason';

  return (
    <form onSubmit={onSubmit} aria-busy={submitting || undefined} noValidate>
      <label htmlFor="report-link" className={LABEL}>
        Short link
      </label>
      <input
        ref={linkRef}
        id="report-link"
        name="link"
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="kaamkit.com/abc1234"
        value={link}
        onChange={(e) => {
          setLink(e.target.value);
          clearErrors();
        }}
        disabled={submitting}
        aria-invalid={linkInvalid || undefined}
        aria-describedby={linkInvalid ? 'report-link-error' : undefined}
        className={`mt-1.5 ${INPUT} ${linkInvalid ? 'border-danger-400 bg-danger-50' : 'border-hair'}`}
      />
      {linkInvalid && (
        <p id="report-link-error" role="alert" className={ERROR}>
          <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
          {fieldError.message}
        </p>
      )}

      <fieldset
        ref={reasonRef}
        className="mt-6"
        aria-invalid={reasonInvalid || undefined}
        aria-describedby={reasonInvalid ? 'report-reason-error' : undefined}
      >
        <legend className={LABEL}>What&apos;s wrong with it?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {REPORT_REASONS.map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-fieldbg px-3 py-2.5 text-sm text-ink transition-colors hover:bg-wash has-checked:border-coral-500 has-checked:bg-coralx-100 has-focus-visible:ring-2 has-focus-visible:ring-coral-500 ${
                reasonInvalid ? 'border-danger-400' : 'border-hair'
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => {
                  setReason(value);
                  clearErrors();
                }}
                disabled={submitting}
                className="h-4 w-4 shrink-0 accent-coral-500 focus-visible:outline-none"
              />
              {REPORT_REASON_LABELS[value]}
            </label>
          ))}
        </div>
        {reasonInvalid && (
          <p id="report-reason-error" role="alert" className={ERROR}>
            <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
            {fieldError.message}
          </p>
        )}
      </fieldset>

      <label htmlFor="report-details" className={`mt-6 ${LABEL}`}>
        Anything else we should know? <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="report-details"
        name="details"
        rows={3}
        maxLength={MAX_REPORT_DETAILS}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        disabled={submitting}
        aria-describedby="report-details-count"
        className={`mt-1.5 ${TEXTAREA}`}
      />
      <p id="report-details-count" className="mt-1 text-right text-xs text-muted">
        {details.length} / {MAX_REPORT_DETAILS}
      </p>

      {/* Honeypot: off-screen and out of the tab order; people never fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="report-website">Website</label>
        <input
          id="report-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-coral-500 px-7 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
      >
        {submitting ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
            Sending…
          </>
        ) : (
          <>
            <Icon name="flag" className="h-4 w-4" />
            Send report
          </>
        )}
      </button>

      {banner && (
        <div
          role="alert"
          className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            banner.kind === 'rate_limited' ? 'border-yellow-300 bg-yellowx-100' : 'border-danger-200 bg-danger-50'
          }`}
        >
          <Icon
            name="alert-triangle"
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              banner.kind === 'rate_limited' ? 'text-yellowx-600' : 'text-danger-600'
            }`}
          />
          <div>
            <p className="font-semibold text-ink">
              {banner.kind === 'rate_limited' ? 'Slow down a moment' : "That didn't work"}
            </p>
            <p className="mt-0.5 text-strong">{banner.message}</p>
          </div>
        </div>
      )}
    </form>
  );
}
