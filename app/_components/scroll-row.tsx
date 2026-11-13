'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * A row of chips that scrolls sideways when it doesn't fit, in a way a mouse can use as well as a finger:
 *   - from `md` up it simply wraps onto more lines (nothing to scroll);
 *   - below `md` it scrolls: touch and trackpad as usual, the mouse wheel moves it sideways while the pointer is over it,
 *     and small arrow buttons appear at an edge when there is more in that direction;
 *   - keyboard: the chips are ordinary buttons, so Tab brings each into view.
 * The arrow buttons are for the pointer only (hidden from the tab order and from assistive tech).
 */
export function ScrollRow({
  label,
  className = '',
  always = false,
  children,
}: {
  /** Names the group for assistive tech, e.g. "QR type". */
  label: string;
  className?: string;
  /** A single line that scrolls at every width (never wraps), with the arrow buttons at every width too: for a slim bar, where wrapping would make it grow. */
  always?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: max - el.scrollLeft > 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // A vertical mouse wheel moves the row sideways, but only while there is room to move that way,
    // so the page can still scroll normally once the row reaches either end.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return;
      const canRight = el.scrollLeft < max - 1;
      const canLeft = el.scrollLeft > 1;
      if ((e.deltaY > 0 && canRight) || (e.deltaY < 0 && canLeft)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('scroll', measure);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, [measure]);

  const nudge = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * Math.max(120, (ref.current?.clientWidth ?? 0) * 0.7), behavior: 'smooth' });

  // `always` (a slim bar): small round buttons for a mouse only (a finger just scrolls), plus a soft fade at each edge that has more behind it.
  const arrow = always
    ? 'absolute top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-surface text-strong shadow-soft focus-visible:outline-none pointer-fine:grid'
    : 'absolute top-0 z-10 grid h-10 w-11 place-items-center bg-surface/95 text-strong shadow-soft focus-visible:outline-none md:hidden';
  const fade = always
    ? `linear-gradient(to right, ${edges.left ? 'transparent 0, #000 28px' : '#000 0'}, ${edges.right ? '#000 calc(100% - 28px), transparent 100%' : '#000 100%'})`
    : undefined;

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        data-scroll-row
        style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
        className={`flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${always ? 'py-0.5' : 'md:flex-wrap md:overflow-visible'}`}
      >
        {children}
      </div>
      {edges.left && (
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(-1)} data-scroll-left className={`${arrow} ${always ? 'left-0.5' : 'left-0 rounded-r-full'}`}>
          <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
        </button>
      )}
      {edges.right && (
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(1)} data-scroll-right className={`${arrow} ${always ? 'right-0.5' : 'right-0 rounded-l-full'}`}>
          <Icon name="chevron-right" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
