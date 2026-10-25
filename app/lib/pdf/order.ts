/** List helpers for the PDF tools (unit-tested in test/pdf-pages.test.mts). */

/** Move `from` to `to`, keeping everything else in order. Out-of-range moves change nothing. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** "1 page" / "12 pages" */
export function pagesLabel(n: number): string {
  return `${n} ${n === 1 ? 'page' : 'pages'}`;
}
