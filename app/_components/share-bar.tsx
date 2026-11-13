'use client';

import { Icon } from './icons';
import { useShare } from './use-share';
import { WHATSAPP_BUTTON_COMPACT } from './whatsapp-style';

const OTHER =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-hair bg-surface px-3 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:px-4';

/**
 * The quick share row at the top of a tool page: WhatsApp, copy the link, and the phone's share sheet where there is one.
 * Same actions as the "Pass it on" card further down (see use-share.ts), in a compact form that sits on the breadcrumb row
 * so it is there while the tool is still on screen. Below `sm` the buttons show only their icon (still 44px, still named).
 */
export function ShareBar({ name, blurb, url }: { name: string; blurb: string; url: string }) {
  const { whatsapp, copied, copy, canShare, nativeShare } = useShare(name, blurb, url);

  return (
    <div role="group" aria-label="Share this tool" data-testid="share-bar" className="flex flex-wrap items-center gap-2">
      <span className="hidden text-sm font-semibold text-muted sm:inline" aria-hidden="true">
        Share
      </span>
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" data-testid="share-bar-whatsapp" aria-label="Share this tool on WhatsApp" className={WHATSAPP_BUTTON_COMPACT}>
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29z" />
        </svg>
        <span className="hidden sm:inline">WhatsApp</span>
      </a>
      <button type="button" onClick={copy} data-testid="share-bar-copy" aria-live="polite" aria-label={copied ? 'Link copied' : 'Copy link to this tool'} className={`${OTHER} ${copied ? '!border-teal-300 !bg-tealx-100 !text-tealx-600' : ''}`}>
        <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">{copied ? 'Link copied' : 'Copy link'}</span>
      </button>
      {canShare && (
        <button type="button" onClick={nativeShare} data-testid="share-bar-native" aria-label="More ways to share this tool" className={OTHER}>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          <span className="hidden sm:inline">More</span>
        </button>
      )}
    </div>
  );
}
