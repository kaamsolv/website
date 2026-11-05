/**
 * The page editor's state, as plain data and a reducer (no React, no PDF library),
 * so every rule — undo, reset, delete-but-keep-one, rotate, reorder — is unit-tested
 * in test/pdf-organize.test.mts. The component only draws it.
 *
 * A page's `src` is its 0-based position in the original file and is also its
 * identity (a page can't be copied here, only kept, moved, rotated or dropped).
 */

export type Rotation = 0 | 90 | 180 | 270;
export type EditPage = { src: number; rotate: Rotation };
export type EditState = {
  /** Pages as they will be saved, in order. */
  pages: EditPage[];
  /** `src` of each ticked page. */
  selected: number[];
  /** Earlier versions of `pages`, newest last, for Undo. */
  past: EditPage[][];
  /** How many pages the file started with (what Reset goes back to). */
  count: number;
};

export type EditAction =
  | { type: 'toggle'; src: number }
  | { type: 'select'; srcs: number[] }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'rotate'; srcs: number[]; by: 90 | 180 | 270 }
  | { type: 'delete'; srcs: number[] }
  | { type: 'keepOnly'; srcs: number[] }
  | { type: 'move'; from: number; to: number }
  | { type: 'undo' }
  | { type: 'reset' };

/** How many steps Undo remembers. */
export const HISTORY_LIMIT = 50;

export function initEdit(count: number): EditState {
  return { pages: Array.from({ length: count }, (_, src) => ({ src, rotate: 0 })), selected: [], past: [], count };
}

const original = (count: number): EditPage[] => initEdit(count).pages;

/** True when the pages differ from the file as it was opened (order, rotation or missing pages). */
export function isEdited(state: EditState): boolean {
  return state.pages.length !== state.count || state.pages.some((p, i) => p.src !== i || p.rotate !== 0);
}

function commit(state: EditState, pages: EditPage[]): EditState {
  const kept = new Set(pages.map((p) => p.src));
  return {
    ...state,
    pages,
    selected: state.selected.filter((s) => kept.has(s)),
    past: [...state.past, state.pages].slice(-HISTORY_LIMIT),
  };
}

export function editReducer(state: EditState, action: EditAction): EditState {
  const has = (src: number) => state.pages.some((p) => p.src === src);
  switch (action.type) {
    case 'toggle':
      if (!has(action.src)) return state;
      return { ...state, selected: state.selected.includes(action.src) ? state.selected.filter((s) => s !== action.src) : [...state.selected, action.src] };
    case 'select':
      return { ...state, selected: [...new Set(action.srcs.filter(has))] };
    case 'selectAll':
      return { ...state, selected: state.pages.map((p) => p.src) };
    case 'clearSelection':
      return state.selected.length ? { ...state, selected: [] } : state;
    case 'rotate': {
      const targets = new Set(action.srcs.filter(has));
      if (targets.size === 0) return state;
      return commit(state, state.pages.map((p) => (targets.has(p.src) ? { ...p, rotate: ((p.rotate + action.by) % 360) as Rotation } : p)));
    }
    case 'delete': {
      const drop = new Set(action.srcs.filter(has));
      // Never leave an empty PDF: at least one page stays.
      if (drop.size === 0 || drop.size >= state.pages.length) return state;
      return commit(state, state.pages.filter((p) => !drop.has(p.src)));
    }
    case 'keepOnly': {
      const keep = new Set(action.srcs.filter(has));
      if (keep.size === 0 || keep.size === state.pages.length) return state;
      return commit(state, state.pages.filter((p) => keep.has(p.src)));
    }
    case 'move': {
      const { from, to } = action;
      const n = state.pages.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
      const next = [...state.pages];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return commit(state, next);
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const pages = state.past[state.past.length - 1];
      const kept = new Set(pages.map((p) => p.src));
      return { ...state, pages, past: state.past.slice(0, -1), selected: state.selected.filter((s) => kept.has(s)) };
    }
    case 'reset':
      if (!isEdited(state)) return state.selected.length ? { ...state, selected: [] } : state;
      return { ...commit(state, original(state.count)), selected: [] };
  }
}

/** What the PDF engine needs to build the file: source page and extra clockwise degrees, in saving order. */
export function toPlan(state: EditState): { index: number; rotate: Rotation }[] {
  return state.pages.map((p) => ({ index: p.src, rotate: p.rotate }));
}

/** A short plain-words account of what Save will do, e.g. "2 pages removed · 1 page turned · order changed". */
export function describeEdit(state: EditState): string {
  const removed = state.count - state.pages.length;
  const turned = state.pages.filter((p) => p.rotate !== 0).length;
  const reordered = state.pages.some((p, i, all) => i > 0 && p.src < all[i - 1].src);
  const parts: string[] = [];
  if (removed > 0) parts.push(`${removed} ${removed === 1 ? 'page' : 'pages'} removed`);
  if (turned > 0) parts.push(`${turned} ${turned === 1 ? 'page' : 'pages'} turned`);
  if (reordered) parts.push('order changed');
  return parts.join(' · ');
}
