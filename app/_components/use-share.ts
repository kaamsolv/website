'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The three ways to pass a tool on, shared by the "Pass it on" card (ShareTool) and the compact ShareBar:
 * a WhatsApp message with the page address filled in, a copied address, and the phone's own share sheet where the
 * browser has one. Nothing is sent to KaamSolv, and the address is the plain page URL with no tracking parameters.
 */
export function useShare(name: string, blurb: string, url: string) {
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

  return { whatsapp, copied, copy, canShare, nativeShare };
}
