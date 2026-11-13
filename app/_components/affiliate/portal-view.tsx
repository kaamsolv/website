import { readableOn, type MerchantBrand } from '@/app/lib/affiliate/merchant';

/**
 * The merchant's branded portal, exactly as visitors see it. Used by the public page (/affiliate/{slug}) and by the
 * live preview in the editor, so what the owner sees is what is published. No hooks: it renders on the server too.
 * The merchant's colour is only ever a background, with Deep Navy or white text picked for contrast.
 */
export function PortalView({ name, brand, registration = 'soon' }: { name: string; brand: MerchantBrand; registration?: 'soon' }) {
  const programme = brand.programmeName || `${name} affiliate programme`;
  const on = readableOn(brand.brandColour);
  return (
    <article aria-labelledby="portal-title">
      <header className="px-4 py-8 sm:px-8 sm:py-10" style={{ backgroundColor: brand.brandColour, color: on }}>
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          {brand.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- a small data URL the owner saved; nothing to optimise
            <img src={brand.logo} alt={`${name} logo`} className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1 sm:h-16 sm:w-16" />
          )}
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold opacity-90">{name}</p>
            <h1 id="portal-title" className="break-words font-display text-2xl font-extrabold leading-tight sm:text-3xl">
              {programme}
            </h1>
          </div>
        </div>
      </header>

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
          <p className="mt-1 text-sm text-muted">
            {registration === 'soon' ? 'Registration opens soon. Check back on this page.' : ''}
          </p>
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
