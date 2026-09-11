'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/app/_components/icons';
import { previewQrPixelSize } from '@/app/lib/qr/compositor/artboard';
import { renderArtboardCanvas } from '@/app/lib/qr/compositor';
import type { QrDesign } from '@/app/lib/qr/design';
import { createMatrixForDesign } from '@/app/lib/qr/matrix';

type Props = {
  encodedText: string | null;
  design: QrDesign;
  exportPixelSize: number;
  empty: boolean;
  renderError: string | null;
};

function previewDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function QrPreview({ encodedText, design, exportPixelSize, empty, renderError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrPixelSize = previewQrPixelSize(exportPixelSize, 220);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !encodedText) {
      setLocalError(null);
      return;
    }

    let cancelled = false;
    const dpr = previewDevicePixelRatio();

    const render = async () => {
      // Wait for layout/paint so mobile browsers size the canvas host before drawing.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (cancelled || !canvasRef.current) return;

      try {
        const matrix = createMatrixForDesign(encodedText, design);
        await renderArtboardCanvas(canvasRef.current, matrix, design, qrPixelSize, {
          devicePixelRatio: dpr,
        });
        if (!cancelled) setLocalError(null);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          setLocalError(msg);
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx && canvasRef.current) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [encodedText, design, qrPixelSize]);

  const message = renderError ?? localError;

  return (
    <div className="rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
      <p className="text-sm font-semibold text-tealx-600">Your QR code</p>

      <div
        className="qr-paper mx-auto mt-3 flex w-full max-w-[min(100%,300px)] items-center justify-center rounded-lg border border-hair p-3"
        aria-live="polite"
      >
        {empty ? (
          <div className="px-4 py-8 text-center">
            <Icon name="business" className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-2 text-sm text-muted">Fill in the details and your QR appears here.</p>
          </div>
        ) : message ? (
          <p className="px-4 py-8 text-center text-sm font-medium text-danger-700">{message}</p>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="QR code preview"
            className="block max-w-full"
          />
        )}
      </div>

      <p className="mt-2 text-xs text-faint">
        Preview includes your frame and logo. Export size can be larger than this preview.
      </p>
    </div>
  );
}
