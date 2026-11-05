'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageDropzone } from '../image/image-dropzone';
import { OnDeviceNote } from '../image/on-device-note';
import { Chips } from '../choice';
import { OrderList } from './order-list';
import { NumbersPanel } from './numbers-panel';
import { PageEditor } from './page-editor';
import { PdfThumb } from './pdf-thumb';
import { ProtectPanel } from './protect-panel';
import { WatermarkPanel, type WatermarkJob } from './watermark-panel';
import { DocxResult, JpgResult, PdfResult, PdfZipResult, TextResult, type DocxDone, type JpgFile, type JpgsDone, type PdfDone, type PdfZipDone, type TextDone } from './results';
import { LINK, PRIMARY, SECONDARY } from './pdf-styles';
import { SplitPanel } from './split-panel';
import { ToolPicker } from './tool-picker';
import { useEntitlements } from '@/app/lib/me-client';
import { downloadBlob } from '@/app/lib/image/export';
import { trackToolError, trackToolSuccess } from '@/app/lib/analytics';
import { formatBytes } from '@/app/lib/image/validate';
import { compressVerdict, compressedPdfName, editedPdfName, extractedPdfName, splitPartName, splitZipName } from '@/app/lib/pdf/outcome';
import { numberedPdfName, type NumberOptions } from '@/app/lib/pdf/numbering';
import type { PagePlan } from '@/app/lib/pdf/organize';
import { protectedPdfName, type ProtectOptions } from '@/app/lib/pdf/protect-rules';
import { watermarkedPdfName } from '@/app/lib/pdf/watermark';
import { initialAction, pathOf, taskOf, type Action, type ConvertMode, type PdfTask } from '@/app/lib/pdf/tools';
import { toPdfToolError } from '@/app/lib/pdf/errors';
import { MAX_RENDER_PAGES, MAX_TEXT_PAGES, maxFileBytes, maxImagesToPdf, maxMergeFiles, sizeLimitLabel } from '@/app/lib/pdf/limits';
import type { MarginMode, PageSizeMode } from '@/app/lib/pdf/image-layout';
import { moveItem, pagesLabel } from '@/app/lib/pdf/order';
import type { PDFDocumentProxy } from '@/app/lib/pdf/pdfjs';
import { IMAGE_ACCEPT, IMAGE_INPUT_LABELS } from '@/app/lib/pdf/prepare-image';
import { assertImageSize, looksLikePdf, pdfBaseName, readPdfFile } from '@/app/lib/pdf/validate';

export type { PdfTask };

type PdfItem = { id: string; file: File; bytes: Uint8Array; pages: number; doc: Promise<PDFDocumentProxy> };
type ImageItem = { id: string; file: File; url: string };

type Done = PdfDone | JpgsDone | DocxDone | PdfZipDone | TextDone | { kind: 'not-smaller'; inputBytes: number; outputBytes: number };

type Busy = { label: string; done?: number; total?: number };

/** Frees pdf.js's copy of a document (its worker keeps one per open file). */
const closeDoc = (d: PDFDocumentProxy) => void d.loadingTask.destroy().catch(() => {});

