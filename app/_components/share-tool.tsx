'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { WHATSAPP_BUTTON } from './whatsapp-style';

/**
 * "Pass it on" card shown under every tool. WhatsApp first (it is how most people here share a useful link), then
 * copy link, and the phone's own share sheet where the browser has one. Nothing is sent to KaamSolv: the buttons only
 * open WhatsApp with a message filled in, copy the page address, or call the browser's share. The address is the plain
 * page URL, with no tracking parameters.
 */
export function ShareTool({ name, blurb, url }: { name: string; blurb: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const message = `Found a handy one: ${name} on KaamSolv. ${blurb} Free, no sign-up, works in your browser.\n${url}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2200);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `${name} · KaamSolv`, text: `${name} on KaamSolv. ${blurb}`, url });
    } catch {
      // The person closed the share sheet: nothing to do.
    }
  }

  return (
    <section aria-labelledby="share-title" data-testid="share-tool" className="rounded-xl2 border border-hair bg-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
      <div className="min-w-0">
        <h2 id="share-title" className="font-display text-lg font-bold text-ink sm:text-xl">
          Saved you some <span className="text-coral-600">kaam</span>? Pass it on.
        </h2>
        <p className="mt-1 text-sm text-muted">Know someone still doing this by hand? Send them {name}. It&apos;s free and takes seconds.</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-0 sm:shrink-0">
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-whatsapp-tool"
          className={WHATSAPP_BUTTON}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29z" />
          </svg>
          Share on WhatsApp
        </a>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          data-testid="share-copy-tool"
          className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 ${
            copied ? 'border-teal-300 bg-tealx-100 text-tealx-600' : 'border-hair bg-surface text-strong hover:bg-wash'
          }`}
        >
          <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={nativeShare}
            data-testid="share-native-tool"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-hair bg-surface px-5 font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>
            More
          </button>
        )}
      </div>
    </section>
  );
}
