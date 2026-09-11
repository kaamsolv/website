'use client';

import { useState } from 'react';
import { Icon } from '@/app/_components/icons';
import { CopyButton } from '@/app/_components/copy-button';
import type { QrStyle } from '@/app/lib/qr/types';
import type { LogoSource } from '@/app/lib/qr/render';
import {
  canvasToPngBlob,
  downloadBlob,
  renderQrPngDataUrl,
  renderQrSvg,
  renderQrToCanvas,
} from '@/app/lib/qr/render';
import { DOWNLOAD_PNG, DOWNLOAD_SVG } from '@/app/lib/qr/style';

type Props = {
  encodedText: string | null;
  style: QrStyle;
  hasLogo: boolean;
  logo: LogoSource | null;
  disabled: boolean;
};

const BTN =
  'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:cursor-not-allowed disabled:opacity-50';

export function QrDownload({ encodedText, style, hasLogo, logo, disabled }: Props) {
  const [busy, setBusy] = useState<'png' | 'svg' | 'share' | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function downloadPng() {
    if (!encodedText || disabled) return;
    setBusy('png');
    setShareNote(null);
    try {
      const dataUrl = await renderQrPngDataUrl(encodedText, style, hasLogo, logo ?? undefined);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      downloadBlob(DOWNLOAD_PNG, blob);
    } catch {
      setShareNote("Couldn't save the PNG. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadSvg() {
    if (!encodedText || disabled) return;
    setBusy('svg');
    setShareNote(null);
    try {
      const svg = await renderQrSvg(encodedText, style, hasLogo);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(DOWNLOAD_SVG, blob);
    } catch {
      setShareNote("Couldn't save the SVG. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function sharePng() {
    if (!encodedText || disabled || typeof navigator.share !== 'function') return;
    setBusy('share');
    setShareNote(null);
    try {
      const canvas = document.createElement('canvas');
      await renderQrToCanvas(canvas, encodedText, style, hasLogo, logo ?? undefined);
      const blob = await canvasToPngBlob(canvas);
      const file = new File([blob], DOWNLOAD_PNG, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'QR code from KaamKit' });
      } else {
        setShareNote('Sharing isn’t available here — download the PNG instead.');
      }
    } catch {
      setShareNote('Sharing was cancelled or isn’t supported on this device.');
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={downloadPng}
          className={`${BTN} bg-coral-500 text-navy-900 hover:bg-coral-600 hover:text-white`}
        >
          <Icon name="download" className="h-4 w-4" />
          {busy === 'png' ? 'Saving…' : 'Download PNG'}
        </button>
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={downloadSvg}
          className={`${BTN} border border-hair bg-surface text-strong hover:bg-wash`}
        >
          <Icon name="download" className="h-4 w-4" />
          {busy === 'svg' ? 'Saving…' : 'Download SVG'}
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

      {hasLogo && (
        <p className="text-xs text-muted">Logo is included in the PNG preview and download. SVG is the QR only.</p>
      )}
      {shareNote && (
        <p role="status" className="text-xs text-muted">{shareNote}</p>
      )}
    </div>
  );
}
