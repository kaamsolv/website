/**
 * "Resize image to KB" pipeline — runs in the Web Worker (or main thread).
 * Decode once → crop/fit into the output frame → search JPG quality (and, if
 * the pixel size isn't fixed, scale) until the file fits the limit.
 */
import { decodeFormat } from './codecs/decode';
import { mapThrownError, userMessageForCode, type ImageErrorCode } from './errors';
import { containRect, cropRect, type CropState } from './crop';
import { setJpegDpi } from './jpeg-dpi';
import type { FormatId } from './registry/format-registry';
import { MAX_OUTPUT_PX, searchTarget, type SearchOutcome } from './target-size';

export type TargetJob = {
  /** Byte limit (already converted with kbToBytes). Null = no size limit. */
  maxBytes: number | null;
  minBytes: number | null;
  /** Exact output size in px; null = keep the image's own size. */
  width: number | null;
  height: number | null;
  /** How to make the image fit an exact size of a different shape. */
  fit: 'crop' | 'pad';
  /** Crop position (source px); null = centred. Only used with fit 'crop'. */
  crop: CropState | null;
  /** Written into the JPG when the size was given in cm / mm / in. */
  dpi: number | null;
};

export type TargetOk = {
  ok: true;
  blob: Blob;
  width: number;
  height: number;
  quality: number;
  outcome: SearchOutcome<unknown>['kind'];
};

export type TargetResultData = TargetOk | { ok: false; code: ImageErrorCode; message: string };

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    return el;
  }
  throw Object.assign(new Error('Canvas unavailable'), { code: 'browser-limit' });
}

function toJpeg(canvas: Canvas, quality: number): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Object.assign(new Error('encode failed'), { code: 'encode-failed' }))),
      'image/jpeg',
      quality,
    ),
  );
}

export async function runTargetPipeline(
  buffer: ArrayBuffer,
  from: FormatId,
  job: TargetJob,
  onProgress?: (stage: 'decoding' | 'processing' | 'encoding') => void,
): Promise<TargetResultData> {
  let bitmap: ImageBitmap | null = null;
  try {
    onProgress?.('decoding');
    bitmap = await decodeFormat(buffer, from);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const fixed = job.width !== null && job.height !== null;
    const outW = fixed ? job.width! : srcW;
    const outH = fixed ? job.height! : srcH;
    if (outW < 1 || outH < 1 || outW > MAX_OUTPUT_PX || outH > MAX_OUTPUT_PX) {
      return { ok: false, code: 'invalid-dimensions', message: `Width and height must be between 1 and ${MAX_OUTPUT_PX} px.` };
    }

    // Source region and where it lands in the output frame.
    const src =
      fixed && job.fit === 'crop'
        ? cropRect(srcW, srcH, outW / outH, job.crop ?? { cx: srcW / 2, cy: srcH / 2, zoom: 1 })
        : { x: 0, y: 0, w: srcW, h: srcH };
    const dst = fixed && job.fit === 'pad' ? containRect(srcW, srcH, outW, outH) : { x: 0, y: 0, w: outW, h: outH };

    onProgress?.('processing');
    const canvases = new Map<number, Canvas>();
    const draw = (scale: number): Canvas => {
      const cached = canvases.get(scale);
      if (cached) return cached;
      const w = Math.max(1, Math.round(outW * scale));
      const h = Math.max(1, Math.round(outH * scale));
      const canvas = makeCanvas(w, h);
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw Object.assign(new Error('Canvas unavailable'), { code: 'browser-limit' });
      ctx.fillStyle = '#FFFFFF'; // JPG has no transparency; forms expect white.
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap!, src.x, src.y, src.w, src.h, dst.x * scale, dst.y * scale, dst.w * scale, dst.h * scale);
      canvases.clear(); // keep only the latest size in memory
      canvases.set(scale, canvas);
      return canvas;
    };

    onProgress?.('encoding');
    const encode = async (quality: number, scale: number) => {
      const canvas = draw(scale);
      const blob = await toJpeg(canvas, quality);
      return { size: blob.size, data: { blob, width: canvas.width, height: canvas.height } };
    };

    const result =
      job.maxBytes === null
        ? { kind: 'fits' as const, best: { quality: 0.92, scale: 1, ...(await encode(0.92, 1)) } }
        : await searchTarget(encode, {
            maxBytes: job.maxBytes,
            minBytes: job.minBytes ?? undefined,
            allowScale: !fixed,
          });

    let blob = result.best.data.blob;
    if (job.dpi) {
      const bytes = setJpegDpi(new Uint8Array(await blob.arrayBuffer()), job.dpi);
      blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
    }

    return {
      ok: true,
      blob,
      width: result.best.data.width,
      height: result.best.data.height,
      quality: result.best.quality,
      outcome: result.kind,
    };
  } catch (err) {
    if (err instanceof Error && 'code' in err && typeof err.code === 'string') {
      return { ok: false, code: err.code as ImageErrorCode, message: userMessageForCode(err.code as ImageErrorCode) };
    }
    const mapped = mapThrownError(err);
    return { ok: false, code: mapped.code, message: mapped.message };
  } finally {
    bitmap?.close();
  }
}
