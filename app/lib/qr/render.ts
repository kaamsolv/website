/**
 * QR raster/vector output via `qrcode`.
 * Imported from client components only — uses canvas/DOM.
 */

import QRCode from 'qrcode';
import type { QrStyle } from './types';
import { effectiveErrorCorrection, LOGO_FRACTION, QR_MARGIN_MODULES } from './style';

export type LogoSource = { dataUrl: string };

function qrColors(style: QrStyle) {
  return style.transparent
    ? { dark: style.fg, light: '#00000000' }
    : { dark: style.fg, light: style.bg };
}

export async function renderQrSvg(text: string, style: QrStyle, hasLogo: boolean): Promise<string> {
  const ec = effectiveErrorCorrection(style.errorCorrection, hasLogo);
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: ec,
    color: qrColors(style),
    margin: QR_MARGIN_MODULES,
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo failed to load'));
    img.src = src;
  });
}

async function drawLogo(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  logo: LogoSource,
  style: QrStyle,
): Promise<void> {
  const size = Math.min(canvas.width, canvas.height) * LOGO_FRACTION;
  const x = (canvas.width - size) / 2;
  const y = (canvas.height - size) / 2;
  const img = await loadImage(logo.dataUrl);
  const pad = size * 0.12;
  ctx.fillStyle = style.transparent ? '#FFFFFF' : style.bg;
  ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2);
  ctx.drawImage(img, x, y, size, size);
}

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  style: QrStyle,
  hasLogo: boolean,
  logo?: LogoSource,
  pixelSize?: number,
): Promise<void> {
  const ec = effectiveErrorCorrection(style.errorCorrection, hasLogo);
  await QRCode.toCanvas(canvas, text, {
    width: pixelSize ?? style.size,
    errorCorrectionLevel: ec,
    color: qrColors(style),
    margin: QR_MARGIN_MODULES,
  });
  if (logo) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    await drawLogo(ctx, canvas, logo, style);
  }
}

export async function renderQrPngDataUrl(
  text: string,
  style: QrStyle,
  hasLogo: boolean,
  logo?: LogoSource,
): Promise<string> {
  const canvas = document.createElement('canvas');
  await renderQrToCanvas(canvas, text, style, hasLogo, logo);
  return canvas.toDataURL('image/png');
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create PNG'));
    }, 'image/png');
  });
}
