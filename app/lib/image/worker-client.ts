import { userMessageForCode, type ImageErrorCode } from './errors';
import { runConversionPipeline, supportsWebpEncodeInContext } from './pipeline';
import { canConvert } from './registry/capabilities';
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

      resolve({
        ok: true,
        blob: event.data.blob,
        outputMime: event.data.outputMime,
        outputExtension: event.data.outputExtension,
        width: event.data.width,
        height: event.data.height,
        inputBytes: buffer.byteLength,
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
  const result = await runConversionPipeline(buffer, from, to, options, onProgress);
  if (!result.ok) return { ok: false, code: result.code, message: result.message };
  return {
    ok: true,
    blob: result.blob,
    outputMime: result.outputMime,
    outputExtension: result.outputExtension,
    width: result.width,
    height: result.height,
    inputBytes: buffer.byteLength,
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

  if (!canConvert(from, to)) {
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
