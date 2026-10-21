'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { ImageDropzone } from './image-dropzone';
import { OnDeviceNote } from './on-device-note';
import { CropBox } from './crop-box';
import { Chips, Segmented } from '../choice';
import { fitImageToTarget, terminateConversionWorker } from '@/app/lib/image/worker-client';
import { downloadBlob } from '@/app/lib/image/export';
import { compressAcceptString, isCompressibleInput } from '@/app/lib/image/compress';
import { initialCrop, type CropState } from '@/app/lib/image/crop';
import { labelForFormatId } from '@/app/lib/image/registry/capabilities';
import type { FormatId } from '@/app/lib/image/registry/format-registry';
import type { TargetJob } from '@/app/lib/image/target-pipeline';
import {
  DEFAULT_DPI,
  KB_PICKS,
  kbLabel,
  kbToBytes,
  parseKb,
  qualityLabel,
  targetFilename,
  toPixels,
  type SizeUnit,
} from '@/app/lib/image/target-size';
import { detectImageFile, formatBytes } from '@/app/lib/image/validate';
import { probeImageDimensions } from '@/app/lib/image/probe';

const MAX_FILES = 20;
const INPUT_LABELS = ['JPG', 'PNG', 'WebP', 'HEIC', 'AVIF', 'BMP'];

const FIELD =
  'h-10 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

type Result = {
  key: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  quality: number;
  outcome: 'fits' | 'too-big' | 'too-small';
  inputBytes: number;
};

type Item = {
  id: string;
  file: File;
  format: FormatId;
  url: string;
  w: number | null;
  h: number | null;
  crop: CropState | null;
  result: Result | null;
  working: boolean;
  error: string | null;
};

type Preset = 'passport' | 'custom';

let nextId = 0;

