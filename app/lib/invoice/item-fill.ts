/**
 * Filling an invoice line from a saved item — the rule, in one place, framework-free (tested in
 * test/item-fill.test.mts). It lives in the editor's memory only: the invoice document is unchanged.
 *
 * When the description matches one saved item exactly (any case, ignoring spaces at the ends), the line's
 * rate, unit, HSN/SAC and GST rate are filled — but **never over something the person typed**:
 *
 *   - a field is written only if it is empty, or still holds exactly what the *previous* fill put there;
 *   - so switching from one saved item to another replaces the first item's values (including clearing ones the
 *     new item doesn't have — no stale HSN/SAC left behind), while a rate the person edited is left alone;
 *   - going back to the same description later restores unedited fields and again leaves edited ones;
 *   - when two saved items share the name, nothing is filled — there is no way to know which was meant — and a
 *     hint says so.
 *
 * Items carry no currency: the rate is filled as typed on the item, and can be changed on the invoice.
 */

import type { LineItem } from './types';

export type SavedItemLike = { id: string; name: string; hsnSac: string; unit: string; rate: string; gstRate: string };

/** What the last fill put into a line (null = that field was left as the person had it). */
export type LineFill = { itemId: string; rate: string | null; hsn: string | null; unit: string | null; gstRate: string | null };

export type FillMatch = { kind: 'none' } | { kind: 'one'; item: SavedItemLike } | { kind: 'many'; count: number; name: string };

const key = (s: string) => s.trim().toLowerCase();

export function matchSavedItem(description: string, items: readonly SavedItemLike[]): FillMatch {
  const k = key(description);
  if (!k) return { kind: 'none' };
  const hits = items.filter((it) => key(it.name) === k);
  return hits.length === 0 ? { kind: 'none' } : hits.length === 1 ? { kind: 'one', item: hits[0] } : { kind: 'many', count: hits.length, name: hits[0].name };
}

export type FillResult = {
  /** What to set on the line (always includes the description). */
  patch: Partial<LineItem>;
  /** The record to keep for this line. */
  fill: LineFill | undefined;
  /** A short plain-English note to show under the line, or null. */
  hint: string | null;
};

const FIELDS = [
  { line: 'rate', item: 'rate', label: 'rate' },
  { line: 'hsn', item: 'hsnSac', label: 'HSN/SAC' },
  { line: 'unit', item: 'unit', label: 'unit' },
  { line: 'gstRate', item: 'gstRate', label: 'GST rate' },
] as const;

export function fillFromSavedItem(line: LineItem, description: string, items: readonly SavedItemLike[], prev: LineFill | undefined): FillResult {
  const m = matchSavedItem(description, items);
  if (m.kind === 'none') return { patch: { description }, fill: prev, hint: null };
  if (m.kind === 'many') {
    return {
      patch: { description },
      fill: prev,
      hint: `${m.count} saved items are called “${m.name}”, so nothing was filled in. Rename one of them in Items.`,
    };
  }

  const patch: Partial<LineItem> = { description };
  const fill: LineFill = { itemId: m.item.id, rate: null, hsn: null, unit: null, gstRate: null };
  const kept: string[] = [];
  for (const f of FIELDS) {
    const current = (line[f.line] ?? '') as string;
    const last = prev ? prev[f.line] : null;
    const value = m.item[f.item] ?? '';
    if (current === '' || (last !== null && current === last)) {
      patch[f.line] = value;
      fill[f.line] = value;
    } else if (value !== '' && value !== current) {
      kept.push(f.label);
    }
  }
  return {
    patch,
    fill,
    hint: kept.length ? `Kept the ${kept.join(' and ')} you typed — the saved item has ${kept.length === 1 ? 'a different one' : 'different ones'}.` : null,
  };
}
