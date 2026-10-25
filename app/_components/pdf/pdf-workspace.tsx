'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageDropzone } from '../image/image-dropzone';
import { OnDeviceNote } from '../image/on-device-note';
import { Chips, Segmented } from '../choice';
import { Icon } from '../icons';
import { OrderList } from './order-list';
import { PdfThumb } from './pdf-thumb';
import { useEntitlements } from '@/app/lib/me-client';
import { downloadBlob } from '@/app/lib/image/export';
import { formatBytes, sizeDeltaLabel } from '@/app/lib/image/validate';
import { compressVerdict, compressedPdfName, extractedPdfName } from '@/app/lib/pdf/outcome';
import { toPdfToolError } from '@/app/lib/pdf/errors';
import { MAX_RENDER_PAGES, maxFileBytes, maxImagesToPdf, maxMergeFiles, sizeLimitLabel } from '@/app/lib/pdf/limits';
import type { MarginMode, PageSizeMode } from '@/app/lib/pdf/image-layout';
import { moveItem, pagesLabel } from '@/app/lib/pdf/order';
import type { PDFDocumentProxy } from '@/app/lib/pdf/pdfjs';
import { IMAGE_ACCEPT, IMAGE_INPUT_LABELS } from '@/app/lib/pdf/prepare-image';
import { assertImageSize, looksLikePdf, pdfBaseName, readPdfFile } from '@/app/lib/pdf/validate';

export type PdfTask = 'hub' | 'compress' | 'merge' | 'split' | 'pdf-to-jpg' | 'jpg-to-pdf';
type Action = 'compress' | 'merge' | 'split' | 'convert';
type ConvertMode = 'to-jpg' | 'from-images';

const TASK_PATH: Record<Exclude<PdfTask, 'hub'>, string> = {
  compress: '/compress-pdf',
  merge: '/merge-pdf',
  split: '/split-pdf',
  'pdf-to-jpg': '/pdf-to-jpg',
  'jpg-to-pdf': '/jpg-to-pdf',
};

function initialAction(task: PdfTask): { action: Action; mode: ConvertMode } {
  if (task === 'pdf-to-jpg') return { action: 'convert', mode: 'to-jpg' };
  if (task === 'jpg-to-pdf') return { action: 'convert', mode: 'from-images' };
  return { action: task === 'hub' ? 'compress' : task, mode: 'to-jpg' };
}

function taskOf(action: Action, mode: ConvertMode): Exclude<PdfTask, 'hub'> {
  return action === 'convert' ? (mode === 'to-jpg' ? 'pdf-to-jpg' : 'jpg-to-pdf') : action;
}

const ACTIONS: { value: Action; label: string; hint: string }[] = [
  { value: 'compress', label: 'Compress', hint: 'Make it smaller' },
  { value: 'merge', label: 'Merge', hint: 'Join PDFs' },
  { value: 'split', label: 'Split', hint: 'Pick pages' },
  { value: 'convert', label: 'Convert', hint: 'PDF ↔ JPG' },
];

type PdfItem = { id: string; file: File; bytes: Uint8Array; pages: number; doc: Promise<PDFDocumentProxy> };
type ImageItem = { id: string; file: File; url: string };
type JpgFile = { blob: Blob; url: string; filename: string; width: number; height: number };

type Done =
  | { kind: 'pdf'; blob: Blob; filename: string; bytes: number; inputBytes: number | null; pages: number | null; note?: string; again: string }
  | { kind: 'jpgs'; files: JpgFile[]; zipName: string }
  | { kind: 'not-smaller'; inputBytes: number; outputBytes: number };

type Busy = { label: string; done?: number; total?: number };

/** Frees pdf.js's copy of a document (its worker keeps one per open file). */
const closeDoc = (d: PDFDocumentProxy) => void d.loadingTask.destroy().catch(() => {});

let idCounter = 0;
const nextId = () => `f${++idCounter}`;

const PRIMARY =
  'h-12 w-full rounded-full bg-coral-500 px-5 text-sm font-semibold text-navy-900 hover:bg-coral-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';
const SECONDARY =
  'inline-flex h-11 items-center justify-center rounded-full border border-hair bg-surface px-4 text-sm font-semibold text-strong hover:bg-wash disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
