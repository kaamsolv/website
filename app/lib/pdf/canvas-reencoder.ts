/**
 * Browser `Reencoder` for Compress PDF: decode → resize → JPEG with a canvas.
 * Works in a Web Worker (OffscreenCanvas) and on the main thread (falls back
 * to a DOM canvas). No library — the browser's own decoders and encoder.
 */

import type { ImageSource, Reencoder } from './compress';

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Canvas2D } {
  const canvas: AnyCanvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as Canvas2D | null;
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
}

async function toJpeg(canvas: AnyCanvas, quality: number): Promise<Uint8Array | null> {
  const blob =
    'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
      : await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', quality));
  if (!blob || blob.type !== 'image/jpeg') return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/** JPEGs inside a PDF are drawn as stored; never apply a camera's EXIF rotation. */
async function decodeJpeg(bytes: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' });
  try {
    return await createImageBitmap(blob, { imageOrientation: 'none' } as ImageBitmapOptions);
  } catch {
    return createImageBitmap(blob);
  }
}

function pixelsToImageData(source: Extract<ImageSource, { kind: 'pixels' }>): ImageData {
  const { pixels, width, height, components } = source;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += components) {
    const o = i * 4;
    if (components === 3) {
      rgba[o] = pixels[j];
      rgba[o + 1] = pixels[j + 1];
      rgba[o + 2] = pixels[j + 2];
    } else {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = pixels[j];
    }
    rgba[o + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}

export const canvasReencoder: Reencoder = async (source, target, quality) => {
  const image: ImageBitmap | ImageData = source.kind === 'jpeg' ? await decodeJpeg(source.bytes) : pixelsToImageData(source);
  try {
    // A JPEG whose header disagrees with the PDF's size: don't guess, leave it.
    if (image.width !== source.width || image.height !== source.height) return null;

    let drawable: CanvasImageSource;
    if (image instanceof ImageData) {
      const full = makeCanvas(image.width, image.height);
      full.ctx.putImageData(image, 0, 0);
      drawable = full.canvas;
    } else {
      drawable = image;
    }

    const { canvas, ctx } = makeCanvas(target.width, target.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(drawable, 0, 0, target.width, target.height);
    return await toJpeg(canvas, quality);
  } finally {
    if (!(image instanceof ImageData)) image.close();
  }
};
