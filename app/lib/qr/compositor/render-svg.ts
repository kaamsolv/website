import type { QrDesign } from '../design';
import { LOGO_PAD_FRACTION, logoFraction } from '../design';
import { frameHasBorder } from '../frames';
import type { QrMatrix } from '../matrix';
import { buildModuleOps } from './draw-modules';
import { computeArtboardLayout } from './artboard';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function opToSvg(op: ReturnType<typeof buildModuleOps>[number], fg: string): string {
  if (op.kind === 'circle') {
    const cx = op.x + op.w / 2;
    const cy = op.y + op.h / 2;
    const r = op.w / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fg}"/>`;
  }
  if (op.kind === 'roundRect') {
    return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" rx="${op.r ?? 0}" fill="${fg}"/>`;
  }
  return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${fg}"/>`;
}

export function renderArtboardSvg(matrix: QrMatrix, design: QrDesign, qrPixelSize: number): string {
  const layout = computeArtboardLayout(matrix, design, qrPixelSize);
  const fg = design.colors.fg;
  const bg = design.colors.transparent ? 'none' : design.colors.bg;
  const ops = buildModuleOps(
    matrix,
    layout.quietZone,
    layout.modulePx,
    layout.qrOffsetX,
    layout.qrOffsetY,
    design.modules.shape,
    design.eyes.shape,
  );

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthPx}" height="${layout.heightPx}" viewBox="0 0 ${layout.widthPx} ${layout.heightPx}">`,
  );

  if (!design.colors.transparent) {
    parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  }

  if (frameHasBorder(design.frame.id)) {
    const x = layout.qrOffsetX - layout.borderWidthPx;
    const y = layout.qrOffsetY - layout.borderWidthPx;
    const w = layout.qrSizePx + layout.borderWidthPx * 2;
    const h = layout.qrSizePx + layout.borderWidthPx * 2 + layout.ctaHeightPx;
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${fg}" stroke-width="${layout.borderWidthPx}" rx="${layout.borderWidthPx * 2}"/>`,
    );
  }

  parts.push(`<g id="qr-modules">`);
  for (const op of ops) {
    parts.push(opToSvg(op, fg));
  }
  parts.push(`</g>`);

  if (design.logo?.dataUrl) {
    const frac = logoFraction(design.logo.size);
    const logoSize = layout.qrSizePx * frac;
    const pad = logoSize * LOGO_PAD_FRACTION;
    const lx = layout.qrOffsetX + (layout.qrSizePx - logoSize) / 2;
    const ly = layout.qrOffsetY + (layout.qrSizePx - logoSize) / 2;
    const plateBg = design.colors.transparent ? '#FFFFFF' : design.colors.bg;
    parts.push(
      `<rect x="${lx - pad}" y="${ly - pad}" width="${logoSize + pad * 2}" height="${logoSize + pad * 2}" fill="${plateBg}"/>`,
    );
    parts.push(
      `<image href="${escapeXml(design.logo.dataUrl)}" x="${lx}" y="${ly}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }

  if (layout.ctaText) {
    const fontSize = Math.max(12, layout.ctaHeightPx * 0.42);
    const textY = layout.qrOffsetY + layout.qrSizePx + layout.ctaHeightPx * 0.72;
    const textX = layout.widthPx / 2;
    parts.push(
      `<text x="${textX}" y="${textY}" text-anchor="middle" fill="${fg}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="600">${escapeXml(layout.ctaText)}</text>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}
