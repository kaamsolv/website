'use client';

import { useEffect, useState } from 'react';
import { Chips } from '../choice';
import { PdfThumb } from './pdf-thumb';
import { PRIMARY } from './pdf-styles';
import {
  DEFAULT_NUMBER_OPTIONS,
  EDGE_MARGIN,
  MAX_START_NUMBER,
  NUMBER_FORMATS,
  NUMBER_POSITIONS,
  NUMBER_SIZES,
  checkNumberOptions,
  planNumberLabels,
  type NumberOptions,
} from '@/app/lib/pdf/numbering';
import type { PDFDocumentProxy } from '@/app/lib/pdf/pdfjs';

const FIELD =
  'h-12 w-28 rounded-xl border border-hair bg-surface px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/**
 * Page numbers: where, how it reads, where to start. A preview shows the number on the first page that gets one,
 * and what is on it follows what is chosen. The PDF itself is only written when the button is pressed.
 */
export function NumbersPanel({
  item,
  disabled,
  onApply,
}: {
  item: { pages: number; doc: Promise<PDFDocumentProxy> };
  disabled: boolean;
  onApply: (options: NumberOptions) => void;
}) {
  const [position, setPosition] = useState(DEFAULT_NUMBER_OPTIONS.position);
  const [format, setFormat] = useState(DEFAULT_NUMBER_OPTIONS.format);
  const [size, setSize] = useState(DEFAULT_NUMBER_OPTIONS.size);
  const [startAt, setStartAt] = useState(String(DEFAULT_NUMBER_OPTIONS.startAt));
  const [fromPage, setFromPage] = useState('1');
  const [shape, setShape] = useState<{ width: number; height: number } | null>(null);

  const options: NumberOptions = { position, format, size, startAt: startAt === '' ? NaN : Number(startAt), fromPage: fromPage === '' ? NaN : Number(fromPage) };
  const check = checkNumberOptions(options, item.pages);
  const previewPage = check.ok ? options.fromPage : 1;
  const label = check.ok ? planNumberLabels(options, item.pages)[previewPage - 1] ?? '' : '';

  // The preview takes the real shape of the page it shows (sideways pages included).
  useEffect(() => {
    let cancelled = false;
    item.doc
      .then((d) => d.getPage(previewPage))
      .then((p) => {
        const v = p.getViewport({ scale: 1 });
        if (!cancelled) setShape({ width: v.width, height: v.height });
        p.cleanup();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.doc, previewPage]);

  const w = shape?.width ?? 595;
  const h = shape?.height ?? 842;
  const place: React.CSSProperties = {
    [position.startsWith('top') ? 'top' : 'bottom']: `${(EDGE_MARGIN / h) * 100}%`,
    ...(position.endsWith('left') ? { left: `${(EDGE_MARGIN / w) * 100}%` } : position.endsWith('right') ? { right: `${(EDGE_MARGIN / w) * 100}%` } : { left: '50%', transform: 'translateX(-50%)' }),
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Writes a number on each page. Your text, links and pictures stay as they are.</p>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-5">
          <Chips legend="Where" options={NUMBER_POSITIONS} value={position} onChange={setPosition} disabled={disabled} />
          <Chips legend="How it reads" options={NUMBER_FORMATS} value={format} onChange={setFormat} disabled={disabled} />
          <Chips legend="Size" options={NUMBER_SIZES.map((s) => ({ value: s.value, label: s.label }))} value={size} onChange={setSize} disabled={disabled} />
          <div className="flex flex-wrap gap-5">
            <div>
              <label htmlFor="num-start" className="block text-sm font-semibold text-ink">
                Start numbering at
              </label>
              <input id="num-start" inputMode="numeric" className={`${FIELD} mt-1`} value={startAt} disabled={disabled} onChange={(e) => setStartAt(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
            <div>
              <label htmlFor="num-from" className="block text-sm font-semibold text-ink">
                Start on page
              </label>
              <input id="num-from" inputMode="numeric" className={`${FIELD} mt-1`} value={fromPage} disabled={disabled} onChange={(e) => setFromPage(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
          </div>
          <p className={`text-sm ${check.ok ? 'text-muted' : 'text-danger-700'}`} role={check.ok ? undefined : 'alert'}>
            {check.ok
              ? options.fromPage > 1
                ? `Pages 1 to ${options.fromPage - 1} are left without a number. Page ${options.fromPage} gets ${options.startAt}.`
                : `Every page is numbered, from ${options.startAt}. Up to ${MAX_START_NUMBER}.`
              : check.message}
          </p>
        </div>
        <figure className="mx-auto w-full max-w-[14rem] md:mx-0">
          <div className="relative w-full overflow-hidden rounded-md shadow-soft" style={{ aspectRatio: `${w} / ${h}`, containerType: 'inline-size' }} data-testid="number-preview">
            <PdfThumb doc={item.doc} pageNumber={previewPage} alt={`Page ${previewPage}`} className="h-full w-full" />
            {label && (
              <span aria-hidden="true" className="absolute whitespace-nowrap font-sans leading-none text-[#333]" style={{ ...place, fontSize: `${(size / w) * 100}cqw` }} data-testid="number-preview-label">
                {label}
              </span>
            )}
          </div>
          <figcaption className="mt-2 text-center text-xs text-muted">Preview of page {previewPage}</figcaption>
        </figure>
      </div>
      <button type="button" className={PRIMARY} disabled={disabled || !check.ok} onClick={() => onApply(options)}>
        Add page numbers
      </button>
    </div>
  );
}
