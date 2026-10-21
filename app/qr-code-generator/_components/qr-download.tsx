'use client';

import { useState } from 'react';
import { Icon } from '@/app/_components/icons';
import { CopyButton } from '@/app/_components/copy-button';
import type { QrDesign, QrExportOptions } from '@/app/lib/qr/design';
import {
  DOWNLOAD_JPG,
  DOWNLOAD_PNG,
  DOWNLOAD_SVG,
  downloadBlob,
  exportJpgBlob,
  exportPngBlob,
  exportSvgString,
  openPrintView,
  canvasToPngBlob,
  renderArtboardPngCanvas,
} from '@/app/lib/qr/render';

type Props = {
  encodedText: string | null;
  design: QrDesign;
  exportOptions: QrExportOptions;
  disabled: boolean;
};

const BTN =
  'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:cursor-not-allowed disabled:opacity-50';

export function QrDownload({ encodedText, design, exportOptions, disabled }: Props) {
  const [busy, setBusy] = useState<'png' | 'svg' | 'jpg' | 'share' | 'print' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function downloadPng() {
    if (!encodedText || disabled) return;
    setBusy('png');
    setNote(null);
    try {
      const blob = await exportPngBlob(encodedText, design, exportOptions);
      downloadBlob(DOWNLOAD_PNG, blob);
    } catch {
      setNote("Couldn't save the PNG. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadSvg() {
    if (!encodedText || disabled) return;
    setBusy('svg');
    setNote(null);
    try {
      const svg = exportSvgString(encodedText, design, exportOptions);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(DOWNLOAD_SVG, blob);
    } catch {
      setNote("Couldn't save the SVG. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadJpg() {
    if (!encodedText || disabled) return;
    setBusy('jpg');
    setNote(null);
    try {
      const blob = await exportJpgBlob(encodedText, design, exportOptions);
      downloadBlob(DOWNLOAD_JPG, blob);
    } catch {
      setNote("Couldn't save the JPG. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function printQr() {
    if (!encodedText || disabled) return;
    setBusy('print');
    setNote(null);
    try {
      const svg = exportSvgString(encodedText, design, exportOptions);
      openPrintView(svg);
    } catch {
      setNote("Couldn't open the print view. Try downloading instead.");
    } finally {
      setBusy(null);
    }
  }

  async function sharePng() {
    if (!encodedText || disabled || typeof navigator.share !== 'function') return;
    setBusy('share');
    setNote(null);
    try {
      const canvas = await renderArtboardPngCanvas(encodedText, design, exportOptions);
      const blob = await canvasToPngBlob(canvas);
      const file = new File([blob], DOWNLOAD_PNG, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'QR code from KaamSolv' });
      } else {
        setNote('Sharing isn’t available here — download the PNG instead.');
      }
    } catch {
      setNote('Sharing was cancelled or isn’t supported on this device.');
    } finally {
      setBusy(null);
    }
  }

  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    !disabled &&
    !!encodedText;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={downloadPng}
          className={`${BTN} bg-coral-500 text-navy-900 hover:bg-coral-600 hover:text-white`}
        >
          <Icon name="download" className="h-4 w-4" />
          {busy === 'png' ? 'Saving…' : 'PNG'}
        </button>
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={downloadSvg}
          className={`${BTN} border border-hair bg-surface text-strong hover:bg-wash`}
        >
          <Icon name="download" className="h-4 w-4" />
          {busy === 'svg' ? 'Saving…' : 'SVG'}
        </button>
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={downloadJpg}
          className={`${BTN} border border-hair bg-surface text-strong hover:bg-wash`}
        >
          <Icon name="download" className="h-4 w-4" />
          {busy === 'jpg' ? 'Saving…' : 'JPG'}
        </button>
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={printQr}
          className={`${BTN} border border-hair bg-surface text-strong hover:bg-wash`}
        >
          {busy === 'print' ? 'Opening…' : 'Print'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {encodedText && (
          <CopyButton value={encodedText} label="Copy encoded text" copiedLabel="Copied" />
        )}
        {canShare && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={sharePng}
            className={`${BTN} w-auto shrink-0 border border-hair bg-surface px-4 text-strong hover:bg-wash`}
          >
            <Icon name="share" className="h-4 w-4" />
            {busy === 'share' ? 'Sharing…' : 'Share'}
          </button>
        )}
      </div>

      <p className="text-xs text-muted">
        Downloads at {exportOptions.pixelSize}px QR size. Logo, frame, and CTA are included in every format.
      </p>
      {note && (
        <p role="status" className="text-xs text-muted">{note}</p>
      )}
    </div>
  );
}