// Text links with a 44 px tap height for phones.
const LINK =
  'inline-flex min-h-11 items-center rounded px-1 text-sm font-semibold text-coral-600 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

export function PdfWorkspace({ task }: { task: PdfTask }) {
  const ent = useEntitlements();
  const start = initialAction(task);
  const [action, setAction] = useState<Action>(start.action);
  const [mode, setMode] = useState<ConvertMode>(start.mode);
  const [pdfs, setPdfs] = useState<PdfItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dpi, setDpi] = useState<150 | 300>(150);
  const [pageSize, setPageSize] = useState<PageSizeMode>('a4');
  const [margin, setMargin] = useState<MarginMode>('none');

  const maxBytes = maxFileBytes(ent);
  const mergeCap = maxMergeFiles(ent);
  const imageCap = maxImagesToPdf(ent);

  // Object URLs we made: released on reset and unmount.
  const urls = useRef<Set<string>>(new Set());
  const track = (url: string) => (urls.current.add(url), url);
  const release = (url: string) => {
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  };
  const pdfsRef = useRef(pdfs);
  pdfsRef.current = pdfs;

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      pdfsRef.current.forEach((p) => p.doc.then(closeDoc, () => {}));
      import('@/app/lib/pdf/client').then((c) => c.terminatePdfWorker()).catch(() => {});
    },
    [],
  );

  const clearResult = useCallback(() => {
    setDone((d) => {
      if (d?.kind === 'jpgs') d.files.forEach((f) => release(f.url));
      return null;
    });
  }, []);

  function choose(nextAction: Action, nextMode: ConvertMode = mode) {
    setAction(nextAction);
    setMode(nextMode);
    setNotice([]);
    clearResult();
    // Each task URL is its own page; a router navigation would remount the
    // workspace and drop the loaded file. replaceState only changes the address
    // (Next.js keeps its router in step), so a refresh or a shared link opens
    // the right tool.
    if (task !== 'hub') window.history.replaceState(null, '', TASK_PATH[taskOf(nextAction, nextMode)]);
  }

  function startAgain() {
    pdfs.forEach((p) => p.doc.then(closeDoc, () => {}));
    images.forEach((i) => release(i.url));
    clearResult();
    setPdfs([]);
    setImages([]);
    setSelected(new Set());
    setNotice([]);
  }

  async function addPdfs(files: File[]) {
    const room = mergeCap - pdfs.length;
    const problems: string[] = [];
    if (files.length > room) {
      problems.push(room <= 0 ? `You can merge up to ${mergeCap} PDFs at a time.` : `Merge works with up to ${mergeCap} PDFs at a time — added the first ${room}.`);
    }
    const added: PdfItem[] = [];
    setReading(true);
    const { openPdf } = await import('@/app/lib/pdf/pdfjs');
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        const bytes = await readPdfFile(file, maxBytes);
        const doc = openPdf(bytes);
        const pages = (await doc).numPages;
        added.push({ id: nextId(), file, bytes, pages, doc });
      } catch (err) {
        problems.push(`${file.name}: ${toPdfToolError(err).message}`);
      }
    }
    setReading(false);
    if (added.length) {
      clearResult();
      setPdfs((list) => [...list, ...added]);
    }
    setNotice(problems);
    return added.length;
  }

  function addImages(files: File[]) {
    const room = imageCap - images.length;
    const problems: string[] = [];
    if (files.length > room) {
      problems.push(room <= 0 ? `A PDF can take up to ${imageCap} images here.` : `Up to ${imageCap} images per PDF — added the first ${room}.`);
    }
    const added: ImageItem[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        assertImageSize(file, maxBytes);
        added.push({ id: nextId(), file, url: track(URL.createObjectURL(file)) });
      } catch (err) {
        problems.push(`${file.name}: ${toPdfToolError(err).message}`);
      }
    }
    if (added.length) {
      clearResult();
      setImages((list) => [...list, ...added]);
    }
    setNotice(problems);
  }

  /** Drops on the hub can be PDFs or images; each goes where it belongs. */
  async function handleFiles(files: File[]) {
    const pdfFiles = files.filter(looksLikePdf);
    const imageFiles = files.filter((f) => !looksLikePdf(f));
    const wantsImages = action === 'convert' && mode === 'from-images';
    if (wantsImages || (task === 'hub' && pdfFiles.length === 0 && imageFiles.length > 0 && pdfs.length === 0)) {
      if (!wantsImages) choose('convert', 'from-images');
      addImages(imageFiles.length ? imageFiles : files);
      return;
    }
    const added = await addPdfs(pdfFiles.length ? pdfFiles : files);
    if (task === 'hub' && pdfs.length + added > 1 && action !== 'merge') choose('merge');
  }

  function removePdf(id: string) {
    const item = pdfs.find((p) => p.id === id);
    item?.doc.then(closeDoc, () => {});
    clearResult();
    setNotice([]);
    setPdfs((list) => list.filter((p) => p.id !== id));
    if (pdfs[0]?.id === id) setSelected(new Set());
  }

  function removeImage(id: string) {
    const item = images.find((i) => i.id === id);
    if (item) release(item.url);
    clearResult();
    setNotice([]);
    setImages((list) => list.filter((i) => i.id !== id));
  }

  async function run<T>(label: string, job: (progress: (done: number, total: number) => void) => Promise<T>): Promise<T | null> {
    setNotice([]);
    clearResult();
    setBusy({ label });
    try {
      return await job((d, t) => setBusy({ label, done: d, total: t }));
    } catch (err) {
      setNotice([toPdfToolError(err).message]);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const first = pdfs[0];

  async function doCompress() {
    if (!first) return;
    const { compressPdf, pdfBlob } = await import('@/app/lib/pdf/client');
    const res = await run('Making the pictures smaller', (p) => compressPdf(first.bytes, p));
    if (!res) return;
    if (compressVerdict(first.bytes.length, res.bytes.length) === 'not-smaller') {
      setDone({ kind: 'not-smaller', inputBytes: first.bytes.length, outputBytes: res.bytes.length });
      return;
    }
    const n = res.stats.imagesReplaced;
    setDone({
      kind: 'pdf',
      blob: pdfBlob(res.bytes),
      filename: compressedPdfName(pdfBaseName(first.file.name)),
      bytes: res.bytes.length,
      inputBytes: first.bytes.length,
      pages: first.pages,
      note: n > 0 ? `${n} ${n === 1 ? 'picture' : 'pictures'} made smaller. Text is untouched.` : 'Tidied up how the file is stored. Text is untouched.',
      again: 'Compress another',
    });
  }

  async function doMerge() {
    if (pdfs.length < 2) return;
    const { mergePdfs, pdfBlob } = await import('@/app/lib/pdf/client');
    const bytes = await run('Merging', (p) => mergePdfs(pdfs.map((x) => x.bytes), p));
    if (!bytes) return;
    setDone({
      kind: 'pdf',
      blob: pdfBlob(bytes),
      filename: 'merged.pdf',
      bytes: bytes.length,
      inputBytes: null,
      pages: pdfs.reduce((n, x) => n + x.pages, 0),
      again: 'Merge others',
    });
  }

  async function doSplit() {
    if (!first || selected.size === 0) return;
    const { extractPages, pdfBlob } = await import('@/app/lib/pdf/client');
    const bytes = await run('Making your new PDF', () => extractPages(first.bytes, [...selected]));
    if (!bytes) return;
    setDone({
      kind: 'pdf',
      blob: pdfBlob(bytes),
      filename: extractedPdfName(pdfBaseName(first.file.name)),
      bytes: bytes.length,
      inputBytes: null,
      pages: selected.size,
      again: 'Split another',
    });
  }

  async function doToJpg() {
    if (!first) return;
    const { renderPageJpeg, scaleForDpi } = await import('@/app/lib/pdf/pdfjs');
    const base = pdfBaseName(first.file.name);
    const width = String(first.pages).length;
    const files = await run('Turning pages into JPGs', async (progress) => {
      const doc = await first.doc;
      const out: JpgFile[] = [];
      progress(0, first.pages);
      for (let n = 1; n <= first.pages; n++) {
        const page = await renderPageJpeg(doc, n, scaleForDpi(dpi), 0.9);
        out.push({ ...page, url: track(URL.createObjectURL(page.blob)), filename: `${base}-page-${String(n).padStart(width, '0')}.jpg` });
        progress(n, first.pages);
      }
      return out;
    });
    if (files) setDone({ kind: 'jpgs', files, zipName: `${base}-jpg.zip` });
  }

  async function doFromImages() {
    if (images.length === 0) return;
    const [{ imagesToPdf, pdfBlob }, { prepareImageForPdf }] = await Promise.all([
      import('@/app/lib/pdf/client'),
      import('@/app/lib/pdf/prepare-image'),
    ]);
    const bytes = await run('Making your PDF', async (progress) => {
      const prepared = [];
      for (let i = 0; i < images.length; i++) {
        progress(i, images.length);
        try {
          prepared.push(await prepareImageForPdf(images[i].file));
        } catch (err) {
          throw Object.assign(toPdfToolError(err), { message: `${images[i].file.name}: ${toPdfToolError(err).message}` });
        }
      }
      progress(images.length, images.length);
      return imagesToPdf(prepared, pageSize, margin);
    });
    if (!bytes) return;
    setDone({ kind: 'pdf', blob: pdfBlob(bytes), filename: 'images.pdf', bytes: bytes.length, inputBytes: null, pages: images.length, again: 'Make another' });
  }

  async function downloadZip(files: JpgFile[], name: string) {
    const { zipSync } = await import('fflate');
    const entries: Record<string, Uint8Array> = {};
    for (const f of files) entries[f.filename] = new Uint8Array(await f.blob.arrayBuffer());
    downloadBlob(new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: 'application/zip' }), name);
  }

  const wantsImages = action === 'convert' && mode === 'from-images';
  const hasAnything = pdfs.length > 0 || images.length > 0;
  const working = busy !== null || reading;
  const tooManyPages = (action === 'split' || (action === 'convert' && mode === 'to-jpg')) && first && first.pages > MAX_RENDER_PAGES;
  const limitLabel = sizeLimitLabel(maxBytes);

  const pdfDrop = (
    <ImageDropzone
      accept="application/pdf,.pdf"
      extensions={['PDF']}
      multiple={action === 'merge' || task === 'hub'}
      onFile={(f) => handleFiles([f])}
      onFiles={handleFiles}
      disabled={working}
      title={action === 'merge' ? 'Drop your PDFs here' : 'Drop your PDF here'}
      detail={task === 'hub' && !hasAnything ? `PDF, JPG, PNG, WebP or HEIC · up to ${limitLabel} each` : `PDF · up to ${limitLabel}${action === 'merge' ? ' each' : ''}`}
    />
  );
  const imageDrop = (
    <ImageDropzone
      accept={IMAGE_ACCEPT}
      extensions={IMAGE_INPUT_LABELS}
      multiple
      onFile={(f) => handleFiles([f])}
      onFiles={handleFiles}
      disabled={working}
      title="Drop your images here"
      detail={`${IMAGE_INPUT_LABELS.join(', ')} · up to ${imageCap} images, ${limitLabel} each`}
    />
  );

  let panel: React.ReactNode = null;
  if (!hasAnything) {
    panel = wantsImages ? imageDrop : task === 'hub' ? <HubDrop drop={pdfDrop} /> : pdfDrop;
  } else if (wantsImages) {
    panel = images.length === 0 ? imageDrop : (
      <div className="space-y-4">
        <p className="text-sm text-muted">One image per page, in this order. Up to {imageCap} images.</p>
        <OrderList
          label="Images for the PDF"
          rows={images.map((img) => ({
            id: img.id,
            name: img.file.name,
            meta: formatBytes(img.file.size),
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            preview: <img src={img.url} alt="" className="h-full w-full rounded-md border border-hair object-cover" />,
          }))}
          onMove={(from, to) => {
            clearResult();
            setImages((l) => moveItem(l, from, to));
          }}
          onRemove={removeImage}
        />
        <AddMore label="Add images" accept={IMAGE_ACCEPT} disabled={working || images.length >= imageCap} onFiles={handleFiles} />
        <div className="grid gap-5 rounded-xl border border-hair bg-surface p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <Chips
              legend="Page size"
              options={[
                { value: 'a4' as const, label: 'A4' },
                { value: 'photo' as const, label: 'Photo size' },
              ]}
              value={pageSize}
              onChange={(v) => (clearResult(), setPageSize(v))}
            />
            <p className="mt-1.5 text-xs text-muted">
              {pageSize === 'a4' ? 'Each photo fits on an A4 page, turned to match.' : 'Each page takes the shape of its photo.'}
            </p>
          </div>
          <Chips
            legend="Margin"
            options={[
              { value: 'none' as const, label: 'None' },
              { value: 'small' as const, label: 'Small' },
            ]}
            value={margin}
            onChange={(v) => (clearResult(), setMargin(v))}
          />
        </div>
        <button type="button" className={PRIMARY} onClick={doFromImages} disabled={working}>
          Make PDF
        </button>
      </div>
    );
  } else if (pdfs.length === 0) {
    panel = pdfDrop;
  } else if (action === 'merge') {
    panel = (
      <div className="space-y-4">
        <p className="text-sm text-muted">Put them in order, then merge. Up to {mergeCap} PDFs at a time.</p>
        <OrderList
          label="PDFs to merge"
          rows={pdfs.map((p) => ({
            id: p.id,
            name: p.file.name,
            meta: `${pagesLabel(p.pages)} · ${formatBytes(p.file.size)}`,
            preview: <PdfThumb doc={p.doc} pageNumber={1} alt="" className="h-full w-full" />,
          }))}
          onMove={(from, to) => {
            clearResult();
            setPdfs((l) => moveItem(l, from, to));
          }}
          onRemove={removePdf}
        />
        {pdfs.length < mergeCap ? (
          <AddMore label="Add PDFs" accept="application/pdf,.pdf" disabled={working} onFiles={handleFiles} />
        ) : (
          <p className="text-sm text-muted">That&apos;s {mergeCap} — the most you can merge at a time.</p>
        )}
        <button type="button" className={PRIMARY} onClick={doMerge} disabled={working || pdfs.length < 2}>
          {pdfs.length < 2 ? 'Add another PDF to merge' : `Merge ${pdfs.length} PDFs`}
        </button>
      </div>
    );
  } else {
    panel = (
      <div className="space-y-4">
        <PdfFileCard item={first!} onRemove={() => removePdf(first!.id)} />
        {pdfs.length > 1 && (
          <p className="text-sm text-muted">
            This works on one PDF at a time — using <strong className="text-strong">{first!.file.name}</strong>. Your other{' '}
            {pdfs.length === 2 ? 'file is' : 'files are'} kept for Merge.
          </p>
        )}
        {tooManyPages ? (
          <p className="rounded-xl border border-yellow-300 bg-yellowx-100 px-4 py-3 text-sm text-strong" role="status">
            This PDF has {first!.pages} pages. Pages can be shown here for PDFs up to {MAX_RENDER_PAGES} pages — try splitting it in your PDF app first.
          </p>
        ) : action === 'compress' ? (
          <>
            <p className="text-sm text-muted">Shrinks the pictures inside your PDF. Text stays sharp and selectable.</p>
            {!done && (
              <button type="button" className={PRIMARY} onClick={doCompress} disabled={working}>
                Compress PDF
              </button>
            )}
          </>
        ) : action === 'split' ? (
          <SplitPicker
            item={first!}
            selected={selected}
            onChange={(s) => (clearResult(), setSelected(s))}
            onExtract={doSplit}
            disabled={working}
          />
        ) : (
          <>
            <div>
              <Chips
                legend="Image quality"
                options={[
                  { value: 150 as const, label: 'Standard' },
                  { value: 300 as const, label: 'High' },
                ]}
                value={dpi}
                onChange={(v) => (clearResult(), setDpi(v))}
              />
              <p className="mt-1.5 text-xs text-muted">
                {dpi === 150 ? '150 DPI — good for screens, sharing and most forms.' : '300 DPI — for printing. Bigger files.'}
              </p>
            </div>
            <button type="button" className={PRIMARY} onClick={doToJpg} disabled={working}>
              Convert {pagesLabel(first!.pages)} to JPG
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <OnDeviceNote subject="files" />

      {hasAnything && (
        <ActionPicker value={action} onChange={(a) => choose(a)} disabled={working} />
      )}
      {hasAnything && action === 'convert' && (
        <Segmented
          legend="Convert"
          hideLegend
          options={[
            { value: 'to-jpg' as const, label: 'PDF → JPG' },
            { value: 'from-images' as const, label: 'JPG → PDF' },
          ]}
          value={mode}
          onChange={(m) => choose('convert', m)}
          disabled={working}
        />
      )}

      {panel}

      {reading && <Progress busy={{ label: 'Opening your PDF' }} />}
      {busy && <Progress busy={busy} />}

      {notice.length > 0 && (
        <div className="rounded-xl border border-danger-400 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700" role="alert">
          {notice.length === 1 ? notice[0] : (
            <ul className="list-disc space-y-1 pl-5">
              {notice.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {done?.kind === 'not-smaller' && (
        <div className="rounded-xl border border-yellow-300 bg-yellowx-100 px-4 py-3 text-sm text-strong" role="status">
          <p className="font-semibold text-ink">This PDF is already about as small as it gets.</p>
          <p className="mt-1">
            Compressing saved less than 2% ({formatBytes(done.inputBytes)} → {formatBytes(done.outputBytes)}), so keep your original.
            PDFs that are mostly text are already compact — compressing helps most with scans and photos.
          </p>
          <button type="button" onClick={startAgain} className={`${SECONDARY} mt-3`}>
            Compress another
          </button>
        </div>
      )}
      {done?.kind === 'pdf' && <PdfResult done={done} onAgain={startAgain} />}
      {done?.kind === 'jpgs' && <JpgResult done={done} onZip={() => downloadZip(done.files, done.zipName)} onAgain={startAgain} />}

      {hasAnything && !done && (
        <p className="text-center">
          <button type="button" className={LINK} onClick={startAgain} disabled={working}>
            Start again
          </button>
        </p>
      )}
    </div>
  );
}

function HubDrop({ drop }: { drop: React.ReactNode }) {
  return (
    <div className="space-y-3">
      {drop}
      <p className="text-center text-sm text-muted">Then pick what to do: compress, merge, split or convert.</p>
    </div>
  );
}

/** The four actions — a radio group, 2 × 2 on phones, one row on wider screens. */
function ActionPicker({ value, onChange, disabled }: { value: Action; onChange: (a: Action) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold text-ink">What do you want to do?</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACTIONS.map((a) => {
          const on = value === a.value;
          return (
            <label key={a.value} className="relative">
              <input
                type="radio"
                name="pdf-action"
                value={a.value}
                checked={on}
                onChange={() => onChange(a.value)}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border px-4 py-2.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-coral-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
                  on ? 'border-activebg bg-activebg text-activetext shadow-soft' : 'border-hair bg-surface text-ink hover:border-muted'
                }`}
              >
                <span className="flex items-center gap-1.5 font-display text-sm font-bold">
                  {on && <Icon name="check" className="-ml-0.5 h-4 w-4" />}
                  {a.label}
                </span>
                <span className={`text-xs ${on ? 'opacity-80' : 'text-muted'}`}>{a.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PdfFileCard({ item, onRemove }: { item: PdfItem; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-hair bg-surface p-3">
      <PdfThumb doc={item.doc} pageNumber={1} alt={`First page of ${item.file.name}`} className="h-20 w-16 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{item.file.name}</p>
        <p className="text-xs text-muted">
          {pagesLabel(item.pages)} · {formatBytes(item.file.size)}
        </p>
      </div>
      <button type="button" onClick={onRemove} className={SECONDARY} aria-label={`Remove ${item.file.name}`}>
        Remove
      </button>
    </div>
  );
}

function SplitPicker({
  item,
  selected,
  onChange,
  onExtract,
  disabled,
}: {
  item: PdfItem;
  selected: Set<number>;
  onChange: (s: Set<number>) => void;
  onExtract: () => void;
  disabled: boolean;
}) {
  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onChange(next);
  };
  const count = selected.size;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Tick the pages you want. They&apos;ll be saved as a new PDF.</p>
        <div className="flex gap-4">
          <button type="button" className={LINK} onClick={() => onChange(new Set(Array.from({ length: item.pages }, (_, i) => i)))}>
            Select all
          </button>
          <button type="button" className={LINK} onClick={() => onChange(new Set())} disabled={count === 0}>
            Clear
          </button>
        </div>
      </div>
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
      <div className="sticky bottom-3 z-10">
        <button type="button" className={`${PRIMARY} shadow-lift`} onClick={onExtract} disabled={disabled || count === 0}>
          {count === 0 ? 'Pick at least one page' : `Extract ${pagesLabel(count)}`}
        </button>
      </div>
    </div>
  );
}

function AddMore({ label, accept, disabled, onFiles }: { label: string; accept: string; disabled?: boolean; onFiles: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={`${SECONDARY} w-full sm:w-auto`} onClick={() => input.current?.click()} disabled={disabled}>
        <span aria-hidden="true" className="mr-1.5 text-base leading-none">
          +
        </span>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (list.length) onFiles(list);
        }}
      />
    </>
  );
}

function Progress({ busy }: { busy: Busy }) {
  const pct = busy.total ? Math.round(((busy.done ?? 0) / busy.total) * 100) : null;
  return (
    <div className="rounded-xl2 border border-hair bg-surface p-5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-semibold text-ink">{busy.label}…</p>
        {busy.total ? (
          <p className="text-muted">
            {busy.done ?? 0} of {busy.total}
          </p>
        ) : null}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-wash">
        <div
          className={`h-full rounded-full bg-coral-500 transition-all duration-300 ${pct === null ? 'w-1/3 animate-pulse' : ''}`}
          style={pct === null ? undefined : { width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

function ResultShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-5" role="status">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-500 text-xs font-bold text-white" aria-hidden="true">
          ✓
        </span>
        <p className="font-display text-lg font-bold text-ink">{title}</p>
      </div>
      {children}
    </div>
  );
}

function PdfResult({ done, onAgain }: { done: Extract<Done, { kind: 'pdf' }>; onAgain: () => void }) {
  const delta = done.inputBytes ? sizeDeltaLabel(done.inputBytes, done.bytes) : '';
  return (
    <ResultShell title="Done. Your PDF is ready.">
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-faint">Filename</dt>
          <dd className="truncate font-medium text-ink">{done.filename}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Size</dt>
          <dd className="font-medium text-strong">{formatBytes(done.bytes)}</dd>
        </div>
        {done.inputBytes ? (
          <div>
            <dt className="text-xs text-faint">Original</dt>
            <dd className="font-medium text-strong">
              {formatBytes(done.inputBytes)}
              {delta ? ` · ${delta}` : ''}
            </dd>
          </div>
        ) : done.pages ? (
          <div>
            <dt className="text-xs text-faint">Pages</dt>
            <dd className="font-medium text-strong">{done.pages}</dd>
          </div>
        ) : null}
      </dl>
      {done.note && <p className="mt-3 text-sm text-strong">{done.note}</p>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => downloadBlob(done.blob, done.filename)}
          className="h-11 flex-1 rounded-full bg-coral-500 px-4 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          Download PDF
        </button>
        <button type="button" onClick={onAgain} className={SECONDARY}>
          {done.again}
        </button>
      </div>
    </ResultShell>
  );
}

function JpgResult({ done, onZip, onAgain }: { done: Extract<Done, { kind: 'jpgs' }>; onZip: () => void; onAgain: () => void }) {
  const one = done.files.length === 1;
  const total = done.files.reduce((n, f) => n + f.blob.size, 0);
  return (
    <ResultShell title={one ? 'Done. Your JPG is ready.' : `Done. ${done.files.length} JPGs are ready.`}>
      <p className="mt-2 text-sm text-strong">
        {formatBytes(total)} in total · {done.files[0].width} × {done.files[0].height} px{one ? '' : ' for page 1'}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={one ? () => downloadBlob(done.files[0].blob, done.files[0].filename) : onZip}
          className="h-11 flex-1 rounded-full bg-coral-500 px-4 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          {one ? 'Download JPG' : 'Download all (ZIP)'}
        </button>
        <button type="button" onClick={onAgain} className={SECONDARY}>
          Convert another
        </button>
      </div>
      {!one && (
        <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {done.files.map((f, i) => (
            <li key={f.filename}>
              <a
                href={f.url}
                download={f.filename}
                className="group block rounded-lg p-1 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img src={f.url} alt="" className="aspect-[3/4] w-full rounded-md border border-hair bg-white object-contain" />
                <span className="mt-1 block text-center text-xs font-semibold text-coral-600 group-hover:underline">
                  Page {i + 1}
                  <span className="sr-only"> — download {f.filename}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </ResultShell>
  );
}
