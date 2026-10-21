'use client';

/**
 * Browser-side "who am I" store, read from GET /api/me once per page and shared
 * by every component that asks (header, invoice editor, /app pages).
 *
 * Anonymous visitors don't pay for it on every page: the header only asks when
 * this browser has signed in before (a `kk.account` flag in localStorage, set
 * when /api/me says signed in, cleared when it says not). Pages that need the
 * truth (the editor, /app/*, /login) always ask — and the sign-in redirect
 * always lands on one of those, which sets the flag.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { entitlementsFrom, NO_ENTITLEMENTS, type Entitlements, type ResolvedEntitlements } from './entitlements';

export type MeUser = { id: string; email: string; name: string };

export type Me =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'signed-in'; user: MeUser; entitlements: ResolvedEntitlements; usage: { invoiceSave: number } };

const ACCOUNT_FLAG = 'kk.account';
const LOADING: Me = { status: 'loading' };
const ANON: Me = { status: 'anon' };

let state: Me = LOADING;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: Me) {
  state = next;
  for (const l of listeners) l();
}

function setFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(ACCOUNT_FLAG, '1');
    else localStorage.removeItem(ACCOUNT_FLAG);
  } catch {
    // Storage blocked: the header just shows "Log in".
  }
}

export function hasAccountFlag(): boolean {
  try {
    return localStorage.getItem(ACCOUNT_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Fetch /api/me now (e.g. after saving, to update the saved count). */
export function refreshMe(): Promise<void> {
  inflight ??= fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { signedIn: false }))
    .then((body: { signedIn: boolean; user?: MeUser; entitlements?: ResolvedEntitlements; usage?: { invoiceSave: number } }) => {
      if (body.signedIn && body.user) {
        setFlag(true);
        emit({
          status: 'signed-in',
          user: body.user,
          entitlements: body.entitlements ?? NO_ENTITLEMENTS,
          usage: body.usage ?? { invoiceSave: 0 },
        });
      } else {
        setFlag(false);
        emit(ANON);
      }
    })
    .catch(() => emit(ANON))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The current visitor. `lazy` (the header): skip the request for browsers that
 * have never signed in — they're anonymous.
 */
export function useMe(opts: { lazy?: boolean } = {}): Me {
  const me = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => LOADING,
  );
  // A lazy caller that skips the request treats the visitor as anonymous
  // *locally* — it never writes ANON to the shared store, so another component
  // that does ask (the editor) still gets the real answer, and so does this one
  // once it arrives.
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    if (state !== LOADING) return;
    if (opts.lazy && !hasAccountFlag()) setSkipped(true);
    else void refreshMe();
  }, [opts.lazy]);
  return skipped && me.status === 'loading' ? ANON : me;
}

/** Entitlements for the current visitor (anonymous → none). */
export function useEntitlements(): Entitlements {
  const me = useMe();
  if (me.status === 'signed-in') return entitlementsFrom(me.entitlements);
  return entitlementsFrom(NO_ENTITLEMENTS, me.status === 'loading');
}
