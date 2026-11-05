'use client';

import { useState } from 'react';
import { downloadBlob } from '@/app/lib/image/export';
import { formatBytes, sizeDeltaLabel } from '@/app/lib/image/validate';
import { DOWNLOAD, SECONDARY } from './pdf-styles';

/** The result cards of the PDF workspace (moved out of pdf-workspace.tsx unchanged, plus the ZIP-of-PDFs card). */

export type JpgFile = { blob: Blob; url: string; filename: string; width: number; height: number };
export type PdfDone = { kind: 'pdf'; blob: Blob; filename: string; bytes: number; inputBytes: number | null; pages: number | null; note?: string; again: string };
export type JpgsDone = { kind: 'jpgs'; files: JpgFile[]; zipName: string; format?: 'JPG' | 'PNG' };
export type TextDone = { kind: 'text'; text: string; filename: string; pages: number; chars: number; sparse: boolean };
export type DocxDone = { kind: 'docx'; blob: Blob; filename: string; bytes: number; pages: number; sparse: boolean };
export type PdfZipDone = { kind: 'pdf-zip'; files: { blob: Blob; filename: string; pages: number }[]; zipName: string; again: string };

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

export function PdfResult({ done, onAgain }: { done: PdfDone; onAgain: () => void }) {
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
        <button type="button" onClick={() => downloadBlob(done.blob, done.filename)} className={DOWNLOAD}>
          Download PDF
        </button>
        <button type="button" onClick={onAgain} className={SECONDARY}>
          {done.again}
        </button>
      </div>
    </ResultShell>
  );
}

export function DocxResult({ done, onAgain }: { done: DocxDone; onAgain: () => void }) {
  return (
    <ResultShell title="Done. Your Word file is ready.">
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-faint">Filename</dt>
          <dd className="truncate font-medium text-ink">{done.filename}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Size</dt>
          <dd className="font-medium text-strong">{formatBytes(done.bytes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Pages read</dt>
          <dd className="font-medium text-strong">{done.pages}</dd>
        </div>
      </dl>
      {done.sparse && (
        <p className="mt-3 rounded-lg border border-yellow-300 bg-yellowx-100 px-3 py-2 text-sm text-strong">
          Very little text was found. This PDF may be a scan, so check the Word file before you rely on it.
        </p>
      )}
      <p className="mt-3 text-sm text-strong">Text and paragraphs came across. Page layout, tables and images didn&apos;t, so look it over in Word.</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => downloadBlob(done.blob, done.filename)} className={DOWNLOAD}>
          Download Word file
        </button>
        <button type="button" onClick={onAgain} className={SECONDARY}>
          Convert another
        </button>
      </div>
    </ResultShell>
  );
}

export function JpgResult({ done, onZip, onAgain }: { done: JpgsDone; onZip: () => void; onAgain: () => void }) {
  const one = done.files.length === 1;
  const fmt = done.format ?? 'JPG';
  const total = done.files.reduce((n, f) => n + f.blob.size, 0);
  return (
    <ResultShell title={one ? `Done. Your ${fmt} is ready.` : `Done. ${done.files.length} ${fmt}s are ready.`}>
      <p className="mt-2 text-sm text-strong">
        {formatBytes(total)} in total · {done.files[0].width} × {done.files[0].height} px{one ? '' : ' for page 1'}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={one ? () => downloadBlob(done.files[0].blob, done.files[0].filename) : onZip} className={DOWNLOAD}>
          {one ? `Download ${fmt}` : 'Download all (ZIP)'}
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

/** Several PDFs made at once (every N pages, one per page): one ZIP, or any of them on its own. */
export function PdfZipResult({ done, onAgain }: { done: PdfZipDone; onAgain: () => void }) {
  const total = done.files.reduce((n, f) => n + f.blob.size, 0);
  async function zip() {
    const { zipSync } = await import('fflate');
    const entries: Record<string, Uint8Array> = {};
    for (const f of done.files) entries[f.filename] = new Uint8Array(await f.blob.arrayBuffer());
    downloadBlob(new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: 'application/zip' }), done.zipName);
  }
  return (
    <ResultShell title={`Done. ${done.files.length} PDFs are ready.`}>
      <p className="mt-2 text-sm text-strong">{formatBytes(total)} in total.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={zip} className={DOWNLOAD}>
          Download all (ZIP)
        </button>
        <button type="button" onClick={onAgain} className={SECONDARY}>
          {done.again}
        </button>
      </div>
      <ul className="mt-5 divide-y divide-hair rounded-xl border border-hair bg-surface text-sm" aria-label="The new PDFs">
        {done.files.map((f) => (
          <li key={f.filename} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate font-medium text-ink">{f.filename}</span>
            <span className="shrink-0 text-xs text-muted">{formatBytes(f.blob.size)}</span>
            <button type="button" onClick={() => downloadBlob(f.blob, f.filename)} className="shrink-0 rounded px-1 py-2 text-sm font-semibold text-coral-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
              Download<span className="sr-only"> {f.filename}</span>
            </button>
          </li>
        ))}
      </ul>
    </ResultShell>
  );
}

/** Plain text of a PDF: a read-only preview, Copy and Download .txt. The text stays in this browser tab. */
export function TextResult({ done, onAgain }: { done: TextDone; onAgain: () => void }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(done.text);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }
  const words = done.text.split(/\s+/).filter(Boolean).length;
  return (
    <ResultShell title="Done. Your text is ready.">
      <p className="mt-2 text-sm text-strong">
        {words.toLocaleString('en-IN')} {words === 1 ? 'word' : 'words'} from {done.pages} {done.pages === 1 ? 'page' : 'pages'}.
      </p>
      {done.sparse && (
        <p className="mt-3 rounded-lg border border-yellow-300 bg-yellowx-100 px-3 py-2 text-sm text-strong">
          Very little text was found. This PDF may be a scan, so check it before you rely on it.
        </p>
      )}
      <label htmlFor="pdf-text-preview" className="mt-4 block text-sm font-semibold text-ink">
        The text
      </label>
      <textarea
        id="pdf-text-preview"
        readOnly
        value={done.text}
        rows={10}
        className="mt-1 w-full rounded-xl border border-hair bg-surface p-3 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
      />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => downloadBlob(new Blob([done.text], { type: 'text/plain;charset=utf-8' }), done.filename)} className={DOWNLOAD}>
          Download .txt
        </button>
        <button type="button" onClick={copy} className={SECONDARY}>
          Copy text
        </button>
        <button type="button" onClick={onAgain} className={SECONDARY}>
          Convert another
        </button>
      </div>
      <p className="mt-2 text-sm text-strong" role="status">
        {copied === 'yes' ? 'Copied.' : copied === 'no' ? 'Couldn’t copy here. Select the text above and copy it.' : ''}
      </p>
    </ResultShell>
  );
}
