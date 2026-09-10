'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

type Pref = 'light' | 'dark' | 'system';

const KEY = 'kaamkit-theme';
const OPTIONS: { value: Pref; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

function apply(pref: Pref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  // Render 'system' on the server and first paint; the inline head script
  // has already set the real theme, so nothing flashes — we just sync the
  // control's highlighted state once we're on the client.
  const [pref, setPref] = useState<Pref>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as Pref | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') setPref(stored);
    } catch {
      /* storage blocked — stay on system */
    }
    setReady(true);
  }, []);

  function choose(next: Pref) {
    setPref(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-full border border-hair bg-surface p-0.5 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const active = ready && pref === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${opt.label} theme`}
            title={`${opt.label} theme`}
            onClick={() => choose(opt.value)}
            className={`grid h-8 w-8 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
              active
                ? 'bg-activebg text-activetext'
                : 'text-muted hover:text-ink hover:bg-wash'
            }`}
          >
            <Icon name={opt.icon} className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
