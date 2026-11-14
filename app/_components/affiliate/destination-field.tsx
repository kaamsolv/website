'use client';

import { useEffect, useRef, useState } from 'react';
import { INPUT, PRIMARY } from '@/app/_components/account/account-shell';
import { useInfo } from '@/app/_components/calc/info-tip';
import { Notice } from '@/app/_components/notice';
import { LINK_DESTINATION_MAX } from '@/app/lib/affiliate/link';

const INFO =
  'This is the page visitors land on when they use an affiliate’s link, usually your store’s home page. Every affiliate link goes to this one address, and KaamSolv adds ?ref=their-code to the end of it. Until you add it, links open your programme page instead.';

/**
 * "Where do affiliate links lead?" The programme's destination, saved on its own (/app/affiliate/portal). One address
 * for the whole programme: a link can't be pointed anywhere else.
 */
export function DestinationField({ disabled }: { disabled?: boolean }) {
  const info = useInfo(INFO);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Once the person has typed, a saved value that arrives late must never replace what they typed.
  const typed = useRef(false);

  useEffect(() => {
    fetch('/api/affiliate/destination', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((b: { destination?: string }) => {
        if (!typed.current) setValue(b.destination ?? '');
        setSaved(b.destination ?? '');
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/affiliate/destination', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination: value }),
      });
      const b = (await res.json()) as { ok: boolean; message?: string; destination?: string };
      if (!res.ok) {
        setState('idle');
        return setError(b.message ?? 'We couldn’t save that. Try again in a moment.');
      }
      setValue(b.destination ?? '');
      setSaved(b.destination ?? '');
      setState('saved');
    } catch {
      setState('idle');
      setError('We couldn’t reach KaamSolv. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-3 rounded-xl2 border border-hair bg-surface p-4" noValidate data-testid="destination-form">
      <div className="flex items-center gap-2">
        <label htmlFor="m-destination" className="text-sm font-bold text-ink">
          Where affiliate links lead
        </label>
        {info.button}
      </div>
      {info.note}
      <input
        id="m-destination"
        type="url"
        inputMode="url"
        className={INPUT}
        value={value}
        maxLength={LINK_DESTINATION_MAX}
        placeholder="https://yourstore.com"
        disabled={disabled || !loaded}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby="m-destination-hint"
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          typed.current = true;
          setValue(e.target.value);
          setState('idle');
          setError(null);
        }}
      />
      <p id="m-destination-hint" className="text-xs text-muted">
        Destination address, https only. Leave it blank for now if you’re not ready.
      </p>
      {error && <Notice role="alert">{error}</Notice>}
      {state === 'saved' && (
        <Notice tone="info" role="status">
          Saved.{' '}
          {saved ? (
            <a href={saved} target="_blank" rel="noopener noreferrer" className="font-bold underline">
              Open it to check it works
            </a>
          ) : (
            'Links will open your programme page.'
          )}
        </Notice>
      )}
      <button type="submit" className={PRIMARY} disabled={disabled || state === 'saving' || !loaded}>
        {state === 'saving' ? 'Saving…' : 'Save destination'}
      </button>
    </form>
  );
}
