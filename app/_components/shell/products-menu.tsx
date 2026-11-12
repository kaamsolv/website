'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { featuredApps } from '@/app/lib/apps';
import { CATEGORIES, liveFirst, POPULAR_TOOLS, searchTools, TOOLS } from '@/app/lib/catalogue';

/**
 * The header's "Products" menu: categories, the featured applications, popular tools with a search box.
 * An accessible disclosure (a button that shows a region), not an ARIA menu: it opens on click, Escape
 * and a click outside close it, and Tab moves through it like any other content. Only live tools are
 * links. The panel is absolutely positioned under the header, so opening it never moves the page.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const LINK = `rounded-lg px-2 py-1.5 text-sm hover:bg-wash ${FOCUS}`;

function useLists(query: string) {
  const q = query.trim();
  const liveCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of TOOLS) if (t.status === 'live') m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, []);
  const popular = useMemo(() => POPULAR_TOOLS.filter((t) => t.status === 'live').slice(0, 5), []);
  const results = useMemo(() => (q ? liveFirst(searchTools(q, 12)).filter((t) => t.status === 'live').slice(0, 6) : []), [q]);
  return { q, liveCounts, popular, results };
}

export function ProductsMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const apps = featuredApps();
  const { q, liveCounts, popular, results } = useLists(query);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
    onNavigate?.();
  };

  return (
    <div ref={root} className="static">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash ${FOCUS} ${open ? 'bg-wash' : ''}`}
      >
        Products
        <Icon name="chevron-right" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Products"
          data-testid="products-menu"
          className="absolute inset-x-0 top-full z-50 border-b border-hair bg-surface shadow-lift"
        >
          <div className="kk-container grid gap-8 py-7 lg:grid-cols-[1.1fr_1fr_1fr]">
            <section aria-labelledby={`${panelId}-cat`}>
              <h2 id={`${panelId}-cat`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Browse by category
              </h2>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {CATEGORIES.map((c) => {
                  const a = ACCENT[c.accent];
                  return (
                    <li key={c.slug}>
                      <a href={`/tools#${c.slug}`} onClick={close} className={`flex items-center gap-2.5 ${LINK}`}>
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${a.tint} ${a.fg}`}>
                          <Icon name={c.icon} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
                        {(liveCounts.get(c.name) ?? 0) > 0 && <span className="text-xs text-muted">{liveCounts.get(c.name)}</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby={`${panelId}-apps`}>
              <h2 id={`${panelId}-apps`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Featured products
              </h2>
              <ul className="space-y-2">
                {apps.map((app) => {
                  const a = ACCENT[app.accent];
                  return (
                    <li key={app.id}>
                      <a href={app.href} onClick={close} className={`flex gap-3 rounded-xl border border-hair p-3 hover:bg-wash ${FOCUS}`}>
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${a.tint} ${a.fg}`}>
                          <Icon name={app.icon} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-display text-sm font-bold text-ink">{app.name}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{app.blurb}</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby={`${panelId}-pop`}>
              <h2 id={`${panelId}-pop`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {q ? 'Matching tools' : 'Popular tools'}
              </h2>
              <label className="relative mb-2 block">
                <span className="sr-only">Search tools</span>
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      root.current?.querySelector<HTMLAnchorElement>('[data-tool-link]')?.focus();
                    }
                  }}
                  placeholder="Search tools…"
                  autoComplete="off"
                  className={`h-10 w-full rounded-full border border-hair bg-fieldbg pl-9 pr-3 text-sm text-ink placeholder:text-muted ${FOCUS}`}
                />
              </label>
              <ul
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                  const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('[data-tool-link]') ?? [])];
                  const i = links.indexOf(document.activeElement as HTMLAnchorElement);
                  if (i < 0) return;
                  e.preventDefault();
                  links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
                }}
              >
                {(q ? results : popular).map((t) => (
                  <li key={t.slug}>
                    <a href={t.url} data-tool-link onClick={close} className={`block ${LINK}`}>
                      <span className="block font-medium text-ink">{t.name}</span>
                      <span className="block truncate text-xs text-muted">{t.blurb}</span>
                    </a>
                  </li>
                ))}
                {q && results.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">No tool for “{q}” yet.</li>}
              </ul>
            </section>
          </div>
          <div className="border-t border-hair bg-wash">
            <div className="kk-container flex items-center justify-between py-3">
              <p className="hidden text-sm text-muted sm:block">Small tools. Less kaam.</p>
              <a href="/tools" onClick={close} className={`inline-flex items-center gap-1 rounded text-sm font-semibold text-coral-600 hover:underline ${FOCUS}`}>
                Explore all products <Icon name="arrow-right" className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The same choices inside the phone menu: one collapsible group, plain links, nothing hidden behind hover. */
export function ProductsAccordion({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const apps = featuredApps();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash ${FOCUS}`}
      >
        Products
        <Icon name="chevron-right" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div id={id} role="region" aria-label="Products" data-testid="products-accordion" className="space-y-3 px-3 pb-2 pt-1">
          <ul className="space-y-0.5">
            {apps.map((app) => (
              <li key={app.id}>
                <a href={app.href} onClick={onNavigate} className={`block ${LINK} font-semibold text-ink`}>
                  {app.name}
                </a>
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-x-2 border-t border-hair pt-2">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <a href={`/tools#${c.slug}`} onClick={onNavigate} className={`block ${LINK} text-muted`}>
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
          <a href="/tools" onClick={onNavigate} className={`inline-flex items-center gap-1 rounded text-sm font-semibold text-coral-600 ${FOCUS}`}>
            Explore all products <Icon name="arrow-right" className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}
