'use client';

import { Icon } from '../icons';
import { QrProSpecimen } from './qr-pro-specimen';
import { priceSentence } from '@/app/lib/billing/plan-price';
import { usePlanPrice } from '@/app/lib/billing/use-plan-price';
import { useEntitlements } from '@/app/lib/me-client';
import type { Product } from '@/app/lib/products';
import { QR_FREE_STRIP, QR_PRO_FACTS, QR_SCAN_NOTE, QR_STATUS_ERROR, QR_UNAVAILABLE } from '@/app/lib/qr/pro-facts';
import { PRIMARY, SECONDARY } from '@/app/lib/ui-classes';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/**
 * The QR Pro page (/app/products/qr). One memorable visual (the specimen), plain rows for what the plan adds,
 * and a free path that is on screen in every state. Price and Subscribe appear only when checkout can really
 * be started (payments configured and a price on file); otherwise the page says subscriptions aren't available
 * yet and the free link becomes the main button. It never sells anything it can't deliver and shows no price it hasn't read.
 */
export function QrProPage({ product: p }: { product: Product }) {
  const { can, loading } = useEntitlements();
  const subscribed = !loading && !!p.proKey && can(p.proKey);
  const price = usePlanPrice('qr_pro', !loading && !subscribed);
  const checking = loading || price.status === 'loading';
  const available = !loading && !subscribed && price.status === 'available';

  if (subscribed) {
    return (
      <div className="space-y-6" data-testid="product-page" data-product="qr" data-state="subscribed">
        <section className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-tealx-100 px-3 py-1 text-sm font-semibold text-tealx-600">
            <Icon name="check" className="h-4 w-4" />
            You have QR Pro
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold text-ink">Your scan detail is on.</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/app/qr" className={PRIMARY}>
              Open QR codes
            </a>
            <a href="/app/qr/campaigns" className={SECONDARY}>
              Campaigns
            </a>
            <a href="/app/qr/analytics" className={SECONDARY}>
              Scan analytics
            </a>
            <a href="/app/qr/exports" className={SECONDARY}>
              Reports &amp; exports
            </a>
          </div>
        </section>
      </div>
    );
  }

  const state = checking ? 'loading' : price.status;
  return (
    <div className="space-y-10" data-testid="product-page" data-product="qr" data-state={state}>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-10" aria-labelledby="qr-pro-statement">
        <div>
          <h2 id="qr-pro-statement" className="font-display text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
            Find out which of your QR codes gets scanned.
          </h2>
          <p className="mt-4 max-w-prose text-muted sm:text-lg">
            Save a QR code and we count the scans. QR Pro adds the detail: where scans come from, longer history, campaigns and exports.
          </p>

          <div className="mt-6" data-testid="qr-status" aria-busy={checking}>
            <div className="min-h-14" role="status">
              {checking && <div className="h-5 w-56 animate-pulse rounded bg-wash" aria-hidden="true" />}
              {available && price.status === 'available' && (
                <>
                  <p className="font-display text-xl font-bold text-ink" data-testid="qr-price">
                    {priceSentence(price.prices)}
                  </p>
                  {price.taxRate !== null && (
                    <p className="mt-0.5 text-sm text-muted" data-testid="qr-gst">
                      Includes {price.taxRate}% GST.
                    </p>
                  )}
                </>
              )}
              {!checking && !available && price.status === 'unavailable' && (
                <p className="text-ink" data-testid="qr-unavailable">
                  <span className="font-semibold">{QR_UNAVAILABLE}</span> Free QR codes keep working.
                </p>
              )}
              {!checking && !available && price.status === 'error' && (
                <p className="text-ink" data-testid="qr-error">
                  <span className="font-semibold">{QR_STATUS_ERROR}</span> Free QR codes keep working.
                </p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {available && (
                <a href="/app/billing#plan-qr_pro" className={PRIMARY} data-testid="subscribe">
                  Subscribe to QR Pro
                </a>
              )}
              <a href="/app/qr" className={available || checking ? SECONDARY : PRIMARY} data-testid="free-link">
                Keep using free QR codes
              </a>
            </div>
          </div>
        </div>

        <QrProSpecimen />
      </section>

      <section aria-labelledby="qr-pro-adds">
        <h2 id="qr-pro-adds" className="font-display text-xl font-bold text-ink">
          What QR Pro adds
        </h2>
        <ul className="mt-4 grid gap-x-10 gap-y-6 sm:grid-cols-2" data-testid="qr-pro-facts">
          {QR_PRO_FACTS.map((f) => (
            <li key={f.title} className="border-t border-hair pt-4">
              <h3 className="font-display text-base font-bold text-ink">{f.title}</h3>
              <p className="mt-1 max-w-prose text-sm text-strong">{f.body}</p>
              {f.detail && <p className="mt-1 text-xs text-muted">{f.detail}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted">{QR_SCAN_NOTE}</p>
      </section>

      <section aria-labelledby="qr-free" className="flex flex-wrap items-center justify-between gap-4 rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <div className="max-w-prose">
          <h2 id="qr-free" className="font-display text-lg font-bold text-ink">
            Free stays free
          </h2>
          <p className="mt-1 text-sm text-muted">{QR_FREE_STRIP}</p>
        </div>
        <a href="/app/qr/new" className={`${SECONDARY} ${FOCUS}`} data-testid="free-new">
          Make a free QR code
        </a>
      </section>
    </div>
  );
}
