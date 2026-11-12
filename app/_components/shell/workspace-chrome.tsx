'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HeaderAccount } from '../account/header-account';
import { Icon } from '../icons';
import { ThemeToggle } from '../theme-toggle';
import { PRODUCTS } from '@/app/lib/products';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/** The application name shown in the top bar, from where you are. Pages can pass `appName` to override it. */
function appNameFor(pathname: string): string {
  const product = /^\/app\/products\/([a-z]+)/.exec(pathname);
  if (product) return PRODUCTS.find((p) => p.slug === product[1])?.name ?? 'Products';
  if (pathname.startsWith('/app/invoices')) return 'Invoices';
  if (pathname.startsWith('/app/qr')) return 'QR codes';
  if (pathname.startsWith('/app/business')) return 'Business profile';
  if (pathname.startsWith('/app/billing')) return 'Plans & billing';
  if (pathname.startsWith('/app/account')) return 'Account';
  return 'Your KaamSolv';
}

/**
 * The workspace frame: a compact top bar, a sidebar that is a drawer on a phone and a tablet, and the
 * full-width main area. No marketing footer, no width cap. The sidebar is one element (so there is one
 * "Your workspace" navigation, not two): off-screen and hidden from assistive tech while the drawer is closed.
 */
export function WorkspaceChrome({ nav, appName, after, children }: { nav: React.ReactNode; appName?: string; /** Shown under the page content (an ad slot for free accounts). */ after?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const name = appName ?? appNameFor(pathname);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-canvas" data-workspace>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header sticky top-0 z-40 border-b border-hair backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <button
            type="button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="ws-sidebar"
            onClick={() => setOpen((v) => !v)}
            className={`grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-wash lg:hidden ${FOCUS}`}
          >
            <Icon name={open ? 'close' : 'menu'} className="h-5 w-5" />
          </button>
          <a href="/" aria-label="KaamSolv home" className={`shrink-0 rounded-lg ${FOCUS}`}>
            <span className="font-display text-xl font-extrabold tracking-tight text-ink">
              Kaam<span className="text-coral-500">Solv</span>
            </span>
          </a>
          <span className="hidden h-5 w-px bg-hair sm:block" aria-hidden="true" />
          <span className="hidden truncate font-display text-sm font-bold text-strong sm:block" data-testid="workspace-app-name">
            {name}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <a href="/tools" className={`hidden h-10 items-center rounded-full px-3 text-sm font-semibold text-strong hover:bg-wash md:inline-flex ${FOCUS}`}>
              All tools
            </a>
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <a href="/contact#feedback" className={`hidden h-10 items-center rounded-full px-3 text-sm font-semibold text-strong hover:bg-wash sm:inline-flex ${FOCUS}`}>
              Help
            </a>
            <HeaderAccount />
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        {open && <div className="fixed inset-0 top-14 z-40 bg-navy-900/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" data-testid="workspace-backdrop" />}
        <aside
          id="ws-sidebar"
          className={`fixed bottom-0 left-0 top-14 z-50 w-72 max-w-[85vw] overflow-y-auto border-r border-hair bg-surface p-3 lg:visible lg:sticky lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:w-auto lg:max-w-none lg:translate-x-0 ${
            open ? 'translate-x-0' : 'invisible -translate-x-full'
          }`}
        >
          {nav}
        </aside>
        <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
          {after && <div className="mt-10">{after}</div>}
        </main>
      </div>
    </div>
  );
}
