/// <reference lib="webworker" />
import { runConversionPipeline } from '../pipeline';
import type { ConvertOptions } from '../types';
import type { FormatId } from '../registry/format-registry';

export type WorkerRequest = {
  id: string;
  buffer: ArrayBuffer;
  from: FormatId;
  to: FormatId;
  options: ConvertOptions;
};

export type WorkerResponse =
  | { id: string; type: 'progress'; stage: string; percent?: number }
  | {
      id: string;
      type: 'done';
      blob: Blob;
      width: number;
      height: number;
      outputMime: string;
      outputExtension: string;
    }
  | { id: string; type: 'error'; code: string; message: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, buffer, from, to, options } = event.data;

  const result = await runConversionPipeline(buffer, from, to, options, (p) => {
    self.postMessage({ id, type: 'progress', stage: p.stage, percent: p.percent });
  });

  if (!result.ok) {
    self.postMessage({ id, type: 'error', code: result.code, message: result.message });
    return;
  }

  self.postMessage({
    id,
    type: 'done',
    blob: result.blob,
    width: result.width,
    height: result.height,
    outputMime: result.outputMime,
    outputExtension: result.outputExtension,
  });
};
