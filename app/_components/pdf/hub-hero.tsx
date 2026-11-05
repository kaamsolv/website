import { Breadcrumb } from '../breadcrumb';
import { ACCENT } from '../accent';
import { Icon } from '../icons';

/**
 * The top of /pdf-tools: what this is, why it's safe, and the real upload workspace beside it.
 * Upload is optional: "Browse all tools" jumps straight to the directory. The workspace
 * (`PdfWorkspace`, passed in as children) keeps every behaviour it had. When a file is loaded it marks itself
 * `data-pdf-active="true"` and this grid drops to one column, so the page editor and other panels get the full width.
 */
export function HubHero({ limit, children }: { limit: string; children: React.ReactNode }) {
  const a = ACCENT.purple;
  return (
    <section aria-labelledby="tool-title" className="relative overflow-x-clip border-b border-hair bg-surface">
      <div className="kk-dotgrid" aria-hidden="true" />
      <div className="kk-container relative py-10 sm:py-14">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'PDF tools' }]} />

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-12 lg:has-[[data-pdf-active=true]]:grid-cols-1">
          <div className="max-w-xl lg:has-[[data-pdf-active=true]]:max-w-none">
            <span className={`kk-rise inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${a.tint} ${a.fg}`}>
              <Icon name="documents" className="h-3.5 w-3.5" />
              Documents · Free tools
            </span>
            <h1 id="tool-title" className="kk-rise kk-rise-2 mt-3 text-balance font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-4xl lg:text-5xl">
              PDF tools, right in your browser
            </h1>
            <p className="kk-rise kk-rise-3 mt-4 text-pretty text-base text-muted sm:text-lg">
              Merge, split, rotate, compress and convert PDFs. Drop a file to start, or pick a tool below.
            </p>
            <ul className="kk-rise kk-rise-4 mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-strong">
              <li className="inline-flex items-center gap-1.5">
                <Icon name="lock" className="h-4 w-4 text-tealx-600" />
                Files stay on your device
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-tealx-600" />
                Free, no sign-up
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-tealx-600" />
                Up to {limit} a file
              </li>
            </ul>
            <p className="kk-rise kk-rise-4 mt-5">
              <a
                href="#pdf-directory"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hair bg-surface px-4 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
              >
                Browse all tools
                <Icon name="chevron-right" className="h-4 w-4 rotate-90" />
              </a>
            </p>
          </div>

          <div className="rounded-xl2 border border-hair bg-canvas p-3 shadow-soft sm:p-4">{children}</div>
        </div>

        <noscript>
          <p className="mt-4 rounded-lg border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">This tool needs JavaScript. Please turn it on in your browser.</p>
        </noscript>
      </div>
    </section>
  );
}
