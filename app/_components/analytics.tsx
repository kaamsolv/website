'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  ANALYTICS_ENABLED,
  GA_ID,
  installGtag,
  isAccountPath,
  readConsent,
  resetPageView,
  setConsent,
  stopTracking,
  syncCleanLocation,
  trackOutboundClick,
  trackPageView,
} from '@/app/lib/analytics';
import { useConsent } from './use-consent';

/**
 * Google Analytics, only after the visitor says yes. Mounted once in the root
 * layout. Renders nothing at all when NEXT_PUBLIC_GA_ID isn't set.
 */
export function Analytics() {
  if (!ANALYTICS_ENABLED) return null;
  return <AnalyticsInner />;
}

function AnalyticsInner() {
  const consent = useConsent();
  const pathname = usePathname();
  const started = useRef(false);
  // The signed-in area is never measured: no script is added there, and if one is already on the
  // page (client-side navigation from a public page) it is switched off while we are in the account.
  const inAccount = isAccountPath(pathname);

  // Consent Mode v2: ads signals stay off for good. gtag.js is only added to
  // the page below, once consent is 'granted' (and never on account pages).
  useEffect(() => {
    if (consent !== 'granted') return;
    // ga-disable-<ID> switches GA off: on withdrawal, and while in the account area. Saying yes again, or
    // coming back to a public page, must undo it.
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = inAccount;
    if (inAccount || started.current) return;
    started.current = true;
    installGtag();
    const gtag = (window as unknown as { gtag: (...a: unknown[]) => void }).gtag;
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('js', new Date());
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('config', GA_ID, {
      send_page_view: false, // we send our own, once per route change
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }, [consent, inAccount]);

  // Google reads the full URL itself for anything it measures on its own; give it the cleaned one, now and on every route change.
  useEffect(() => {
    if (consent === 'granted' && !inAccount) syncCleanLocation();
  }, [consent, pathname, inAccount]);

  // Declined or withdrawn (including in another tab): make sure GA is off here too and no _ga cookie lingers.
  useEffect(() => {
    // `consent` is 'denied' on the server render too, so check the stored choice itself.
    if (consent === 'denied' && readConsent() === 'denied') stopTracking();
  }, [consent]);

  // Page views: first load and every client-side navigation.
  useEffect(() => {
    if (consent !== 'granted') {
      resetPageView();
      return;
    }
    trackPageView(pathname);
  }, [consent, pathname]);

  // Outbound links: the domain only.
  useEffect(() => {
    if (consent !== 'granted') return;
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (a) trackOutboundClick(a.getAttribute('href') ?? '');
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [consent]);

  return (
    <>
      {consent === 'granted' && !inAccount && (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`}
          strategy="afterInteractive"
        />
      )}
      {consent === 'unset' && <ConsentBanner />}
    </>
  );
}

const CHOICE_BUTTON =
  'inline-flex h-11 flex-1 items-center justify-center rounded-lg border-2 border-ink bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 sm:flex-none';

function ConsentBanner() {
  return (
    <section
      aria-label="Analytics choice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-hair bg-surface p-3 shadow-lg sm:inset-x-4 sm:bottom-4 sm:p-5"
    >
      <p className="font-display text-sm font-bold text-ink sm:text-base">Help us see what&apos;s useful?</p>
      <p className="mt-0.5 text-xs leading-snug text-muted sm:mt-1 sm:text-sm sm:leading-normal">
        Google Analytics would count visits and tool use. It sets a cookie and never sees your files, text or numbers.
        Change your mind any time on our{' '}
        <a href="/privacy#analytics" className="font-semibold text-coral-600 underline">
          Privacy page
        </a>
        .
      </p>
      <div className="mt-3 flex gap-3 sm:mt-4">
        <button type="button" className={CHOICE_BUTTON} onClick={() => setConsent('granted')}>
          Accept analytics
        </button>
        <button type="button" className={CHOICE_BUTTON} onClick={() => setConsent('denied')}>
          No thanks
        </button>
      </div>
    </section>
  );
}

/** The "change my choice" control for the Privacy page. */
export function AnalyticsChoice() {
  const consent = useConsent();
  if (!ANALYTICS_ENABLED) return null;
  const on = consent === 'granted';
  return (
    <div className="not-prose my-4 rounded-xl border border-hair bg-surface p-4">
      <p className="text-sm font-semibold text-ink" aria-live="polite">
        Analytics is {on ? 'on' : 'off'} in this browser.
      </p>
      <button type="button" className={`${CHOICE_BUTTON} mt-3 w-full sm:w-auto`} onClick={() => setConsent(on ? 'denied' : 'granted')}>
        {on ? 'Turn analytics off' : 'Turn analytics on'}
      </button>
    </div>
  );
}
