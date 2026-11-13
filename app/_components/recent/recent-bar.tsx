'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { ScrollRow } from '../scroll-row';
import { useRecentTools } from './use-recent-tools';
import { CATEGORIES, TOOLS } from '@/app/lib/catalogue';
import { actionOf } from '@/app/lib/search-actions';
import { clearRecent, mostUsedList, readBarClosed, recentList, setBarClosed, showsRecentBar, subscribeBar, usesText } from '@/app/lib/recent-tools';

type View = 'recent' | 'most';

/** More than fit on any screen: the row scrolls, so a person who uses many tools can still reach them all. */
const MAX = 12;

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/**
 * A slim bar under the header with the tools this device used lately (or uses most), so a returning visitor is one tap from where
 * they left off. It shows only where people choose a tool (the home page and /tools), never inside a tool or the workspace, and only
 * to someone who has used a tool. The chips sit on one line and scroll sideways when they do not fit (touch, wheel, arrow buttons,
 * and Tab). The switch opens a small panel: Recent or Most used, and Clear. The close button hides the bar until the next visit to
 * the home page. Kept on the device (app/lib/recent-tools.ts); nothing is sent anywhere.
 */
export function RecentBar() {
  const pathname = usePathname();
  const list = useRecentTools();
  const closed = useSyncExternalStore(subscribeBar, readBarClosed, () => false);
  const [hiddenHere, setHiddenHere] = useState(false);
  const [view, setView] = useState<View>('recent');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [announce, setAnnounce] = useState('');
  const menuId = useId();
  const switchRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Stored values are only read in the browser, so the first (server) render has no bar; it fills in once the page is up.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Opening the home page always brings the bar back.
  useEffect(() => {
    if (pathname === '/') {
      setBarClosed(false);
      setHiddenHere(false);
    }
  }, [pathname]);

  const recent = useMemo(() => recentList(list, MAX), [list]);
  const most = useMemo(() => mostUsedList(list, MAX), [list]);
  const mostOn = view === 'most' && most.length > 0;
  const shown = mostOn ? most : recent;

  useEffect(() => {
    if (view === 'most' && most.length === 0) setView('recent');
  }, [view, most.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        switchRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !switchRef.current?.contains(t)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    panelRef.current?.querySelector<HTMLElement>('input:checked, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menuOpen]);

  if (!showsRecentBar(pathname)) return null;

  const visible = mounted && recent.length > 0 && !closed && !hiddenHere;

  function hide() {
    setHiddenHere(true);
    setBarClosed(true);
    setMenuOpen(false);
  }

  function clear() {
    clearRecent();
    setMenuOpen(false);
    setAnnounce('Recent tools cleared.');
    // The button that was pressed is gone now: put the focus on the page title so a keyboard or screen-reader user is not dropped at the top.
    requestAnimationFrame(() => {
      const h1 = document.querySelector('h1');
      if (h1) {
        h1.setAttribute('tabindex', '-1');
        h1.focus();
      }
    });
  }

  return (
    <>
      {/* The slot keeps the bar's space reserved from the first paint (see globals.css), so the page never jumps down. */}
      <div className="recent-slot" data-open={mounted ? String(visible) : undefined}>
        {visible && (
          <nav aria-label="Your recent tools" data-testid="recent-bar" className="relative z-40 h-11 border-b border-hair bg-wash pointer-coarse:h-[3.25rem]">
            <div className="kk-container flex h-full items-center gap-2">
              <div className="relative shrink-0">
                <button
                  ref={switchRef}
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? menuId : undefined}
                  onClick={() => setMenuOpen((o) => !o)}
                  data-testid="recent-switch"
                  className={`inline-flex h-8 items-center gap-1 rounded-full border border-hair bg-surface px-3 text-xs font-semibold text-strong hover:bg-chip pointer-coarse:h-11 pointer-coarse:text-sm ${FOCUS}`}
                >
                  {mostOn ? 'Most used' : 'Recent'}
                  <Icon name="chevron-right" className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${menuOpen ? '-rotate-90' : 'rotate-90'}`} />
                </button>
                {menuOpen && (
                  <div id={menuId} ref={panelRef} data-testid="recent-panel" className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border border-hair bg-raised p-2 shadow-lift">
                    {most.length > 0 && (
                      <fieldset className="space-y-0.5 border-b border-hair pb-2">
                        <legend className="sr-only">Show</legend>
                        {(['recent', 'most'] as View[]).map((v) => (
                          <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm font-semibold text-ink hover:bg-wash has-checked:bg-wash pointer-coarse:min-h-11">
                            <input
                              type="radio"
                              name={`${menuId}-view`}
                              checked={(v === 'most') === mostOn}
                              onChange={() => {
                                setView(v);
                                setMenuOpen(false);
                              }}
                              className="h-4 w-4 accent-coral-500"
                            />
                            {v === 'recent' ? 'Recent' : 'Most used'}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <button
                      type="button"
                      onClick={clear}
                      data-testid="recent-clear"
                      className={`${most.length > 0 ? 'mt-1' : ''} flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm font-semibold text-coralx-600 hover:bg-wash pointer-coarse:min-h-11 ${FOCUS}`}
                    >
                      Clear recent tools
                    </button>
                  </div>
                )}
              </div>

              <ScrollRow label="Your recent tools" always className="min-w-0 flex-1">
                {shown.map((entry) => {
                  const tool = TOOLS.find((t) => t.slug === entry.slug);
                  if (!tool) return null;
                  const cat = CATEGORIES.find((c) => c.name === tool.category)!;
                  const a = ACCENT[cat.accent];
                  return (
                    <a
                      key={entry.slug}
                      href={tool.url}
                      title={mostOn ? `${tool.name} · ${usesText(entry.uses)}` : tool.name}
                      data-testid={`recent-${entry.slug}`}
                      className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-hair bg-surface pl-1.5 pr-3 text-sm font-medium text-ink transition-colors hover:bg-chip pointer-coarse:h-11 ${FOCUS}`}
                    >
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${a.tint} ${a.fg}`}>
                        <Icon name={cat.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="whitespace-nowrap">{actionOf(tool.slug) ?? tool.name}</span>
                    </a>
                  );
                })}
              </ScrollRow>

              <button
                type="button"
                onClick={hide}
                aria-label="Hide recent tools"
                data-testid="recent-hide"
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-chip hover:text-ink pointer-coarse:h-11 pointer-coarse:w-11 ${FOCUS}`}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          </nav>
        )}
      </div>
      <p role="status" className="sr-only">
        {announce}
      </p>
    </>
  );
}
