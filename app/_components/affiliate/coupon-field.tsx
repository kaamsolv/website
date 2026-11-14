'use client';

import { useState } from 'react';
import { INPUT, SECONDARY } from '@/app/_components/account/account-shell';
import { useInfo } from '@/app/_components/calc/info-tip';
import { Notice } from '@/app/_components/notice';
import { COUPON_MAX, COUPON_NOTE } from '@/app/lib/affiliate/orders';

/**
 * The WooCommerce coupon code that credits one approved affiliate (on the business's Applications page). Saved on its
 * own. Blank takes it off. A code belongs to the first affiliate it is given to.
 */
export function CouponField({ applicationId, current, disabled, onChanged }: { applicationId: string; current: string; disabled?: boolean; onChanged: () => void }) {
  const info = useInfo(COUPON_NOTE);
  const [value, setValue] = useState(current);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const id = `coupon-${applicationId}`;
  const changed = value.trim().toUpperCase() !== current;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/affiliate/coupon', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId, code: value }),
      });
      const b = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      if (!res.ok) {
        setState('idle');
        return setError(b.message ?? 'We couldn’t save that. Try again in a moment.');
      }
      setValue(b.code ?? '');
      setState('saved');
      onChanged();
    } catch {
      setState('idle');
      setError('We couldn’t reach KaamSolv. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={save} className="mt-3 rounded-xl border border-hair bg-wash p-3" noValidate data-testid="coupon-form">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-bold text-ink">
          Their coupon code
        </label>
        {info.button}
      </div>
      {info.note}
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <input
          id={id}
          className={`${INPUT} min-w-0 flex-1 basis-40 uppercase`}
          value={value}
          maxLength={COUPON_MAX + 8}
          placeholder="For example ASHA10"
          disabled={disabled}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setState('idle');
            setError(null);
          }}
        />
        <button type="submit" className={SECONDARY} disabled={disabled || state === 'saving' || !changed}>
          {state === 'saving' ? 'Saving…' : value.trim() === '' && current ? 'Remove code' : 'Save code'}
        </button>
      </div>
      {error && (
        <div id={`${id}-error`} className="mt-2">
          <Notice role="alert">{error}</Notice>
        </div>
      )}
      {state === 'saved' && !error && (
        <p className="mt-2 text-sm text-strong" role="status">
          {value ? `Saved. Orders that use ${value} are credited to them from now.` : 'Code removed.'}
        </p>
      )}
    </form>
  );
}
