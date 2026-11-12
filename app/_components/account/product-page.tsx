'use client';

import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { PRIMARY, SECONDARY } from '@/app/lib/ui-classes';
import { useEntitlements } from '@/app/lib/me-client';
import type { Product } from '@/app/lib/products';

/**
 * /app/products/<slug>: what a product gives you and how to get it. A product you have: "you're on it" and
 * a way in. A product with a plan: its paid features, what stays free, and a button to Plans and billing
 * (where the price and checkout already live). A product with no plan yet: what is free now, no subscribe button.
 */
export function ProductPage({ product: p }: { product: Product }) {
  const { can, loading } = useEntitlements();
  const a = ACCENT[p.accent];
  const subscribed = !!p.proKey && can(p.proKey);
  const soon = p.status === 'soon';

  return (
    <div className="space-y-6" data-testid="product-page" data-product={p.slug}>
      <section className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${a.tint} ${a.fg}`}>
              <Icon name={p.icon} className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{soon ? 'Coming later' : p.planName}</p>
              <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">{p.promise}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {loading ? null : soon ? (
              <a href={p.home} className={PRIMARY}>
                Open the free PDF tools
              </a>
            ) : subscribed ? (
              <a href={p.home} className={PRIMARY}>
                Open {p.name}
              </a>
            ) : (
              <>
                <a href={`/app/billing#plan-${p.planKey}`} className={PRIMARY} data-testid="subscribe">
                  Subscribe to {p.planName}
                </a>
                <a href={p.home} className={SECONDARY}>
                  Open {p.name} (free)
                </a>
              </>
            )}
          </div>
        </div>
        {subscribed && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-tealx-100 px-3 py-1 text-sm font-semibold text-tealx-600">
            <Icon name="check" className="h-4 w-4" />
            You have {p.planName}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {p.pro.length > 0 && (
          <section className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6" aria-labelledby="pro-features">
            <h3 id="pro-features" className="text-xs font-semibold uppercase tracking-wide text-muted">
              {subscribed ? `Included in ${p.planName}` : `You get with ${p.planName}`}
            </h3>
            <ul className="mt-3 space-y-2.5">
              {p.pro.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-strong">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-tealx-600" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6" aria-labelledby="free-features">
          <h3 id="free-features" className="text-xs font-semibold uppercase tracking-wide text-muted">
            {soon ? 'Free today' : 'You keep for free'}
          </h3>
          <ul className="mt-3 space-y-2.5">
            {p.free.map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-strong">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-tealx-600" />
                {f}
              </li>
            ))}
          </ul>
          {!subscribed && !soon && (
            <p className="mt-4 rounded-lg border border-dashed border-hair p-3 text-sm text-muted">
              Once you subscribe, {p.name} opens right here in your workspace. You won’t need the public page.
            </p>
          )}
          {soon && (
            <p className="mt-4 rounded-lg border border-dashed border-hair p-3 text-sm text-muted">
              Want something specific from a PDF plan? <a href="/contact#suggest" className="font-semibold text-coral-600 underline underline-offset-2">Tell us</a>.
            </p>
          )}
        </section>
      </div>

      {p.planKey && !subscribed && (
        <p className="text-sm text-muted">
          Invoice Pro and QR Pro are also sold together as a bundle. <a href="/app/billing" className="font-semibold text-coral-600 underline underline-offset-2">See Plans and billing</a>.
        </p>
      )}
    </div>
  );
}
