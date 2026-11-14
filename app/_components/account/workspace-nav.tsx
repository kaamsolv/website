'use client';

import { usePathname } from 'next/navigation';
import { ACCENT } from '../accent';
import { AffiliateNavSection } from '../affiliate/nav-section';
import { Icon } from '../icons';
import type { EntitlementKey } from '@/app/lib/entitlements';
import { useEntitlements } from '@/app/lib/me-client';
import { PRODUCTS, productPageHref, type Product } from '@/app/lib/products';
import { ProductChip } from './product-chip';

type Link = { href: string; label: string; pro?: boolean; /** Shown only when the account has this entitlement. */ key?: EntitlementKey };

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const ROW = `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${FOCUS}`;
const IDLE = 'text-strong hover:bg-wash';
const ACTIVE = 'bg-activebg text-activetext';

/** The pages inside a product while you are in it. Pro-only pages show only for Pro (no dead ends). */
const SUB: Record<string, Link[]> = {
  invoices: [
    { href: '/app/invoices/overview', label: 'Overview', pro: true },
    { href: '/app/invoices/collections', label: 'Payments & collections', pro: true },
    { href: '/app/invoices/reports', label: 'Reports & exports', key: 'invoice_csv_export' },
    { href: '/app/invoices/accountant', label: 'Accountant Connect', key: 'invoice_csv_export' },
    { href: '/app/invoices', label: 'All invoices' },
    { href: '/app/invoices/batch', label: 'From a CSV', key: 'invoice_batch_csv' },
    { href: '/app/invoices/settings', label: 'Invoice settings' },
  ],
  qr: [
    { href: '/app/qr', label: 'Dashboard' },
    { href: '/app/qr/codes', label: 'All QR codes' },
    { href: '/app/qr/campaigns', label: 'Campaigns', key: 'qr_campaigns' },
    { href: '/app/qr/analytics', label: 'Scan analytics' },
    { href: '/app/qr/exports', label: 'Reports & exports', key: 'qr_export' },
  ],
};

type State = 'loading' | 'pro' | 'free' | 'upgrade' | 'soon';

/**
 * The signed-in navigation: your KaamSolv, the products, what is shared, the account. A product's chip says its plan
 * (Pro, Free, Soon: the same words as on the hub); how a row behaves says where it goes:
 *   - Pro: its pages open under it while you are in it;
 *   - Free, and you are in it: its free pages, then an "Unlock … Pro" line;
 *   - Free, and you are elsewhere: a quiet coral edge marks that it has a Pro page; the row opens that page;
 *   - Soon (no plan yet): opens a "coming soon" page.
 * The sidebar (a drawer on a phone) is this one list.
 */
export function WorkspaceNav(_props: { stacked?: boolean } = {}) {
  const pathname = usePathname() ?? '';
  const { can, loading } = useEntitlements();

  const stateOf = (p: Product): State => {
    if (loading) return 'loading';
    if (p.status === 'soon') return 'soon';
    if (p.proKey && can(p.proKey)) return 'pro';
    return pathname.startsWith(p.prefix) ? 'free' : 'upgrade';
  };

  // A page is current when its address matches. A product's own row is current only on its product page.
  const isCurrent = (l: Link) => {
    // A single code (/app/qr/<id>) sits under "All QR codes"; a campaign page under "Campaigns".
    if (l.href === '/app/qr/codes') return pathname === l.href || /^\/app\/qr\/[0-9a-f-]{36}$/i.test(pathname);
    if (l.href === '/app/qr/campaigns') return pathname.startsWith('/app/qr/campaigns');
    if (l.href === '/app/business/customers') return pathname === l.href || /^\/app\/business\/customers\/[0-9a-f-]{36}$/i.test(pathname);
    // The invoice editor is "All invoices" territory.
    if (l.href === '/app/invoices') return pathname === l.href || pathname.startsWith('/app/invoices/editor');
    return pathname === l.href;
  };

  const plain = (l: Link) => (!l.pro || can('invoice_dashboard')) && (!l.key || can(l.key));

  const simple = (l: { href: string; label: string }) => {
    const active = pathname === l.href;
    return (
      <li key={l.href}>
        <a href={l.href} aria-current={active ? 'page' : undefined} className={`${ROW} ${active ? ACTIVE : IDLE}`}>
          {l.label}
        </a>
      </li>
    );
  };

  return (
    <nav aria-label="Your workspace">
      <ul className="flex flex-col gap-4">
        <li>
          <ul>{simple({ href: '/app', label: 'Your KaamSolv' })}</ul>
        </li>

        <li>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Products</p>
          <ul className="flex flex-col gap-0.5">
            {PRODUCTS.map((p) => {
              const state = stateOf(p);
              const a = ACCENT[p.accent];
              const nudged = state === 'upgrade' || state === 'soon';
              const open = state === 'pro' || state === 'free' || (state === 'loading' && pathname.startsWith(p.prefix));
              const href = nudged ? productPageHref(p) : p.home;
              const onProductPage = pathname === productPageHref(p);
              const subs = (SUB[p.slug] ?? []).filter(plain);
              return (
                <li key={p.slug}>
                  <a
                    href={href}
                    data-product={p.slug}
                    data-state={state}
                    aria-current={onProductPage ? 'page' : undefined}
                    title={state === 'upgrade' ? `${p.planName}: see what it adds` : undefined}
                    className={`${ROW} ${onProductPage ? ACTIVE : IDLE} ${state === 'upgrade' ? 'shadow-[inset_2px_0_0_#FE6336]' : ''}`}
                  >
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${a.tint} ${a.fg}`}>
                      <Icon name={p.icon} className="h-4 w-4" />
                    </span>
                    {p.name}
                    {state !== 'loading' && <ProductChip state={state === 'upgrade' ? 'free' : state} className="ml-auto" />}
                  </a>
                  {open && (subs.length > 0 || (state === 'free' && p.planKey)) && (
                    <ul className="ml-3 mt-0.5 flex flex-col gap-0.5">
                      {subs.map((l) => {
                        const active = isCurrent(l);
                        return (
                          <li key={`${l.href}-${l.label}`}>
                            <a
                              href={l.href}
                              aria-current={active ? 'page' : undefined}
                              className={`block rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${active ? ACTIVE : IDLE}`}
                            >
                              {l.label}
                            </a>
                          </li>
                        );
                      })}
                      {state === 'free' && p.planKey && (
                        <li>
                          <a
                            href={productPageHref(p)}
                            aria-current={onProductPage ? 'page' : undefined}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-coralx-600 hover:bg-wash ${FOCUS}`}
                          >
                            <Icon name="sparkle" className="h-4 w-4" />
                            Unlock {p.planName}
                          </a>
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </li>

        <AffiliateNavSection />

        <li>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Shared</p>
          <ul className="flex flex-col gap-0.5">
            {[
              { href: '/app/business', label: 'Business profile' },
              { href: '/app/business/customers', label: 'Customers' },
              { href: '/app/business/items', label: 'Items' },
            ].map((l) => {
              const active = isCurrent(l);
              return (
                <li key={l.href}>
                  <a href={l.href} aria-current={active ? 'page' : undefined} className={`${ROW} ${active ? ACTIVE : IDLE}`}>
                    {l.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </li>

        <li className="border-t border-hair pt-3">
          <ul className="flex flex-col gap-0.5">
            {simple({ href: '/app/billing', label: 'Plans & billing' })}
            {simple({ href: '/app/account', label: 'Account' })}
          </ul>
        </li>
      </ul>
    </nav>
  );
}
