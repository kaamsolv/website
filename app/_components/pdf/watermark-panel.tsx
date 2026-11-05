'use client';

import { useEffect, useRef, useState } from 'react';
import { Chips, Segmented } from '../choice';
import { PdfThumb } from './pdf-thumb';
import { PRIMARY, SECONDARY } from './pdf-styles';
import {
  DEFAULT_IMAGE_WATERMARK,
  DEFAULT_TEXT_WATERMARK,
  MAX_OPACITY,
  MAX_WATERMARK_CHARS,
  MIN_OPACITY,
  WATERMARK_COLORS,
  checkImageWatermark,
  checkTextWatermark,
  pagesForWatermark,
  watermarkFontSize,
  type ImagePosition,
  type ImageWatermark,
  type TextWatermark,
  type WatermarkColor,
  type WatermarkLayout,
  type WatermarkSize,
} from '@/app/lib/pdf/watermark';
import { EDGE_MARGIN } from '@/app/lib/pdf/numbering';
import { IMAGE_ACCEPT, IMAGE_INPUT_LABELS } from '@/app/lib/pdf/prepare-image';
import type { PDFDocumentProxy } from '@/app/lib/pdf/pdfjs';

export type WatermarkJob = { kind: 'text'; mark: TextWatermark } | { kind: 'image'; mark: ImageWatermark; file: File };

const FIELD =
  'h-12 w-full rounded-xl border border-hair bg-surface px-3 text-base text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 sm:max-w-sm';
const POSITIONS: { value: ImagePosition; label: string }[] = [
  { value: 'center', label: 'Centre' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];

/** Width of `text` at 1 pt in bold Helvetica / Arial (they share widths), measured by the browser, for the preview. */
function useTextWidth(text: string): number {
  const [width, setWidth] = useState(0.6 * Math.max(1, text.length));
  useEffect(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    ctx.font = 'bold 100px Helvetica, Arial, sans-serif';
    setWidth(Math.max(0.01, ctx.measureText(text.trim() || ' ').width / 100));
  }, [text]);
  return width;
}

/**
 * Watermark: words or a picture, see-through, on all pages or the ones you name. The preview shows the first
 * page that will be stamped; it's close to the saved result, not pixel-exact.
 */
