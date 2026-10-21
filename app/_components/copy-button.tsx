'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * Copy-to-clipboard with a brief confirmation. Shared — any tool result
 * card can use it. Falls back to a hidden textarea + execCommand where the
 * async Clipboard API is unavailable (older Safari, insecure contexts).
 */
export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = '',
  iconOnlyOnMobile = false,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  /** Below `sm`, show only the icon (label stays for screen readers) — for tight rows. */
  iconOnlyOnMobile?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = legacyCopy(value);
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
        copied
          ? 'border-teal-300 bg-tealx-100 text-tealx-600'
          : 'border-hair bg-surface text-strong hover:bg-wash'
      } ${className}`}
    >
      <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
      <span className={iconOnlyOnMobile ? 'max-sm:sr-only' : undefined}>{copied ? copiedLabel : label}</span>
    </button>
  );
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
