import type { QrDesign } from '../design';
import { LOGO_PAD_FRACTION, logoFraction } from '../design';
import { frameHasBorder } from '../frames';
import type { QrMatrix } from '../matrix';
import { buildModuleOps } from './draw-modules';
import { computeArtboardLayout } from './artboard';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo failed to load'));
    img.src = src;
  });
}

function drawOp(ctx: CanvasRenderingContext2D, op: ReturnType<typeof buildModuleOps>[number], fg: string) {
  ctx.fillStyle = fg;
  if (op.kind === 'circle') {
    const cx = op.x + op.w / 2;
    const cy = op.y + op.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, op.w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (op.kind === 'roundRect' && typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(op.x, op.y, op.w, op.h, op.r ?? 0);
    ctx.fill();
    return;
  }
  if (op.kind === 'roundRect') {
    const r = op.r ?? 0;
    const { x, y, w, h } = op;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.fillRect(op.x, op.y, op.w, op.h);
}

export type RenderCanvasOptions = {
  /** CSS-pixel ratio for sharp preview on retina screens. Omit for export (1). */
  devicePixelRatio?: number;
};

export async function renderArtboardCanvas(
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  design: QrDesign,
  qrPixelSize: number,
  options?: RenderCanvasOptions,
): Promise<void> {
  const layout = computeArtboardLayout(matrix, design, qrPixelSize);
  const dpr = Math.max(1, options?.devicePixelRatio ?? 1);
  const cssW = layout.widthPx;
  const cssH = layout.heightPx;

  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!design.colors.transparent) {
    ctx.fillStyle = design.colors.bg;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  if (frameHasBorder(design.frame.id)) {
    const x = layout.qrOffsetX - layout.borderWidthPx;
    const y = layout.qrOffsetY - layout.borderWidthPx;
    const w = layout.qrSizePx + layout.borderWidthPx * 2;
    const h = layout.qrSizePx + layout.borderWidthPx * 2 + layout.ctaHeightPx;
    ctx.strokeStyle = design.colors.fg;
    ctx.lineWidth = layout.borderWidthPx;
    const r = layout.borderWidthPx * 2;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
  }

  const ops = buildModuleOps(
    matrix,
    layout.quietZone,
    layout.modulePx,
    layout.qrOffsetX,
    layout.qrOffsetY,
    design.modules.shape,
    design.eyes.shape,
  );
  for (const op of ops) {
    drawOp(ctx, op, design.colors.fg);
  }

  if (design.logo?.dataUrl) {
    const frac = logoFraction(design.logo.size);
    const logoSize = layout.qrSizePx * frac;
    const pad = logoSize * LOGO_PAD_FRACTION;
    const lx = layout.qrOffsetX + (layout.qrSizePx - logoSize) / 2;
    const ly = layout.qrOffsetY + (layout.qrSizePx - logoSize) / 2;
    const img = await loadImage(design.logo.dataUrl);
    ctx.fillStyle = design.colors.transparent ? '#FFFFFF' : design.colors.bg;
    ctx.fillRect(lx - pad, ly - pad, logoSize + pad * 2, logoSize + pad * 2);
    ctx.drawImage(img, lx, ly, logoSize, logoSize);
  }

  if (layout.ctaText) {
    const fontSize = Math.max(12, layout.ctaHeightPx * 0.42);
    ctx.fillStyle = design.colors.fg;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textY = layout.qrOffsetY + layout.qrSizePx + layout.ctaHeightPx * 0.55;
    ctx.fillText(layout.ctaText, cssW / 2, textY);
  }
}