export function WatermarkPanel({
  item,
  disabled,
  onApply,
}: {
  item: { pages: number; doc: Promise<PDFDocumentProxy> };
  disabled: boolean;
  onApply: (job: WatermarkJob) => void;
}) {
  const [kind, setKind] = useState<'text' | 'image'>('text');
  const [text, setText] = useState(DEFAULT_TEXT_WATERMARK.text);
  const [layout, setLayout] = useState<WatermarkLayout>(DEFAULT_TEXT_WATERMARK.layout);
  const [size, setSize] = useState<WatermarkSize>(DEFAULT_TEXT_WATERMARK.size);
  const [color, setColor] = useState<WatermarkColor>(DEFAULT_TEXT_WATERMARK.color);
  const [textOpacity, setTextOpacity] = useState(DEFAULT_TEXT_WATERMARK.opacity);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [position, setPosition] = useState<ImagePosition>(DEFAULT_IMAGE_WATERMARK.position);
  const [share, setShare] = useState(DEFAULT_IMAGE_WATERMARK.widthShare);
  const [imageOpacity, setImageOpacity] = useState(DEFAULT_IMAGE_WATERMARK.opacity);
  const [pagesText, setPagesText] = useState('');
  const [shape, setShape] = useState<{ width: number; height: number } | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const which = pagesForWatermark(pagesText, item.pages);
  const previewPage = which.ok && which.pages ? which.pages[0] + 1 : 1;
  const widthAt1 = useTextWidth(text);

  useEffect(() => {
    if (!file) return setFileUrl(null);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
  const opacity = kind === 'text' ? textOpacity : imageOpacity;
  const textMark: TextWatermark = { text, layout, size, color, opacity: textOpacity, pages: which.ok ? which.pages : null };
  const imageMark: ImageWatermark = { position, widthShare: share, opacity: imageOpacity, pages: which.ok ? which.pages : null };
  const problem = !which.ok ? which.message : kind === 'text' ? (() => { const c = checkTextWatermark(textMark); return c.ok ? null : c.message; })() : !file ? 'Choose a picture first.' : (() => { const c = checkImageWatermark(imageMark); return c.ok ? null : c.message; })();

  const previewSize = watermarkFontSize(widthAt1, w, h, layout, size);
  const imageStyle: React.CSSProperties = {
    width: `${share * 100}%`,
    opacity: imageOpacity,
    ...(position === 'center'
      ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
      : {
          [position.startsWith('top') ? 'top' : 'bottom']: `${(EDGE_MARGIN / h) * 100}%`,
          [position.endsWith('left') ? 'left' : 'right']: `${(EDGE_MARGIN / w) * 100}%`,
        }),
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Stamps words or a picture on your pages, see-through so the page still reads. It’s drawn on top of each page you choose.</p>
      <Segmented
        legend="Watermark with"
        options={[
          { value: 'text' as const, label: 'Words' },
          { value: 'image' as const, label: 'A picture' },
        ]}
        value={kind}
        onChange={setKind}
        disabled={disabled}
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-5">
          {kind === 'text' ? (
            <>
              <div>
                <label htmlFor="wm-text" className="block text-sm font-semibold text-ink">
                  Words
                </label>
                <input id="wm-text" className={`${FIELD} mt-1`} value={text} maxLength={MAX_WATERMARK_CHARS + 20} disabled={disabled} onChange={(e) => setText(e.target.value)} placeholder="CONFIDENTIAL" autoComplete="off" />
              </div>
              <Chips legend="Direction" options={[{ value: 'diagonal' as const, label: 'Diagonal' }, { value: 'center' as const, label: 'Straight across' }]} value={layout} onChange={setLayout} disabled={disabled} />
              <Chips legend="Size" options={[{ value: 'small' as const, label: 'Small' }, { value: 'medium' as const, label: 'Medium' }, { value: 'large' as const, label: 'Large' }]} value={size} onChange={setSize} disabled={disabled} />
              <Chips legend="Colour" options={(Object.keys(WATERMARK_COLORS) as WatermarkColor[]).map((c) => ({ value: c, label: WATERMARK_COLORS[c].label }))} value={color} onChange={setColor} disabled={disabled} />
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-ink">Picture</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <button type="button" className={SECONDARY} disabled={disabled} onClick={() => pick.current?.click()}>
                    {file ? 'Choose another picture' : 'Choose a picture'}
                  </button>
                  <span className="min-w-0 truncate text-sm text-muted" data-testid="wm-file-name">
                    {file ? file.name : `${IMAGE_INPUT_LABELS.join(', ')}`}
                  </span>
                </div>
                <input
                  ref={pick}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Watermark picture"
                  data-testid="wm-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    if (f) setFile(f);
                  }}
                />
                <p className="mt-1.5 text-xs text-muted">A logo with a clear background works best (PNG). Need Hindi or another script? Make it as a picture and use it here.</p>
              </div>
              <Chips legend="Where" options={POSITIONS} value={position} onChange={setPosition} disabled={disabled} />
              <RangeField id="wm-size" label="Size" value={Math.round(share * 100)} min={10} max={100} unit="% of the page width" onChange={(v) => setShare(v / 100)} disabled={disabled} />
            </>
          )}
          <RangeField
            id="wm-opacity"
            label="How solid"
            value={Math.round(opacity * 100)}
            min={Math.round(MIN_OPACITY * 100)}
            max={Math.round(MAX_OPACITY * 100)}
            unit="%"
            onChange={(v) => (kind === 'text' ? setTextOpacity(v / 100) : setImageOpacity(v / 100))}
            disabled={disabled}
          />
          <div>
            <label htmlFor="wm-pages" className="block text-sm font-semibold text-ink">
              Pages <span className="font-normal text-muted">(empty = every page)</span>
            </label>
            <input id="wm-pages" className={`${FIELD} mt-1`} value={pagesText} placeholder="All pages, or 1-3, 5" disabled={disabled} onChange={(e) => setPagesText(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="wm-hint" />
          </div>
          <p id="wm-hint" className={`text-sm ${problem ? 'text-danger-700' : 'text-muted'}`} role={problem ? 'alert' : undefined} data-testid="wm-hint">
            {problem ?? (which.ok && which.pages ? `Goes on ${which.pages.length} of ${item.pages} pages.` : `Goes on all ${item.pages} ${item.pages === 1 ? 'page' : 'pages'}.`)}
          </p>
        </div>
        <figure className="mx-auto w-full max-w-[14rem] md:mx-0">
          <div className="relative w-full overflow-hidden rounded-md shadow-soft" style={{ aspectRatio: `${w} / ${h}`, containerType: 'inline-size' }} data-testid="wm-preview">
            <PdfThumb doc={item.doc} pageNumber={previewPage} alt={`Page ${previewPage}`} className="h-full w-full" />
            {kind === 'text' && text.trim() !== '' && (
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 whitespace-nowrap font-sans font-bold leading-none"
                style={{
                  fontSize: `${(previewSize / w) * 100}cqw`,
                  color: WATERMARK_COLORS[color].css,
                  opacity: textOpacity,
                  transform: `translate(-50%, -50%) rotate(${layout === 'diagonal' ? -45 : 0}deg)`,
                }}
                data-testid="wm-preview-text"
              >
                {text.trim()}
              </span>
            )}
            {kind === 'image' && fileUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL
              <img src={fileUrl} alt="" className="absolute h-auto" style={imageStyle} data-testid="wm-preview-image" />
            )}
          </div>
          <figcaption className="mt-2 text-center text-xs text-muted">Preview of page {previewPage}</figcaption>
        </figure>
      </div>
      <button
        type="button"
        className={PRIMARY}
        disabled={disabled || !!problem}
        onClick={() => onApply(kind === 'text' ? { kind: 'text', mark: { ...textMark, text: text.trim() } } : { kind: 'image', mark: imageMark, file: file! })}
      >
        Add watermark
      </button>
    </div>
  );
}

function RangeField({ id, label, value, min, max, unit, onChange, disabled }: { id: string; label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-semibold text-ink">
        <span>{label}</span>
        <span className="font-normal text-muted" data-testid={`${id}-value`}>
          {value}
          {unit === '%' ? '%' : ` ${unit}`}
        </span>
      </label>
      <input id={id} type="range" min={min} max={max} step={5} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 h-11 w-full cursor-pointer accent-coral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 sm:max-w-sm" />
      <div className="flex justify-between text-xs text-muted sm:max-w-sm">
        <span>{min}%</span>
        <span>{max}%</span>
      </div>
    </div>
  );
}
