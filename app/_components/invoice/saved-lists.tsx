'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Customer, Item } from '@/app/lib/invoice/settings';

export type SavedCustomer = Customer & { id: string };
export type SavedItem = Item & { id: string };

/** The plain list answers up to this many rows; a longer directory is searched on the server as you type instead. */
const LIST_CAP = 200;
const SEARCH_PAGE = 25;
const SEARCH_DELAY_MS = 250;

type Search = { timer: ReturnType<typeof setTimeout>; resolve: (rows: never[]) => void; ticket: number };

/**
 * Saved customers and items for the signed-in editor — loaded once, then offered as suggestions (`<datalist>`)
 * on "Bill to" and item descriptions. Up to 200 of each are loaded outright, exactly as before. If an account
 * has more than that (Pro can save up to 1,000), the suggestions come from a search on the server while you type
 * (`searchCustomers` / `searchItems`), so nothing past the 200th is out of reach.
 */
export function useSavedLists(enabled: { customers: boolean; items: boolean }) {
  const [customers, setCustomers] = useState<SavedCustomer[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [truncated, setTruncated] = useState({ customers: false, items: false });
  const pending = useRef<Record<string, Search | undefined>>({});
  const tickets = useRef(0);

  const reload = useCallback(async () => {
    const get = async <T,>(path: string): Promise<T[]> => {
      const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      return res?.ok ? (((await res.json()) as { rows: T[] }).rows ?? []) : [];
    };
    const [c, i] = await Promise.all([
      enabled.customers ? get<SavedCustomer>('/api/customers') : Promise.resolve([]),
      enabled.items ? get<SavedItem>('/api/items') : Promise.resolve([]),
    ]);
    setCustomers(c);
    setItems(i);
    setTruncated({ customers: c.length >= LIST_CAP, items: i.length >= LIST_CAP });
  }, [enabled.customers, enabled.items]);

  useEffect(() => {
    if (enabled.customers || enabled.items) void reload();
  }, [enabled.customers, enabled.items, reload]);

  /** A moment after typing stops, ask the server for matches; the suggestions become those matches. Resolves with them (or [] if superseded). */
  const search = useCallback(<T,>(path: string, term: string, set: (rows: T[]) => void): Promise<T[]> => {
    const prior = pending.current[path];
    if (prior) {
      clearTimeout(prior.timer);
      prior.resolve([] as never[]);
    }
    return new Promise<T[]>((resolve) => {
      const ticket = ++tickets.current;
      const timer = setTimeout(async () => {
        const res = await fetch(`${path}?q=${encodeURIComponent(term.trim().slice(0, 80))}&page=1&pageSize=${SEARCH_PAGE}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
        const rows = res?.ok ? (((await res.json()) as { rows: T[] }).rows ?? []) : [];
        if (pending.current[path]?.ticket === ticket) {
          set(rows);
          pending.current[path] = undefined;
        }
        resolve(rows);
      }, SEARCH_DELAY_MS);
      pending.current[path] = { timer, resolve: resolve as (rows: never[]) => void, ticket };
    });
  }, []);

  const searchCustomers = useCallback((term: string) => search<SavedCustomer>('/api/customers', term, setCustomers), [search]);
  const searchItems = useCallback((term: string) => search<SavedItem>('/api/items', term, setItems), [search]);

  return { customers, items, reload, truncated, searchCustomers, searchItems };
}

/** Native suggestion lists; inputs point at them with `list=`. */
export function SavedDatalists({ customers, items }: { customers: SavedCustomer[]; items: SavedItem[] }) {
  return (
    <>
      <datalist id="saved-customers">
        {customers.map((c) => (
          <option key={c.id} value={c.name}>
            {c.gstin || c.email || ''}
          </option>
        ))}
      </datalist>
      <datalist id="saved-items">
        {items.map((it) => (
          <option key={it.id} value={it.name}>
            {[it.hsnSac && `HSN/SAC ${it.hsnSac}`, it.rate && `Rate ${it.rate}`].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
    </>
  );
}
