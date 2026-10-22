'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Customer, Item } from '@/app/lib/invoice/settings';

export type SavedCustomer = Customer & { id: string };
export type SavedItem = Item & { id: string };

/**
 * Saved customers and items for the signed-in editor — loaded once, then
 * offered as suggestions (`<datalist>`) on "Bill to" and item descriptions.
 */
export function useSavedLists(enabled: { customers: boolean; items: boolean }) {
  const [customers, setCustomers] = useState<SavedCustomer[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);

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
  }, [enabled.customers, enabled.items]);

  useEffect(() => {
    if (enabled.customers || enabled.items) void reload();
  }, [enabled.customers, enabled.items, reload]);

  return { customers, items, reload };
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
            {[it.hsnSac && `HSN/SAC ${it.hsnSac}`, it.rate && `₹${it.rate}`].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
    </>
  );
}
