import { pageWindow, rangeText } from '@/app/lib/paging';

/**
 * Page links for a long list. Real links (so they open in a new tab and work without scripts) that the list
 * intercepts to change page without a reload; the current page is `aria-current`; the range ("26–50 of 132")
 * is a live status so a screen reader hears the change. Phones show previous / next and the range only.
 */
export function Pager({
  page,
  pages,
  pageSize,
  matched,
  hrefFor,
  onGo,
  label = 'Pages',
}: {
  page: number;
  pages: number;
  pageSize: number;
  matched: number;
  hrefFor: (page: number) => string;
  onGo?: (href: string, e: React.MouseEvent) => void;
  label?: string;
}) {
  const base = 'inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold';
  const link = `${base} text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500`;
  const item = (p: number, text: React.ReactNode, aria?: string) => (
    <a key={`p${p}-${aria ?? ''}`} href={hrefFor(p)} onClick={(e) => onGo?.(hrefFor(p), e)} aria-label={aria} className={link}>
      {text}
    </a>
  );
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted" role="status" data-testid="pager-range">
        Showing {rangeText(page, pageSize, matched)}
      </p>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {page > 1 ? item(page - 1, '← Previous', 'Previous page') : <span className={`${link} opacity-40`} aria-hidden="true">← Previous</span>}
          <span className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, pages).map((p, i) =>
              p === 'gap' ? (
                <span key={`g${i}`} className="px-1 text-muted" aria-hidden="true">
                  …
                </span>
              ) : p === page ? (
                <span key={p} aria-current="page" aria-label={`Page ${p}, current page`} className={`${base} bg-activebg text-activetext`}>
                  {p}
                </span>
              ) : (
                item(p, p, `Page ${p}`)
              ),
            )}
          </span>
          <span className="px-2 text-sm text-muted sm:hidden">
            {page} of {pages}
          </span>
          {page < pages ? item(page + 1, 'Next →', 'Next page') : <span className={`${link} opacity-40`} aria-hidden="true">Next →</span>}
        </div>
      )}
    </nav>
  );
}
