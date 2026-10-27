/**
 * Page maths shared by the invoice list, the customer and item directories and their APIs. Framework-free.
 * Pages are 1-based and addressed in the URL (`?page=3`); the server clamps a page past the end to the last one.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type Paging = { page: number; pageSize: number };

/** Reads `page` / `pageSize` from a query string. Absent = page 1 of 25; anything else must be a plain whole number in range. */
export function parsePaging(q: URLSearchParams): ({ ok: true } & Paging) | { ok: false; message: string } {
  const rawPage = q.get('page');
  const rawSize = q.get('pageSize');
  if (rawPage !== null && !/^[1-9]\d{0,5}$/.test(rawPage)) return { ok: false, message: 'That page number isn’t valid.' };
  if (rawSize !== null && !/^[1-9]\d{0,3}$/.test(rawSize)) return { ok: false, message: 'That page size isn’t valid.' };
  const pageSize = rawSize === null ? DEFAULT_PAGE_SIZE : Number(rawSize);
  if (pageSize > MAX_PAGE_SIZE) return { ok: false, message: `Pages can hold up to ${MAX_PAGE_SIZE} rows.` };
  return { ok: true, page: rawPage === null ? 1 : Number(rawPage), pageSize };
}

export const pageCount = (matched: number, pageSize: number): number => Math.max(1, Math.ceil(matched / Math.max(1, pageSize)));
export const clampPage = (page: number, pages: number): number => Math.min(Math.max(1, page), Math.max(1, pages));

/** "26–50 of 132" (or "0 results"). */
export function rangeText(page: number, pageSize: number, matched: number): string {
  if (matched === 0) return '0 results';
  const from = (page - 1) * pageSize + 1;
  return `${from}–${Math.min(matched, page * pageSize)} of ${matched}`;
}

/** Which page links to show: first, last and the neighbours of the current page, with gaps marked. */
export function pageWindow(page: number, pages: number, neighbours = 1): (number | 'gap')[] {
  const keep = new Set<number>([1, pages]);
  for (let p = page - neighbours; p <= page + neighbours; p++) if (p >= 1 && p <= pages) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : 'gap');
    out.push(p);
  });
  return out;
}
