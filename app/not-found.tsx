import { Icon } from './_components/icons';

/**
 * Most links on the homepage point at tools and pages that land in a later
 * phase. Until then this is where they arrive — an honest, on-brand
 * "not yet" rather than a browser error.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-coralx-100 text-coralx-600">
          <Icon name="toolbox" className="h-7 w-7" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-extrabold text-ink">
          That one&apos;s not built yet.
        </h1>
        <p className="mt-3 text-muted">
          KaamKit is being put together tool by tool. This page is on the list — it just
          isn&apos;t ready to help you yet.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/"
            className="inline-flex h-11 items-center rounded-full bg-coral-500 px-6 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Back to the toolbox
          </a>
          <a
            href="/suggest-a-tool"
            className="inline-flex h-11 items-center rounded-full border border-ink px-6 text-sm font-semibold text-ink transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Ask for it
          </a>
        </div>
        <p className="font-hand mt-8 text-lg text-teal-500">Bas, thoda ruk jao.</p>
      </div>
    </main>
  );
}