export function ResizeKbWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Settings shared by every image.
  const [limitOn, setLimitOn] = useState(true);
  const [kbInput, setKbInput] = useState('50');
  const [minOn, setMinOn] = useState(false);
  const [minKbInput, setMinKbInput] = useState('');
  const [sizeOn, setSizeOn] = useState(false);
  const [preset, setPreset] = useState<Preset>('passport');
  const [unit, setUnit] = useState<SizeUnit>('cm');
  const [wInput, setWInput] = useState('3.5');
  const [hInput, setHInput] = useState('4.5');
  const [dpiInput, setDpiInput] = useState(String(DEFAULT_DPI));
  const [fit, setFit] = useState<'crop' | 'pad'>('crop');

  const urls = useRef<Set<string>>(new Set());
  const track = (u: string) => (urls.current.add(u), u);
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      terminateConversionWorker();
    },
    [],
  );

  // ---------------- derived settings
  const maxKb = limitOn ? parseKb(kbInput) : null;
  const minKb = limitOn && minOn ? parseKb(minKbInput) : null;
  const dpi = Number(dpiInput);
  const outW = sizeOn ? toPixels(Number(wInput), unit, dpi) : null;
  const outH = sizeOn ? toPixels(Number(hInput), unit, dpi) : null;

  const problems: string[] = [];
  if (!limitOn && !sizeOn) problems.push('Turn on a file size limit, an exact size, or both.');
  if (limitOn && maxKb === null) problems.push('Enter a size limit between 1 KB and 20 MB, like 50.');
  if (limitOn && minOn && minKb === null) problems.push('Enter a minimum size in KB, like 10.');
  if (maxKb !== null && minKb !== null && minKb >= maxKb) problems.push('The minimum must be smaller than the maximum.');
  if (sizeOn && (!Number.isFinite(outW) || !Number.isFinite(outH) || outW! < 1 || outH! < 1))
    problems.push('Enter a valid width and height.');
  else if (sizeOn && (outW! > 8000 || outH! > 8000)) problems.push('That size is over 8,000 px — try a smaller one.');
  const valid = problems.length === 0;

  const settingsKey = JSON.stringify({ maxKb, minKb, outW, outH, fit, dpi: sizeOn && unit !== 'px' ? dpi : null });

  const jobFor = useCallback(
    (item: Item): TargetJob => ({
      maxBytes: maxKb !== null ? kbToBytes(maxKb) : null,
      minBytes: minKb !== null ? kbToBytes(minKb) : null,
      width: sizeOn ? outW : null,
      height: sizeOn ? outH : null,
      fit,
      crop: item.crop,
      dpi: sizeOn && unit !== 'px' ? dpi : null,
    }),
    [maxKb, minKb, sizeOn, outW, outH, fit, unit, dpi],
  );
  const keyFor = (item: Item) => `${settingsKey}|${JSON.stringify(item.crop)}`;

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  // ---------------- files
  async function addFiles(files: File[]) {
    setNotice(null);
    const room = MAX_FILES - items.length;
    const accepted: Item[] = [];
    const rejected: string[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const d = await detectImageFile(file);
      if (!d.ok) {
        rejected.push(`${file.name}: ${d.message}`);
        continue;
      }
      if (!isCompressibleInput(d.detected.format)) {
        rejected.push(`${file.name}: ${labelForFormatId(d.detected.format)} isn't supported here — use JPG, PNG, WebP or HEIC.`);
        continue;
      }
      accepted.push({
        id: `img-${++nextId}`,
        file,
        format: d.detected.format,
        url: track(URL.createObjectURL(file)),
        w: null,
        h: null,
        crop: null,
        result: null,
        working: false,
        error: null,
      });
    }
    if (files.length > room) rejected.push(`Up to ${MAX_FILES} images at a time — the rest were left out.`);
    if (rejected.length) setNotice(rejected.join(' '));
    if (!accepted.length) return;

    setItems((list) => [...list, ...accepted]);
    setSelectedId((cur) => cur ?? accepted[0].id);
    for (const it of accepted) {
      probeImageDimensions(it.file, it.format)
        .then((dims) => update(it.id, { w: dims.width, h: dims.height, crop: initialCrop(dims.width, dims.height) }))
        .catch(() => update(it.id, { error: "Couldn't read this image's size." }));
    }
  }

  function remove(id: string) {
    setItems((list) => {
      const next = list.filter((it) => it.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  // ---------------- processing
  const run = useCallback(
    async (item: Item) => {
      const key = keyFor(item);
      update(item.id, { working: true, error: null });
      const res = await fitImageToTarget(item.file, jobFor(item));
      setItems((list) =>
        list.map((it) => {
          if (it.id !== item.id) return it;
          if (keyFor(it) !== key) return { ...it, working: false }; // settings moved on; ignore
          if (!res.ok) return { ...it, working: false, error: res.message, result: null };
          return {
            ...it,
            working: false,
            result: {
              key,
              blob: res.blob,
              url: track(URL.createObjectURL(res.blob)),
              width: res.width,
              height: res.height,
              quality: res.quality,
              outcome: res.outcome,
              inputBytes: res.inputBytes,
            },
          };
        }),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobFor, settingsKey],
  );

  const selected = items.find((it) => it.id === selectedId) ?? null;

  // Live preview of the selected image, debounced.
  useEffect(() => {
    if (!selected || !valid || selected.w === null) return;
    if (selected.result?.key === keyFor(selected)) return;
    const t = setTimeout(() => run(selected), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.w, selected?.crop, settingsKey, valid]);

  const upToDate = (it: Item) => it.result?.key === keyFor(it);
  const pending = items.filter((it) => !upToDate(it) && it.w !== null);
  const [batchRunning, setBatchRunning] = useState(false);

  async function resizeAll() {
    setBatchRunning(true);
    for (const it of pending) await run(it);
    setBatchRunning(false);
  }

  const nameFor = (it: Item) => targetFilename(it.file.name, maxKb, it.result?.width ?? 0, it.result?.height ?? 0);

  function downloadAll() {
    const entries: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    const ready = items.filter((it) => upToDate(it) && it.result!.outcome === 'fits');
    Promise.all(
      ready.map(async (it) => {
        let name = nameFor(it);
        for (let n = 2; used.has(name); n++) name = name.replace(/(\.jpg)$/, `-${n}$1`);
        used.add(name);
        entries[name] = new Uint8Array(await it.result!.blob.arrayBuffer());
      }),
    ).then(() => {
      // JPGs are already compressed; store them as-is.
      const zip = zipSync(entries, { level: 0 });
      downloadBlob(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), 'kaamsolv-resized-images.zip');
    });
  }

  const fitsCount = items.filter((it) => upToDate(it) && it.result!.outcome === 'fits').length;
  const aspect = outW && outH ? outW / outH : 1;

  // ---------------- render
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <OnDeviceNote />

      {/* Settings */}
      <div className="space-y-5 rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
        <fieldset className="space-y-2">
          <legend className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={limitOn} onChange={(e) => setLimitOn(e.target.checked)} className="h-4 w-4 accent-coral-500" aria-label="Limit the file size" />
            File size limit
          </legend>
          {limitOn && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Chips
                  legend="Quick sizes"
                  hideLegend
                  options={KB_PICKS.map((kb) => ({ value: kb as number, label: kbLabel(kb) }))}
                  value={maxKb ?? undefined}
                  onChange={(kb) => setKbInput(String(kb))}
                />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span className="sr-only">Maximum size in KB</span>
                  <input value={kbInput} onChange={(e) => setKbInput(e.target.value)} inputMode="decimal" className={`${FIELD} h-10 w-24`} />
                  KB max
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-strong">
                <input type="checkbox" checked={minOn} onChange={(e) => setMinOn(e.target.checked)} className="h-4 w-4 accent-coral-500" />
                My form also has a minimum
              </label>
              {minOn && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span className="sr-only">Minimum size in KB</span>
                  <input value={minKbInput} onChange={(e) => setMinKbInput(e.target.value)} inputMode="decimal" placeholder="10" className={`${FIELD} w-24`} />
                  KB min
                </label>
              )}
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3 border-t border-hair pt-4">
          <legend className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={sizeOn} onChange={(e) => setSizeOn(e.target.checked)} className="h-4 w-4 accent-coral-500" aria-label="Set an exact size" />
            Exact size (width × height)
          </legend>
          {sizeOn && (
            <>
              <Chips
                legend="Size preset"
                hideLegend
                options={[
                  { value: 'passport' as Preset, label: 'Passport photo 3.5 × 4.5 cm' },
                  { value: 'custom' as Preset, label: 'Custom' },
                ]}
                value={preset}
                onChange={(p) => {
                  setPreset(p);
                  if (p === 'passport') {
                    setUnit('cm');
                    setWInput('3.5');
                    setHInput('4.5');
                  }
                }}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="text-xs font-medium text-muted">
                  Width
                  <input value={wInput} onChange={(e) => (setWInput(e.target.value), setPreset('custom'))} inputMode="decimal" className={`${FIELD} mt-1`} />
                </label>
                <label className="text-xs font-medium text-muted">
                  Height
                  <input value={hInput} onChange={(e) => (setHInput(e.target.value), setPreset('custom'))} inputMode="decimal" className={`${FIELD} mt-1`} />
                </label>
                <label className="text-xs font-medium text-muted">
                  Unit
                  <select value={unit} onChange={(e) => (setUnit(e.target.value as SizeUnit), setPreset('custom'))} className={`${FIELD} mt-1`}>
                    <option value="px">px</option>
                    <option value="cm">cm</option>
                    <option value="mm">mm</option>
                    <option value="in">inches</option>
                  </select>
                </label>
                {unit !== 'px' && (
                  <label className="text-xs font-medium text-muted">
                    DPI
                    <input value={dpiInput} onChange={(e) => setDpiInput(e.target.value)} inputMode="numeric" className={`${FIELD} mt-1`} />
                  </label>
                )}
              </div>
              {Number.isFinite(outW) && Number.isFinite(outH) && unit !== 'px' && (
                <p className="text-xs text-muted">
                  = {outW} × {outH} px at {dpiInput} DPI
                </p>
              )}
              <Segmented
                legend="If your photo is a different shape"
                options={[
                  { value: 'crop' as const, label: 'Crop to fill' },
                  { value: 'pad' as const, label: 'Fit with white border' },
                ]}
                value={fit}
                onChange={setFit}
              />
            </>
          )}
        </fieldset>

        <p className="text-xs text-muted">
          Saved as JPG — what forms accept. Always check the size your form’s notice asks for.
        </p>
        {!valid && items.length > 0 && (
          <p className="text-sm font-medium text-danger-700" role="alert">
            {problems[0]}
          </p>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700" role="alert">
          {notice}
        </div>
      )}

      {items.length === 0 ? (
        <ImageDropzone accept={compressAcceptString()} extensions={INPUT_LABELS} onFile={(f) => addFiles([f])} multiple onFiles={addFiles} />
      ) : (
        <>
          {/* Selected image: crop + result */}
          {selected && (
            <div className="grid gap-4 md:grid-cols-2">
              <section aria-label="Your image" className="rounded-xl2 border border-hair bg-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink" title={selected.file.name}>
                    {selected.file.name}
                  </p>
                  <p className="shrink-0 text-xs text-muted">{formatBytes(selected.file.size)}</p>
                </div>
                {sizeOn && fit === 'crop' && selected.w && selected.h && selected.crop && valid ? (
                  <CropBox
                    src={selected.url}
                    srcW={selected.w}
                    srcH={selected.h}
                    aspect={aspect}
                    value={selected.crop}
                    onChange={(crop) => update(selected.id, { crop })}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img src={selected.url} alt="Your image" className="mx-auto max-h-80 rounded-lg object-contain" />
                )}
              </section>

              <section aria-label="Result" aria-live="polite" className="rounded-xl2 border border-hair bg-surface p-4">
                <ResultPanel
                  item={selected}
                  current={upToDate(selected)}
                  maxKb={maxKb}
                  minKb={minKb}
                  fixedSize={sizeOn}
                  valid={valid}
                  filename={nameFor(selected)}
                />
              </section>
            </div>
          )}

          {/* Batch list */}
          <section aria-label="Images" className="rounded-xl2 border border-hair bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {items.length} image{items.length === 1 ? '' : 's'}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.length < MAX_FILES && (
                  <label className="inline-flex h-9 cursor-pointer items-center rounded-full border border-hair bg-fieldbg px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-within:ring-2 focus-within:ring-coral-500">
                    Add more
                    <input
                      type="file"
                      multiple
                      accept={compressAcceptString()}
                      className="sr-only"
                      onChange={(e) => {
                        addFiles(Array.from(e.target.files ?? []));
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setItems([]);
                    setSelectedId(null);
                    setNotice(null);
                  }}
                  className="h-9 rounded-full border border-hair bg-fieldbg px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                >
                  Start again
                </button>
              </div>
            </div>
            {items.length > 1 && (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {items.map((it) => {
                  const status = it.working
                    ? 'Working…'
                    : it.error
                      ? 'Problem'
                      : upToDate(it)
                        ? it.result!.outcome === 'fits'
                          ? formatBytes(it.result!.blob.size)
                          : 'Doesn’t fit'
                        : 'Ready';
                  return (
                    <li key={it.id} className="relative">
                      <button
                        type="button"
                        onClick={() => setSelectedId(it.id)}
                        aria-pressed={it.id === selectedId}
                        aria-label={`${it.file.name}, ${status}`}
                        className={`block w-full overflow-hidden rounded-lg border-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
                          it.id === selectedId ? 'border-coral-500' : 'border-hair'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                        <img src={it.url} alt="" className="aspect-square w-full object-cover" />
                        <span className="block truncate px-1.5 py-1 text-[11px] font-semibold text-strong">{status}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(it.id)}
                        aria-label={`Remove ${it.file.name}`}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-navy-900/80 text-xs font-bold text-white hover:bg-navy-900"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {items.length > 1 && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={resizeAll}
                  disabled={!valid || batchRunning || pending.length === 0}
                  className="h-11 flex-1 rounded-full bg-coral-500 px-5 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {batchRunning ? 'Resizing…' : pending.length ? `Resize all ${items.length}` : 'All done'}
                </button>
                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={fitsCount === 0 || batchRunning}
                  className="h-11 flex-1 rounded-full border border-hair bg-surface px-5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Download all (.zip){fitsCount ? ` · ${fitsCount}` : ''}
                </button>
              </div>
            )}
            {items.length > 1 && fitsCount > 0 && fitsCount < items.length && !batchRunning && pending.length === 0 && (
              <p className="mt-2 text-xs text-muted">The ZIP has the {fitsCount} images that fit. Open the others to see why.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ResultPanel({
  item,
  current,
  maxKb,
  minKb,
  fixedSize,
  valid,
  filename,
}: {
  item: Item;
  current: boolean;
  maxKb: number | null;
  minKb: number | null;
  fixedSize: boolean;
  valid: boolean;
  filename: string;
}) {
  if (item.error) return <p className="text-sm font-medium text-danger-700">{item.error}</p>;
  if (!valid) return <p className="text-sm text-muted">Fix the settings above to see your result.</p>;
  if (!current || !item.result)
    return (
      <div className="grid h-full min-h-40 place-items-center text-sm text-muted" role="status">
        Working out the best result…
      </div>
    );

  const r = item.result;
  const size = r.blob.size;
  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
      <img src={r.url} alt="Result preview" className="mx-auto max-h-64 rounded-lg border border-hair object-contain" />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">File size</dt>
        <dd className="font-semibold text-ink">
          {formatBytes(size)}
          {maxKb !== null && <span className="font-normal text-muted"> of {kbLabel(maxKb)}</span>}
        </dd>
        <dt className="text-muted">Size</dt>
        <dd className="font-semibold text-ink">
          {r.width} × {r.height} px
        </dd>
        <dt className="text-muted">Quality</dt>
        <dd className="font-semibold text-ink">{qualityLabel(r.quality)}</dd>
      </dl>

      {r.outcome === 'fits' && (
        <>
          <p className="text-sm font-semibold text-tealx-600">✓ Fits. Ready to download.</p>
          {qualityLabel(r.quality) === 'Low' && (
            <p className="text-xs text-muted">That’s a tight limit, so quality is low. Check the preview before you upload.</p>
          )}
          <button
            type="button"
            onClick={() => downloadBlob(r.blob, filename)}
            className="h-11 w-full rounded-full bg-coral-500 px-4 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Download JPG
          </button>
        </>
      )}

      {r.outcome === 'too-big' && (
        <>
          <p className="text-sm text-strong" role="status">
            <strong className="text-ink">Can’t get under {maxKb !== null ? kbLabel(maxKb) : 'the limit'}.</strong>{' '}
            {fixedSize
              ? `At ${r.width} × ${r.height} px the smallest clean JPG is ${formatBytes(size)}. Raise the limit or use a smaller pixel size.`
              : `The closest we got is ${formatBytes(size)}. Try a higher limit.`}
          </p>
          <button
            type="button"
            onClick={() => downloadBlob(r.blob, filename)}
            className="h-11 w-full rounded-full border border-hair bg-surface px-4 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Download anyway ({formatBytes(size)} — over the limit)
          </button>
        </>
      )}

      {r.outcome === 'too-small' && (
        <p className="text-sm text-strong" role="status">
          <strong className="text-ink">It comes out under {minKb !== null ? kbLabel(minKb) : 'the minimum'}</strong> even at
          the best quality ({formatBytes(size)}). Use a larger pixel size, or a larger original photo. We don’t pad files with
          junk data to fake the size.
        </p>
      )}
    </div>
  );
}
