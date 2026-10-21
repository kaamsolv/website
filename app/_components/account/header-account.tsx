'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/app/lib/auth-client';
import { useMe } from '@/app/lib/me-client';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

function loginHref(pathname: string | null) {
  const here = pathname && pathname !== '/login' ? pathname : '/app/invoices';
  return `/login?next=${encodeURIComponent(here)}`;
}

/** Header bar: "Log in", or the signed-in user's initial with a small menu. */
export function HeaderAccount() {
  const me = useMe({ lazy: true });
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (me.status === 'loading') return <span className="hidden w-14 sm:block" aria-hidden="true" />;

  if (me.status === 'anon') {
    return (
      <a href={loginHref(pathname)} className={`hidden h-10 items-center rounded-full px-3 text-sm font-semibold text-strong hover:bg-wash sm:inline-flex ${FOCUS}`}>
        Log in
      </a>
    );
  }

  const initial = (me.user.name || me.user.email).trim().charAt(0).toUpperCase() || '?';
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${me.user.email}`}
        onClick={() => setOpen((v) => !v)}
        className={`grid h-10 w-10 place-items-center rounded-full bg-activebg font-display text-sm font-bold text-activetext ${FOCUS}`}
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-60 rounded-xl2 border border-hair bg-surface p-2 shadow-lift">
          <p className="truncate px-3 py-2 text-xs text-muted">{me.user.email}</p>
          <a role="menuitem" href="/app/invoices" className={`block rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash ${FOCUS}`}>
            My invoices
          </a>
          <a role="menuitem" href="/app/account" className={`block rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash ${FOCUS}`}>
            Account
          </a>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await signOut();
              window.location.assign('/');
            }}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-strong hover:bg-wash ${FOCUS}`}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Mobile menu rows: the same choices, as plain links. */
export function MobileAccountLinks({ onNavigate }: { onNavigate: () => void }) {
  const me = useMe({ lazy: true });
  const pathname = usePathname();
  const row = 'block rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash';
  if (me.status === 'loading') return null;
  if (me.status === 'anon') {
    return (
      <a href={loginHref(pathname)} onClick={onNavigate} className={row}>
        Log in
      </a>
    );
  }
  return (
    <>
      <a href="/app/invoices" onClick={onNavigate} className={row}>
        My invoices
      </a>
      <a href="/app/account" onClick={onNavigate} className={row}>
        Account
      </a>
    </>
  );
}
