'use client';

import { useState } from 'react';
import { INPUT, PRIMARY } from '@/app/_components/account/account-shell';
import { Notice } from '@/app/_components/notice';
import { PORTAL_REPORT_DETAILS_MAX, PORTAL_REPORT_LABELS, PORTAL_REPORT_REASONS } from '@/app/lib/affiliate/report';

const INVALID = 'aria-invalid:border-danger-700 aria-invalid:ring-1 aria-invalid:ring-danger-700';

/** "Report this page": what is wrong, and optionally a few words. The merchant is not told who reported. */
export function ReportForm({ slug, merchantName }: { slug: string; merchantName: string }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [fieldError, setFieldError] = useState<{ field: 'reason' | 'details'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason) {
      setFieldError({ field: 'reason', message: 'Choose what is wrong with this page.' });
      document.getElementById('r-reason')?.focus();
      return;
    }
    setFieldError(null);
    setState('sending');
    try {
      const res = await fetch('/api/affiliate/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, reason, details, website2: trap }),
      });
      const b = (await res.json()) as { ok: boolean; message?: string; field?: 'reason' | 'details' };
      if (!res.ok) {
        setState('idle');
        if (b.field === 'reason' || b.field === 'details') {
          setFieldError({ field: b.field, message: b.message ?? 'Check this field.' });
          document.getElementById(b.field === 'reason' ? 'r-reason' : 'r-details')?.focus();
          return;
        }
        return setError(b.message ?? 'We couldn’t send that. Try again in a moment.');
      }
      setState('sent');
    } catch {
      setState('idle');
      setError('We couldn’t reach KaamSolv. Check your connection and try again.');
    }
  }

  if (state === 'sent') {
    return (
      <Notice tone="info" role="status" className="mt-5" >
        Thanks. We’ll look at this page. We don’t tell {merchantName} who reported it.
      </Notice>
    );
  }

  const reasonBad = fieldError?.field === 'reason';
  const detailsBad = fieldError?.field === 'details';
  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
      <div>
        <label htmlFor="r-reason" className="block text-sm font-bold text-ink">
          What is wrong?
        </label>
        <select
          id="r-reason"
          className={`${INPUT} ${INVALID} mt-1 pr-8`}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setFieldError(null);
          }}
          aria-invalid={reasonBad ? true : undefined}
          aria-describedby={reasonBad ? 'r-reason-error' : undefined}
        >
          <option value="">Choose one</option>
          {PORTAL_REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {PORTAL_REPORT_LABELS[r]}
            </option>
          ))}
        </select>
        {reasonBad && (
          <p id="r-reason-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger-700">
            <span aria-hidden="true" className="font-bold">!</span>
            <span>{fieldError!.message}</span>
          </p>
        )}
      </div>

      <div>
        <label htmlFor="r-details" className="block text-sm font-bold text-ink">
          Anything we should know? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="r-details"
          rows={4}
          className={`${INPUT} ${INVALID} mt-1`}
          value={details}
          maxLength={PORTAL_REPORT_DETAILS_MAX}
          onChange={(e) => {
            setDetails(e.target.value);
            setFieldError(null);
          }}
          aria-invalid={detailsBad ? true : undefined}
          aria-describedby={detailsBad ? 'r-details-error' : 'r-details-count'}
        />
        <p id="r-details-count" className="mt-1 text-xs text-muted">
          {details.length} / {PORTAL_REPORT_DETAILS_MAX}
        </p>
        {detailsBad && (
          <p id="r-details-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger-700">
            <span aria-hidden="true" className="font-bold">!</span>
            <span>{fieldError!.message}</span>
          </p>
        )}
      </div>

      {/* Bot trap: people never see or fill this. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="r-trap">Leave this empty</label>
        <input id="r-trap" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      {error && <Notice role="alert">{error}</Notice>}
      <button type="submit" className={PRIMARY} disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send report'}
      </button>
    </form>
  );
}
