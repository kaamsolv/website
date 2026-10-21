'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icons';
import { liveFirst, POPULAR_TOOLS, searchTools, toolHref, type Tool } from '../lib/catalogue';

type Variant = 'hero' | 'compact';

/**
 * The homepage's primary interaction: type what you need, see matching
 * tools, press Enter. Full ARIA combobox — arrow keys move, Enter opens,
 * Escape closes. With an empty field it offers the popular tools rather
 * than an empty void.
 */
export function ToolSearch({
  variant = 'hero',
  inputId,
  className = '',
}: {
  variant?: Variant;
  inputId?: string;
  className?: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const autoId = useId();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const trimmed = query.trim();
  const matches = useMemo(() => (trimmed ? liveFirst(searchTools(trimmed)) : []), [trimmed]);
  const showing: Tool[] = trimmed ? matches : POPULAR_TOOLS;
  const noResults = trimmed.length > 0 && matches.length === 0;

  useEffect(() => {
    setActive(-1);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function go(tool: Tool) {
    setOpen(false);
    router.push(toolHref(tool));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!showing.length) return;
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => {
        const n = showing.length;
        if (e.key === 'ArrowDown') return i + 1 >= n ? 0 : i + 1;
        return i - 1 < 0 ? n - 1 : i - 1;
      });
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && showing[active]) {
        e.preventDefault();
        go(showing[active]);
      } else if (matches[0]) {
        e.preventDefault();
        go(matches[0]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  const big = variant === 'hero';
  const activeId = active >= 0 && showing[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches[0]) go(matches[0]);
        }}
        className={big ? 'flex flex-col gap-2 sm:flex-row' : 'flex gap-2'}
      >
        <div className="relative flex-1">
          <span
            className={`pointer-events-none absolute left-0 top-0 grid place-items-center text-faint ${
              big ? 'h-14 w-14' : 'h-11 w-11'
            }`}
          >
            <Icon name="search" className={big ? 'h-5 w-5' : 'h-4 w-4'} />
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label="Search for a tool"
            autoComplete="off"
            placeholder="Search for a tool…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={`w-full rounded-full border border-hair bg-fieldbg text-ink placeholder:text-faint focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
              big ? 'h-14 pl-14 pr-4 text-base' : 'h-11 pl-11 pr-3 text-sm'
            }`}
          />
        </div>
        <button
          type="submit"
          className={`shrink-0 rounded-full bg-coral-500 font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
            big ? 'h-14 w-full px-7 text-base sm:w-auto' : 'h-11 px-5 text-sm'
          }`}
        >
          Search
        </button>
      </form>

      {open && (showing.length > 0 || noResults) && (
        <div
          className="kk-pop absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl2 border border-hair bg-raised"
          // keep focus in the input when a result is tapped
          onMouseDown={(e) => e.preventDefault()}
        >
          {showing.length > 0 && (
            <>
              <p
                id={autoId}
                className="border-b border-hair px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {trimmed ? 'Matching tools' : 'Popular tools'}
              </p>
              <ul id={listId} role="listbox" aria-labelledby={autoId} className="max-h-80 overflow-y-auto py-1">
                {showing.map((tool, i) => (
                  <li
                    key={tool.slug}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => go(tool)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                        i === active ? 'bg-wash' : ''
                      }`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-chip text-strong">
                        <Icon name="search" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{tool.name}</span>
                        <span className="block truncate text-xs text-muted">{tool.blurb}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-strong">
                        {tool.status === 'live' ? tool.category : 'Soon'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {noResults && (
            <div className="px-4 py-4 text-sm">
              <p className="font-semibold text-ink">No tool for “{trimmed}” yet.</p>
              <p className="mt-1 text-muted">
                It might be on the way —{' '}
                <a href="/contact#suggest" className="font-semibold text-coral-600 hover:underline">
                  tell us what you need
                </a>
                .
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
