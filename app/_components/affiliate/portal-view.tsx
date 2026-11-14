import Link from 'next/link';
import { readableOn, type MerchantBrand } from '@/app/lib/affiliate/merchant';

/**
 * The merchant's branded portal, exactly as visitors see it. Used by the public page (/affiliate/{slug}) and by the
 * live preview in the editor, so what the owner sees is what is published. No hooks: it renders on the server too.
 * The merchant's colour is only ever a background, with Deep Navy or white text picked for contrast.
 */
export type PortalRegistration = {
  state: 'open' | 'closed' | 'pending' | 'approved' | 'suspended' | 'cooldown' | 'own_programme';
  /** Where "Apply to join" goes. Without it (the editor's preview) the button is only drawn. */
  href?: string;
  /** Where a signed-in visitor's "my programmes" / "review applications" button goes. */
  manageHref?: string;
};

/**
 * The merchant's band: logo, business name and programme name on their colour. The portal and the application page both
 * open with it, so an affiliate sees the merchant's identity from the first page to the last. `heading` sets the page's
 * h1: the programme on the portal, "Apply to join" on the application page (the programme name is then a plain line).
 */
export function PortalHeader({ name, brand, heading }: { name: string; brand: MerchantBrand; heading?: string }) {
  const programme = brand.programmeName || `${name} affiliate programme`;
  const on = readableOn(brand.brandColour);
  const Title = heading ? 'p' : 'h1';
  return (
    <header className="px-4 py-8 sm:px-8 sm:py-10" style={{ backgroundColor: brand.brandColour, color: on }} data-testid="portal-header">
      <div className="mx-auto flex max-w-2xl items-center gap-4">
        {brand.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- a small data URL the owner saved; nothing to optimise
          <img src={brand.logo} alt={`${name} logo`} className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1 sm:h-16 sm:w-16" />
        )}
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold opacity-90">{name}</p>
          <Title id={heading ? undefined : 'portal-title'} className="break-words font-display text-2xl font-extrabold leading-tight sm:text-3xl">
            {programme}
          </Title>
        </div>
      </div>
    </header>
  );
}

export function PortalView({ name, brand, registration = { state: 'closed' } }: { name: string; brand: MerchantBrand; registration?: PortalRegistration }) {
  const on = readableOn(brand.brandColour);
  const applyClass = 'mt-3 inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-bold';
  const applyStyle = { backgroundColor: brand.brandColour, color: on };
  return (
    <article aria-labelledby="portal-title">
      <PortalHeader name={name} brand={brand} />

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-0">
        {brand.programmeDescription && (
          <section aria-labelledby="portal-about">
            <h2 id="portal-about" className="font-display text-lg font-extrabold text-ink">
              About the programme
            </h2>
            <p className="mt-2 whitespace-pre-line break-words text-strong">{brand.programmeDescription}</p>
          </section>
        )}

        <section aria-labelledby="portal-join" className="rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
          <h2 id="portal-join" className="font-display text-lg font-extrabold text-ink">
            Join as an affiliate
          </h2>
          {registration.state === 'open' && (
            <>
              <p className="mt-1 text-sm text-muted">Apply and the team will review it. It takes a minute.</p>
              {registration.href ? (
                <Link href={registration.href} className={applyClass} style={applyStyle}>
                  Apply to join
                </Link>
              ) : (
                <span className={applyClass} style={applyStyle}>
                  Apply to join
                </span>
              )}
            </>
          )}
          {registration.state === 'closed' && <p className="mt-1 text-sm text-muted">Applications are closed right now. Check back on this page.</p>}
          {/* A signed-in visitor sees where they stand, not an invitation to apply again. */}
          {registration.state === 'approved' && (
            <>
              <p className="mt-1 text-sm font-semibold text-ink" data-testid="portal-status">You’re part of this programme.</p>
              <p className="mt-1 text-sm text-muted">See all the programmes you’ve joined in your account.</p>
              <Link href={registration.manageHref ?? '/app/affiliate/programmes'} className={applyClass} style={applyStyle}>
                Go to my programmes
              </Link>
            </>
          )}
          {registration.state === 'pending' && (
            <>
              <p className="mt-1 text-sm font-semibold text-ink" data-testid="portal-status">Your application is with {name}.</p>
              <p className="mt-1 text-sm text-muted">They’ll review it. The result shows here and in your account.</p>
              <Link href={registration.manageHref ?? '/app/affiliate/programmes'} className={applyClass} style={applyStyle}>
                See my applications
              </Link>
            </>
          )}
          {registration.state === 'suspended' && (
            <>
              <p className="mt-1 text-sm font-semibold text-ink" data-testid="portal-status">Your access is paused.</p>
              <p className="mt-1 text-sm text-muted">{name} has paused your place in this programme. Their reason, if they gave one, is in your account.</p>
              <Link href={registration.manageHref ?? '/app/affiliate/programmes'} className={applyClass} style={applyStyle}>
                See my programmes
              </Link>
            </>
          )}
          {registration.state === 'cooldown' && (
            <p className="mt-1 text-sm text-muted" data-testid="portal-status">Your last application wasn’t approved. You can apply again after a few days.</p>
          )}
          {registration.state === 'own_programme' && (
            <>
              <p className="mt-1 text-sm text-muted" data-testid="portal-status">This is your programme. This is how affiliates see it.</p>
              <Link href={registration.manageHref ?? '/app/affiliate/applications'} className={applyClass} style={applyStyle}>
                Review applications
              </Link>
            </>
          )}
        </section>

        {brand.terms && (
          <section aria-labelledby="portal-terms">
            <h2 id="portal-terms" className="font-display text-lg font-extrabold text-ink">
              Terms and conditions
            </h2>
            <p className="mt-2 whitespace-pre-line break-words text-sm text-strong">{brand.terms}</p>
          </section>
        )}
      </div>
    </article>
  );
}
