'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { ThemeToggle } from './theme-toggle';
import { ToolSearch } from './tool-search';

const NAV = [
  { label: 'Tools', href: '/tools' },
  { label: 'Categories', href: '/#categories' },
  { label: 'About', href: '/about' },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Show the compact header search only once the hero's own search has
  // scrolled up behind the header — no duplicate search box on the first
  // screen. Measured live each scroll so it can't get stuck on a stale value.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const anchor = document.getElementById('hero-search-anchor');
      const bottom = anchor?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY;
      setCondensed(bottom < 72);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="site-header sticky top-0 z-50 border-b border-hair backdrop-blur">
      <div className="kk-container flex h-16 items-center gap-4">
        <a href="/" aria-label="KaamSolv home" className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
          <span className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Kaam<span className="text-coral-500">Solv</span>
          </span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-1 text-sm font-medium text-strong lg:flex">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-lg px-3 py-2 hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Compact search — appears once the hero's own search scrolls away,
            so the first screen never shows two search boxes. */}
        <div
          className={`ml-auto hidden max-w-sm flex-1 transition-all duration-200 lg:block ${
            condensed ? 'opacity-100' : 'w-0 max-w-0 opacity-0'
          }`}
        >
          {condensed && <ToolSearch variant="compact" />}
        </div>

        <div className={`flex items-center gap-2 ${condensed ? 'shrink-0' : 'ml-auto'}`}>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <a
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 sm:inline-block"
          >
            Log in
          </a>
          <a
            href="/suggest-a-tool"
            className="inline-flex h-10 items-center rounded-full bg-coral-500 px-3.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:px-4"
          >
            <span className="sm:hidden">Suggest</span>
            <span className="hidden sm:inline">Suggest a tool</span>
          </a>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 lg:hidden"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} className="h-5 w-5" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" ref={menuRef} className="border-t border-hair bg-surface lg:hidden">
          <div className="kk-container space-y-1 py-3">
            <div className="pb-2">
              <ToolSearch variant="compact" />
            </div>
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-strong hover:bg-wash sm:hidden"
            >
              Log in
            </a>
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="text-sm font-medium text-muted">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
