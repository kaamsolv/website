import { userMessageForCode, type ImageErrorCode } from './errors';
import { runConversionPipeline, supportsWebpEncodeInContext } from './pipeline';
import { runTargetPipeline, type TargetJob } from './target-pipeline';
import { canProcess } from './registry/capabilities';
import type { FormatId } from './registry/format-registry';
import type { ConvertOptions, ConvertProgress, ConvertResult, OutputFormat } from './types';
import { DEFAULT_CONVERT_OPTIONS } from './types';
import type { WorkerRequest, WorkerResponse } from './worker/convert.worker';
import { detectImageFile, outputFilename } from './validate';

let worker: Worker | null = null;
let jobCounter = 0;

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker/convert.worker.ts', import.meta.url));
    return worker;
  } catch {
    return null;
  }
}

export function terminateConversionWorker(): void {
  worker?.terminate();
  worker = null;
}

function convertInWorker(
  buffer: ArrayBuffer,
  from: FormatId,
  to: OutputFormat,
  options: ConvertOptions,
  onProgress?: (p: ConvertProgress) => void,
): Promise<ConvertResult> {
  const w = getWorker();
  if (!w) return convertOnMainThread(buffer, from, to, options, onProgress);

  const id = `job-${++jobCounter}`;
  // Read before postMessage: transferring the buffer detaches it (byteLength → 0).
  const inputBytes = buffer.byteLength;

  return new Promise((resolve) => {
    const handler = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;

      if (event.data.type === 'progress') {
        onProgress?.({
          stage: event.data.stage as ConvertProgress['stage'],
          percent: event.data.percent,
        });
        return;
      }

      w.removeEventListener('message', handler);

      if (event.data.type === 'error') {
        resolve({
          ok: false,
          code: event.data.code as ImageErrorCode,
          message: event.data.message,
        });
        return;
      }
      if (event.data.type !== 'done') return;

      resolve({
        ok: true,
        blob: event.data.blob,
        outputMime: event.data.outputMime,
        outputExtension: event.data.outputExtension,
        width: event.data.width,
        height: event.data.height,
        inputBytes,
        outputBytes: event.data.blob.size,
      });
    };

    w.addEventListener('message', handler);
    const req: WorkerRequest = { id, buffer, from, to, options };
    w.postMessage(req, [buffer]);
  });
}

async function convertOnMainThread(
  buffer: ArrayBuffer,
  from: FormatId,
  to: OutputFormat,
  options: ConvertOptions,
  onProgress?: (p: ConvertProgress) => void,
): Promise<ConvertResult> {
  const inputBytes = buffer.byteLength;
  const result = await runConversionPipeline(buffer, from, to, options, onProgress);
  if (!result.ok) return { ok: false, code: result.code, message: result.message };
  return {
    ok: true,
    blob: result.blob,
    outputMime: result.outputMime,
    outputExtension: result.outputExtension,
    width: result.width,
    height: result.height,
    inputBytes,
    outputBytes: result.blob.size,
  };
}

export async function convertImage(
  file: File,
  from: FormatId,
  to: OutputFormat,
  options: ConvertOptions = DEFAULT_CONVERT_OPTIONS,
  onProgress?: (p: ConvertProgress) => void,
): Promise<ConvertResult> {
  const detected = await detectImageFile(file);
  if (!detected.ok) {
    return { ok: false, code: detected.code, message: detected.message };
  }

  if (detected.detected.format !== from) {
    return {
      ok: false,
      code: 'format-mismatch',
      message: `That file is ${detected.detected.format.toUpperCase()}, not your selected input format.`,
    };
  }

  if (!canProcess(from, to)) {
    return {
      ok: false,
      code: 'unsupported-format',
      message: userMessageForCode('unsupported-format'),
    };
  }

  if (to === 'webp' && !supportsWebpEncodeInContext()) {
    return {
      ok: false,
      code: 'webp-unsupported',
      message: userMessageForCode('webp-unsupported'),
    };
  }

  const buffer = await file.arrayBuffer();
  return convertInWorker(buffer, from, to, options, onProgress);
}

export function suggestedDownloadName(inputName: string, to: OutputFormat): string {
  return outputFilename(inputName, to);
}

// ------------------------------------------------- Resize image to KB (target)

export type TargetResult =
  | {
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      quality: number;
      outcome: 'fits' | 'too-big' | 'too-small';
      inputBytes: number;
    }
  | { ok: false; code: ImageErrorCode; message: string };

/**
 * Resize/compress one image to a byte limit and/or exact pixel size, in the
 * worker when available. See target-pipeline.ts.
 */
export async function fitImageToTarget(
  file: File,
  job: TargetJob,
  onProgress?: (stage: string) => void,
): Promise<TargetResult> {
  const detected = await detectImageFile(file);
  if (!detected.ok) return { ok: false, code: detected.code, message: detected.message };
  const from = detected.detected.format;
  const buffer = await file.arrayBuffer();
  const inputBytes = buffer.byteLength;

  const w = getWorker();
  if (!w) {
    const res = await runTargetPipeline(buffer, from, job, onProgress);
    return res.ok ? { ...res, inputBytes } : res;
  }

  const id = `target-${++jobCounter}`;
  return new Promise((resolve) => {
    const handler = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.stage);
        return;
      }
      w.removeEventListener('message', handler);
      if (msg.type === 'error') {
        resolve({ ok: false, code: msg.code as ImageErrorCode, message: msg.message });
      } else if (msg.type === 'target-done') {
        resolve({
          ok: true,
          blob: msg.blob,
          width: msg.width,
          height: msg.height,
          quality: msg.quality,
          outcome: msg.outcome,
          inputBytes,
        });
      }
    };
    w.addEventListener('message', handler);
    const req: WorkerRequest = { kind: 'target', id, buffer, from, job };
    w.postMessage(req, [buffer]);
  });
}
