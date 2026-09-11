import type { QrDesign } from '../design';
import { frameHasBorder, frameHasCta, resolveCtaText } from '../frames';
import type { QrMatrix } from '../matrix';

export type ArtboardLayout = {
  matrixSize: number;
  quietZone: number;
  modulePx: number;
  /** Pixel size of QR matrix + quiet zone (square). */
  qrSizePx: number;
  framePadPx: number;
  borderWidthPx: number;
  ctaHeightPx: number;
  ctaText: string | null;
  widthPx: number;
  heightPx: number;
  /** Top-left of QR area (including quiet zone) within artboard. */
  qrOffsetX: number;
  qrOffsetY: number;
};

export function computeArtboardLayout(
  matrix: QrMatrix,
  design: QrDesign,
  qrPixelSize: number,
): ArtboardLayout {
  const quietZone = design.quietZoneModules;
  const totalModules = matrix.size + quietZone * 2;
  const modulePx = qrPixelSize / totalModules;

  const hasBorder = frameHasBorder(design.frame.id);
  const framePadPx = hasBorder ? Math.max(8, qrPixelSize * 0.06) : 0;
  const borderWidthPx = hasBorder ? Math.max(2, qrPixelSize * 0.014) : 0;
  const ctaText = resolveCtaText(design.frame.id, design.frame.ctaText);
  const ctaHeightPx = frameHasCta(design.frame.id) ? Math.max(28, qrPixelSize * 0.12) : 0;

  const innerW = qrPixelSize + framePadPx * 2;
  const innerH = qrPixelSize + framePadPx * 2 + ctaHeightPx;

  return {
    matrixSize: matrix.size,
    quietZone,
    modulePx,
    qrSizePx: qrPixelSize,
    framePadPx,
    borderWidthPx,
    ctaHeightPx,
    ctaText,
    widthPx: innerW,
    heightPx: innerH,
    qrOffsetX: framePadPx,
    qrOffsetY: framePadPx,
  };
}

/** Scale artboard to fit a max preview edge while preserving aspect ratio. */
export function previewQrPixelSize(exportQrPixelSize: number, maxEdge = 220): number {
  return Math.min(exportQrPixelSize, maxEdge);
}
