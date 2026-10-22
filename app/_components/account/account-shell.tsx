import { SiteFooter } from '../site-footer';
import { SiteHeader } from '../site-header';
import { WorkspaceNav } from './workspace-nav';

/** Shell for /login and the signed-in /app pages: header, a title, the content. */
export function AccountShell({
  title,
  intro,
  actions,
  narrow = false,
  workspace = false,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  narrow?: boolean;
  /** Signed-in pages: adds the workspace navigation (sidebar / tab bar). */
  workspace?: boolean;
  children: React.ReactNode;
}) {
  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {intro && <p className="mt-2 text-muted sm:text-lg">{intro}</p>}
      </div>
      {actions}
    </div>
  );
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="min-h-[70vh] bg-canvas">
        {workspace ? (
          <div className="kk-container py-8 sm:py-12 md:grid md:grid-cols-[11rem_1fr] md:gap-10">
            <WorkspaceNav />
            <div className="min-w-0">
              {heading}
              <div className={`mt-8 ${narrow ? 'max-w-xl' : ''}`}>{children}</div>
            </div>
          </div>
        ) : (
          <div className={`kk-container py-10 sm:py-14 ${narrow ? 'max-w-md' : ''}`}>
            {heading}
            <div className="mt-8">{children}</div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

export const BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60';
export const PRIMARY = `${BTN} bg-coral-500 text-navy-900 hover:bg-coral-600 hover:text-white`;
export const SECONDARY = `${BTN} border border-hair bg-surface text-strong hover:bg-wash`;
export const INPUT =
  'h-12 w-full rounded-lg border border-hair bg-fieldbg px-3 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
