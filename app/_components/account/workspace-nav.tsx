'use client';

import { usePathname } from 'next/navigation';
import type { EntitlementKey } from '@/app/lib/entitlements';
import { useEntitlements } from '@/app/lib/me-client';

type Link = { href: string; label: string; pro?: boolean; sub?: boolean; /** Shown only when the account has this entitlement. */ key?: EntitlementKey };

/**
 * The signed-in navigation, in groups: the hub, each tool (its own pages show
 * while you're in it), what's shared across business tools, and the account.
 * Sidebar on desktop; one scrolling tab bar on phones. Pro-only pages show
 * only for Pro — free accounts never see a dead end.
 */
function groups(pathname: string): { label?: string; links: Link[] }[] {
  const inInvoices = pathname.startsWith('/app/invoices');
  const inQr = pathname.startsWith('/app/qr');
  return [
    { links: [{ href: '/app', label: 'Your KaamSolv' }] },
    {
      label: 'Tools',
      links: [
        { href: '/app/invoices', label: 'Invoices' },
        ...(inInvoices
          ? [
              { href: '/app/invoices/overview', label: 'Overview', pro: true, sub: true },
              { href: '/app/invoices/collections', label: 'Payments & collections', pro: true, sub: true },
              { href: '/app/invoices/reports', label: 'Reports & exports', sub: true, key: 'invoice_csv_export' as const },
              { href: '/app/invoices', label: 'All invoices', sub: true },
              { href: '/app/invoices/batch', label: 'From a CSV', sub: true, key: 'invoice_batch_csv' as const },
              { href: '/app/invoices/settings', label: 'Invoice settings', sub: true },
            ]
          : []),
        { href: '/app/qr', label: 'QR codes' },
        ...(inQr
          ? [
              { href: '/app/qr', label: 'Dashboard', sub: true },
              { href: '/app/qr/codes', label: 'All QR codes', sub: true },
              { href: '/app/qr/campaigns', label: 'Campaigns', sub: true, key: 'qr_campaigns' as const },
              { href: '/app/qr/analytics', label: 'Scan analytics', sub: true },
              { href: '/app/qr/exports', label: 'Reports & exports', sub: true, key: 'qr_export' as const },
            ]
          : []),
      ],
    },
    {
      label: 'Shared',
      links: [
        { href: '/app/business', label: 'Business profile' },
        { href: '/app/business/customers', label: 'Customers' },
        { href: '/app/business/items', label: 'Items' },
      ],
    },
    { links: [{ href: '/app/account', label: 'Account' }] },
  ];
}

export function WorkspaceNav() {
  const pathname = usePathname() ?? '';
  const { can } = useEntitlements();
  const all = groups(pathname).map((g) => ({ ...g, links: g.links.filter((l) => (!l.pro || can('invoice_dashboard')) && (!l.key || can(l.key))) }));
  // "Invoices" itself is current only when no sub-page is listed (outside Invoices).
  // "Invoices" and "QR codes" are current only when no sub-page is listed under them.
  const isCurrent = (l: Link) => {
    if (!l.sub && ((l.href === '/app/invoices' && pathname.startsWith('/app/invoices')) || (l.href === '/app/qr' && pathname.startsWith('/app/qr')))) return false;
    // A single code (/app/qr/<id>) sits under "All QR codes"; a campaign page under "Campaigns".
    if (l.href === '/app/qr/codes') return pathname === l.href || /^\/app\/qr\/[0-9a-f-]{36}$/i.test(pathname);
    if (l.href === '/app/qr/campaigns') return pathname.startsWith('/app/qr/campaigns');
    // One customer's page sits under "Customers".
    if (l.href === '/app/business/customers') return pathname === l.href || /^\/app\/business\/customers\/[0-9a-f-]{36}$/i.test(pathname);
    return pathname === l.href;
  };

  return (
    <nav aria-label="Your workspace" className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:mb-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:flex-col md:gap-4">
        {all.map((g, gi) => (
          <li key={gi} className="contents md:block">
            {g.label && <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted md:block">{g.label}</p>}
            <ul className="contents md:flex md:flex-col md:gap-0.5">
              {g.links.map((l) => {
                const active = isCurrent(l);
                return (
                  <li key={`${l.href}-${l.label}`} className="shrink-0">
                    <a
                      href={l.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block whitespace-nowrap rounded-full px-4 py-2 md:whitespace-normal text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 md:rounded-lg md:px-3 ${
                        l.sub ? 'md:ml-3 md:py-1.5 md:font-medium' : ''
                      } ${active ? 'bg-activebg text-activetext' : 'text-strong hover:bg-wash'}`}
                    >
                      {l.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