let idCounter = 0;
const nextId = () => `f${++idCounter}`;

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
  const [pageMarks, setPageMarks] = useState(false);
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

  // Page edits (rotate, delete, rearrange) live in the editor until saved: don't lose them by accident.
  const dirty = useRef(false);
  const setDirty = useCallback((d: boolean) => void (dirty.current = d), []);
  const discardOk = () => !dirty.current || window.confirm('Discard your page changes? They haven’t been saved.');
  const EDITORS: Action[] = ['rotate', 'delete', 'rearrange'];

  function choose(nextAction: Action, nextMode: ConvertMode = mode) {
    if (!EDITORS.includes(nextAction) && EDITORS.includes(action) && !discardOk()) return;
    if (!EDITORS.includes(nextAction)) dirty.current = false;
    setAction(nextAction);
    setMode(nextMode);
    setNotice([]);
    clearResult();
    // Each task URL is its own page; a router navigation would remount the
    // workspace and drop the loaded file. replaceState only changes the address
    // (Next.js keeps its router in step), so a refresh or a shared link opens
    // the right tool.
    if (task !== 'hub') window.history.replaceState(null, '', pathOf(taskOf(nextAction, nextMode)));
  }

  function startAgain() {
    if (!discardOk()) return;
    dirty.current = false;
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
    if (!discardOk()) return;
    dirty.current = false;
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
      const out = await job((d, t) => setBusy({ label, done: d, total: t }));
      trackToolSuccess('converter', true);
      return out;
    } catch (err) {
      const known = toPdfToolError(err);
      trackToolError(known.code, 'converter');
      setNotice([known.message]);
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

  async function doEdit(plan: PagePlan[], summary: string) {
    if (!first) return;
    const { editPages, pdfBlob } = await import('@/app/lib/pdf/client');
    const bytes = await run('Making your new PDF', () => editPages(first.bytes, plan));
    if (!bytes) return;
    dirty.current = false;
    setDone({ kind: 'pdf', blob: pdfBlob(bytes), filename: editedPdfName(pdfBaseName(first.file.name)), bytes: bytes.length, inputBytes: null, pages: plan.length, note: summary || undefined, again: 'Edit another' });
  }

  async function doSplitGroups(groups: number[][]) {
    if (!first || groups.length < 2) return;
    const { splitGroups, pdfBlob } = await import('@/app/lib/pdf/client');
    const parts = await run('Splitting your PDF', (p) => splitGroups(first.bytes, groups, p));
    if (!parts) return;
    const base = pdfBaseName(first.file.name);
    const single = groups.every((g) => g.length === 1);
    setDone({
      kind: 'pdf-zip',
      files: parts.map((b, i) => ({ blob: pdfBlob(b), filename: splitPartName(base, i + 1, parts.length, single), pages: groups[i].length })),
      zipName: splitZipName(base),
      again: 'Split another',
    });
  }

  async function doToImages(format: 'JPG' | 'PNG') {
    if (!first) return;
    const { renderPageJpeg, renderPagePng, scaleForDpi } = await import('@/app/lib/pdf/pdfjs');
    const base = pdfBaseName(first.file.name);
    const width = String(first.pages).length;
    const ext = format.toLowerCase();
    const files = await run(`Turning pages into ${format}s`, async (progress) => {
      const doc = await first.doc;
      const out: JpgFile[] = [];
      progress(0, first.pages);
      for (let n = 1; n <= first.pages; n++) {
        const page = format === 'PNG' ? await renderPagePng(doc, n, scaleForDpi(dpi)) : await renderPageJpeg(doc, n, scaleForDpi(dpi), 0.9);
        out.push({ ...page, url: track(URL.createObjectURL(page.blob)), filename: `${base}-page-${String(n).padStart(width, '0')}.${ext}` });
        progress(n, first.pages);
      }
      return out;
    });
    if (files) setDone({ kind: 'jpgs', files, zipName: `${base}-${ext}.zip`, format });
  }

  async function doToText() {
    if (!first) return;
    const { pdfToText, textFileName } = await import('@/app/lib/pdf/to-text');
    const res = await run('Reading the text', async (progress) => pdfToText(await first.doc, progress, pageMarks));
    if (!res) return;
    setDone({ kind: 'text', text: res.text, filename: textFileName(pdfBaseName(first.file.name)), pages: res.pages, chars: res.chars, sparse: res.sparse });
  }

  async function doWatermark(job: WatermarkJob) {
    if (!first) return;
    const client = await import('@/app/lib/pdf/client');
    const bytes = await run('Adding the watermark', async () => {
      if (job.kind === 'text') return client.watermarkText(first.bytes, job.mark);
      try {
        assertImageSize(job.file, maxBytes);
        const { prepareImageForPdf } = await import('@/app/lib/pdf/prepare-image');
        return client.watermarkImage(first.bytes, await prepareImageForPdf(job.file), job.mark);
      } catch (err) {
        throw Object.assign(toPdfToolError(err), { message: `${job.file.name}: ${toPdfToolError(err).message}` });
      }
    });
    if (!bytes) return;
    const count = job.mark.pages ? job.mark.pages.length : first.pages;
    setDone({ kind: 'pdf', blob: client.pdfBlob(bytes), filename: watermarkedPdfName(pdfBaseName(first.file.name)), bytes: bytes.length, inputBytes: null, pages: first.pages, note: `Watermark added to ${count} ${count === 1 ? 'page' : 'pages'}.`, again: 'Watermark another' });
  }

  async function doProtect(options: ProtectOptions) {
    if (!first) return;
    const { protectPdf, pdfBlob } = await import('@/app/lib/pdf/client');
    const bytes = await run('Locking your PDF', () => protectPdf(first.bytes, options));
    if (!bytes) return;
    setDone({ kind: 'pdf', blob: pdfBlob(bytes), filename: protectedPdfName(pdfBaseName(first.file.name)), bytes: bytes.length, inputBytes: null, pages: first.pages, note: 'It opens only with the password you chose. We can’t recover it, so keep it somewhere safe.', again: 'Protect another' });
  }

  async function doNumbers(options: NumberOptions) {
    if (!first) return;
    const { numberPages, pdfBlob } = await import('@/app/lib/pdf/client');
    const bytes = await run('Adding page numbers', () => numberPages(first.bytes, options));
    if (!bytes) return;
    const count = first.pages - options.fromPage + 1;
    setDone({ kind: 'pdf', blob: pdfBlob(bytes), filename: numberedPdfName(pdfBaseName(first.file.name)), bytes: bytes.length, inputBytes: null, pages: first.pages, note: `Numbers added to ${count} ${count === 1 ? 'page' : 'pages'}.`, again: 'Number another' });
  }

  async function doToWord() {
    if (!first) return;
    const { pdfToDocx, wordFileName, DOCX_MIME } = await import('@/app/lib/pdf/to-word');
    const res = await run('Reading the text', async (progress) => pdfToDocx(await first.doc, progress));
    if (!res) return;
    setDone({
      kind: 'docx',
      blob: new Blob([res.bytes as BlobPart], { type: DOCX_MIME }),
      filename: wordFileName(pdfBaseName(first.file.name)),
      bytes: res.bytes.length,
      pages: res.pages,
      sparse: res.sparse,
    });
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
  const toWord = action === 'convert' && mode === 'to-word';
  const toText = action === 'convert' && mode === 'to-text';
  const toPng = action === 'convert' && mode === 'to-png';
  const readsText = toWord || toText;
  const pageCap = readsText ? MAX_TEXT_PAGES : MAX_RENDER_PAGES;
  const tooManyPages = (action === 'split' || EDITORS.includes(action) || (action === 'convert' && (mode === 'to-jpg' || toPng || readsText))) && first && first.pages > pageCap;
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
            This PDF has {first!.pages} pages. {readsText ? 'Text can be read here' : 'Pages can be shown here'} for PDFs up to {pageCap} pages — try splitting it in your PDF app first.
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
          <SplitPanel
            item={first!}
            selected={selected}
            onChange={(s) => (clearResult(), setSelected(s))}
            onExtract={doSplit}
            onGroups={doSplitGroups}
            disabled={working}
          />
        ) : action === 'rotate' || action === 'delete' || action === 'rearrange' ? (
          <PageEditor
            key={first!.id}
            fileName={first!.file.name}
            pages={first!.pages}
            doc={first!.doc}
            focus={action}
            disabled={working}
            onSave={doEdit}
            onDirtyChange={setDirty}
          />
        ) : action === 'numbers' ? (
          <NumbersPanel key={first!.id} item={first!} disabled={working} onApply={doNumbers} />
        ) : action === 'watermark' ? (
          <WatermarkPanel key={first!.id} item={first!} disabled={working} onApply={doWatermark} />
        ) : action === 'protect' ? (
          <ProtectPanel disabled={working} onApply={doProtect} />
        ) : toWord ? (
          <>
            <p className="text-sm text-muted">Gets the text out of your PDF into a Word file you can edit. Best for letters, reports and other text documents.</p>
            <p className="rounded-xl border border-hair bg-surface px-4 py-3 text-sm text-strong">
              Text, paragraphs and headings come across. Page layout, tables, columns and images don&apos;t, and scanned pages can&apos;t be read.
            </p>
            {!done && (
              <button type="button" className={PRIMARY} onClick={doToWord} disabled={working}>
                Convert {pagesLabel(first!.pages)} to Word
              </button>
            )}
          </>
        ) : toText ? (
          <>
            <p className="text-sm text-muted">Gets the text out of your PDF as plain text you can copy or save. Best for letters, reports and other text documents.</p>
            <Chips
              legend="Page breaks"
              options={[
                { value: false, label: 'Leave them out' },
                { value: true, label: 'Mark each page' },
              ]}
              value={pageMarks}
              onChange={(v) => (clearResult(), setPageMarks(v))}
            />
            <p className="rounded-xl border border-hair bg-surface px-4 py-3 text-sm text-strong">
              Only the text comes across, in reading order. Tables and columns can mix, and scanned pages can&apos;t be read.
            </p>
            {!done && (
              <button type="button" className={PRIMARY} onClick={doToText} disabled={working}>
                Get the text from {pagesLabel(first!.pages)}
              </button>
            )}
          </>
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
                {toPng ? ' PNG keeps every pixel, so the files are larger than JPG. Best for screenshots, diagrams and text.' : ''}
              </p>
            </div>
            <button type="button" className={PRIMARY} onClick={() => doToImages(toPng ? 'PNG' : 'JPG')} disabled={working}>
              Convert {pagesLabel(first!.pages)} to {toPng ? 'PNG' : 'JPG'}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={task === 'hub' ? 'w-full space-y-5' : 'mx-auto max-w-3xl space-y-5'} data-pdf-active={hasAnything ? 'true' : 'false'}>
      {task !== 'hub' && <OnDeviceNote subject="files" />}

      {hasAnything && (
        <ToolPicker
          value={taskOf(action, mode)}
          onChange={(t) => {
            const n = initialAction(t);
            choose(n.action, n.mode);
          }}
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
      {done?.kind === 'docx' && <DocxResult done={done} onAgain={startAgain} />}
      {done?.kind === 'text' && <TextResult done={done} onAgain={startAgain} />}
      {done?.kind === 'pdf-zip' && <PdfZipResult done={done} onAgain={startAgain} />}
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
      <p className="text-center text-sm text-muted">Then choose what to do with it, or pick a tool below.</p>
    </div>
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
