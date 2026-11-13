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
  children,
}: {
  /** Names the group for assistive tech, e.g. "QR type". */
  label: string;
  className?: string;
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

  const arrow =
    'absolute top-0 z-10 grid h-10 w-9 place-items-center bg-surface/95 text-strong shadow-soft focus-visible:outline-none md:hidden';

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        data-scroll-row
        className="flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible"
      >
        {children}
      </div>
      {edges.left && (
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(-1)} data-scroll-left className={`${arrow} left-0 rounded-r-full`}>
          <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
        </button>
      )}
      {edges.right && (
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => nudge(1)} data-scroll-right className={`${arrow} right-0 rounded-l-full`}>
          <Icon name="chevron-right" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
