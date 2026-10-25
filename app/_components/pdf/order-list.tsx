'use client';

import { useState } from 'react';
import { Icon } from '../icons';

export type OrderRow = {
  id: string;
  name: string;
  /** "12 pages · 1.4 MB" */
  meta: string;
  preview: React.ReactNode;
};

const ICON_BUTTON =
  'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hair bg-surface text-strong hover:bg-wash disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/**
 * A numbered list the user can put in order: Move up / Move down buttons
 * (touch and keyboard), plus drag and drop with a mouse. Remove on every row.
 */
export function OrderList({
  rows,
  label,
  onMove,
  onRemove,
}: {
  rows: OrderRow[];
  /** "PDFs to merge" — names the list for screen readers. */
  label: string;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <ol aria-label={label} className="space-y-2">
      {rows.map((row, i) => (
        <li
          key={row.id}
          draggable
          onDragStart={(e) => {
            setDragging(i);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
          }}
          onDragOver={(e) => {
            if (dragging === null) return;
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver((o) => (o === i ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null && dragging !== i) onMove(dragging, i);
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          className={`flex items-center gap-3 rounded-xl border bg-surface p-2.5 pr-2 transition-colors sm:cursor-grab ${
            over === i && dragging !== i ? 'border-coral-500' : 'border-hair'
          } ${dragging === i ? 'opacity-60' : ''}`}
        >
          <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-muted" aria-hidden="true">
            {i + 1}
          </span>
          <div className="h-14 w-11 shrink-0">{row.preview}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
            <p className="text-xs text-muted">{row.meta}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={i === 0}
              onClick={() => onMove(i, i - 1)}
              aria-label={`Move ${row.name} up`}
            >
              <Icon name="chevron-right" className="h-4 w-4 -rotate-90" />
            </button>
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={i === rows.length - 1}
              onClick={() => onMove(i, i + 1)}
              aria-label={`Move ${row.name} down`}
            >
              <Icon name="chevron-right" className="h-4 w-4 rotate-90" />
            </button>
            <button type="button" className={ICON_BUTTON} onClick={() => onRemove(row.id)} aria-label={`Remove ${row.name}`}>
              <span aria-hidden="true" className="text-lg leading-none">
                ×
              </span>
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
