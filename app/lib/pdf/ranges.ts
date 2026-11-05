/**
 * Page ranges as people type them ("1-3, 5, 8-") and the grouping helpers behind
 * "every N pages" and "one PDF per page". Pure, so it's unit-tested
 * (test/pdf-organize.test.mts) and safe to import anywhere.
 */

export type RangeResult = { ok: true; pages: number[] } | { ok: false; message: string };

/**
 * "1-3, 5, 8-" → 0-based page indices, sorted, no repeats.
 * Accepts commas, semicolons or spaces between parts; "8-" means 8 to the last page; "-3" means 1 to 3.
 * An empty string is fine (nothing picked). Anything else that doesn't make sense returns a plain message.
 */
export function parsePageRanges(text: string, pageCount: number): RangeResult {
  const cleaned = text.trim().replace(/\s*-\s*/g, '-');
  if (cleaned === '') return { ok: true, pages: [] };
  const picked = new Set<number>();
  for (const part of cleaned.split(/[\s,;]+/).filter(Boolean)) {
    const single = /^(\d+)$/.exec(part);
    const span = /^(\d*)-(\d*)$/.exec(part);
    let from: number;
    let to: number;
    if (single) {
      from = to = Number(single[1]);
    } else if (span && (span[1] !== '' || span[2] !== '')) {
      from = span[1] === '' ? 1 : Number(span[1]);
      to = span[2] === '' ? pageCount : Number(span[2]);
    } else {
      return { ok: false, message: `“${part}” isn’t a page or a range. Try something like 1-3, 5, 8-` };
    }
    if (from < 1 || to < 1) return { ok: false, message: 'Pages start at 1.' };
    if (from > to) return { ok: false, message: `“${part}” runs backwards. Write it as ${to}-${from}.` };
    if (to > pageCount) {
      const bad = from > pageCount ? from : to;
      return { ok: false, message: `This PDF has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}, so page ${bad} isn’t there.` };
    }
    for (let p = from; p <= to; p++) picked.add(p - 1);
  }
  return { ok: true, pages: [...picked].sort((a, b) => a - b) };
}

/** [0,1,2,4,7,8] → "1-3, 5, 8-9": the same pages, written the short way. */
export function formatPageRanges(indices: readonly number[]): string {
  const sorted = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i] + 1}-${sorted[j] + 1}` : String(sorted[i] + 1));
    i = j + 1;
  }
  return parts.join(', ');
}

/** Pages in groups of `n`: (7, 3) → [[0,1,2],[3,4,5],[6]]. `n` below 1 counts as 1. */
export function chunkPages(pageCount: number, n: number): number[][] {
  const size = Math.max(1, Math.floor(n) || 1);
  const groups: number[][] = [];
  for (let start = 0; start < pageCount; start += size) {
    groups.push(Array.from({ length: Math.min(size, pageCount - start) }, (_, k) => start + k));
  }
  return groups;
}

/** Every page on its own: (3) → [[0],[1],[2]]. */
export function singlePages(pageCount: number): number[][] {
  return chunkPages(pageCount, 1);
}

/** Odd pages (1, 3, 5…) as 0-based indices. */
export function oddPages(pageCount: number): number[] {
  return Array.from({ length: Math.ceil(pageCount / 2) }, (_, k) => k * 2);
}

/** Even pages (2, 4, 6…) as 0-based indices. */
export function evenPages(pageCount: number): number[] {
  return Array.from({ length: Math.floor(pageCount / 2) }, (_, k) => k * 2 + 1);
}
