'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/app/_components/icons';
import type { QrStyle } from '@/app/lib/qr/types';
import type { LogoSource } from '@/app/lib/qr/render';
import { renderQrToCanvas } from '@/app/lib/qr/render';

type Props = {
  encodedText: string | null;
  style: QrStyle;
  hasLogo: boolean;
  logo: LogoSource | null;
  empty: boolean;
  renderError: string | null;
};

export function QrPreview({ encodedText, style, hasLogo, logo, empty, renderError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewSize = Math.min(style.size, 280);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !encodedText) return;

    let cancelled = false;
    (async () => {
      try {
        canvas.width = previewSize;
        canvas.height = previewSize;
        await renderQrToCanvas(canvas, encodedText, style, hasLogo, logo ?? undefined, previewSize);
      } catch {
        if (!cancelled) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [encodedText, style, hasLogo, logo, previewSize]);

  return (
    <div className="rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
      <p className="text-xs font-semibold text-tealx-600">Your QR code</p>

      <div
        className="qr-paper mx-auto mt-3 grid aspect-square w-full max-w-[280px] place-items-center rounded-lg border border-hair p-3"
        aria-live="polite"
      >
        {empty ? (
          <div className="px-4 text-center">
            <Icon name="business" className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-2 text-sm text-muted">Fill in the details and your QR appears here.</p>
          </div>
        ) : renderError ? (
          <p className="px-4 text-center text-sm font-medium text-danger-700">{renderError}</p>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="QR code preview"
            className="h-full w-full max-h-[240px] max-w-[240px]"
          />
        )}
      </div>

      <p className="mt-2 text-xs text-faint">
        Preview stays on a light &quot;paper&quot; swatch in both themes — easier to scan and print.
      </p>
    </div>
  );
}
