'use client';

import { useEffect, useRef, useState } from 'react';
import { Segmented } from '../choice';
import { PdfThumb } from './pdf-thumb';
import { LINK, PRIMARY } from './pdf-styles';
import { chunkPages, evenPages, formatPageRanges, oddPages, parsePageRanges } from '@/app/lib/pdf/ranges';
import { pagesLabel } from '@/app/lib/pdf/order';
import type { PDFDocumentProxy } from '@/app/lib/pdf/pdfjs';

type SplitItem = { file: { name: string }; pages: number; doc: Promise<PDFDocumentProxy> };
type Mode = 'pick' | 'every' | 'each';

/**
 * Split: pick pages by ticking them or by typing ranges ("1-3, 5, 8-"), or cut the PDF into
 * several files (every N pages, or one per page) as a ZIP. The tick grid is the one Split always had.
 */
export function SplitPanel({
  item,
  selected,
  onChange,
  onExtract,
  onGroups,
  disabled,
}: {
  item: SplitItem;
  selected: Set<number>;
  onChange: (s: Set<number>) => void;
  onExtract: () => void;
  onGroups: (groups: number[][]) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>('pick');
  const [every, setEvery] = useState('2');
  const [text, setText] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Ticking a page rewrites the box; typing in the box never rewrites what the person is writing.
  const fromTyping = useRef(false);
  useEffect(() => {
    if (fromTyping.current) {
      fromTyping.current = false;
      return;
    }
    setText(formatPageRanges([...selected]));
    setRangeError(null);
  }, [selected]);

  const n = Number(every);
  const everyOk = Number.isInteger(n) && n >= 1 && n <= item.pages;
  const groups = everyOk ? chunkPages(item.pages, n) : [];

  function typed(value: string) {
    setText(value);
    const parsed = parsePageRanges(value, item.pages);
    if (!parsed.ok) return setRangeError(parsed.message);
    setRangeError(null);
    const next = new Set(parsed.pages);
    const same = next.size === selected.size && [...next].every((p) => selected.has(p));
    if (!same) {
      fromTyping.current = true;
      onChange(next);
    }
  }

  return (
    <div className="space-y-4">
      <Segmented
        legend="How to split"
        options={[
          { value: 'pick' as const, label: 'Pick pages' },
          { value: 'every' as const, label: 'Every N pages' },
          { value: 'each' as const, label: 'One PDF per page' },
        ]}
        value={mode}
        onChange={setMode}
        disabled={disabled}
      />

      {mode === 'every' && (
        <div className="space-y-3 rounded-xl border border-hair bg-surface p-4">
          <label htmlFor="split-every" className="block text-sm font-semibold text-ink">
            Pages in each file
          </label>
          <input
            id="split-every"
            inputMode="numeric"
            className="h-12 w-28 rounded-xl border border-hair bg-surface px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            value={every}
            onChange={(e) => setEvery(e.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-describedby="split-every-hint"
          />
          <p id="split-every-hint" className={`text-sm ${everyOk ? 'text-muted' : 'text-danger-700'}`} role={everyOk ? undefined : 'alert'}>
            {everyOk
              ? `${pagesLabel(item.pages)} in groups of ${n} makes ${groups.length} ${groups.length === 1 ? 'file' : 'files'}, saved together as a ZIP.`
              : `Type a number from 1 to ${item.pages}.`}
          </p>
          <button type="button" className={PRIMARY} disabled={disabled || !everyOk || groups.length < 2} onClick={() => onGroups(groups)}>
            {!everyOk ? 'Enter a number first' : groups.length < 2 ? 'That’s one file already' : `Split into ${groups.length} PDFs`}
          </button>
        </div>
      )}

      {mode === 'each' && (
        <div className="space-y-3 rounded-xl border border-hair bg-surface p-4">
          <p className="text-sm text-muted">{item.pages === 1 ? 'This PDF has one page, so there’s nothing to split.' : `${pagesLabel(item.pages)} makes ${item.pages} PDFs, saved together as a ZIP.`}</p>
          <button type="button" className={PRIMARY} disabled={disabled || item.pages < 2} onClick={() => onGroups(chunkPages(item.pages, 1))}>
            {item.pages < 2 ? 'Nothing to split' : `Split into ${item.pages} PDFs`}
          </button>
        </div>
      )}

      {mode === 'pick' && (
        <>
          <div className="space-y-2">
            <label htmlFor="split-ranges" className="block text-sm font-semibold text-ink">
              Pages <span className="font-normal text-muted">(or tick them below)</span>
            </label>
            <input
              id="split-ranges"
              className="h-12 w-full rounded-xl border border-hair bg-surface px-3 text-base text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 sm:max-w-sm"
              placeholder="1-3, 5, 8-"
              value={text}
              disabled={disabled}
              onChange={(e) => typed(e.target.value)}
              aria-invalid={rangeError ? true : undefined}
              aria-describedby="split-ranges-hint"
              autoComplete="off"
              spellCheck={false}
            />
            <p id="split-ranges-hint" className={`text-sm ${rangeError ? 'text-danger-700' : 'text-muted'}`} role={rangeError ? 'alert' : undefined}>
              {rangeError ?? `This PDF has ${pagesLabel(item.pages)}. Write ranges like 1-3, 5, 8- (8- means page 8 to the end).`}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Tick the pages you want. They&apos;ll be saved as a new PDF.</p>
            <div className="flex flex-wrap gap-x-4">
              <button type="button" className={LINK} onClick={() => onChange(new Set(Array.from({ length: item.pages }, (_, i) => i)))}>
                Select all
              </button>
              <button type="button" className={LINK} onClick={() => onChange(new Set(oddPages(item.pages)))}>
                Odd pages
              </button>
              <button type="button" className={LINK} onClick={() => onChange(new Set(evenPages(item.pages)))} disabled={item.pages < 2}>
                Even pages
              </button>
              <button type="button" className={LINK} onClick={() => onChange(new Set())} disabled={selected.size === 0}>
                Clear
              </button>
            </div>
          </div>
          <PageTicks item={item} selected={selected} onChange={onChange} />
          <div className="sticky bottom-3 z-10">
            <button type="button" className={`${PRIMARY} shadow-lift`} onClick={onExtract} disabled={disabled || selected.size === 0}>
              {selected.size === 0 ? 'Pick at least one page' : `Extract ${pagesLabel(selected.size)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The grid of page previews with a tick on each (the part of Split that was always here). */
function PageTicks({ item, selected, onChange }: { item: SplitItem; selected: Set<number>; onChange: (s: Set<number>) => void }) {
  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onChange(next);
  };
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" aria-label={`Pages of ${item.file.name}`}>
      {Array.from({ length: item.pages }, (_, i) => {
        const on = selected.has(i);
        return (
          <li key={i}>
            <label className={`group block cursor-pointer rounded-lg p-1.5 transition-colors ${on ? 'bg-coralx-100 ring-2 ring-coral-500' : 'hover:bg-wash'}`}>
              <span className="relative block">
                <PdfThumb doc={item.doc} pageNumber={i + 1} alt="" className="aspect-[3/4] w-full" />
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(i)}
                  className="absolute left-1.5 top-1.5 h-5 w-5 cursor-pointer accent-coral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
                  aria-label={`Page ${i + 1}`}
                />
              </span>
              <span className={`mt-1 block text-center text-xs ${on ? 'font-semibold text-ink' : 'text-muted'}`}>Page {i + 1}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
