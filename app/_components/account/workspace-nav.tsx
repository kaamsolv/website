'use client';

import { usePathname } from 'next/navigation';
import { useEntitlements } from '@/app/lib/me-client';

const LINKS = [
  { href: '/app', label: 'Dashboard', pro: true },
  { href: '/app/invoices', label: 'Invoices' },
  { href: '/app/customers', label: 'Customers' },
  { href: '/app/items', label: 'Items' },
  { href: '/app/settings', label: 'Settings' },
  { href: '/app/account', label: 'Account' },
] as const;

/**
 * Signed-in navigation: a sidebar on desktop, a scrolling tab bar on phones.
 * Dashboard shows only for Pro — free accounts never see a dead end.
 */
export function WorkspaceNav() {
  const pathname = usePathname();
  const { can } = useEntitlements();
  const links = LINKS.filter((l) => !('pro' in l) || can('invoice_dashboard'));
  return (
    <nav aria-label="Your workspace" className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:mb-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:flex-col">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <li key={l.href} className="shrink-0">
              <a
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 md:rounded-lg md:px-3 ${
                  active ? 'bg-activebg text-activetext' : 'text-strong hover:bg-wash'
                }`}
              >
                {l.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
